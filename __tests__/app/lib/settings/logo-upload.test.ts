import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogoUploadTarget, logoUploadRequestSchema } from "@/app/lib/settings/logo-upload";

const originalEnv = process.env;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-31T12:00:00.000Z"));
  process.env = {
    ...originalEnv,
    S3_ACCESS_KEY_ID: "local-access-id",
    S3_SECRET_ACCESS_KEY: "local-signing-value",
    S3_BUCKET: "bukay-uploads",
    S3_ENDPOINT: "https://storage.example.com",
    S3_REGION: "auto",
    S3_PUBLIC_BASE_URL: "https://cdn.example.com",
  };
});

afterEach(() => {
  process.env = originalEnv;
  vi.useRealTimers();
});

describe("logo upload target", () => {
  it("rejects unsupported or oversized logo upload requests", () => {
    expect(
      logoUploadRequestSchema.safeParse({
        fileName: "logo.svg",
        contentType: "image/svg+xml",
        size: 100,
      }).success
    ).toBe(false);

    expect(
      logoUploadRequestSchema.safeParse({
        fileName: "logo.png",
        contentType: "image/png",
        size: 2 * 1024 * 1024 + 1,
      }).success
    ).toBe(false);
  });

  it("creates a tenant-scoped presigned S3-compatible PUT target", () => {
    const target = createLogoUploadTarget("tenant-1", {
      fileName: "logo.png",
      contentType: "image/png",
      size: 1024,
    });

    expect(target.method).toBe("PUT");
    expect(target.expiresIn).toBe(300);
    expect(target.headers).toEqual({
      "Content-Type": "image/png",
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    });
    expect(target.publicUrl).toMatch(
      /^https:\/\/cdn\.example\.com\/tenants\/tenant-1\/settings\/logo-/
    );

    const uploadUrl = new URL(target.uploadUrl);
    expect(uploadUrl.origin).toBe("https://storage.example.com");
    expect(uploadUrl.pathname).toMatch(/^\/bukay-uploads\/tenants\/tenant-1\/settings\/logo-/);
    expect(uploadUrl.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(uploadUrl.searchParams.get("X-Amz-Credential")).toContain(
      "local-access-id/20260731/auto/s3/aws4_request"
    );
    expect(uploadUrl.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(uploadUrl.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-type;host;x-amz-content-sha256"
    );
    expect(uploadUrl.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails closed when object storage is not configured", () => {
    delete process.env.S3_BUCKET;
    delete process.env.OBJECT_STORAGE_BUCKET;

    expect(() =>
      createLogoUploadTarget("tenant-1", {
        fileName: "logo.png",
        contentType: "image/png",
        size: 1024,
      })
    ).toThrow("object_storage_not_configured");
  });
});
