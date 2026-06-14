import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import * as trpcExpress from "@trpc/server/adapters/express";
import multer from "multer";
import AdmZip from "adm-zip";
import { appRouter } from "./routers.js";
import { db, schema } from "./db.js";
import { eq, sql } from "drizzle-orm";
import { uploadAdsBatch, uploadAllReady, uploadProgressEmitter, getAllProgress, updateDestinationUrls, updateCreativeFields, setAdStatusInMeta, replaceAdAssets, addAdAssets, duplicateAdsWithNewUrl, reuploadAdsToAccount } from "./meta-upload.js";
import { uploadToR2, getR2PresignedPutUrl, ensureR2CorsConfigured, streamUploadToR2 } from "./r2.js";
import { logger } from "./logger.js";
import { uploadState } from "./upload-state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = process.env.UPLOADS_PATH ?? path.join(__dirname, "..", "uploads");

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || true, // In production, set CORS_ORIGIN to the actual domain
  credentials: true,
}));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(express.json({ limit: "50mb" }));

// ── Simple password auth ─────────────────────────────────────────────────────
const APP_PASSWORD = process.env.APP_PASSWORD;
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!APP_PASSWORD) return next();
  // Allow SSE endpoint via query param token (EventSource can't set headers)
  const auth = req.headers["x-app-token"] || req.query.token;
  if (auth === APP_PASSWORD) return next();
  res.status(401).json({ error: "Unauthorized" });
}
app.use("/api", authMiddleware);

// ── Health check (no auth) ──────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Serve uploaded files
app.use("/uploads", express.static(uploadsDir));

// File upload endpoint — stores in memory, returns base64 data URI
// This avoids Railway's ephemeral disk (files lost on redeploy)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

