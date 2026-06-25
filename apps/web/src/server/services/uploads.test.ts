import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock at the module boundary — never hits a real S3
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://minio/presigned"),
}));
vi.mock("@/lib/s3", () => ({
  s3: {},
  BUCKET: "ggg-uploads",
}));

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createPresignedUpload } from "./uploads";

const getSignedUrlMock = getSignedUrl as ReturnType<typeof vi.fn>;

describe("createPresignedUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSignedUrlMock.mockResolvedValue("https://minio/presigned");
  });

  it("returns a random key with correct .png extension and a presigned URL", async () => {
    const result = await createPresignedUpload("image/png", 1000);

    expect(result.uploadUrl).toBe("https://minio/presigned");
    expect(result.key).toMatch(/^covers\/[0-9a-f-]{36}\.png$/);
  });

  it("returns a random key with correct .jpg extension for image/jpeg", async () => {
    const result = await createPresignedUpload("image/jpeg", 1000);

    expect(result.uploadUrl).toBe("https://minio/presigned");
    expect(result.key).toMatch(/^covers\/[0-9a-f-]{36}\.jpg$/);
  });

  it("returns a random key with correct .webp extension for image/webp", async () => {
    const result = await createPresignedUpload("image/webp", 1000);

    expect(result.uploadUrl).toBe("https://minio/presigned");
    expect(result.key).toMatch(/^covers\/[0-9a-f-]{36}\.webp$/);
  });

  it("generates unique keys on each call", async () => {
    const r1 = await createPresignedUpload("image/png", 1000);
    const r2 = await createPresignedUpload("image/png", 1000);

    expect(r1.key).not.toBe(r2.key);
  });

  it("passes correct Bucket, Key, ContentType, and ContentLength to PutObjectCommand", async () => {
    await createPresignedUpload("image/png", 2048);

    expect(getSignedUrlMock).toHaveBeenCalledOnce();
    const [, cmd] = getSignedUrlMock.mock.calls[0] as [
      unknown,
      InstanceType<typeof PutObjectCommand>,
    ];
    // PutObjectCommand stores input in .input
    const input = (cmd as unknown as { input: Record<string, unknown> }).input;
    expect(input.Bucket).toBe("ggg-uploads");
    expect(input.ContentType).toBe("image/png");
    expect(input.ContentLength).toBe(2048);
    expect(typeof input.Key).toBe("string");
    expect(input.Key).toMatch(/^covers\//);
  });

  it("passes expiresIn option to getSignedUrl", async () => {
    await createPresignedUpload("image/png", 1000);

    const [, , opts] = getSignedUrlMock.mock.calls[0] as [unknown, unknown, { expiresIn: number }];
    expect(opts.expiresIn).toBeGreaterThanOrEqual(60);
    expect(opts.expiresIn).toBeLessThanOrEqual(300);
  });

  it("rejects oversized uploads (>5 MB)", async () => {
    await expect(createPresignedUpload("image/png", 6 * 1024 * 1024)).rejects.toThrow(
      "Content length out of range",
    );
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it("rejects exactly 0 content length", async () => {
    await expect(createPresignedUpload("image/png", 0)).rejects.toThrow();
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it("accepts exactly 5 MB (boundary value)", async () => {
    const result = await createPresignedUpload("image/png", 5 * 1024 * 1024);
    expect(result.uploadUrl).toBe("https://minio/presigned");
  });

  it("rejects disallowed MIME types", async () => {
    await expect(createPresignedUpload("application/zip" as "image/png", 100)).rejects.toThrow(
      "Unsupported content type",
    );
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it("rejects unknown image MIME types", async () => {
    await expect(createPresignedUpload("image/gif" as "image/png", 100)).rejects.toThrow(
      "Unsupported content type",
    );
  });
});
