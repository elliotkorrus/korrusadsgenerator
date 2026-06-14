/**
 * Cloudflare R2 upload helper (S3-compatible)
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

function generateKey(originalName: string): string {
  const ext = path.extname(originalName) || ".bin";
  return `uploads/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
}

/**
 * Generate a short-lived presigned PUT URL for direct browser→R2 uploads.
 * Skips Railway entirely — Railway's request timeout (~60-90s) was killing
 * large video uploads since the bytes have to traverse twice through the
 * server-proxy path. With presigned URLs the browser PUTs straight to R2.
 *
 * Returns { uploadUrl, publicUrl, key }. The client PUTs to uploadUrl with
 * the file as the body; the public R2 URL is then ready to use.
 */
export async function getR2PresignedPutUrl(
  originalName: string,
  mimeType: string,
  expiresInSeconds = 60 * 10 // 10 minutes — covers slow connections on big files
): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  const key = generateKey(originalName);
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: mimeType,
  });
  const uploadUrl = await getSignedUrl(getS3(), command, { expiresIn: expiresInSeconds });
  return {
    uploadUrl,
    publicUrl: `${R2_PUBLIC_URL}/${key}`,
    key,
  };
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
  const key = generateKey(originalName);

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
