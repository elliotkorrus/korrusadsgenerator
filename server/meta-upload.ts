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