// Presigned PUT URL for direct browser→R2 uploads. Use this for large files
// (videos especially) — Railway's request timeout was killing 100MB+ uploads
// because the bytes had to traverse twice through the server-proxy path.
const ALLOWED_PRESIGN_MIMES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
  "video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/x-matroska",
]);
// Streaming upload — bytes flow request → R2 chunk-by-chunk without ever
// being buffered in memory. No CORS needed (server-to-R2), no memory
// spike on big videos. Send the file as the raw POST body with
// `Content-Type` = the file's mime and `X-Filename` = the original name.
const ALLOWED_STREAM_MIMES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
  "video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/x-matroska",
]);
app.post("/api/upload-stream", async (req, res) => {
  const filename = (req.headers["x-filename"] as string) || "upload.bin";
  const mimeType = (req.headers["content-type"] as string) || "application/octet-stream";
  // Browsers using streaming body (or proxies that re-chunk) may omit
  // Content-Length and use Transfer-Encoding: chunked instead. Treat the
  // header as a hint only — fall back to "unknown" for the lib-storage
  // multipart upload, which doesn't actually need a known length.
  const contentLength = Number(req.headers["content-length"] || 0) || undefined;
  const sizeMB = contentLength ? (contentLength / (1024 * 1024)).toFixed(1) : "?";
  console.log(`[upload-stream] start filename=${filename} mime=${mimeType} size=${sizeMB}MB chunked=${!contentLength}`);

  if (!ALLOWED_STREAM_MIMES.has(mimeType)) {
    console.warn(`[upload-stream] rejected: bad mime "${mimeType}"`);
    res.status(400).json({ error: `mimeType "${mimeType}" not allowed. Accepted: images and videos.` });
    return;
  }

  // Surface low-level network failures (client disconnect, connection reset)
  // explicitly so they don't bubble up as a silent "Failed to fetch".
  req.on("error", (e) => {
    console.error(`[upload-stream] request stream error:`, e.message);
  });
  req.on("aborted", () => {
    console.warn(`[upload-stream] request aborted by client`);
  });

  const started = Date.now();
  try {
    const result = await streamUploadToR2(req, filename, mimeType, contentLength);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[upload-stream] success filename=${filename} size=${sizeMB}MB elapsed=${elapsed}s key=${result.key}`);
    res.json({
      fileUrl: result.publicUrl,
      fileKey: result.key,
      fileMimeType: mimeType,
      fileSize: contentLength ?? 0,
      originalName: filename,
    });
  } catch (err: any) {
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.error(`[upload-stream] FAILED filename=${filename} elapsed=${elapsed}s error="${err?.message}" name="${err?.name}" code="${err?.Code || err?.code}"`);
    logger.error("Streaming R2 upload failed", { error: err.message });
    res.status(500).json({ error: `Upload failed: ${err.message}` });
  }
});

app.post("/api/r2-presign", express.json(), async (req, res) => {
  const { filename, mimeType } = req.body as { filename?: string; mimeType?: string };
  if (!filename || typeof filename !== "string") {
    res.status(400).json({ error: "filename (string) required" });
    return;
  }
  if (!mimeType || typeof mimeType !== "string" || !ALLOWED_PRESIGN_MIMES.has(mimeType)) {
    res.status(400).json({ error: `mimeType "${mimeType}" not allowed. Accepted: images and videos.` });
    return;
  }
  try {
    const result = await getR2PresignedPutUrl(filename, mimeType);
    res.json(result);
  } catch (err: any) {
    logger.error("R2 presign failed", { error: err.message });
    res.status(500).json({ error: `Presign failed: ${err.message}` });
  }
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }

  const ALLOWED_MIME_TYPES = [
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
    "video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/x-matroska",
  ];
  if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
    res.status(400).json({ error: `File type "${req.file.mimetype}" not allowed. Accepted: images and videos.` });
    return;
  }

  try {
    // Upload ALL files to Cloudflare R2 — returns a public URL
    const publicUrl = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
    const fileKey = publicUrl.split("/").pop() || req.file.originalname;

    res.json({
      fileUrl: publicUrl,
      fileKey,
      fileMimeType: req.file.mimetype,
      fileSize: req.file.size,
      originalName: req.file.originalname,
    });
  } catch (err: any) {
    logger.error("R2 upload failed", { error: err.message });
    res.status(500).json({ error: `Upload failed: ${err.message}` });
  }
});

// ─── Bulk ZIP upload — extracts files and uploads each to R2 ────────────────
app.post("/api/upload-zip", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }
  if (req.file.mimetype !== "application/zip" && !req.file.originalname.endsWith(".zip")) {
    res.status(400).json({ error: "File must be a ZIP archive" });
    return;
  }

  try {
    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries();
    const ALLOWED_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".mov", ".avi", ".webm"]);

    const results: Array<{
      filename: string;
      folder: string;
      fileUrl: string;
      fileMimeType: string;
      fileSize: number;
    }> = [];

    for (const entry of entries) {
      // Skip directories and hidden files
      if (entry.isDirectory || entry.entryName.startsWith("__MACOSX") || entry.entryName.startsWith(".")) continue;

      const ext = "." + entry.entryName.split(".").pop()?.toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) continue;

      const buffer = entry.getData();
      const filename = entry.entryName.split("/").pop() || entry.entryName;
      const folder = entry.entryName.includes("/")
        ? entry.entryName.split("/").slice(0, -1).join("/")
        : "";

      // Guess MIME type from extension
      const mimeMap: Record<string, string> = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".webp": "image/webp",
        ".mp4": "video/mp4", ".mov": "video/quicktime",
        ".avi": "video/x-msvideo", ".webm": "video/webm",
      };
      const mimeType = mimeMap[ext] || "application/octet-stream";

      const publicUrl = await uploadToR2(buffer, filename, mimeType);
      results.push({
        filename,
        folder,
        fileUrl: publicUrl,
        fileMimeType: mimeType,
        fileSize: buffer.length,
      });
    }

    res.json({ success: true, files: results, count: results.length });
  } catch (err: any) {
    logger.error("ZIP upload failed", { error: err.message });
    res.status(500).json({ error: `ZIP extraction failed: ${err.message}` });
  }
});

// Download a remote file and return as base64 data URI
app.post("/api/download-from-url", express.json(), async (req, res) => {
  const { url } = req.body as { url: string };
  if (!url) { res.status(400).json({ error: "url required" }); return; }

  // SSRF protection: only allow R2 URLs
  const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "https://pub-c9423435b61d49a1887a699c2781dcdf.r2.dev";
  if (!url.startsWith(R2_PUBLIC_URL) && !url.startsWith("https://pub-")) {
    res.status(403).json({ error: "Only R2 URLs are allowed" });
    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const ext = url.split("?")[0].split(".").pop() || "bin";
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString("base64");
    const dataUri = `data:${contentType};base64,${base64}`;
    res.json({
      fileUrl: dataUri,
      fileKey: filename,
      fileMimeType: contentType,
      fileSize: buffer.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// tRPC
app.use(
  "/api/trpc",
  trpcExpress.createExpressMiddleware({ router: appRouter })
);

// ─── Update Destination URL on already-uploaded Meta ads (legacy) ────
app.post("/api/update-destination-url", express.json(), async (req, res) => {
  const { adIds, destinationUrl } = req.body as { adIds?: number[]; destinationUrl?: string };
  if (!Array.isArray(adIds) || adIds.length === 0) {
    res.status(400).json({ success: false, error: "adIds (array) required" });
    return;
  }
  if (!destinationUrl || typeof destinationUrl !== "string") {
    res.status(400).json({ success: false, error: "destinationUrl required" });
    return;
  }
  try {
    const result = await updateDestinationUrls(adIds, destinationUrl);
    res.json({ success: true, ...result });
  } catch (err: any) {
    logger.error("Update destination URL failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Update creative fields (URL, CTA, headline, body) on uploaded Meta ads ──
// Long-running operation: kicks off in background, returns immediately.
// Client polls /api/update-creative-fields/status for progress.
let activeUpdateJob: {
  total: number;
  completed: number;
  success: number;
  failed: number;
  errors: Array<{ adId: number; error: string }>;
  done: boolean;
  startedAt: number;
} | null = null;

app.post("/api/update-creative-fields", express.json(), async (req, res) => {
  const { adIds, updates } = req.body as {
    adIds?: number[];
    updates?: { destinationUrl?: string; cta?: string; headline?: string; bodyCopy?: string };
  };
  if (!Array.isArray(adIds) || adIds.length === 0) {
    res.status(400).json({ success: false, error: "adIds (array) required" });
    return;
  }
  if (!updates || typeof updates !== "object") {
    res.status(400).json({ success: false, error: "updates object required" });
    return;
  }
  const hasAny = !!(updates.destinationUrl || updates.cta || updates.headline || updates.bodyCopy);
  if (!hasAny) {
    res.status(400).json({ success: false, error: "At least one field to update is required" });
    return;
  }
  if (activeUpdateJob && !activeUpdateJob.done) {
    res.status(409).json({
      success: false,
      error: "An update job is already running. Wait for it to finish.",
    });
    return;
  }

  // Initialize job tracker
  activeUpdateJob = {
    total: adIds.length,
    completed: 0,
    success: 0,
    failed: 0,
    errors: [],
    done: false,
    startedAt: Date.now(),
  };

  // Respond immediately
  res.json({ success: true, message: "Update started", total: adIds.length });

  // Run in background
  (async () => {
    try {
      // Process in chunks of 5 to balance throughput vs progress reporting
      const CHUNK = 5;
      for (let i = 0; i < adIds.length; i += CHUNK) {
        const slice = adIds.slice(i, i + CHUNK);
        const result = await updateCreativeFields(slice, updates);
        activeUpdateJob!.completed += slice.length;
        activeUpdateJob!.success += result.meta.success;
        activeUpdateJob!.failed += result.meta.failed;
        for (const r of result.results) {
          if (!r.success && r.error) {
            activeUpdateJob!.errors.push({ adId: r.adId, error: r.error });
          }
        }
      }
    } catch (err: any) {
      logger.error("Background update creative fields failed", { error: err.message });
      activeUpdateJob!.errors.push({ adId: 0, error: err.message });
      activeUpdateJob!.failed = activeUpdateJob!.total - activeUpdateJob!.success;
    } finally {
      activeUpdateJob!.done = true;
    }
  })();
});

app.get("/api/update-creative-fields/status", (_req, res) => {
  if (!activeUpdateJob) {
    res.json({ active: false });
    return;
  }
  res.json({
    active: true,
    ...activeUpdateJob,
    elapsedMs: Date.now() - activeUpdateJob.startedAt,
  });
});

// ─── Pause / resume ads in Meta (async with progress polling) ────────
let activeStatusJob: {
  total: number;
  completed: number;
  success: number;
  failed: number;
  errors: Array<{ adId: number; error: string }>;
  done: boolean;
  newStatus: "PAUSED" | "ACTIVE";
  startedAt: number;
} | null = null;

app.post("/api/set-ad-status", express.json(), async (req, res) => {
  const { adIds, newStatus } = req.body as {
    adIds?: number[];
    newStatus?: "PAUSED" | "ACTIVE";
  };
  if (!Array.isArray(adIds) || adIds.length === 0) {
    res.status(400).json({ success: false, error: "adIds (array) required" });
    return;
  }
  if (newStatus !== "PAUSED" && newStatus !== "ACTIVE") {
    res.status(400).json({ success: false, error: "newStatus must be PAUSED or ACTIVE" });
    return;
  }
  if (activeStatusJob && !activeStatusJob.done) {
    res.status(409).json({
      success: false,
      error: "A status update job is already running. Wait for it to finish.",
    });
    return;
  }

  activeStatusJob = {
    total: adIds.length,
    completed: 0,
    success: 0,
    failed: 0,
    errors: [],
    done: false,
    newStatus,
    startedAt: Date.now(),
  };

  res.json({ success: true, message: "Status update started", total: adIds.length });

  (async () => {
    try {
      const CHUNK = 10;
      for (let i = 0; i < adIds.length; i += CHUNK) {
        const slice = adIds.slice(i, i + CHUNK);
        const result = await setAdStatusInMeta(slice, newStatus);
        activeStatusJob!.completed += slice.length;
        activeStatusJob!.success += result.meta.success;
        activeStatusJob!.failed += result.meta.failed;
        for (const r of result.results) {
          if (!r.success && r.error) {
            activeStatusJob!.errors.push({ adId: r.adId, error: r.error });
          }
        }
      }
    } catch (err: any) {
      logger.error("Background set-ad-status failed", { error: err.message });
      activeStatusJob!.errors.push({ adId: 0, error: err.message });
      activeStatusJob!.failed = activeStatusJob!.total - activeStatusJob!.success;
    } finally {
      activeStatusJob!.done = true;
    }
  })();
});

app.get("/api/set-ad-status/status", (_req, res) => {
  if (!activeStatusJob) {
    res.json({ active: false });
    return;
  }
  res.json({
    active: true,
    ...activeStatusJob,
    elapsedMs: Date.now() - activeStatusJob.startedAt,
  });
});

// ─── Duplicate ads with new URL (async with progress) ───────────────
let activeDuplicateJob: {
  total: number;
  completed: number;
  success: number;
  failed: number;
  errors: Array<{ adId: number; error: string }>;
  done: boolean;
  startedAt: number;
} | null = null;

app.post("/api/duplicate-ads-with-url", express.json(), async (req, res) => {
  const { sourceAdIds, newDestinationUrl, nameSuffix, newCta } = req.body as {
    sourceAdIds?: number[];
    newDestinationUrl?: string;
    nameSuffix?: string;
    newCta?: string;
  };
  if (!Array.isArray(sourceAdIds) || sourceAdIds.length === 0) {
    res.status(400).json({ success: false, error: "sourceAdIds (array) required" });
    return;
  }
  if (!newDestinationUrl || typeof newDestinationUrl !== "string") {
    res.status(400).json({ success: false, error: "newDestinationUrl required" });
    return;
  }
  if (activeDuplicateJob && !activeDuplicateJob.done) {
    const elapsedMs = Date.now() - activeDuplicateJob.startedAt;
    const STALE_AFTER_MS = 5 * 60 * 1000;
    if (elapsedMs > STALE_AFTER_MS) {
      logger.warn("Auto-resetting stale duplicate job", {
        elapsedMs,
        completed: activeDuplicateJob.completed,
        total: activeDuplicateJob.total,
      });
      activeDuplicateJob = null;
    } else {
      const elapsedSec = Math.round(elapsedMs / 1000);
      res.status(409).json({
        success: false,
        error: `A duplicate job is already running (${activeDuplicateJob.completed}/${activeDuplicateJob.total} done, ${elapsedSec}s elapsed). Wait for it to finish.`,
        elapsedMs,
        completed: activeDuplicateJob.completed,
        total: activeDuplicateJob.total,
      });
      return;
    }
  }

  activeDuplicateJob = {
    total: sourceAdIds.length,
    completed: 0,
    success: 0,
    failed: 0,
    errors: [],
    done: false,
    startedAt: Date.now(),
  };

  res.json({ success: true, message: "Duplicate started", total: sourceAdIds.length });

  (async () => {
    try {
      // Process in chunks of 5 so progress updates feel responsive
      const CHUNK = 5;
      for (let i = 0; i < sourceAdIds.length; i += CHUNK) {
        const slice = sourceAdIds.slice(i, i + CHUNK);
        const result = await duplicateAdsWithNewUrl(slice, {
          newDestinationUrl,
          nameSuffix,
          newCta,
        });
        activeDuplicateJob!.completed += slice.length;
        activeDuplicateJob!.success += result.meta.success;
        activeDuplicateJob!.failed += result.meta.failed;
        for (const r of result.results) {
          if (!r.success && r.error) {
            activeDuplicateJob!.errors.push({ adId: r.sourceAdId, error: r.error });
          }
        }
      }
    } catch (err: any) {
      logger.error("Background duplicate failed", { error: err.message });
      activeDuplicateJob!.errors.push({ adId: 0, error: err.message });
      activeDuplicateJob!.failed = activeDuplicateJob!.total - activeDuplicateJob!.success;
    } finally {
      activeDuplicateJob!.done = true;
    }
  })();
});

app.get("/api/duplicate-ads-with-url/status", (_req, res) => {
  if (!activeDuplicateJob) {
    res.json({ active: false });
    return;
  }
  res.json({
    active: true,
    ...activeDuplicateJob,
    elapsedMs: Date.now() - activeDuplicateJob.startedAt,
  });
});

// ─── Re-upload uploaded ads to a different ad account (migration) ───
//
// Starts a background job that, for each source ad ID, inserts a fresh
// upload_queue row and uploads it to the target ad account / ad set.
// Source rows are NOT mutated. Client polls /status while it runs.
let activeReuploadJob: {
  total: number;
  completed: number;
  success: number;
  failed: number;
  errors: Array<{ sourceAdIds: number[]; error: string }>;
  done: boolean;
  startedAt: number;
  targetAdAccountId: string;
  targetAdSetId: string;
} | null = null;

app.post("/api/reupload-to-account", express.json(), async (req, res) => {
  const { sourceAdIds, targetAdAccountId, targetAdSetId, targetAdSetName } = req.body as {
    sourceAdIds?: number[];
    targetAdAccountId?: string;
    targetAdSetId?: string;
    targetAdSetName?: string;
  };
  if (!Array.isArray(sourceAdIds) || sourceAdIds.length === 0) {
    res.status(400).json({ success: false, error: "sourceAdIds (array) required" });
    return;
  }
  if (!targetAdAccountId || typeof targetAdAccountId !== "string") {
    res.status(400).json({ success: false, error: "targetAdAccountId required" });
    return;
  }
  if (!targetAdSetId || typeof targetAdSetId !== "string") {
    res.status(400).json({ success: false, error: "targetAdSetId required" });
    return;
  }
  if (activeReuploadJob && !activeReuploadJob.done) {
    const elapsedMs = Date.now() - activeReuploadJob.startedAt;
    const STALE_AFTER_MS = 10 * 60 * 1000;
    if (elapsedMs > STALE_AFTER_MS) {
      logger.warn("Auto-resetting stale reupload job", {
        elapsedMs,
        completed: activeReuploadJob.completed,
        total: activeReuploadJob.total,
      });
      activeReuploadJob = null;
    } else {
      const elapsedSec = Math.round(elapsedMs / 1000);
      res.status(409).json({
        success: false,
        error: `A re-upload job is already running (${activeReuploadJob.completed}/${activeReuploadJob.total} done, ${elapsedSec}s elapsed). Wait for it to finish.`,
        elapsedMs,
        completed: activeReuploadJob.completed,
        total: activeReuploadJob.total,
      });
      return;
    }
  }

  activeReuploadJob = {
    total: sourceAdIds.length,
    completed: 0,
    success: 0,
    failed: 0,
    errors: [],
    done: false,
    startedAt: Date.now(),
    targetAdAccountId,
    targetAdSetId,
  };

  res.json({ success: true, message: "Re-upload started", total: sourceAdIds.length });

  (async () => {
    try {
      // Process in chunks so progress updates feel responsive even on large
      // batches. Each chunk is one reuploadAdsToAccount call, which itself
      // groups by concept internally.
      const CHUNK = 5;
      for (let i = 0; i < sourceAdIds.length; i += CHUNK) {
        const slice = sourceAdIds.slice(i, i + CHUNK);
        const result = await reuploadAdsToAccount(slice, {
          targetAdAccountId,
          targetAdSetId,
          targetAdSetName,
        });
        activeReuploadJob!.completed += slice.length;
        // result.meta counts concept groups, not source rows; sum row-level success
        for (const r of result.results) {
          if (r.success) {
            activeReuploadJob!.success += r.sourceAdIds.length;
          } else {
            activeReuploadJob!.failed += r.sourceAdIds.length;
            if (r.error) {
              activeReuploadJob!.errors.push({ sourceAdIds: r.sourceAdIds, error: r.error });
            }
          }
        }
      }
    } catch (err: any) {
      logger.error("Background reupload failed", { error: err.message });
      activeReuploadJob!.errors.push({ sourceAdIds: [], error: err.message });
      activeReuploadJob!.failed = activeReuploadJob!.total - activeReuploadJob!.success;
    } finally {
      activeReuploadJob!.done = true;
    }
  })();
});

app.get("/api/reupload-to-account/status", (_req, res) => {
  if (!activeReuploadJob) {
    res.json({ active: false });
    return;
  }
  res.json({
    active: true,
    ...activeReuploadJob,
    elapsedMs: Date.now() - activeReuploadJob.startedAt,
  });
});

// ─── Add a new size/asset to a live Meta ad (one concept) ───────────
app.post("/api/add-ad-assets", express.json(), async (req, res) => {
  const { conceptKey, additions } = req.body as {
    conceptKey?: string;
    additions?: Array<{
      dimensions: string;
      contentType: "VID" | "IMG";
      fileUrl: string;
      fileKey: string;
      fileMimeType: string;
      fileSize: number;
    }>;
  };
  if (!conceptKey || typeof conceptKey !== "string") {
    res.status(400).json({ success: false, error: "conceptKey required" });
    return;
  }
  if (!Array.isArray(additions) || additions.length === 0) {
    res.status(400).json({ success: false, error: "additions (non-empty array) required" });
    return;
  }
  try {
    const result = await addAdAssets(conceptKey, additions);
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (err: any) {
    logger.error("Add ad assets failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Replace creative assets on a live Meta ad (one concept at a time) ──
app.post("/api/replace-ad-assets", express.json(), async (req, res) => {
  const { conceptKey, replacements } = req.body as {
    conceptKey?: string;
    replacements?: Array<{
      rowId: number;
      fileUrl: string;
      fileKey: string;
      fileMimeType: string;
      fileSize: number;
    }>;
  };
  if (!conceptKey || typeof conceptKey !== "string") {
    res.status(400).json({ success: false, error: "conceptKey required" });
    return;
  }
  if (!Array.isArray(replacements) || replacements.length === 0) {
    res.status(400).json({ success: false, error: "replacements (non-empty array) required" });
    return;
  }
  try {
    const result = await replaceAdAssets(conceptKey, replacements);
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (err: any) {
    logger.error("Replace ad assets failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Send to Meta (single ad — finds its concept group automatically) ──
app.post("/api/send-to-meta", express.json(), async (req, res) => {
  const { adId } = req.body as { adId: number };
  if (!adId) { res.status(400).json({ error: "adId required" }); return; }

  try {
    const result = await uploadAdsBatch([adId]);
    if (result.meta.failed > 0) {
      const err = result.results[0]?.error || "Unknown error";
      res.status(400).json({ success: false, error: err });
    } else {
      const { success: _, ...rest } = result.results[0] || {};
      res.json({ success: true, ...rest });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Send to Meta (batch — groups by concept automatically) ──────────
// Returns immediately, uploads run in background. Frontend polls status.
app.post("/api/send-to-meta-batch", express.json(), async (req, res) => {
  const { adIds } = req.body as { adIds?: number[] };

  // Auto-reset stale uploads (in case a prior upload wedged on a hung
  // Meta fetch and the finally block never ran).
  if (uploadState.isActive()) {
    if (uploadState.isStale()) {
      logger.warn("Auto-resetting stale upload", { elapsedMs: uploadState.elapsedMs() });
      uploadState.clear();
    } else {
      const elapsedSec = Math.round(uploadState.elapsedMs() / 1000);
      res.status(409).json({
        success: false,
        error: `An upload is already in progress (${elapsedSec}s elapsed). Wait for it to complete, or click "Reset Stuck" if it's hung.`,
        elapsedMs: uploadState.elapsedMs(),
      });
      return;
    }
  }

  // Respond immediately — uploads happen in background
  res.json({ success: true, message: "Upload started. Ads will update as they complete.", meta: { total: 0, success: 0, failed: 0 } });

  uploadState.set((async () => {
    try {
      if (adIds && adIds.length > 0) {
        await uploadAdsBatch(adIds);
      } else {
        await uploadAllReady();
      }
    } catch (err: any) {
      logger.error("Background Meta upload error", { error: err.message });
    } finally {
      uploadState.clear();
    }
  })());
});

