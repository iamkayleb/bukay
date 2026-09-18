import type { Metadata } from "next";

import type { ShopfrontTenant } from "./data";

function metadataBase(): URL {
  const rootHost = process.env.ROOT_HOST?.trim();
  return new URL(rootHost ? `https://${rootHost}` : "http://localhost:3000");
}

export type ShopfrontMetadata = {
  description: string;
  imageUrl: string;
  pageUrl: string;
  title: string;
};

export function getShopfrontMetadata(
  tenant: ShopfrontTenant | null,
  slug: string
): ShopfrontMetadata {
  const base = metadataBase();
  const pageUrl = new URL(`/${slug}`, base).toString();
  const imageUrl = new URL("/favicon.ico", base).toString();

  if (!tenant) {
    return {
      title: "Shop not found | Bukay",
      description: "The requested Bukay shopfront could not be found.",
      pageUrl,
      imageUrl,
    };
  }

  return {
    title: `${tenant.name} | Book with Bukay`,
    description:
      tenant.services.length > 0
        ? `Book ${tenant.services
            .slice(0, 3)
            .map((service) => service.name)
            .join(", ")} and more with ${tenant.name} on Bukay.`
        : `Book an appointment with ${tenant.name} on Bukay.`,
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
      images: [{ url: metadata.imageUrl }],
    },
    twitter: {
      card: "summary",
      title: metadata.title,
      description: metadata.description,
      images: [metadata.imageUrl],
    },
  };
}
