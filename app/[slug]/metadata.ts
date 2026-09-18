import type { Metadata } from "next";

import type { ShopfrontTenant } from "./data";

export function metadataBase(): URL {
  const rootHost = process.env.ROOT_HOST?.trim();
  if (!rootHost) return new URL("http://localhost:3000");

  return new URL(/^https?:\/\//i.test(rootHost) ? rootHost : `https://${rootHost}`);
}

export type ShopfrontMetadata = {
  description: string;
  imageAlt: string;
  imageUrl: string;
  pageUrl: string;
  title: string;
};

export function getShopfrontMetadata(
  tenant: ShopfrontTenant | null,
  slug: string
): ShopfrontMetadata {
  const base = metadataBase();
  // Slugs are route segments. Encoding them here preserves the one-segment
  // canonical/OG URL even if imported tenant data contains URL-reserved text.
  const pageUrl = new URL(`/${encodeURIComponent(slug)}`, base).toString();
  const imageUrl = new URL("/favicon.ico", base).toString();

  if (!tenant) {
    return {
      title: "Shop not found | Bukay",
      description: "The requested Bukay shopfront could not be found.",
      imageAlt: "Bukay shopfront",
      pageUrl,
      imageUrl,
    };
  }

  const shopfrontName = tenant.name.trim() || "Bukay Shopfront";
  const serviceNames = tenant.services
    .map((service) => service.name.trim())
    .filter(Boolean)
    .slice(0, 3);

  return {
    title: `${shopfrontName} | Book with Bukay`,
    description:
      serviceNames.length > 0
        ? `Book ${serviceNames.join(", ")} and more with ${shopfrontName} on Bukay.`
        : `Book an appointment with ${shopfrontName} on Bukay.`,
    imageAlt: `${shopfrontName} booking page on Bukay`,
    pageUrl,
    imageUrl,
  };
}

export function asNextMetadata(metadata: ShopfrontMetadata): Metadata {
  return {
    title: metadata.title,
    description: metadata.description,
    alternates: { canonical: metadata.pageUrl },
    openGraph: {
      title: metadata.title,
      description: metadata.description,
      url: metadata.pageUrl,
      type: "website",
      siteName: "Bukay",
      images: [{ url: metadata.imageUrl, alt: metadata.imageAlt }],
    },
    twitter: {
      card: "summary",
      title: metadata.title,
      description: metadata.description,
      images: [metadata.imageUrl],
    },
  };
}
