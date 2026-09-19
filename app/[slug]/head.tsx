import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getShopfrontTenant } from "./data";
import { getShopfrontMetadata, type ShopfrontMetadata } from "./metadata";

type ShopfrontHeadProps = {
  params: { slug: string };
};

export type ShopfrontHeadMetadata = Pick<ShopfrontMetadata, "description" | "title"> & {
  canonicalUrl: string;
  openGraph: {
    description: string;
    image: { alt: string; height: number; type: string; url: string; width: number };
    locale: string;
    siteName: string;
    title: string;
    type: "website";
    url: string;
  };
  twitter: {
    card: "summary";
    description: string;
    image: string;
    title: string;
  };
};

function nonEmptyMetadataValue(value: string, fallback: string): string {
  return value.trim() || fallback;
}

function webUrlOrFallback(value: string, fallback: string): string {
  // URL() accepts leading and trailing ASCII whitespace. Metadata attributes
  // should publish a canonical URL, never the unnormalised source value.
  const normalizedValue = value.trim();
  if (!normalizedValue) return fallback;

  try {
    const url = new URL(normalizedValue);
    // Canonical and social-preview URLs are public identifiers. Credentials
    // or fragments are not part of those identifiers and must not leak into
    // the tags even if a future metadata source provides them.
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.hash ||
      url.search
    ) {
      return fallback;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

// This exported contract is deliberately separate from the JSX below so route
// metadata can be verified without depending on React's server renderer.
export function getShopfrontHeadMetadata(metadata: ShopfrontMetadata): ShopfrontHeadMetadata {
  // Keep this boundary defensive. Even if a future metadata source supplies
  // blank display text, the route must continue to emit the required SEO tags
  // with meaningful title and description values.
  const title = nonEmptyMetadataValue(metadata.title, "Bukay Shopfront | Book with Bukay");
  const description = nonEmptyMetadataValue(
    metadata.description,
    "Book an appointment with Bukay on Bukay."
  );
  const canonicalUrl = webUrlOrFallback(metadata.pageUrl, "http://localhost:3000/");
  const imageUrl = webUrlOrFallback(metadata.imageUrl, "http://localhost:3000/opengraph-image");
  const imageAlt = nonEmptyMetadataValue(metadata.imageAlt, "Bukay shopfront booking page");

  return {
    title,
    description,
    canonicalUrl,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: "website",
      locale: "en_NG",
      siteName: "Bukay",
      image: {
        url: imageUrl,
        alt: imageAlt,
        type: "image/png",
        width: 1200,
        height: 630,
      },
    },
    twitter: {
      card: "summary",
      title,
      description,
      image: imageUrl,
    },
  };
}

// The App Router consumes this structured metadata at runtime, while the
// default export below keeps the route's explicit HTML tag contract available.
// Keeping both forms derived from this one route contract prevents SEO values
// from diverging between server-rendered HTML and Next's metadata composition.
export function getShopfrontRouteMetadata(metadata: ShopfrontMetadata): Metadata {
  const head = getShopfrontHeadMetadata(metadata);
  const canonicalUrl = new URL(head.canonicalUrl);

  return {
    // Declare the origin alongside the absolute URLs below so this remains a
    // complete App Router metadata contract if a future field is relative.
    metadataBase: new URL(canonicalUrl.origin),
    title: head.title,
    description: head.description,
    robots: {
      index: true,
      follow: true,
    },
    alternates: { canonical: head.canonicalUrl },
    openGraph: {
      title: head.openGraph.title,
      description: head.openGraph.description,
      url: head.openGraph.url,
      type: head.openGraph.type,
      locale: head.openGraph.locale,
      siteName: head.openGraph.siteName,
      images: [head.openGraph.image],
    },
    twitter: {
      card: head.twitter.card,
      title: head.twitter.title,
      description: head.twitter.description,
      images: [head.twitter.image],
    },
  };
}

export default async function Head({ params }: ShopfrontHeadProps) {
  const tenant = await getShopfrontTenant(params.slug);

  // Keep the metadata route aligned with the page route: unknown shopfronts
  // must resolve to Next's 404 response rather than publishing fallback tags.
  if (!tenant) {
    notFound();
  }

  const metadata = getShopfrontHeadMetadata(getShopfrontMetadata(tenant, params.slug));

  return (
    <>
      <title>{metadata.title}</title>
      <meta name="description" content={metadata.description} />
      <link rel="canonical" href={metadata.canonicalUrl} />
      <meta property="og:title" content={metadata.openGraph.title} />
      <meta property="og:description" content={metadata.openGraph.description} />
      <meta property="og:url" content={metadata.openGraph.url} />
      <meta property="og:type" content={metadata.openGraph.type} />
      <meta property="og:locale" content={metadata.openGraph.locale} />
      <meta property="og:site_name" content={metadata.openGraph.siteName} />
      <meta property="og:image" content={metadata.openGraph.image.url} />
      <meta property="og:image:alt" content={metadata.openGraph.image.alt} />
      <meta property="og:image:type" content={metadata.openGraph.image.type} />
      <meta property="og:image:width" content={String(metadata.openGraph.image.width)} />
      <meta property="og:image:height" content={String(metadata.openGraph.image.height)} />
      <meta name="twitter:card" content={metadata.twitter.card} />
      <meta name="twitter:title" content={metadata.twitter.title} />
      <meta name="twitter:description" content={metadata.twitter.description} />
      <meta name="twitter:image" content={metadata.twitter.image} />
    </>
  );
}