// ─── Upload Progress SSE endpoint ────────────────────────────────────
app.get("/api/upload-progress", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send current state immediately
  const current = getAllProgress();
  if (current.length > 0) {
    res.write(`data: ${JSON.stringify(current)}\n\n`);
  }

  // Listen for updates
  const onProgress = () => {
    const all = getAllProgress();
    res.write(`data: ${JSON.stringify(all)}\n\n`);
  };
  uploadProgressEmitter.on("progress", onProgress);

  // Heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  req.on("close", () => {
    uploadProgressEmitter.off("progress", onProgress);
    clearInterval(heartbeat);
  });
});

// Legacy MANUS callback (still works for external integrations)
app.post("/api/meta-callback", express.json(), async (req, res) => {
  const { adId, metaAdId, metaCreativeId, error } = req.body;

  if (error) {
    await db.update(schema.uploadQueue)
      .set({ status: "error", errorMessage: error, updatedAt: sql`now()` })
      .where(eq(schema.uploadQueue.id, adId));
    res.json({ success: true, status: "error" });
  } else {
    await db.update(schema.uploadQueue)
      .set({
        status: "uploaded",
        metaAdId: metaAdId || null,
        metaCreativeId: metaCreativeId || null,
        uploadedAt: new Date().toISOString(),
        updatedAt: sql`now()`,
      })
      .where(eq(schema.uploadQueue.id, adId));
    res.json({ success: true, status: "uploaded" });
  }
});

