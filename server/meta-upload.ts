/**
 * Meta Marketing API Upload Logic
 *
 * Implements the proven 3-step upload flow:
 *   1. Upload image(s) to Meta's ad images endpoint
 *   2. Create an ad creative (with placement asset customization for multi-size concepts)
 *   3. Create the ad in PAUSED status
 *
 * Based on the Manus-tested payload structure that handles the critical
 * object_story_spec + asset_feed_spec interaction correctly.
 */

import { db, schema } from "./db.js";
import { eq, inArray, sql } from "drizzle-orm";

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// ── Types ────────────────────────────────────────────────────────────

interface MetaSettings {
  accessToken: string;
  adAccountId: string;
  pageId: string;
  instagramUserId: string;
  defaultDestinationUrl?: string | null;
  defaultDisplayUrl?: string | null;
  defaultCta?: string | null;
  utmTemplate?: string | null;
}

interface QueueRow {
  id: number;
  brand: string;
  initiative: string;
  variation: string;
  angle: string;
  source: string;
  product: string;
  contentType: string;
  creativeType: string;
  dimensions: string;
  copySlug: string;
  filename: string;
  date: string;
  generatedAdName: string;
  adSetId: string | null;
  adSetName: string | null;
  destinationUrl: string | null;
  headline: string | null;
  bodyCopy: string | null;
  fileUrl: string | null;
  handle: string | null;
  cta: string | null;
  displayUrl: string | null;
  pageId: string | null;
  instagramAccountId: string | null;
  conceptKey: string | null;
  status: string;
}

interface UploadResult {
  conceptKey: string;
  adIds: number[];
  success: boolean;
  metaAdId?: string;
  metaCreativeId?: string;
  error?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Fetch a file from a URL (R2 public URL) or decode a base64 data URI */
async function fetchFileBuffer(fileUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
  // Handle legacy base64 data URIs
  const dataMatch = fileUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (dataMatch) {
    return {
      mimeType: dataMatch[1],
      buffer: Buffer.from(dataMatch[2], "base64"),
    };
  }

  // Handle HTTP URLs (R2, etc.)
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to fetch file from ${fileUrl}: HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType: contentType };
}

/** Check if a mime type or file extension indicates video */
function isVideo(mimeType: string, filename?: string): boolean {
  if (mimeType.startsWith("video/")) return true;
  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    return ["mp4", "mov", "avi", "webm", "mkv", "m4v"].includes(ext || "");
  }
  return false;
}

/** Strip the "act_" prefix if present — DB may store it either way */
function normalizeAdAccountId(id: string): string {
  return id.replace(/^act_/, "");
}

/** Classify dimension string into feed or story placement */
function placementType(dims: string): "story" | "feed" {
  if (dims === "9:16") return "story";
  return "feed"; // 4:5, 1:1, 16:9 are all feed placements
}

// ── Step 1: Upload Image ─────────────────────────────────────────────

async function uploadImageToMeta(
  adAccountId: string,
  accessToken: string,
  imageBuffer: Buffer,
  filename: string
): Promise<string> {
  const url = `${META_BASE}/act_${adAccountId}/adimages`;

  const formData = new FormData();
  formData.append("access_token", accessToken);
  formData.append("filename", new Blob([imageBuffer]), filename);

  const res = await fetch(url, { method: "POST", body: formData });
  const data = await res.json();

  if (data.error) {
    throw new Error(`Meta image upload failed: ${JSON.stringify(data.error)}`);
  }

  // Response: { images: { <filename>: { hash: "abc123", ... } } }
  const images = data.images;
  if (!images) throw new Error(`Unexpected image upload response: ${JSON.stringify(data)}`);

  const firstKey = Object.keys(images)[0];
  const hash = images[firstKey]?.hash;
  if (!hash) throw new Error(`No hash in image upload response: ${JSON.stringify(data)}`);

  return hash;
}

// ── Step 1b: Upload Video ────────────────────────────────────────────

