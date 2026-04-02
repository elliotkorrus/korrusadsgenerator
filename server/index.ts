import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import * as trpcExpress from "@trpc/server/adapters/express";
import multer from "multer";
import { appRouter } from "./routers.js";
import { db, schema } from "./db.js";
import { eq, sql } from "drizzle-orm";
import { uploadAdsBatch, uploadAllReady } from "./meta-upload.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = process.env.UPLOADS_PATH ?? path.join(__dirname, "..", "uploads");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ── Simple password auth ─────────────────────────────────────────────────────
const APP_PASSWORD = process.env.APP_PASSWORD;
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!APP_PASSWORD) return next();
  const auth = req.headers["x-app-token"];
  if (auth === APP_PASSWORD) return next();
  res.status(401).json({ error: "Unauthorized" });
}
app.use("/api", authMiddleware);

// Serve uploaded files
app.use("/uploads", express.static(uploadsDir));

// File upload endpoint — stores in memory, returns base64 data URI
// This avoids Railway's ephemeral disk (files lost on redeploy)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }
  // Convert to base64 data URI — stored in Postgres, survives redeploys
  const base64 = req.file.buffer.toString("base64");
  const dataUri = `data:${req.file.mimetype};base64,${base64}`;
  const fileKey = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(req.file.originalname)}`;

  // Also save to disk as a fallback for local dev
  try {
    const { writeFileSync } = require("fs");
    writeFileSync(path.join(uploadsDir, fileKey), req.file.buffer);
  } catch { /* ignore in production */ }

  res.json({
    fileUrl: dataUri,
    fileKey,
    fileMimeType: req.file.mimetype,
    fileSize: req.file.size,
    originalName: req.file.originalname,
  });
});

// Download a remote file and return as base64 data URI
app.post("/api/download-from-url", express.json(), async (req, res) => {
  const { url } = req.body as { url: string };
  if (!url) { res.status(400).json({ error: "url required" }); return; }
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
      res.json({ success: true, ...result.results[0] });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Send to Meta (batch — groups by concept automatically) ──────────
app.post("/api/send-to-meta-batch", express.json(), async (req, res) => {
  const { adIds } = req.body as { adIds?: number[] };

  try {
    let result;
    if (adIds && adIds.length > 0) {
      result = await uploadAdsBatch(adIds);
    } else {
      // No specific IDs = upload ALL ready ads
      result = await uploadAllReady();
    }
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
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
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
