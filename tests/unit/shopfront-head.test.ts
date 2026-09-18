import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getShopfrontTenant } = vi.hoisted(() => ({ getShopfrontTenant: vi.fn() }));

vi.mock("@/app/[slug]/data", () => ({ getShopfrontTenant }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));

import Head from "@/app/[slug]/head";

describe("shopfront head", () => {
  beforeEach(() => {
    getShopfrontTenant.mockResolvedValue({
      id: "tenant-id",
      name: "Head Test Salon",
      slug: "head-test-salon",
      currency: "NGN",
      services: [{ name: "Haircut" }],
    });
  });

  it("renders title, description, and Open Graph image metadata for a shopfront", async () => {
    const markup = renderToStaticMarkup(await Head({ params: { slug: "head-test-salon" } }));

    expect(markup).toContain("<title>Head Test Salon | Book with Bukay</title>");
    expect(markup).toContain(
      '<meta name="description" content="Book Haircut and more with Head Test Salon on Bukay."/>',
    );
    expect(markup).toContain(
      '<meta property="og:title" content="Head Test Salon | Book with Bukay"/>',
    );
    expect(markup).toContain(
      '<meta property="og:description" content="Book Haircut and more with Head Test Salon on Bukay."/>',
    );
    expect(markup).toContain(
      '<meta property="og:image" content="http://localhost:3000/head-test-salon/opengraph-image"/>',
    );
    expect(markup).toContain(
      '<meta property="og:image:alt" content="Head Test Salon booking page on Bukay"/>',
    );
    expect(markup).toContain('<link rel="canonical" href="http://localhost:3000/head-test-salon"/>');
    expect(markup).toContain('<meta property="og:url" content="http://localhost:3000/head-test-salon"/>');
    expect(markup).toContain('<meta property="og:type" content="website"/>');
  });

  it("does not render fallback metadata for an unknown shopfront", async () => {
    getShopfrontTenant.mockResolvedValueOnce(null);

    await expect(Head({ params: { slug: "missing-shopfront" } })).rejects.toThrow("not found");
  });

  it("keeps required route metadata non-empty when tenant display fields are blank", async () => {
    getShopfrontTenant.mockResolvedValueOnce({
      id: "tenant-id",
      name: "   ",
      slug: "sparse-shopfront",
      currency: "NGN",
      services: [{ name: " " }],
    });

    const markup = renderToStaticMarkup(await Head({ params: { slug: "sparse-shopfront" } }));

    expect(markup).toContain("<title>Bukay Shopfront | Book with Bukay</title>");
    expect(markup).toContain('meta name="description" content="Book an appointment with Bukay Shopfront on Bukay."');
    expect(markup).toContain('meta property="og:title" content="Bukay Shopfront | Book with Bukay"');
    expect(markup).toContain(
      'meta property="og:description" content="Book an appointment with Bukay Shopfront on Bukay."',
    );
    expect(markup).toContain(
      'meta property="og:image" content="http://localhost:3000/sparse-shopfront/opengraph-image"',
    );
  });
});