async function uploadVideoToMeta(
  adAccountId: string,
  accessToken: string,
  videoBuffer: Buffer,
  filename: string
): Promise<string> {
  const url = `${META_BASE}/act_${adAccountId}/advideos`;

  const formData = new FormData();
  formData.append("access_token", accessToken);
  formData.append("source", new Blob([videoBuffer]), filename);
  formData.append("title", filename);

  const res = await fetch(url, { method: "POST", body: formData });
  const data = await res.json();

  if (data.error) {
    throw new Error(`Meta video upload failed: ${JSON.stringify(data.error)}`);
  }

  if (!data.id) throw new Error(`No video ID in response: ${JSON.stringify(data)}`);

  // Wait for video to be ready (Meta processes videos async)
  const videoId = data.id;
  let attempts = 0;
  const maxAttempts = 30; // 5 minutes max
  while (attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, 10000)); // 10s intervals
    const statusRes = await fetch(
      `${META_BASE}/${videoId}?fields=status&access_token=${accessToken}`
    );
    const statusData = await statusRes.json();
    if (statusData.status?.video_status === "ready") break;
    if (statusData.status?.video_status === "error") {
      throw new Error(`Video processing failed: ${JSON.stringify(statusData.status)}`);
    }
    attempts++;
  }
  if (attempts >= maxAttempts) {
    throw new Error("Video processing timed out after 5 minutes");
  }

  return videoId;
}

// ── Step 2: Create Ad Creative ───────────────────────────────────────

interface AssetEntry {
  /** For images: the image hash. For videos: the video ID */
  id: string;
  type: "image" | "video";
  placement: "feed" | "story";
}

async function createAdCreative(
  adAccountId: string,
  accessToken: string,
  opts: {
    name: string;
    pageId: string;
    instagramUserId: string;
    assets: AssetEntry[];
    bodyCopy: string;
    headline: string;
    displayUrl: string;
    destinationUrl: string;
    cta: string;
    utmTags?: string;
  }
): Promise<string> {
  const url = `${META_BASE}/act_${adAccountId}/adcreatives`;

  const hasFeed = opts.assets.some((i) => i.placement === "feed");
  const hasStory = opts.assets.some((i) => i.placement === "story");
  const isMultiPlacement = hasFeed && hasStory;
  const hasVideo = opts.assets.some((a) => a.type === "video");

  // ── object_story_spec: ALWAYS minimal when using asset_feed_spec ──
  const objectStorySpec: Record<string, any> = {
    page_id: opts.pageId,
    instagram_user_id: opts.instagramUserId,
  };

  let body: Record<string, any>;

  if (isMultiPlacement) {
    // Multi-placement: use asset_feed_spec with placement customization
    const assetFeedSpec: Record<string, any> = {
      optimization_type: "PLACEMENT",
      bodies: [{ text: opts.bodyCopy }],
      titles: [{ text: opts.headline }],
      descriptions: [{ text: opts.displayUrl || "" }],
      link_urls: [
        {
          website_url: opts.destinationUrl,
          display_url: opts.displayUrl || "",
        },
      ],
      call_to_action_types: [opts.cta],
      asset_customization_rules: [
        {
          customization_spec: {
            publisher_platforms: ["facebook", "instagram"],
            facebook_positions: ["feed", "marketplace", "video_feeds", "search"],
            instagram_positions: ["stream", "explore", "explore_home", "profile_feed", "ig_search"],
          },
          ...(hasVideo ? { video_label: { name: "feed_label" } } : { image_label: { name: "feed_label" } }),
        },
        {
          customization_spec: {
            publisher_platforms: ["facebook", "instagram"],
            facebook_positions: ["story"],
            instagram_positions: ["story"],
          },
          ...(hasVideo ? { video_label: { name: "story_label" } } : { image_label: { name: "story_label" } }),
        },
      ],
    };

    if (hasVideo) {
      assetFeedSpec.ad_formats = ["SINGLE_VIDEO"];
      assetFeedSpec.videos = opts.assets.map((a) => ({
        video_id: a.id,
        adlabels: [{ name: a.placement === "feed" ? "feed_label" : "story_label" }],
      }));
    } else {
      assetFeedSpec.ad_formats = ["SINGLE_IMAGE"];
      assetFeedSpec.images = opts.assets.map((a) => ({
        hash: a.id,
        adlabels: [{ name: a.placement === "feed" ? "feed_label" : "story_label" }],
      }));
    }

    body = {
      name: opts.name,
      access_token: accessToken,
      object_story_spec: JSON.stringify(objectStorySpec),
      asset_feed_spec: JSON.stringify(assetFeedSpec),
    };
  } else {
    // Single asset: use standard object_story_spec
    const asset = opts.assets[0];
    if (!asset) throw new Error("No asset available");

    if (asset.type === "video") {
      body = {
        name: opts.name,
        access_token: accessToken,
        object_story_spec: JSON.stringify({
          page_id: opts.pageId,
          instagram_user_id: opts.instagramUserId,
          video_data: {
            video_id: asset.id,
            link_description: opts.bodyCopy,
            title: opts.headline,
            message: opts.bodyCopy,
            call_to_action: {
              type: opts.cta,
              value: { link: opts.destinationUrl },
            },
          },
        }),
      };
    } else {
      body = {
        name: opts.name,
        access_token: accessToken,
        object_story_spec: JSON.stringify({
          page_id: opts.pageId,
          instagram_user_id: opts.instagramUserId,
          link_data: {
            image_hash: asset.id,
            link: opts.destinationUrl,
            message: opts.bodyCopy,
            name: opts.headline,
            caption: opts.displayUrl || undefined,
            call_to_action: {
              type: opts.cta,
              value: { link: opts.destinationUrl },
            },
          },
        }),
      };
    }
  }

  if (opts.utmTags) {
    body.url_tags = opts.utmTags;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();

  if (data.error) {
    throw new Error(`Meta creative creation failed: ${JSON.stringify(data.error)}`);
  }

  if (!data.id) throw new Error(`No creative ID in response: ${JSON.stringify(data)}`);
  return data.id;
}

// ── Step 3: Create the Ad ────────────────────────────────────────────

async function createAd(
  adAccountId: string,
  accessToken: string,
  opts: {
    name: string;
    adSetId: string;
    creativeId: string;
  }
): Promise<string> {
  const url = `${META_BASE}/act_${adAccountId}/ads`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: opts.name,
      adset_id: opts.adSetId,
      status: "PAUSED",
      access_token: accessToken,
      creative: { creative_id: opts.creativeId },
    }),
  });
  const data = await res.json();

  if (data.error) {
    throw new Error(`Meta ad creation failed: ${JSON.stringify(data.error)}`);
  }

  if (!data.id) throw new Error(`No ad ID in response: ${JSON.stringify(data)}`);
  return data.id;
}

