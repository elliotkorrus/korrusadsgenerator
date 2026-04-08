import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import * as trpcExpress from "@trpc/server/adapters/express";
import multer from "multer";
import { appRouter } from "./routers.js";
import { db, schema } from "./db.js";
import { eq, sql } from "drizzle-orm";
import { uploadAdsBatch, uploadAllReady, uploadProgressEmitter, getAllProgress } from "./meta-upload.js";
import { uploadToR2 } from "./r2.js";

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
    console.error("R2 upload failed:", err);
    res.status(500).json({ error: `Upload failed: ${err.message}` });
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
let activeUploadPromise: Promise<any> | null = null;

app.post("/api/send-to-meta-batch", express.json(), async (req, res) => {
  const { adIds } = req.body as { adIds?: number[] };

  // Prevent concurrent uploads
  if (activeUploadPromise) {
    res.status(409).json({ success: false, error: "An upload is already in progress. Wait for it to complete." });
    return;
  }

  // Respond immediately — uploads happen in background
  res.json({ success: true, message: "Upload started. Ads will update as they complete.", meta: { total: 0, success: 0, failed: 0 } });

  // Run uploads in background with concurrency tracking
  activeUploadPromise = (async () => {
    try {
      if (adIds && adIds.length > 0) {
        await uploadAdsBatch(adIds);
      } else {
        await uploadAllReady();
      }
    } catch (err: any) {
      console.error("Background Meta upload error:", err.message);
    } finally {
      activeUploadPromise = null;
    }
  })();
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
  console.log(`Server running on http://localhost:${PORT}`);
});

// ── Graceful shutdown ───────────────────────────────────────────────────────
async function gracefulShutdown(signal: string) {
  console.log(`[${signal}] Shutting down gracefully...`);

  // Reset any in-progress uploads back to "ready" so they can be retried
  try {
    const result = await db.update(schema.uploadQueue)
      .set({ status: "ready", errorMessage: null, updatedAt: sql`now()` })
      .where(eq(schema.uploadQueue.status, "uploading"));
    console.log(`[shutdown] Reset uploading ads back to ready`);
  } catch (err) {
    console.error("[shutdown] Failed to reset uploading ads:", err);
  }

  // Wait for active upload to finish (up to 30s)
  if (activeUploadPromise) {
    console.log("[shutdown] Waiting for active upload to complete (30s max)...");
    await Promise.race([
      activeUploadPromise,
      new Promise((r) => setTimeout(r, 30000)),
    ]);
  }

  server.close(() => {
    console.log("[shutdown] Server closed");
    process.exit(0);
  });

  // Force exit after 45s
  setTimeout(() => {
    console.error("[shutdown] Forced exit after timeout");
    process.exit(1);
  }, 45000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
