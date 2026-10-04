import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: { tenant: { findUnique: state.findUnique } },
}));

import { bookingUrlForSlug, GET } from "@/app/api/qr/[slug]/route";

beforeEach(() => {
  state.findUnique.mockReset();
  state.findUnique.mockResolvedValue({ name: "Demo Salon", slug: "demo" });
});

describe("GET /api/qr/[slug]", () => {
  it("returns a branded PDF for an existing tenant", async () => {
    const response = await GET(new NextRequest("https://bukay.test/api/qr/demo"), {
      params: { slug: "demo" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("demo-booking-qr.pdf");
    const pdf = new TextDecoder().decode(await response.arrayBuffer());
    expect(pdf).toContain("https://bukay.test/demo");
    expect((pdf.match(/ re f/g) ?? []).length).toBeGreaterThan(100);
  });

  it("uses the public slug route as the booking URL", () => {
    expect(bookingUrlForSlug("demo salon", "https://bukay.test/api/qr/demo")).toBe(
      "https://bukay.test/demo%20salon"
    );
  });

  it("returns 404 when the tenant does not exist", async () => {
    state.findUnique.mockResolvedValueOnce(null);

    const response = await GET(new NextRequest("https://bukay.test/api/qr/missing"), {
      params: { slug: "missing" },
    });

    expect(response.status).toBe(404);
  });
});