// ── Orchestrator: upload a concept group ─────────────────────────────

async function uploadConceptGroup(
  rows: QueueRow[],
  meta: MetaSettings
): Promise<UploadResult> {
  const conceptKey = rows[0].conceptKey || `solo_${rows[0].id}`;
  const adIds = rows.map((r) => r.id);

  // Use fields from the first row (shared across concept)
  const primary = rows[0];

  // Resolve copy if needed
  let headline = primary.headline || "";
  let bodyCopy = primary.bodyCopy || "";
  if ((!headline || !bodyCopy) && primary.copySlug) {
    const copyRows = await db
      .select()
      .from(schema.copyLibrary)
      .where(eq(schema.copyLibrary.copySlug, primary.copySlug));
    const copyRow = copyRows[0];
    if (copyRow) {
      if (!headline) headline = copyRow.headline;
      if (!bodyCopy) bodyCopy = copyRow.bodyCopy;
    }
  }

  const destinationUrl = primary.destinationUrl || meta.defaultDestinationUrl || "";
  const displayUrl = primary.displayUrl || meta.defaultDisplayUrl || "";
  const cta = primary.cta || meta.defaultCta || "SHOP_NOW";
  const pageId = primary.pageId || meta.pageId || "";
  const instagramUserId = primary.instagramAccountId || meta.instagramUserId || "";
  const adSetId = primary.adSetId || "";

  // Validate required fields
  const missing: string[] = [];
  if (!adSetId) missing.push("adSetId");
  if (!destinationUrl) missing.push("destinationUrl");
  if (!headline) missing.push("headline");
  if (!bodyCopy) missing.push("bodyCopy");
  if (!pageId) missing.push("pageId");
  if (!instagramUserId) missing.push("instagramUserId");

  const rowsMissingFiles = rows.filter((r) => !r.fileUrl);
  if (rowsMissingFiles.length > 0) {
    missing.push(`fileUrl (missing on ${rowsMissingFiles.length} row(s))`);
  }

  if (missing.length > 0) {
    return {
      conceptKey,
      adIds,
      success: false,
      error: `Missing required fields: ${missing.join(", ")}`,
    };
  }

  try {
    // Mark all rows as uploading
    await db
      .update(schema.uploadQueue)
      .set({ status: "uploading", updatedAt: sql`now()` })
      .where(inArray(schema.uploadQueue.id, adIds));

    // Step 1: Upload all assets (images + videos)
    const assetEntries: AssetEntry[] = [];
    for (const row of rows) {
      if (!row.fileUrl) continue;
      const { buffer, mimeType } = await fetchFileBuffer(row.fileUrl);
      const filename = row.filename || `${row.id}`;

      if (isVideo(mimeType, filename)) {
        const videoFilename = filename.includes(".") ? filename : `${filename}.mp4`;
        const videoId = await uploadVideoToMeta(meta.adAccountId, meta.accessToken, buffer, videoFilename);
        assetEntries.push({
          id: videoId,
          type: "video",
          placement: placementType(row.dimensions),
        });
      } else {
        const imgFilename = filename.includes(".") ? filename : `${filename}.jpg`;
        const hash = await uploadImageToMeta(meta.adAccountId, meta.accessToken, buffer, imgFilename);
        assetEntries.push({
          id: hash,
          type: "image",
          placement: placementType(row.dimensions),
        });
      }
    }

    // Step 2: Create creative
    const creativeId = await createAdCreative(meta.adAccountId, meta.accessToken, {
      name: primary.generatedAdName,
      pageId,
      instagramUserId,
      assets: assetEntries,
      bodyCopy,
      headline,
      displayUrl,
      destinationUrl,
      cta,
      utmTags: meta.utmTemplate || undefined,
    });

    // Step 3: Create ad
    const metaAdId = await createAd(meta.adAccountId, meta.accessToken, {
      name: primary.generatedAdName,
      adSetId,
      creativeId,
    });

    // Step 4: Update all rows in the concept group
    await db
      .update(schema.uploadQueue)
      .set({
        status: "uploaded",
        metaAdId,
        metaCreativeId: creativeId,
        uploadedAt: new Date().toISOString(),
        updatedAt: sql`now()`,
      })
      .where(inArray(schema.uploadQueue.id, adIds));

    return { conceptKey, adIds, success: true, metaAdId, metaCreativeId: creativeId };
  } catch (err: any) {
    // Mark all rows as error
    const errorMsg = err.message || String(err);
    await db
      .update(schema.uploadQueue)
      .set({
        status: "error",
        errorMessage: errorMsg,
        updatedAt: sql`now()`,
      })
      .where(inArray(schema.uploadQueue.id, adIds));

    return { conceptKey, adIds, success: false, error: errorMsg };
  }
}

