import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import * as trpcExpress from "@trpc/server/adapters/express";
import multer from "multer";
import { appRouter } from "./routers.js";
import { db, schema } from "./db.js";
import { eq, sql } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = process.env.UPLOADS_PATH ?? path.join(__dirname, "..", "uploads");

const app = express();

app.use(cors());
app.use(express.json());

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

// File upload endpoint
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

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

// ─── MANUS "Send to Meta" ─────────────────────────────────────
app.post("/api/send-to-meta", express.json(), async (req, res) => {
  const { adId } = req.body as { adId: number };
  if (!adId) { res.status(400).json({ error: "adId required" }); return; }

  const adRows = await db.select().from(schema.uploadQueue).where(eq(schema.uploadQueue.id, adId));
  const ad = adRows[0];
  if (!ad) { res.status(404).json({ error: "Ad not found" }); return; }
  if (ad.status !== "ready") { res.status(400).json({ error: "Ad must be in 'ready' status" }); return; }

  const metaRows = await db.select().from(schema.metaSettings);
  const metaSettings = metaRows[0];

  let headline = ad.headline || "";
  let bodyCopy = ad.bodyCopy || "";
  if ((!headline || !bodyCopy) && ad.copySlug) {
    const copyRows = await db.select().from(schema.copyLibrary)
      .where(eq(schema.copyLibrary.copySlug, ad.copySlug));
    const copyRow = copyRows[0];
    if (copyRow) {
      if (!headline) headline = copyRow.headline;
      if (!bodyCopy) bodyCopy = copyRow.bodyCopy;
    }
  }

  const destinationUrl = ad.destinationUrl || metaSettings?.defaultDestinationUrl || "";
  const displayUrl = ad.displayUrl || metaSettings?.defaultDisplayUrl || "";
  const cta = ad.cta || metaSettings?.defaultCta || "SHOP_NOW";
  const instagramUserId = metaSettings?.instagramUserId || "";
  const pageId = metaSettings?.pageId || "";
  const utmTemplate = metaSettings?.utmTemplate || "";

  const missing: string[] = [];
  if (!ad.fileUrl) missing.push("fileUrl");
  if (!ad.adSetId) missing.push("adSetId");
  if (!destinationUrl) missing.push("destinationUrl");
  if (!headline) missing.push("headline");
  if (!bodyCopy) missing.push("bodyCopy");
  if (!pageId) missing.push("pageId (set in Meta Settings)");
  if (!instagramUserId) missing.push("instagramUserId (set in Meta Settings)");
  if (!metaSettings?.accessToken) missing.push("accessToken (set in Meta Settings)");

  if (missing.length > 0) {
    res.status(400).json({
      success: false,
      error: `Missing required fields: ${missing.join(", ")}. Please fill these in on the ad or set defaults in Meta Settings.`,
    });
    return;
  }

  const adPayload = {
    adId: ad.id,
    adName: ad.generatedAdName,
    fileUrl: ad.fileUrl,
    headline,
    bodyCopy,
    adSetId: ad.adSetId,
    adSetName: ad.adSetName,
    destinationUrl,
    displayUrl,
    cta,
    instagramUserId,
    pageId,
    utmTemplate,
    product: ad.product,
    dimensions: ad.dimensions,
    contentType: ad.contentType,
    conceptKey: ad.conceptKey,
  };

  const manusWebhookUrl = process.env.MANUS_WEBHOOK_URL;

  await db.update(schema.uploadQueue)
    .set({ status: "uploading", updatedAt: sql`now()` })
    .where(eq(schema.uploadQueue.id, adId));

  if (manusWebhookUrl) {
    try {
      const manusRes = await fetch(manusWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adPayload),
      });
      if (!manusRes.ok) throw new Error(`MANUS returned ${manusRes.status}`);
      res.json({ success: true, message: "Sent to MANUS", adPayload });
    } catch (err: any) {
      await db.update(schema.uploadQueue)
        .set({ status: "error", errorMessage: err.message, updatedAt: sql`now()` })
        .where(eq(schema.uploadQueue.id, adId));
      res.status(500).json({ error: err.message });
    }
  } else {
    res.json({
      success: true,
      stub: true,
      message: "MANUS_WEBHOOK_URL not set. Ad payload ready to send:",
      adPayload,
    });
    // Reset back to ready after returning
    db.update(schema.uploadQueue)
      .set({ status: "ready", updatedAt: sql`now()` })
      .where(eq(schema.uploadQueue.id, adId))
      .then(() => {});
  }
});

// MANUS callback
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
