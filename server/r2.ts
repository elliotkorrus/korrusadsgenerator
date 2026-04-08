/**
 * Cloudflare R2 upload helper (S3-compatible)
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import path from "path";

const R2_BUCKET = process.env.R2_BUCKET || "korrus-ads";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "https://pub-c9423435b61d49a1887a699c2781dcdf.r2.dev";

// Lazy-initialized S3 client — only crashes when actually used without env vars
let _s3: S3Client | null = null;
function getS3(): S3Client {
  if (!_s3) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKey = process.env.R2_ACCESS_KEY_ID;
    const secretKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!accountId || !accessKey || !secretKey) {
      throw new Error("Missing R2 env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
    }
    _s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });
  }
  return _s3;
}

/**
 * Upload a buffer to R2 and return the public URL.
 * Retries up to 3 times with exponential backoff on transient failures.
 */
export async function uploadToR2(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<string> {
  const ext = path.extname(originalName) || ".bin";
  const key = `uploads/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await getS3().send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
        })
      );
      return `${R2_PUBLIC_URL}/${key}`;
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        const delay = 1000 * Math.pow(2, attempt);
        console.warn(`[R2] Upload attempt ${attempt + 1} failed, retrying in ${delay}ms...`, (err as Error).message);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
