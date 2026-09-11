import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/app/db/prisma", () => ({
  prisma: { tenant: { findUnique } },
}));

import ShopfrontHead from "@/app/[slug]/head";

describe("shopfront head", () => {
  it("renders tenant-specific SEO metadata", async () => {
    findUnique.mockResolvedValue({ name: "Bukay Demo Salon" });

    const head = await ShopfrontHead({ params: { slug: "demo salon" } });

    expect(findUnique).toHaveBeenCalledWith({
      where: { slug: "demo salon" },
      select: { name: true },
    });
    expect(renderToStaticMarkup(head)).toBe(
      '<title>Bukay Demo Salon | Book online</title><meta name="description" content="Book an appointment with Bukay Demo Salon online."/><meta name="robots" content="index, follow"/><link rel="canonical" href="/demo%20salon"/>'
    );
  });
});
