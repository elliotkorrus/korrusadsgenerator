/**
 * Cloudflare R2 upload helper (S3-compatible)
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import path from "path";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "258b30deeb11a969a9117dc726bb2c17";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "fb2bd374c488163a65d4e6eca2b61538";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "363b14307100b5ae2cea658719611b907cfb749db218e74c9dccd306d0751336";
const R2_BUCKET = process.env.R2_BUCKET || "korrus-ads";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "https://pub-c9423435b61d49a1887a699c2781dcdf.r2.dev";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Upload a buffer to R2 and return the public URL.
 */
export async function uploadToR2(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<string> {
  const ext = path.extname(originalName) || ".bin";
  const key = `uploads/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  return `${R2_PUBLIC_URL}/${key}`;
}
