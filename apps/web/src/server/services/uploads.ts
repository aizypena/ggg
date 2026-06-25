import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, BUCKET } from "@/lib/s3";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const MAX_BYTES = 5 * 1024 * 1024;

export async function createPresignedUpload(
  contentType: string,
  contentLength: number,
): Promise<{ uploadUrl: string; key: string }> {
  const ext = EXT[contentType];
  if (!ext) {
    throw Object.assign(new Error("Unsupported content type"), { status: 400 });
  }
  if (contentLength <= 0 || contentLength > MAX_BYTES) {
    throw Object.assign(new Error("Content length out of range"), { status: 400 });
  }

  // Server-generated key: never trust any client-supplied filename
  const key = `covers/${randomUUID()}.${ext}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    { expiresIn: 300 }, // 5 minutes
  );

  return { uploadUrl, key };
}
