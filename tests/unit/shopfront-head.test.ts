import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getShopfrontTenant } = vi.hoisted(() => ({ getShopfrontTenant: vi.fn() }));

vi.mock("@/app/[slug]/data", () => ({ getShopfrontTenant }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));

import Head, { getShopfrontHeadMetadata, getShopfrontRouteMetadata } from "@/app/[slug]/head";
import { getShopfrontMetadata } from "@/app/[slug]/metadata";
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

  it("exports the complete shopfront route metadata contract", () => {
    const metadata = getShopfrontHeadMetadata(
      getShopfrontMetadata(
        {
          id: "tenant-id",
          name: "Head Test Salon",
          slug: "head-test-salon",
          currency: "NGN",
          services: [
            {
              id: "service-id",
              name: "Haircut",
              description: null,
              durationMinutes: 30,
              priceCents: 5000,
            },
          ],
        },
        "head-test-salon",
      ),
    );

    expect(metadata.title).toBe("Head Test Salon | Book with Bukay");
    expect(metadata.description).toBe("Book Haircut and more with Head Test Salon on Bukay.");
    expect(metadata.openGraph).toEqual({
      title: "Head Test Salon | Book with Bukay",
      description: "Book Haircut and more with Head Test Salon on Bukay.",
      url: "http://localhost:3000/head-test-salon",
      type: "website",
      locale: "en_NG",
      siteName: "Bukay",
      image: {
        url: "http://localhost:3000/head-test-salon/opengraph-image",
        alt: "Head Test Salon booking page on Bukay",
        type: "image/png",
        width: 1200,
        height: 630,
      },
    });
  });

  it("derives Next runtime metadata from the explicit shopfront head contract", () => {
    const routeMetadata = getShopfrontRouteMetadata(
      getShopfrontMetadata(
        {
          id: "tenant-id",
          name: "Head Test Salon",
          slug: "head-test-salon",
          currency: "NGN",
          services: [],
        },
        "head-test-salon",
      ),
    );

    expect(routeMetadata).toMatchObject({
      metadataBase: new URL("http://localhost:3000"),
      title: "Head Test Salon | Book with Bukay",
      description: "Book an appointment with Head Test Salon on Bukay.",
      robots: {
        index: true,
        follow: true,
      },
      alternates: { canonical: "http://localhost:3000/head-test-salon" },
      openGraph: {
        title: "Head Test Salon | Book with Bukay",
        description: "Book an appointment with Head Test Salon on Bukay.",
        url: "http://localhost:3000/head-test-salon",
        images: [
          {
            url: "http://localhost:3000/head-test-salon/opengraph-image",
            alt: "Head Test Salon booking page on Bukay",
          },
        ],
      },
    });
  });

  it("keeps every required route metadata value non-empty", () => {
    const routeMetadata = getShopfrontRouteMetadata(
      getShopfrontMetadata(
        {
          id: "tenant-id",
          name: "Required Metadata Salon",
          slug: "required-metadata-salon",
          currency: "NGN",
          services: [],
        },
        "required-metadata-salon",
      ),
    );
    const ogImages = routeMetadata.openGraph?.images;
    const ogImage = Array.isArray(ogImages) ? ogImages[0] : ogImages;
    const ogImageUrl =
      typeof ogImage === "string" || ogImage instanceof URL ? ogImage.toString() : ogImage?.url;

    expect(routeMetadata.title?.toString().trim()).not.toBe("");
    expect(routeMetadata.description?.trim()).not.toBe("");
    expect(routeMetadata.openGraph?.title?.toString().trim()).not.toBe("");
    expect(routeMetadata.openGraph?.description?.trim()).not.toBe("");
    expect(ogImageUrl?.toString().trim()).not.toBe("");
  });

  it("keeps route title and description non-empty at the head boundary", () => {
    const metadata = getShopfrontHeadMetadata({
      title: "   ",
      description: "\n",
      pageUrl: "http://localhost:3000/resilient-shopfront",
      imageUrl: "http://localhost:3000/resilient-shopfront/opengraph-image",
      imageAlt: "Resilient shopfront booking page on Bukay",
    });

    expect(metadata.title).toBe("Bukay Shopfront | Book with Bukay");
    expect(metadata.description).toBe("Book an appointment with Bukay on Bukay.");
    expect(metadata.openGraph.title).toBe(metadata.title);
    expect(metadata.openGraph.description).toBe(metadata.description);
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
    expect(markup).toContain('<meta property="og:locale" content="en_NG"/>');
  });

  it("renders every required explicit head tag with a non-empty value", async () => {
    const markup = renderToStaticMarkup(await Head({ params: { slug: "head-test-salon" } }));

    const requiredTags = [
      /<title>([^<]+)<\/title>/,
      /<meta name="description" content="([^"]+)"\/>/,
      /<meta property="og:title" content="([^"]+)"\/>/,
      /<meta property="og:description" content="([^"]+)"\/>/,
      /<meta property="og:image" content="([^"]+)"\/>/,
    ];

    for (const tag of requiredTags) {
      expect(markup.match(tag)?.[1].trim()).not.toBe("");
    }
  });

  it("escapes tenant text while retaining the explicit SEO tag contract", async () => {
    getShopfrontTenant.mockResolvedValueOnce({
      id: "tenant-id",
      name: "Safety & <Style> Salon",
      slug: "safe-style-salon",
      currency: "NGN",
      services: [{ name: "Cut & Color" }],
    });

    const markup = renderToStaticMarkup(await Head({ params: { slug: "safe-style-salon" } }));

    expect(markup).toContain("<title>Safety &amp; &lt;Style&gt; Salon | Book with Bukay</title>");
    expect(markup).toContain(
      'meta name="description" content="Book Cut &amp; Color and more with Safety &amp; &lt;Style&gt; Salon on Bukay."',
    );
    expect(markup).toContain(
      'meta property="og:title" content="Safety &amp; &lt;Style&gt; Salon | Book with Bukay"',
    );
    expect(markup).toContain(
      'meta property="og:description" content="Book Cut &amp; Color and more with Safety &amp; &lt;Style&gt; Salon on Bukay."',
    );
    expect(markup).toContain(
      'meta property="og:image" content="http://localhost:3000/safe-style-salon/opengraph-image"',
    );
    expect(markup).not.toContain("Safety & <Style> Salon");
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
        type: "image/png",
        width: 1200,
        height: 630,
      },
    ]);
  });

  it("keeps the explicit head tags aligned with Next's runtime metadata", async () => {
    getShopfrontTenant.mockResolvedValueOnce({
      id: "tenant-id",
      name: "Metadata Consistency Salon",
      slug: "metadata-consistency-salon",
      currency: "NGN",
      services: [{ name: "Consultation" }],
    });
    const markup = renderToStaticMarkup(
      await Head({ params: { slug: "metadata-consistency-salon" } }),
    );

    getShopfrontTenant.mockResolvedValueOnce({
      id: "tenant-id",
      name: "Metadata Consistency Salon",
      slug: "metadata-consistency-salon",
      currency: "NGN",
      services: [{ name: "Consultation" }],
    });
    const metadata = await generateMetadata({
      params: { slug: "metadata-consistency-salon" },
    });
    const ogImages = metadata.openGraph?.images;
    const ogImage = Array.isArray(ogImages) ? ogImages[0] : ogImages;
    const ogImageUrl =
      typeof ogImage === "string" || ogImage instanceof URL ? ogImage.toString() : ogImage?.url;

    expect(markup).toContain(`<title>${metadata.title}</title>`);
    expect(markup).toContain(`content="${metadata.description}"`);
    expect(markup).toContain(`content="${metadata.openGraph?.url}"`);
    expect(markup).toContain(`content="${ogImageUrl}"`);
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
    getShopfrontTenant.mockResolvedValue({
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

    // The page's runtime metadata is what Next uses to produce the document
    // head. Assert its required values too, so a future change cannot leave
    // the explicit head component valid while making the actual route
    // metadata empty for sparse tenant records.
    const routeMetadata = await generateMetadata({ params: { slug: "sparse-shopfront" } });
    const ogImages = routeMetadata.openGraph?.images;
    const ogImage = Array.isArray(ogImages) ? ogImages[0] : ogImages;
    const ogImageUrl =
      typeof ogImage === "string" || ogImage instanceof URL ? ogImage.toString() : ogImage?.url;

    expect(routeMetadata.title?.toString().trim()).not.toBe("");
    expect(routeMetadata.description?.trim()).not.toBe("");
    expect(routeMetadata.openGraph?.title?.toString().trim()).not.toBe("");
    expect(routeMetadata.openGraph?.description?.trim()).not.toBe("");
    expect(ogImageUrl?.toString().trim()).not.toBe("");
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
