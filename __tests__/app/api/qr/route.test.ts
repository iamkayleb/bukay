import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: state.findUnique,
    },
  },
}));

import { GET } from "@/app/api/qr/[slug]/route";

beforeEach(() => {
  state.findUnique.mockReset();
});

function call(slug: string) {
  return GET(new NextRequest(`http://app.test/api/qr/${slug}`), { params: { slug } });
}

describe("GET /api/qr/[slug]", () => {
  it("returns HTTP 200 with a PDF whose code resolves to /{slug}", async () => {
    state.findUnique.mockResolvedValue({ name: "Ada Salon", slug: "ada-salon" });

    const response = await call("ada-salon");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("ada-salon-booking-qr.pdf");
    expect(response.headers.get("x-booking-path")).toBe("/ada-salon");

    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    const loaded = await PDFDocument.load(bytes);
    expect(new URL(loaded.getSubject() ?? "http://invalid").pathname).toBe("/ada-salon");
  });

  it("returns 404 when the slug does not match a tenant", async () => {
    state.findUnique.mockResolvedValue(null);
    const response = await call("missing-shop");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "not_found" });
  });

  it("returns 400 for an invalid slug", async () => {
    const response = await call("not a slug");
    expect(response.status).toBe(400);
    expect(state.findUnique).not.toHaveBeenCalled();
  });
});