// ── Public API: upload specific ad IDs (batch) ───────────────────────

export async function uploadAdsBatch(adIds: number[]): Promise<{
  results: UploadResult[];
  meta: { total: number; success: number; failed: number };
}> {
  // Load meta settings
  const metaRows = await db.select().from(schema.metaSettings);
  const metaSettings = metaRows[0];
  if (!metaSettings?.accessToken || !metaSettings?.adAccountId) {
    throw new Error("Meta Settings not configured. Set access token and ad account ID first.");
  }

  const meta: MetaSettings = {
    accessToken: metaSettings.accessToken,
    adAccountId: normalizeAdAccountId(metaSettings.adAccountId),
    pageId: metaSettings.pageId || "",
    instagramUserId: metaSettings.instagramUserId || "",
    defaultDestinationUrl: metaSettings.defaultDestinationUrl,
    defaultDisplayUrl: metaSettings.defaultDisplayUrl,
    defaultCta: metaSettings.defaultCta,
    utmTemplate: metaSettings.utmTemplate,
  };

  // Load the requested ads
  const ads = (await db
    .select()
    .from(schema.uploadQueue)
    .where(inArray(schema.uploadQueue.id, adIds))) as QueueRow[];

  // Only upload ads that are "ready"
  const readyAds = ads.filter((a) => a.status === "ready");
  if (readyAds.length === 0) {
    return {
      results: [],
      meta: { total: 0, success: 0, failed: 0 },
    };
  }

  // Group by conceptKey
  const groups = new Map<string, QueueRow[]>();
  for (const ad of readyAds) {
    const key = ad.conceptKey || `solo_${ad.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ad);
  }

  // Upload each concept group
  const results: UploadResult[] = [];
  for (const [, rows] of groups) {
    const result = await uploadConceptGroup(rows, meta);
    results.push(result);
  }

  return {
    results,
    meta: {
      total: results.length,
      success: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    },
  };
}

// ── Public API: upload ALL ready ads ─────────────────────────────────

export async function uploadAllReady(): Promise<{
  results: UploadResult[];
  meta: { total: number; success: number; failed: number };
}> {
  const readyAds = await db
    .select({ id: schema.uploadQueue.id })
    .from(schema.uploadQueue)
    .where(eq(schema.uploadQueue.status, "ready"));

  if (readyAds.length === 0) {
    return { results: [], meta: { total: 0, success: 0, failed: 0 } };
  }

  return uploadAdsBatch(readyAds.map((a) => a.id));
}
