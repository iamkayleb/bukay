import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

const state = vi.hoisted(() => ({
  tenantFindUnique: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: state.tenantFindUnique,
    },
  },
}));

import { LOGO_UPLOAD_MAX_BYTES } from "@/app/lib/storage/s3-logo-upload";
import { POST } from "@/app/api/settings/logo-upload/route";

const originalEnv = { ...process.env };

function request(path: string, init: NextRequestInit = {}) {
  return new NextRequest(`http://app.test${path}`, {
    ...init,
    headers: {
      "x-tenant-id": "tenant-1",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function jsonRequest(path: string, body: unknown, init: NextRequestInit = {}) {
  return request(path, {
    ...init,
    method: init.method ?? "POST",
    headers: {
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
  });
}

function configureS3() {
  process.env.S3_LOGO_BUCKET = "bukay-logos";
  process.env.S3_REGION = "us-east-1";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_ENDPOINT = "https://bukay-logos.s3.us-east-1.amazonaws.com";
  process.env.S3_LOGO_PUBLIC_BASE_URL = "https://cdn.example.com";
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-02T12:00:00.000Z"));
  process.env = { ...originalEnv };
  configureS3();
  state.tenantFindUnique.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  process.env = originalEnv;
});

describe("/api/settings/logo-upload", () => {
  it("creates a tenant-scoped logo upload URL with content length signed into the PUT", async () => {
    const res = await POST(
      jsonRequest("/api/settings/logo-upload", {
        contentLength: 42_000,
        contentType: "image/png",
        fileName: "logo.png",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    const uploadUrl = new URL(body.upload.uploadUrl);

    expect(body.upload).toMatchObject({
      contentLength: 42_000,
      contentType: "image/png",
      expiresAt: "2026-08-02T12:05:00.000Z",
      headers: {
        "content-length": "42000",
        "content-type": "image/png",
      },
      logoUrl: expect.stringMatching(
        /^https:\/\/cdn\.example\.com\/tenants\/tenant-1\/logos\/.+\.png$/
      ),
      method: "PUT",
    });
    expect(body.upload.key).toMatch(/^tenants\/tenant-1\/logos\/.+\.png$/);
    expect(uploadUrl.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(uploadUrl.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-length;content-type;host"
    );
    expect(uploadUrl.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects logo uploads larger than the storage limit before signing", async () => {
    const res = await POST(
      jsonRequest("/api/settings/logo-upload", {
        contentLength: LOGO_UPLOAD_MAX_BYTES + 1,
        contentType: "image/png",
        fileName: "logo.png",
      })
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.fieldErrors.contentLength).toContain("Logo must be 1 MB or smaller");
  });

  it("rejects unsupported logo content types", async () => {
    const res = await POST(
      jsonRequest("/api/settings/logo-upload", {
        contentLength: 4_000,
        contentType: "image/svg+xml",
        fileName: "logo.svg",
      })
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.fieldErrors.contentType).toContain("Logo must be a PNG, JPEG, or WebP image");
  });

  it("does not presign uploads when S3 is not configured", async () => {
    delete process.env.S3_LOGO_BUCKET;
    delete process.env.S3_BUCKET;

    const res = await POST(
      jsonRequest("/api/settings/logo-upload", {
        contentLength: 4_000,
        contentType: "image/webp",
        fileName: "logo.webp",
      })
    );

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("logo_upload_not_configured");
  });
});
