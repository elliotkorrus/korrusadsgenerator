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
import { EventEmitter } from "events";

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// ── Upload Progress Tracking ────────────────────────────────────────

export interface UploadProgress {
  conceptKey: string;
  adName: string;
  stage: "uploading_asset" | "processing_video" | "creating_creative" | "creating_ad" | "done" | "error";
  currentAsset: number;
  totalAssets: number;
  chunkProgress: number; // 0-100
  message: string;
}

export const uploadProgressEmitter = new EventEmitter();
const progressMap = new Map<string, UploadProgress>();

function emitProgress(conceptKey: string, update: Partial<UploadProgress>) {
  const existing = progressMap.get(conceptKey) || {
    conceptKey,
    adName: "",
    stage: "uploading_asset" as const,
    currentAsset: 0,
    totalAssets: 0,
    chunkProgress: 0,
    message: "",
  };
  const merged = { ...existing, ...update };
  progressMap.set(conceptKey, merged);
  uploadProgressEmitter.emit("progress", merged);
}

export function getAllProgress(): UploadProgress[] {
  return Array.from(progressMap.values());
}

function clearProgress(conceptKey: string) {
  progressMap.delete(conceptKey);
}

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

  // Handle HTTP URLs (R2, etc.) — 60s timeout to avoid hanging
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  let res: Response;
  try {
    res = await fetch(fileUrl, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
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

// ── Retry Utility ───────────────────────────────────────────────────

/** Meta API error codes that should NOT be retried (permission/validation/token) */
const NON_RETRYABLE_META_CODES = new Set([10, 100, 190, 200]);

/** Meta API error codes that SHOULD be retried (rate limiting/transient) */
const RETRYABLE_META_CODES = new Set([1, 2, 4, 17]);

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      // Don't retry if we've exhausted attempts
      if (attempt === maxRetries) break;

      // Check for non-retryable Meta API error codes
      const metaCode = err?.metaErrorCode as number | undefined;
      if (metaCode !== undefined && NON_RETRYABLE_META_CODES.has(metaCode)) {
        console.log(`[retryWithBackoff] Non-retryable Meta error code ${metaCode}, failing immediately`);
        break;
      }

      // Check if this is a retryable error
      const isRetryable =
        (metaCode !== undefined && RETRYABLE_META_CODES.has(metaCode)) ||
        err?.isHttp5xx === true ||
        err?.name === "TypeError" || // network errors (fetch throws TypeError)
        err?.code === "ECONNRESET" ||
        err?.code === "ECONNREFUSED" ||
        err?.code === "ETIMEDOUT" ||
        err?.code === "UND_ERR_CONNECT_TIMEOUT";

      if (!isRetryable) {
        console.log(`[retryWithBackoff] Non-retryable error, failing immediately`);
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`[retryWithBackoff] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, err?.message || err);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/** Wraps a fetch call to Meta API: executes fetch, checks for 5xx/retryable errors, and throws enriched errors */
async function metaFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);

  // Tag 5xx errors as retryable
  if (res.status >= 500) {
    const err: any = new Error(`Meta API returned HTTP ${res.status}`);
    err.isHttp5xx = true;
    throw err;
  }

  return res;
}

/** Parses a Meta API JSON response and throws enriched errors for retryable codes */
function checkMetaResponse(data: any): void {
  if (data.error) {
    // Build a human-readable message instead of raw JSON
    const e = data.error;
    const userMsg = e.error_user_msg || e.error_user_title || e.message || "Unknown Meta API error";
    const detail = e.error_user_msg && e.message && e.message !== e.error_user_msg
      ? ` (${e.message})`
      : "";
    const err: any = new Error(`${userMsg}${detail}`);
    err.metaErrorCode = typeof e.code === "number" ? e.code : undefined;
    err.metaSubcode = e.error_subcode;
    err.rawError = e;
    throw err;
  }
}

// ── Step 1: Upload Image ─────────────────────────────────────────────

async function uploadImageToMeta(
  adAccountId: string,
  accessToken: string,
  imageBuffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<string> {
  const url = `${META_BASE}/act_${adAccountId}/adimages`;

  const formData = new FormData();
  formData.append("access_token", accessToken);
  formData.append("filename", new Blob([new Uint8Array(imageBuffer)], { type: mimeType || "image/png" }), filename);

  return retryWithBackoff(async () => {
    const res = await metaFetch(url, { method: "POST", body: formData });
    const data = await res.json();
    checkMetaResponse(data);

    // Response: { images: { <filename>: { hash: "abc123", ... } } }
    const images = data.images;
    if (!images) throw new Error(`Unexpected image upload response: ${JSON.stringify(data)}`);

    const firstKey = Object.keys(images)[0];
    const hash = images[firstKey]?.hash;
    if (!hash) throw new Error(`No hash in image upload response: ${JSON.stringify(data)}`);

    return hash;
  });
}

// ── Step 1b: Upload Video (chunked for large files) ─────────────────

const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks

async function uploadVideoToMeta(
  adAccountId: string,
  accessToken: string,
  videoBuffer: Buffer,
  filename: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const fileSize = videoBuffer.length;

  // Use chunked upload for files > 10MB
  if (fileSize > 10 * 1024 * 1024) {
    return uploadVideoChunked(adAccountId, accessToken, videoBuffer, filename, onProgress);
  }

  // Small files: direct upload
  const url = `${META_BASE}/act_${adAccountId}/advideos`;
  const formData = new FormData();
  formData.append("access_token", accessToken);
  formData.append("source", new Blob([new Uint8Array(videoBuffer)]), filename);
  formData.append("title", filename);

  const res = await fetch(url, { method: "POST", body: formData });
  const data = await res.json();

  if (data.error) {
    throw new Error(`Meta video upload failed: ${JSON.stringify(data.error)}`);
  }
  if (!data.id) throw new Error(`No video ID in response: ${JSON.stringify(data)}`);

  await waitForVideoReady(data.id, accessToken);
  return data.id;
}

/** Chunked upload: start → transfer chunks → finish */
async function uploadVideoChunked(
  adAccountId: string,
  accessToken: string,
  videoBuffer: Buffer,
  filename: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const fileSize = videoBuffer.length;
  const url = `${META_BASE}/act_${adAccountId}/advideos`;

  // Step 1: Start upload session
  const startForm = new FormData();
  startForm.append("access_token", accessToken);
  startForm.append("upload_phase", "start");
  startForm.append("file_size", String(fileSize));

  const startRes = await fetch(url, { method: "POST", body: startForm });
  const startData = await startRes.json();
  if (startData.error) {
    throw new Error(`Meta video upload start failed: ${JSON.stringify(startData.error)}`);
  }

  const uploadSessionId = startData.upload_session_id;
  const videoId = startData.video_id;
  if (!uploadSessionId || !videoId) {
    throw new Error(`Missing session/video ID: ${JSON.stringify(startData)}`);
  }

  // Step 2: Transfer chunks
  let startOffset = Number(startData.start_offset) || 0;
  let endOffset = Number(startData.end_offset) || Math.min(CHUNK_SIZE, fileSize);

  while (startOffset < fileSize) {
    const chunk = videoBuffer.subarray(startOffset, endOffset);

    const chunkForm = new FormData();
    chunkForm.append("access_token", accessToken);
    chunkForm.append("upload_phase", "transfer");
    chunkForm.append("upload_session_id", uploadSessionId);
    chunkForm.append("start_offset", String(startOffset));
    chunkForm.append("video_file_chunk", new Blob([new Uint8Array(chunk)]), filename);

    const chunkData = await retryWithBackoff(async () => {
      const chunkRes = await metaFetch(url, { method: "POST", body: chunkForm });
      const data = await chunkRes.json();
      checkMetaResponse(data);
      return data;
    });

    startOffset = Number(chunkData.start_offset);
    endOffset = Number(chunkData.end_offset) || fileSize;
    if (onProgress) onProgress(Math.round((startOffset / fileSize) * 100));
  }

  // Step 3: Finish upload
  const finishForm = new FormData();
  finishForm.append("access_token", accessToken);
  finishForm.append("upload_phase", "finish");
  finishForm.append("upload_session_id", uploadSessionId);
  finishForm.append("title", filename);

  const finishRes = await fetch(url, { method: "POST", body: finishForm });
  const finishData = await finishRes.json();
  if (finishData.error) {
    throw new Error(`Meta video upload finish failed: ${JSON.stringify(finishData.error)}`);
  }

  await waitForVideoReady(videoId, accessToken);
  return videoId;
}

/** Poll Meta until video processing is complete */
async function waitForVideoReady(videoId: string, accessToken: string): Promise<void> {
  let attempts = 0;
  const maxAttempts = 60; // 10 minutes max
  while (attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, 10000)); // 10s intervals
    const statusRes = await fetch(
      `${META_BASE}/${videoId}?fields=status&access_token=${accessToken}`
    );
    const statusData = await statusRes.json();
    if (statusData.status?.video_status === "ready") return;
    if (statusData.status?.video_status === "error") {
      throw new Error(`Video processing failed: ${JSON.stringify(statusData.status)}`);
    }
    attempts++;
  }
  throw new Error("Video processing timed out after 10 minutes");
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
    // Single placement: use standard object_story_spec
    if (opts.assets.length > 1) {
      console.warn(`[createAdCreative] ${opts.assets.length} assets for single placement type — only first will be used. Concept: ${opts.name}`);
    }
    const asset = opts.assets[0];
    if (!asset) throw new Error("No asset available");

    if (asset.type === "video") {
      // Fetch the video thumbnail URL from Meta to satisfy the image_url requirement
      let imageUrl: string | undefined;
      try {
        const thumbRes = await fetch(
          `${META_BASE}/${asset.id}?fields=thumbnails&access_token=${accessToken}`
        );
        const thumbData = await thumbRes.json();
        if (thumbData.thumbnails?.data?.[0]?.uri) {
          imageUrl = thumbData.thumbnails.data[0].uri;
        }
      } catch {
        // Thumbnail fetch is best-effort
      }

      body = {
        name: opts.name,
        access_token: accessToken,
        object_story_spec: JSON.stringify({
          page_id: opts.pageId,
          instagram_user_id: opts.instagramUserId,
          video_data: {
            video_id: asset.id,
            ...(imageUrl ? { image_url: imageUrl } : {}),
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

  return retryWithBackoff(async () => {
    const res = await metaFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    checkMetaResponse(data);

    if (!data.id) throw new Error(`No creative ID in response: ${JSON.stringify(data)}`);
    return data.id as string;
  });
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

  return retryWithBackoff(async () => {
    const res = await metaFetch(url, {
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
    checkMetaResponse(data);

    if (!data.id) throw new Error(`No ad ID in response: ${JSON.stringify(data)}`);
    return data.id as string;
  });
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
  const metaAdName = primary.generatedAdName;

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

  // Resolve page ID and Instagram account from handle bank (for whitelisting)
  let pageId = primary.pageId || "";
  let instagramUserId = primary.instagramAccountId || "";
  if (primary.handle) {
    const handleRows = await db
      .select()
      .from(schema.handleBank)
      .where(eq(schema.handleBank.handle, primary.handle));
    const handleEntry = handleRows[0];
    if (handleEntry) {
      if (!pageId && handleEntry.fbPageId) pageId = handleEntry.fbPageId;
      if (!instagramUserId && handleEntry.igAccountId) instagramUserId = handleEntry.igAccountId;
      console.log(`[uploadConceptGroup] Using handle bank for "${primary.handle}": pageId=${pageId}, igId=${instagramUserId}`);
    }
  }
  // Fall back to meta settings defaults
  if (!pageId) pageId = meta.pageId || "";
  if (!instagramUserId) instagramUserId = meta.instagramUserId || "";
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
    const errorMsg = `Missing required fields: ${missing.join(", ")}`;
    // Mark ads as error so user can see what went wrong
    await db.update(schema.uploadQueue)
      .set({ status: "error", errorMessage: errorMsg, updatedAt: sql`now()` })
      .where(inArray(schema.uploadQueue.id, adIds));
    emitProgress(conceptKey, { adName: metaAdName, stage: "error", message: errorMsg });
    setTimeout(() => clearProgress(conceptKey), 30000);
    return { conceptKey, adIds, success: false, error: errorMsg };
  }

  try {
    // Mark all rows as uploading
    await db
      .update(schema.uploadQueue)
      .set({ status: "uploading", updatedAt: sql`now()` })
      .where(inArray(schema.uploadQueue.id, adIds));

    // Step 1: Upload all assets (images + videos)
    const totalAssets = rows.filter((r) => r.fileUrl).length;
    let currentAsset = 0;
    emitProgress(conceptKey, { adName: metaAdName, totalAssets, stage: "uploading_asset", message: "Starting upload..." });

    const assetEntries: AssetEntry[] = [];
    for (const row of rows) {
      if (!row.fileUrl) continue;
      currentAsset++;
      emitProgress(conceptKey, { currentAsset, chunkProgress: 0, message: `Fetching ${row.dimensions} asset from storage...` });

      const { buffer, mimeType } = await fetchFileBuffer(row.fileUrl);
      const filename = row.filename || `${row.id}`;

      if (isVideo(mimeType, filename)) {
        const videoFilename = /\.\w{2,4}$/.test(filename) ? filename : `${filename.replace(/\.+$/, "")}.mp4`;
        emitProgress(conceptKey, { message: `Uploading ${row.dimensions} video (${(buffer.length/1024/1024).toFixed(0)}MB)...` });
        const videoId = await uploadVideoToMeta(meta.adAccountId, meta.accessToken, buffer, videoFilename, (pct) => {
          emitProgress(conceptKey, { chunkProgress: pct });
        });
        emitProgress(conceptKey, { stage: "processing_video", chunkProgress: 100, message: `Waiting for ${row.dimensions} video processing...` });
        assetEntries.push({
          id: videoId,
          type: "video",
          placement: placementType(row.dimensions),
        });
      } else {
        const imgFilename = /\.\w{2,4}$/.test(filename) ? filename : `${filename.replace(/\.+$/, "")}.png`;
        emitProgress(conceptKey, { message: `Uploading ${row.dimensions} image...` });
        const hash = await uploadImageToMeta(meta.adAccountId, meta.accessToken, buffer, imgFilename, mimeType);
        emitProgress(conceptKey, { chunkProgress: 100 });
        assetEntries.push({
          id: hash,
          type: "image",
          placement: placementType(row.dimensions),
        });
      }
    }

    // Step 2: Create creative
    emitProgress(conceptKey, { stage: "creating_creative", chunkProgress: 0, message: "Creating ad creative..." });
    const creativeId = await createAdCreative(meta.adAccountId, meta.accessToken, {
      name: metaAdName,
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
    emitProgress(conceptKey, { stage: "creating_ad", message: "Creating ad in Meta..." });
    const metaAdId = await createAd(meta.adAccountId, meta.accessToken, {
      name: metaAdName,
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

    emitProgress(conceptKey, { stage: "done", chunkProgress: 100, message: "Upload complete!" });
    setTimeout(() => clearProgress(conceptKey), 10000); // Clear after 10s

    // Audit log
    try {
      await db.insert(schema.auditLog).values({
        action: "upload_to_meta",
        entityType: "ad",
        entityId: metaAdId,
        details: JSON.stringify({ conceptKey, adIds, adName: metaAdName, adSetId, pageId }),
      });
    } catch {}

    return { conceptKey, adIds, success: true, metaAdId, metaCreativeId: creativeId };
  } catch (err: any) {
    // Mark all rows as error
    const errorMsg = err.message || String(err);
    emitProgress(conceptKey, { stage: "error", message: errorMsg });
    setTimeout(() => clearProgress(conceptKey), 30000); // Clear after 30s
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

// ── Update creative fields on already-uploaded Meta ads ──────────────
//
// Meta creatives are immutable. To change destination URL / CTA /
// headline / body copy we must:
// 1. Fetch the existing creative spec
// 2. Create a new creative with the same content but updated fields
// 3. Reassign the ad to use the new creative
// 4. Update our DB record

interface UpdateCreativeResult {
  adId: number;
  metaAdId: string;
  success: boolean;
  newCreativeId?: string;
  error?: string;
}

export interface CreativeFieldUpdates {
  destinationUrl?: string;
  cta?: string;
  headline?: string;
  bodyCopy?: string;
}

export async function updateCreativeFields(
  adIds: number[],
  updates: CreativeFieldUpdates
): Promise<{
  results: UpdateCreativeResult[];
  meta: { total: number; success: number; failed: number };
}> {
  const hasAny = !!(updates.destinationUrl || updates.cta || updates.headline || updates.bodyCopy);
  if (!hasAny) throw new Error("At least one field to update is required");

  // Load Meta settings
  const metaRows = await db.select().from(schema.metaSettings);
  const settings = metaRows[0];
  if (!settings?.accessToken || !settings?.adAccountId) {
    throw new Error("Meta Settings not configured.");
  }
  const accessToken = settings.accessToken;
  const adAccountId = normalizeAdAccountId(settings.adAccountId);

  // Load the ads, only those already uploaded to Meta
  const ads = await db
    .select()
    .from(schema.uploadQueue)
    .where(inArray(schema.uploadQueue.id, adIds));
  const uploadedAds = ads.filter((a) => a.metaAdId && a.status === "uploaded");

  const results: UpdateCreativeResult[] = [];

  for (const ad of uploadedAds) {
    try {
      // Step 1: Fetch the current ad's creative ID + spec
      const adRes = await fetch(
        `${META_BASE}/${ad.metaAdId}?fields=creative{id,object_story_spec,asset_feed_spec,name,url_tags}&access_token=${encodeURIComponent(accessToken)}`
      );
      const adData = await adRes.json();
      if (adData.error) throw new Error(`Failed to fetch ad: ${adData.error.message}`);
      const oldCreative = adData.creative;
      if (!oldCreative) throw new Error("No creative found on ad");

      const newCreativeBody: Record<string, any> = {
        name: oldCreative.name || ad.generatedAdName || `${ad.id}`,
        access_token: accessToken,
      };

      // Determine spec type: asset_feed_spec (multi-placement) or object_story_spec (single)
      if (oldCreative.asset_feed_spec) {
        const spec = typeof oldCreative.asset_feed_spec === "string"
          ? JSON.parse(oldCreative.asset_feed_spec)
          : oldCreative.asset_feed_spec;

        if (updates.destinationUrl && Array.isArray(spec.link_urls)) {
          spec.link_urls = spec.link_urls.map((u: any) => ({
            ...u,
            website_url: updates.destinationUrl,
          }));
        }
        if (updates.cta && Array.isArray(spec.call_to_action_types)) {
          spec.call_to_action_types = [updates.cta];
        }
        if (updates.headline && Array.isArray(spec.titles)) {
          spec.titles = [{ text: updates.headline }];
        }
        if (updates.bodyCopy && Array.isArray(spec.bodies)) {
          spec.bodies = [{ text: updates.bodyCopy }];
        }

        // Pull the minimal object_story_spec from the old creative
        const minimalStorySpec = typeof oldCreative.object_story_spec === "string"
          ? JSON.parse(oldCreative.object_story_spec)
          : (oldCreative.object_story_spec || {});
        newCreativeBody.object_story_spec = JSON.stringify({
          page_id: minimalStorySpec.page_id,
          instagram_user_id: minimalStorySpec.instagram_user_id,
        });
        newCreativeBody.asset_feed_spec = JSON.stringify(spec);
      } else if (oldCreative.object_story_spec) {
        const spec = typeof oldCreative.object_story_spec === "string"
          ? JSON.parse(oldCreative.object_story_spec)
          : oldCreative.object_story_spec;

        // video_data path (single video)
        if (spec.video_data) {
          if (updates.destinationUrl && spec.video_data.call_to_action?.value) {
            spec.video_data.call_to_action.value.link = updates.destinationUrl;
          }
          if (updates.cta && spec.video_data.call_to_action) {
            spec.video_data.call_to_action.type = updates.cta;
          }
          if (updates.headline) {
            spec.video_data.title = updates.headline;
          }
          if (updates.bodyCopy) {
            spec.video_data.message = updates.bodyCopy;
            spec.video_data.link_description = updates.bodyCopy;
          }
        }
        // link_data path (single image)
        if (spec.link_data) {
          if (updates.destinationUrl) {
            spec.link_data.link = updates.destinationUrl;
            if (spec.link_data.call_to_action?.value) {
              spec.link_data.call_to_action.value.link = updates.destinationUrl;
            }
          }
          if (updates.cta && spec.link_data.call_to_action) {
            spec.link_data.call_to_action.type = updates.cta;
          }
          if (updates.headline) {
            spec.link_data.name = updates.headline;
          }
          if (updates.bodyCopy) {
            spec.link_data.message = updates.bodyCopy;
          }
        }
        newCreativeBody.object_story_spec = JSON.stringify(spec);
      } else {
        throw new Error("Creative has neither asset_feed_spec nor object_story_spec");
      }

      // Preserve URL tags (UTM) if they were set
      if (oldCreative.url_tags) {
        newCreativeBody.url_tags = oldCreative.url_tags;
      }

      // Step 3: Create the new creative
      const createRes = await fetch(`${META_BASE}/act_${adAccountId}/adcreatives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCreativeBody),
      });
      const createData = await createRes.json();
      if (createData.error) throw new Error(`Create creative failed: ${createData.error.message}`);
      const newCreativeId = createData.id;
      if (!newCreativeId) throw new Error("No creative ID returned");

      // Step 4: Reassign the ad to use the new creative
      const updateRes = await fetch(`${META_BASE}/${ad.metaAdId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creative: { creative_id: newCreativeId },
          access_token: accessToken,
        }),
      });
      const updateData = await updateRes.json();
      if (updateData.error) throw new Error(`Update ad failed: ${updateData.error.message}`);

      // Step 5: Update our DB record
      const dbUpdates: Record<string, any> = {
        metaCreativeId: newCreativeId,
        updatedAt: sql`now()`,
      };
      if (updates.destinationUrl) dbUpdates.destinationUrl = updates.destinationUrl;
      if (updates.cta) dbUpdates.cta = updates.cta;
      if (updates.headline) dbUpdates.headline = updates.headline;
      if (updates.bodyCopy) dbUpdates.bodyCopy = updates.bodyCopy;

      await db
        .update(schema.uploadQueue)
        .set(dbUpdates)
        .where(eq(schema.uploadQueue.id, ad.id));

      // Audit log
      try {
        await db.insert(schema.auditLog).values({
          action: "update_creative_fields",
          entityType: "ad",
          entityId: ad.metaAdId,
          details: JSON.stringify({
            adId: ad.id,
            oldCreativeId: oldCreative.id,
            newCreativeId,
            updates,
          }),
        });
      } catch {}

      results.push({
        adId: ad.id,
        metaAdId: ad.metaAdId!,
        success: true,
        newCreativeId,
      });
    } catch (err: any) {
      results.push({
        adId: ad.id,
        metaAdId: ad.metaAdId || "",
        success: false,
        error: err.message || String(err),
      });
    }
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

// Backwards-compatible wrapper kept for existing /api/update-destination-url endpoint
export async function updateDestinationUrls(
  adIds: number[],
  newDestinationUrl: string
) {
  return updateCreativeFields(adIds, { destinationUrl: newDestinationUrl });
}

// ── Replace asset (video/image) on a live Meta ad ───────────────────
//
// Each asset (video or image) is associated with a row in our DB. To
// replace assets on a live ad, we:
// 1. Fetch the existing creative spec from Meta
// 2. For each replacement: upload the new file to Meta, swap the
//    asset id in the spec by matching the dimension's adlabel
// 3. Create a new creative with the updated spec
// 4. Reassign the ad to use the new creative
// 5. Update each row's fileUrl/fileKey in our DB

interface AssetReplacement {
  rowId: number;          // uploadQueue.id of the row whose asset is being replaced
  fileUrl: string;        // R2 public URL of the new file (already uploaded)
  fileKey: string;
  fileMimeType: string;
  fileSize: number;
}

interface ReplaceAssetsResult {
  conceptKey: string;
  metaAdId: string;
  success: boolean;
  newCreativeId?: string;
  error?: string;
}

export async function replaceAdAssets(
  conceptKey: string,
  replacements: AssetReplacement[]
): Promise<ReplaceAssetsResult> {
  if (!replacements.length) throw new Error("No replacements provided");

  const metaRows = await db.select().from(schema.metaSettings);
  const settings = metaRows[0];
  if (!settings?.accessToken || !settings?.adAccountId) {
    throw new Error("Meta Settings not configured.");
  }
  const accessToken = settings.accessToken;
  const adAccountId = normalizeAdAccountId(settings.adAccountId);

  // Load all rows in this concept group from DB
  const allRows = await db
    .select()
    .from(schema.uploadQueue)
    .where(eq(schema.uploadQueue.conceptKey, conceptKey));
  if (allRows.length === 0) throw new Error(`Concept ${conceptKey} not found`);
  const primary = allRows[0];
  if (!primary.metaAdId) throw new Error("Concept has not been uploaded to Meta yet");

  // Build a map of rowId → new asset info for quick lookup
  const replacementMap = new Map<number, AssetReplacement>();
  for (const r of replacements) replacementMap.set(r.rowId, r);

  try {
    // Step 1: Fetch existing creative spec
    const adRes = await fetch(
      `${META_BASE}/${primary.metaAdId}?fields=creative{id,object_story_spec,asset_feed_spec,name,url_tags}&access_token=${encodeURIComponent(accessToken)}`
    );
    const adData = await adRes.json();
    if (adData.error) throw new Error(`Failed to fetch ad: ${adData.error.message}`);
    const oldCreative = adData.creative;
    if (!oldCreative) throw new Error("No creative found on ad");

    // Step 2: Upload new files to Meta and build a dimension → newAssetId map
    // We need to know which dimension each replacement corresponds to so we
    // can match it to the right adlabel in asset_feed_spec.
    const dimToNewAsset = new Map<string, { id: string; type: "video" | "image" }>();
    for (const replacement of replacements) {
      const row = allRows.find((r) => r.id === replacement.rowId);
      if (!row) throw new Error(`Row ${replacement.rowId} not in concept`);

      const { buffer, mimeType } = await fetchFileBuffer(replacement.fileUrl);
      const filename = row.filename || `${row.id}`;

      if (isVideo(mimeType, filename)) {
        const videoFilename = /\.\w{2,4}$/.test(filename) ? filename : `${filename.replace(/\.+$/, "")}.mp4`;
        const videoId = await uploadVideoToMeta(adAccountId, accessToken, buffer, videoFilename);
        dimToNewAsset.set(row.dimensions, { id: videoId, type: "video" });
      } else {
        const imgFilename = /\.\w{2,4}$/.test(filename) ? filename : `${filename.replace(/\.+$/, "")}.png`;
        const hash = await uploadImageToMeta(adAccountId, accessToken, buffer, imgFilename, mimeType);
        dimToNewAsset.set(row.dimensions, { id: hash, type: "image" });
      }
    }

    // Step 3: Build new creative body, swapping assets
    const newCreativeBody: Record<string, any> = {
      name: oldCreative.name || primary.generatedAdName || `${primary.id}`,
      access_token: accessToken,
    };

    if (oldCreative.asset_feed_spec) {
      const spec = typeof oldCreative.asset_feed_spec === "string"
        ? JSON.parse(oldCreative.asset_feed_spec)
        : oldCreative.asset_feed_spec;

      // Map our dimensions to Meta's adlabel names
      // (uploadConceptGroup uses "feed_label" for non-9:16 and "story_label" for 9:16)
      const dimToAdlabel = (dims: string) => (dims === "9:16" ? "story_label" : "feed_label");

      // Swap videos
      if (Array.isArray(spec.videos)) {
        spec.videos = spec.videos.map((v: any) => {
          // Find the dim matching this video's adlabel
          const adlabelName = v.adlabels?.[0]?.name;
          for (const [dim, newAsset] of dimToNewAsset) {
            if (newAsset.type === "video" && dimToAdlabel(dim) === adlabelName) {
              return { ...v, video_id: newAsset.id };
            }
          }
          return v;
        });
      }
      // Swap images
      if (Array.isArray(spec.images)) {
        spec.images = spec.images.map((img: any) => {
          const adlabelName = img.adlabels?.[0]?.name;
          for (const [dim, newAsset] of dimToNewAsset) {
            if (newAsset.type === "image" && dimToAdlabel(dim) === adlabelName) {
              return { ...img, hash: newAsset.id };
            }
          }
          return img;
        });
      }

      const minimalStorySpec = typeof oldCreative.object_story_spec === "string"
        ? JSON.parse(oldCreative.object_story_spec)
        : (oldCreative.object_story_spec || {});
      newCreativeBody.object_story_spec = JSON.stringify({
        page_id: minimalStorySpec.page_id,
        instagram_user_id: minimalStorySpec.instagram_user_id,
      });
      newCreativeBody.asset_feed_spec = JSON.stringify(spec);
    } else if (oldCreative.object_story_spec) {
      // Single placement: swap the single asset
      const spec = typeof oldCreative.object_story_spec === "string"
        ? JSON.parse(oldCreative.object_story_spec)
        : oldCreative.object_story_spec;

      // Take the first replacement (single placement only has one asset)
      const firstReplacement = replacements[0];
      const row = allRows.find((r) => r.id === firstReplacement.rowId);
      const newAsset = row ? dimToNewAsset.get(row.dimensions) : undefined;
      if (!newAsset) throw new Error("No new asset for single-placement ad");

      if (spec.video_data && newAsset.type === "video") {
        spec.video_data.video_id = newAsset.id;
        // Re-fetch thumbnail for the new video
        try {
          const thumbRes = await fetch(
            `${META_BASE}/${newAsset.id}?fields=thumbnails&access_token=${accessToken}`
          );
          const thumbData = await thumbRes.json();
          if (thumbData.thumbnails?.data?.[0]?.uri) {
            spec.video_data.image_url = thumbData.thumbnails.data[0].uri;
          }
        } catch {}
      } else if (spec.link_data && newAsset.type === "image") {
        spec.link_data.image_hash = newAsset.id;
      } else {
        throw new Error("Asset type mismatch with existing creative");
      }
      newCreativeBody.object_story_spec = JSON.stringify(spec);
    } else {
      throw new Error("Creative has neither asset_feed_spec nor object_story_spec");
    }

    if (oldCreative.url_tags) newCreativeBody.url_tags = oldCreative.url_tags;

    // Step 4: Create the new creative
    const createRes = await fetch(`${META_BASE}/act_${adAccountId}/adcreatives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newCreativeBody),
    });
    const createData = await createRes.json();
    if (createData.error) throw new Error(`Create creative failed: ${createData.error.message}`);
    const newCreativeId = createData.id;
    if (!newCreativeId) throw new Error("No creative ID returned");

    // Step 5: Reassign the ad
    const updateRes = await fetch(`${META_BASE}/${primary.metaAdId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creative: { creative_id: newCreativeId },
        access_token: accessToken,
      }),
    });
    const updateData = await updateRes.json();
    if (updateData.error) throw new Error(`Update ad failed: ${updateData.error.message}`);

    // Step 6: Update DB rows with new file info
    for (const replacement of replacements) {
      await db
        .update(schema.uploadQueue)
        .set({
          fileUrl: replacement.fileUrl,
          fileKey: replacement.fileKey,
          fileMimeType: replacement.fileMimeType,
          fileSize: replacement.fileSize,
          metaCreativeId: newCreativeId,
          updatedAt: sql`now()`,
        })
        .where(eq(schema.uploadQueue.id, replacement.rowId));
    }
    // Also update metaCreativeId on rows that weren't replaced but share the ad
    const unreplacedIds = allRows
      .filter((r) => !replacementMap.has(r.id))
      .map((r) => r.id);
    if (unreplacedIds.length > 0) {
      await db
        .update(schema.uploadQueue)
        .set({ metaCreativeId: newCreativeId, updatedAt: sql`now()` })
        .where(inArray(schema.uploadQueue.id, unreplacedIds));
    }

    // Audit log
    try {
      await db.insert(schema.auditLog).values({
        action: "replace_ad_assets",
        entityType: "ad",
        entityId: primary.metaAdId,
        details: JSON.stringify({
          conceptKey,
          oldCreativeId: oldCreative.id,
          newCreativeId,
          replacedRowIds: replacements.map((r) => r.rowId),
        }),
      });
    } catch {}

    return {
      conceptKey,
      metaAdId: primary.metaAdId,
      success: true,
      newCreativeId,
    };
  } catch (err: any) {
    return {
      conceptKey,
      metaAdId: primary.metaAdId || "",
      success: false,
      error: err.message || String(err),
    };
  }
}

// ── Pause / resume ads in Meta ──────────────────────────────────────
//
// Sets each ad's status to PAUSED or ACTIVE via the Meta API.
// Acts only on ads with status="uploaded" in our DB.

interface SetAdStatusResult {
  adId: number;
  metaAdId: string;
  success: boolean;
  error?: string;
}

export async function setAdStatusInMeta(
  adIds: number[],
  newStatus: "PAUSED" | "ACTIVE"
): Promise<{
  results: SetAdStatusResult[];
  meta: { total: number; success: number; failed: number };
}> {
  const metaRows = await db.select().from(schema.metaSettings);
  const settings = metaRows[0];
  if (!settings?.accessToken) throw new Error("Meta Settings not configured.");
  const accessToken = settings.accessToken;

  const ads = await db
    .select()
    .from(schema.uploadQueue)
    .where(inArray(schema.uploadQueue.id, adIds));
  const uploadedAds = ads.filter((a) => a.metaAdId && a.status === "uploaded");

  const results: SetAdStatusResult[] = [];

  for (const ad of uploadedAds) {
    try {
      const res = await fetch(`${META_BASE}/${ad.metaAdId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, access_token: accessToken }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || "Meta API error");

      // Audit log
      try {
        await db.insert(schema.auditLog).values({
          action: newStatus === "PAUSED" ? "pause_ad" : "resume_ad",
          entityType: "ad",
          entityId: ad.metaAdId,
          details: JSON.stringify({ adId: ad.id, newStatus }),
        });
      } catch {}

      results.push({ adId: ad.id, metaAdId: ad.metaAdId!, success: true });
    } catch (err: any) {
      results.push({
        adId: ad.id,
        metaAdId: ad.metaAdId || "",
        success: false,
        error: err.message || String(err),
      });
    }
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
