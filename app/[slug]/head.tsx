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
    image: { alt: string; height: number; type: string; url: string; width: number };
    siteName: string;
    type: string;
    url: string;
  };
};

// This exported contract is deliberately separate from the JSX below so route
// metadata can be verified without depending on React's server renderer.
export function getShopfrontHeadMetadata(metadata: ShopfrontMetadata): ShopfrontHeadMetadata {
  return {
    title: metadata.title,
    description: metadata.description,
    canonicalUrl: metadata.pageUrl,
    openGraph: {
      url: metadata.pageUrl,
      type: "website",
      siteName: "Bukay",
      image: {
        url: metadata.imageUrl,
        alt: metadata.imageAlt,
        type: "image/png",
        width: 1200,
        height: 630,
      },
    },
  };
}

// The App Router consumes this structured metadata at runtime, while the
// default export below keeps the route's explicit HTML tag contract available.
// Keeping both forms derived from this one route contract prevents SEO values
// from diverging between server-rendered HTML and Next's metadata composition.
export function getShopfrontRouteMetadata(metadata: ShopfrontMetadata): Metadata {
  const head = getShopfrontHeadMetadata(metadata);

  return {
    title: head.title,
    description: head.description,
    alternates: { canonical: head.canonicalUrl },
    openGraph: {
      title: head.title,
      description: head.description,
      url: head.openGraph.url,
      type: "website",
      siteName: head.openGraph.siteName,
      images: [head.openGraph.image],
    },
    twitter: {
      card: "summary",
      title: head.title,
      description: head.description,
      images: [head.openGraph.image.url],
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
      <meta property="og:title" content={metadata.title} />
      <meta property="og:description" content={metadata.description} />
      <meta property="og:url" content={metadata.openGraph.url} />
      <meta property="og:type" content={metadata.openGraph.type} />
      <meta property="og:site_name" content={metadata.openGraph.siteName} />
      <meta property="og:image" content={metadata.openGraph.image.url} />
      <meta property="og:image:alt" content={metadata.openGraph.image.alt} />
      <meta property="og:image:type" content={metadata.openGraph.image.type} />
      <meta property="og:image:width" content={String(metadata.openGraph.image.width)} />
      <meta property="og:image:height" content={String(metadata.openGraph.image.height)} />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={metadata.title} />
      <meta name="twitter:description" content={metadata.description} />
      <meta name="twitter:image" content={metadata.openGraph.image.url} />
    </>
  );
}
