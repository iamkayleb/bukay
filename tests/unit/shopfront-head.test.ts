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
import { generateMetadata } from "@/app/[slug]/page";

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
    expect(markup).toContain('<meta property="og:image:type" content="image/png"/>');
    expect(markup).toContain('<meta property="og:image:width" content="1200"/>');
    expect(markup).toContain('<meta property="og:image:height" content="630"/>');
    expect(markup).toContain('<link rel="canonical" href="http://localhost:3000/head-test-salon"/>');
    expect(markup).toContain('<meta property="og:url" content="http://localhost:3000/head-test-salon"/>');
    expect(markup).toContain('<meta property="og:type" content="website"/>');
  });

  it("exports complete structured route metadata for Next head composition", async () => {
    const metadata = await generateMetadata({ params: { slug: "head-test-salon" } });

    expect(metadata.title).toBe("Head Test Salon | Book with Bukay");
    expect(metadata.description).toBe(
      "Book Haircut and more with Head Test Salon on Bukay.",
    );
    expect(metadata.openGraph).toMatchObject({
      title: "Head Test Salon | Book with Bukay",
      description: "Book Haircut and more with Head Test Salon on Bukay.",
      type: "website",
    });
    expect(metadata.openGraph?.images).toEqual([
      {
        url: "http://localhost:3000/head-test-salon/opengraph-image",
        alt: "Head Test Salon booking page on Bukay",
      },
    ]);
  });

  it("does not render fallback metadata for an unknown shopfront", async () => {
    getShopfrontTenant.mockResolvedValueOnce(null);

    await expect(Head({ params: { slug: "missing-shopfront" } })).rejects.toThrow("not found");
  });

  it("does not generate shopfront metadata for an unknown slug", async () => {
    getShopfrontTenant.mockResolvedValueOnce(null);

    await expect(generateMetadata({ params: { slug: "missing-shopfront" } })).rejects.toThrow(
      "not found",
    );
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

  it("encodes a route slug consistently in canonical and Open Graph URLs", async () => {
    getShopfrontTenant.mockResolvedValueOnce({
      id: "tenant-id",
      name: "Encoded Slug Salon",
      slug: "encoded-slug",
      currency: "NGN",
      services: [],
    });

    const markup = renderToStaticMarkup(await Head({ params: { slug: "encoded slug/preview" } }));

    expect(markup).toContain(
      '<link rel="canonical" href="http://localhost:3000/encoded%20slug%2Fpreview"/>',
    );
    expect(markup).toContain(
      '<meta property="og:url" content="http://localhost:3000/encoded%20slug%2Fpreview"/>',
    );
    expect(markup).toContain(
      '<meta property="og:image" content="http://localhost:3000/encoded%20slug%2Fpreview/opengraph-image"/>',
    );
  });
});
