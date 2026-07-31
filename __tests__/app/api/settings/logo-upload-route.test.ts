import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

const state = vi.hoisted(() => ({
  findUnique: vi.fn(),
  createLogoUploadTarget: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: state.findUnique,
    },
  },
}));

vi.mock("@/app/lib/settings/logo-upload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/settings/logo-upload")>();
  return {
    ...actual,
    createLogoUploadTarget: state.createLogoUploadTarget,
  };
});

import { POST } from "@/app/api/settings/logo-upload/route";

function request(body: unknown, init: NextRequestInit = {}) {
  return new NextRequest("http://app.test/api/settings/logo-upload", {
    ...init,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tenant-id": "tenant-1",
      ...(init.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.findUnique.mockReset();
  state.createLogoUploadTarget.mockReset();
  state.createLogoUploadTarget.mockReturnValue({
    uploadUrl: "https://storage.example.com/bucket/logo.png?signature=abc",
    publicUrl: "https://cdn.example.com/tenants/tenant-1/settings/logo.png",
    method: "PUT",
    headers: {
      "Content-Type": "image/png",
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    },
    expiresIn: 300,
  });
});

describe("/api/settings/logo-upload", () => {
  it("creates a tenant-scoped logo upload target", async () => {
    const res = await POST(
      request({
        fileName: "logo.png",
        contentType: "image/png",
        size: 1024,
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      upload: {
        publicUrl: "https://cdn.example.com/tenants/tenant-1/settings/logo.png",
        method: "PUT",
        expiresIn: 300,
      },
    });
    expect(state.createLogoUploadTarget).toHaveBeenCalledWith("tenant-1", {
      fileName: "logo.png",
      contentType: "image/png",
      size: 1024,
    });
  });

  it("rejects unsupported logo files", async () => {
    const res = await POST(
      request({
        fileName: "logo.svg",
        contentType: "image/svg+xml",
        size: 1024,
      })
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(state.createLogoUploadTarget).not.toHaveBeenCalled();
  });

  it("returns a service error when object storage is not configured", async () => {
    state.createLogoUploadTarget.mockImplementation(() => {
      throw new Error("object_storage_not_configured");
    });

    const res = await POST(
      request({
        fileName: "logo.png",
        contentType: "image/png",
        size: 1024,
      })
    );

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("object_storage_not_configured");
  });
});
