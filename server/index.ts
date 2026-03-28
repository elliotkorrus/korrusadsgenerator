import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import * as trpcExpress from "@trpc/server/adapters/express";
import multer from "multer";
import { appRouter } from "./routers.js";
import { db, schema } from "./db.js";
import { sql } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In production on Railway, set UPLOADS_PATH to the mounted volume path (e.g. /app/uploads)
const uploadsDir = process.env.UPLOADS_PATH ?? path.join(__dirname, "..", "uploads");

const app = express();

app.use(cors());
app.use(express.json());

// Serve uploaded files
app.use("/uploads", express.static(uploadsDir));

// File upload endpoint
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({
    fileUrl,
    fileKey: req.file.filename,
    fileMimeType: req.file.mimetype,
    fileSize: req.file.size,
    originalName: req.file.originalname,
  });
});

// Download a remote file to local uploads/ and return its metadata
app.post("/api/download-from-url", express.json(), async (req, res) => {
  const { url } = req.body as { url: string };
  if (!url) { res.status(400).json({ error: "url required" }); return; }
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const ext = url.split("?")[0].split(".").pop() || "bin";
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    const dest = path.join(uploadsDir, filename);
    const { createWriteStream } = await import("fs");
    const fileStream = createWriteStream(dest);
    const { Readable } = await import("stream");
    await new Promise((resolve, reject) => {
      Readable.fromWeb(response.body as any).pipe(fileStream);
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });
    const stat = (await import("fs")).statSync(dest);
    res.json({
      fileUrl: `/uploads/${filename}`,
      fileKey: filename,
      fileMimeType: contentType,
      fileSize: stat.size,
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

// ─── MANUS "Send to Meta" stub ─────────────────────────────────
// When you have MANUS credits, replace the body of this route with
// a real call to your MANUS webhook URL. MANUS will receive the ad
// data and use browser automation to upload it to Meta Ads Manager.
//
// Example MANUS call (future):
//   const res = await fetch(process.env.MANUS_WEBHOOK_URL, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(adPayload),
//   });
//
app.post("/api/send-to-meta", express.json(), async (req, res) => {
  const { adId } = req.body as { adId: number };
  if (!adId) { res.status(400).json({ error: "adId required" }); return; }

  // Fetch the ad from DB
  const { eq } = await import("drizzle-orm");
  const ad = db.select().from(schema.uploadQueue).where(eq(schema.uploadQueue.id, adId)).get();
  if (!ad) { res.status(404).json({ error: "Ad not found" }); return; }
  if (ad.status !== "ready") { res.status(400).json({ error: "Ad must be in 'ready' status" }); return; }

  // Build the payload MANUS will receive
  const adPayload = {
    adName: ad.generatedAdName,
    fileUrl: ad.fileUrl,
    headline: ad.headline,
    bodyCopy: ad.bodyCopy,
    adSetId: ad.adSetId,
    adSetName: ad.adSetName,
    destinationUrl: ad.destinationUrl,
    product: ad.product,
    dimensions: ad.dimensions,
    contentType: ad.contentType,
  };

  const manusWebhookUrl = process.env.MANUS_WEBHOOK_URL;

  // Always mark as uploading immediately
  const { sql: sqlExpr } = await import("drizzle-orm");
  db.update(schema.uploadQueue)
    .set({ status: "uploading", updatedAt: sqlExpr`datetime('now')` })
    .where(eq(schema.uploadQueue.id, adId))
    .run();

  if (manusWebhookUrl) {
    try {
      const manusRes = await fetch(manusWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adPayload),
      });
      if (!manusRes.ok) throw new Error(`MANUS returned ${manusRes.status}`);
      // On success, MANUS will call back /api/meta-callback to update status
      res.json({ success: true, message: "Sent to MANUS", adPayload });
    } catch (err: any) {
      db.update(schema.uploadQueue)
        .set({ status: "error", errorMessage: err.message, updatedAt: sqlExpr`datetime('now')` })
        .where(eq(schema.uploadQueue.id, adId))
        .run();
      res.status(500).json({ error: err.message });
    }
  } else {
    // STUB: no webhook configured yet — return the payload and reset status to ready
    // so the item doesn't get stuck on "uploading" during development
    res.json({
      success: true,
      stub: true,
      message: "MANUS_WEBHOOK_URL not set. Ad payload ready to send:",
      adPayload,
    });
    // Reset back to ready after returning (non-blocking)
    setImmediate(() => {
      db.update(schema.uploadQueue)
        .set({ status: "ready", updatedAt: sqlExpr`datetime('now')` })
        .where(eq(schema.uploadQueue.id, adId))
        .run();
    });
  }
});

// MANUS calls this endpoint when it finishes uploading to Meta Ads Manager
app.post("/api/meta-callback", express.json(), async (req, res) => {
  const { adId, metaAdId, metaCreativeId, error } = req.body;
  const { eq, sql } = await import("drizzle-orm");

  if (error) {
    db.update(schema.uploadQueue)
      .set({ status: "error", errorMessage: error, updatedAt: sql`datetime('now')` })
      .where(eq(schema.uploadQueue.id, adId))
      .run();
    res.json({ success: true, status: "error" });
  } else {
    db.update(schema.uploadQueue)
      .set({
        status: "uploaded",
        metaAdId: metaAdId || null,
        metaCreativeId: metaCreativeId || null,
        uploadedAt: sql`datetime('now')`,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(schema.uploadQueue.id, adId))
      .run();
    res.json({ success: true, status: "uploaded" });
  }
});

// Ensure uploads directory exists (important on first boot with Railway volume)
import { mkdirSync } from "fs";
mkdirSync(uploadsDir, { recursive: true });

// In production: serve the Vite-built frontend
if (process.env.NODE_ENV === "production") {
  const staticDir = path.join(__dirname, "..", "dist", "public");
  app.use(express.static(staticDir));
  // Fallback: send index.html for all non-API routes (client-side routing)
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

const PORT = Number(process.env.PORT) || 3002;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
