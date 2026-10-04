import { NextRequest } from "next/server";
import jsQR from "jsqr";
import { describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/app/db/prisma", () => ({ prisma: { tenant: { findUnique } } }));

import { GET } from "@/app/api/qr/[slug]/route";
import { bookingUrl, buildQrPdf, qrMatrix } from "@/app/lib/qr-pdf";

describe("qr link", () => {
  it("builds the booking url as /{slug}", () => {
    expect(bookingUrl("https://bukay.app/", "glow-salon")).toBe("https://bukay.app/glow-salon");
  });

  it("encodes a matrix that decodes back to the booking url", () => {
    const url = bookingUrl("https://bukay.app", "glow-salon");
    const m = qrMatrix(url);
    const scale = 4;
    const q = 4;
    const size = (m.length + q * 2) * scale;
    const px = new Uint8ClampedArray(size * size * 4).fill(255);
    m.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (!dark) return;
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const i = (((y + q) * scale + dy) * size + (x + q) * scale + dx) * 4;
            px[i] = px[i + 1] = px[i + 2] = 0;
          }
      })
    );
    expect(jsQR(px, size, size)?.data).toBe(url);
  });

  it("produces a PDF containing the tenant name and url", () => {
    const pdf = buildQrPdf({ name: "Glow (Salon)", slug: "glow", origin: "https://bukay.app" });
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("Glow \\(Salon\\)");
    expect(text).toContain("https://bukay.app/glow");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("route returns 200 with a PDF body", async () => {
    findUnique.mockResolvedValue({ name: "Glow", slug: "glow", active: true });
    const res = await GET(new NextRequest("https://bukay.app/api/qr/glow"), {
      params: { slug: "glow" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("route returns the PNG when asked", async () => {
    findUnique.mockResolvedValue({ name: "Glow", slug: "glow", active: true });
    const res = await GET(new NextRequest("https://bukay.app/api/qr/glow?format=png"), {
      params: { slug: "glow" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("route returns 404 for an unknown tenant", async () => {
    findUnique.mockResolvedValue(null);
    const res = await GET(new NextRequest("https://bukay.app/api/qr/nope"), {
      params: { slug: "nope" },
    });
    expect(res.status).toBe(404);
  });
});
