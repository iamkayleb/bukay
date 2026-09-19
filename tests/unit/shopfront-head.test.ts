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
    expect(metadata.twitter).toEqual({
      card: "summary",
      title: "Head Test Salon | Book with Bukay",
      description: "Book Haircut and more with Head Test Salon on Bukay.",
      image: "http://localhost:3000/head-test-salon/opengraph-image",
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

  it("keeps canonical and Open Graph image URLs usable at the head boundary", () => {
    const metadata = getShopfrontHeadMetadata({
      title: "Resilient Shopfront | Book with Bukay",
      description: "Book a resilient shopfront on Bukay.",
      pageUrl: "not a URL",
      imageUrl: "javascript:alert(1)",
      imageAlt: "   ",
    });

    expect(metadata.canonicalUrl).toBe("http://localhost:3000/");
    expect(metadata.openGraph.url).toBe(metadata.canonicalUrl);
    expect(metadata.openGraph.image.url).toBe("http://localhost:3000/opengraph-image");
    expect(metadata.openGraph.image.alt).toBe("Bukay shopfront booking page");
  });

  it("does not publish credentials or fragments in canonical and Open Graph URLs", () => {
    const metadata = getShopfrontHeadMetadata({
      title: "Private URL Salon | Book with Bukay",
      description: "Book a private URL shopfront on Bukay.",
      pageUrl: "https://metadata-user:metadata-password@example.test/private-url-salon#booking",
      imageUrl: "https://example.test/private-url-salon/opengraph-image#preview",
      imageAlt: "Private URL Salon booking page on Bukay",
    });

    expect(metadata.canonicalUrl).toBe("http://localhost:3000/");
    expect(metadata.openGraph.url).toBe("http://localhost:3000/");
    expect(metadata.openGraph.image.url).toBe("http://localhost:3000/opengraph-image");
  });

  it("keeps Next's structured metadata URLs sanitized with the explicit head tags", () => {
    const metadata = getShopfrontRouteMetadata({
      title: "Structured Metadata Salon | Book with Bukay",
      description: "Book with Structured Metadata Salon on Bukay.",
      pageUrl: "https://metadata-user:metadata-password@example.test/shopfront#booking",
      imageUrl: "javascript:alert(1)",
      imageAlt: "Structured Metadata Salon booking page on Bukay",
    });
    const ogImages = metadata.openGraph?.images;
    const ogImage = Array.isArray(ogImages) ? ogImages[0] : ogImages;
    const ogImageUrl =
      typeof ogImage === "string" || ogImage instanceof URL ? ogImage.toString() : ogImage?.url;

    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/");
    expect(metadata.openGraph?.url).toBe("http://localhost:3000/");
    expect(ogImageUrl).toBe("http://localhost:3000/opengraph-image");
  });

  it("does not publish query-string URLs as canonical or Open Graph metadata", () => {
    const metadata = getShopfrontHeadMetadata({
      title: "Query String Salon | Book with Bukay",
      description: "Book with Query String Salon on Bukay.",
      pageUrl: "https://shops.bukay.test/query-string-salon?ref=tracking",
      imageUrl: "https://shops.bukay.test/query-string-salon/opengraph-image?ref=tracking",
      imageAlt: "Query String Salon booking page on Bukay",
    });

    expect(metadata.canonicalUrl).toBe("http://localhost:3000/");
    expect(metadata.openGraph.url).toBe(metadata.canonicalUrl);
    expect(metadata.openGraph.image.url).toBe("http://localhost:3000/opengraph-image");
  });

  it("normalizes whitespace around route metadata URLs", () => {
    const metadata = getShopfrontHeadMetadata({
      title: "Whitespace URL Salon | Book with Bukay",
      description: "Book a whitespace URL shopfront on Bukay.",
      pageUrl: " \nhttp://localhost:3000/whitespace-url-salon\t ",
      imageUrl: " \nhttp://localhost:3000/whitespace-url-salon/opengraph-image\t ",
      imageAlt: "Whitespace URL Salon booking page on Bukay",
    });

    expect(metadata.canonicalUrl).toBe("http://localhost:3000/whitespace-url-salon");
    expect(metadata.openGraph.url).toBe(metadata.canonicalUrl);
    expect(metadata.openGraph.image.url).toBe(
      "http://localhost:3000/whitespace-url-salon/opengraph-image",
    );
  });

  it("uses crawlable fallbacks when metadata contains only invisible characters", () => {
    const metadata = getShopfrontHeadMetadata({
      title: "\u200B\u200C\u200D\uFEFF",
      description: "\u200B\u200C\u200D\uFEFF",
      pageUrl: "http://localhost:3000/invisible-metadata-salon",
      imageUrl: "http://localhost:3000/invisible-metadata-salon/opengraph-image",
      imageAlt: "\u200B\u200C\u200D\uFEFF",
    });

    expect(metadata.title).toBe("Bukay Shopfront | Book with Bukay");
    expect(metadata.description).toBe("Book an appointment with Bukay on Bukay.");
    expect(metadata.openGraph.title).toBe(metadata.title);
    expect(metadata.openGraph.description).toBe(metadata.description);
    expect(metadata.openGraph.image.alt).toBe("Bukay shopfront booking page");
  });

  it("uses crawlable fallbacks when metadata contains only control characters", () => {
    const metadata = getShopfrontHeadMetadata({
      title: "\u0000\u0001\u007F\u009F",
      description: "\u0000\u0001\u007F\u009F",
      pageUrl: "http://localhost:3000/control-character-salon",
      imageUrl: "http://localhost:3000/control-character-salon/opengraph-image",
      imageAlt: "\u0000\u0001\u007F\u009F",
    });

    expect(metadata.title).toBe("Bukay Shopfront | Book with Bukay");
    expect(metadata.description).toBe("Book an appointment with Bukay on Bukay.");
    expect(metadata.openGraph.title).toBe(metadata.title);
    expect(metadata.openGraph.description).toBe(metadata.description);
    expect(metadata.openGraph.image.alt).toBe("Bukay shopfront booking page");
  });

  it("uses crawlable fallbacks for Unicode formatting-only metadata", () => {
    const metadata = getShopfrontHeadMetadata({
      title: "\u2060\u200E\u202A",
      description: "\u034F\u061C\u2060",
      pageUrl: "http://localhost:3000/formatting-only-metadata-salon",
      imageUrl: "http://localhost:3000/formatting-only-metadata-salon/opengraph-image",
      imageAlt: "\u00AD\u180E\u2060",
    });

    expect(metadata.title).toBe("Bukay Shopfront | Book with Bukay");
    expect(metadata.description).toBe("Book an appointment with Bukay on Bukay.");
    expect(metadata.openGraph.title).toBe(metadata.title);
    expect(metadata.openGraph.description).toBe(metadata.description);
    expect(metadata.openGraph.image.alt).toBe("Bukay shopfront booking page");
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
    expect(markup).toContain('<meta name="twitter:card" content="summary"/>');
    expect(markup).toContain(
      '<meta name="twitter:title" content="Head Test Salon | Book with Bukay"/>',
    );
    expect(markup).toContain(
      '<meta name="twitter:description" content="Book Haircut and more with Head Test Salon on Bukay."/>',
    );
    expect(markup).toContain(
      '<meta name="twitter:image" content="http://localhost:3000/head-test-salon/opengraph-image"/>',
    );
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

    // The explicit head component is composed with Next's route metadata in
    // the rendered document. Keep its own core tags singular so a future JSX
    // change cannot introduce conflicting title, description, or Open Graph
    // values before the route-level integration test catches it.
    expect(markup.match(/<title>/g)).toHaveLength(1);
    expect(markup.match(/<meta name="description"/g)).toHaveLength(1);
    expect(markup.match(/<meta property="og:title"/g)).toHaveLength(1);
    expect(markup.match(/<meta property="og:description"/g)).toHaveLength(1);
    expect(markup.match(/<meta property="og:image"/g)).toHaveLength(1);
  });

  it("publishes a secure Open Graph image URL when the shopfront is served over HTTPS", async () => {
    const previousRootHost = process.env.ROOT_HOST;
    process.env.ROOT_HOST = "https://shops.bukay.test";

    try {
      const markup = renderToStaticMarkup(await Head({ params: { slug: "head-test-salon" } }));

      expect(markup).toContain(
        '<meta property="og:image:secure_url" content="https://shops.bukay.test/head-test-salon/opengraph-image"/>',
      );
    } finally {
      if (previousRootHost === undefined) {
        delete process.env.ROOT_HOST;
      } else {
        process.env.ROOT_HOST = previousRootHost;
      }
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

  it("escapes quoted tenant text in title, description, and Open Graph tags", async () => {
    getShopfrontTenant.mockResolvedValueOnce({
      id: "tenant-id",
      name: 'Quoted "Salon"',
      slug: "quoted-salon",
      currency: "NGN",
      services: [{ name: 'Cut "&" Style' }],
    });

    const markup = renderToStaticMarkup(await Head({ params: { slug: "quoted-salon" } }));

    expect(markup).toContain("<title>Quoted &quot;Salon&quot; | Book with Bukay</title>");
    expect(markup).toContain(
      'meta name="description" content="Book Cut &quot;&amp;&quot; Style and more with Quoted &quot;Salon&quot; on Bukay."',
    );
    expect(markup).toContain(
      'meta property="og:title" content="Quoted &quot;Salon&quot; | Book with Bukay"',
    );
    expect(markup).toContain(
      'meta property="og:description" content="Book Cut &quot;&amp;&quot; Style and more with Quoted &quot;Salon&quot; on Bukay."',
    );
    expect(markup).not.toContain('name="description" content="Book Cut "&" Style');
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