// Ensure uploads directory exists
import { mkdirSync } from "fs";
mkdirSync(uploadsDir, { recursive: true });

// In production: serve the Vite-built frontend
if (process.env.NODE_ENV === "production") {
  const staticDir = path.join(__dirname, "..", "dist", "public");
  app.use(express.static(staticDir));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

const PORT = process.env.NODE_ENV === "production" ? (Number(process.env.PORT) || 3002) : 3002;
const server = app.listen(PORT, () => {
  logger.info("Server started", { port: PORT, env: process.env.NODE_ENV || "development" });
  // Configure R2 CORS so direct browser PUTs from the dashboard work.
  // Fire-and-forget — if it fails, we log and move on. The legacy
  // /api/upload path still works without CORS.
  ensureR2CorsConfigured();
});

// Long-running streaming uploads (100MB+ videos) need generous socket
// timeouts so Node doesn't kill the connection mid-stream.
server.requestTimeout = 0;        // no timeout on the request itself
server.headersTimeout = 60_000;   // 60s to receive headers
server.keepAliveTimeout = 65_000; // 65s idle keep-alive

// ── Graceful shutdown ───────────────────────────────────────────────────────
async function gracefulShutdown(signal: string) {
  logger.info("Shutting down gracefully", { signal });

  // Reset any in-progress uploads back to "ready" so they can be retried
  try {
    const result = await db.update(schema.uploadQueue)
      .set({ status: "ready", errorMessage: null, updatedAt: sql`now()` })
      .where(eq(schema.uploadQueue.status, "uploading"));
    logger.info("Reset uploading ads back to ready");
  } catch (err: any) {
    logger.error("Failed to reset uploading ads on shutdown", { error: err?.message || String(err) });
  }

  // Wait for active upload to finish (up to 30s)
  const activePromise = uploadState.getPromise();
  if (activePromise) {
    logger.info("Waiting for active upload to complete (30s max)");
    await Promise.race([
      activePromise,
      new Promise((r) => setTimeout(r, 30000)),
    ]);
  }

  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });

  // Force exit after 45s
  setTimeout(() => {
    logger.error("Forced exit after timeout");
    process.exit(1);
  }, 45000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ── Scheduled uploads polling ───────────────────────────────────────
setInterval(async () => {
  try {
    const due = await db.select().from(schema.scheduledUploads)
      .where(eq(schema.scheduledUploads.status, "pending"));

    const now = new Date();
    for (const job of due) {
      if (new Date(job.scheduledAt) <= now) {
        // Mark as running
        await db.update(schema.scheduledUploads)
          .set({ status: "running" })
          .where(eq(schema.scheduledUploads.id, job.id));

        try {
          const adIds = JSON.parse(job.adIds) as number[];
          const result = await uploadAdsBatch(adIds);
          await db.update(schema.scheduledUploads)
            .set({ status: "completed", result: JSON.stringify(result.meta) })
            .where(eq(schema.scheduledUploads.id, job.id));
        } catch (err: any) {
          await db.update(schema.scheduledUploads)
            .set({ status: "failed", result: err.message })
            .where(eq(schema.scheduledUploads.id, job.id));
        }
      }
    }
  } catch (err) {
    logger.error("Scheduled uploads check failed", { error: err instanceof Error ? err.message : String(err) });
  }
}, 60_000); // Check every minute
