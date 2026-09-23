import type { ShopfrontTenant } from "./data";

export function metadataBase(): URL {
  const rootHost = process.env.ROOT_HOST?.trim();
  if (!rootHost) return new URL("http://localhost:3000");

  try {
    const base = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(rootHost) ? rootHost : `https://${rootHost}`
    );
    // Canonical and Open Graph URLs must be fetchable web URLs.  Accepting a
    // syntactically valid non-HTTP scheme here (for example, ftp:) would emit
    // unusable metadata for every shopfront in that deployment.
    if (base.protocol !== "http:" && base.protocol !== "https:") {
      return new URL("http://localhost:3000");
    }
    // ROOT_HOST identifies the public origin, not a page URL. Drop a
    // mistakenly supplied path and reject user info so canonical and Open
    // Graph URLs cannot publish deployment-only URL components.
    if (base.username || base.password) {
      return new URL("http://localhost:3000");
    }
    return new URL(base.origin);
  } catch {
    // Invalid deployment configuration must not turn an otherwise valid
    // shopfront into a 500 response or omit its required metadata.
    return new URL("http://localhost:3000");
  }
}

export type ShopfrontMetadata = {
  description: string;
  imageAlt: string;
  imageUrl: string;
  pageUrl: string;
  title: string;
};

function visibleText(value: string): string {
  // Tenant display fields are admin-provided content. Treat formatting and
  // control characters as empty so crawlers always receive meaningful
  // shopfront metadata rather than an apparently non-empty invisible label.
  return value
    .replace(
      /[\u0000-\u001F\u007F-\u009F\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFFF9-\uFFFB\u{E0000}-\u{E0FFF}\uFEFF]/gu,
      ""
    )
    .trim();
}

// The social-image route and the document metadata both represent the same
// shopfront. Keep their display-name fallback at this shared boundary so a
// non-visible tenant name cannot produce a crawlable title with a blank image.
export function shopfrontDisplayName(value: string): string {
  return visibleText(value) || "Bukay Shopfront";
}

export function getShopfrontMetadata(
  tenant: ShopfrontTenant | null,
  slug: string
): ShopfrontMetadata {
  const base = metadataBase();
  // Slugs are route segments. Encoding them here preserves the one-segment
  // canonical/OG URL even if imported tenant data contains URL-reserved text.
  const encodedSlug = encodeURIComponent(slug);
  const pageUrl = new URL(`/${encodedSlug}`, base).toString();
  // A full-size route image gives social clients a usable preview instead of
  // pointing them at the small browser favicon.
  const imageUrl = new URL(`/${encodedSlug}/opengraph-image`, base).toString();

  if (!tenant) {
    return {
      title: "Shop not found | Bukay",
      description: "The requested Bukay shopfront could not be found.",
      imageAlt: "Bukay shopfront",
      pageUrl,
      imageUrl,
    };
  }

  const shopfrontName = shopfrontDisplayName(tenant.name);
  // Services can legitimately share a display name. Repeating one in the
  // description makes the route's search and social metadata less useful,
  // so retain the first three distinct non-empty labels instead.
  const serviceNames = Array.from(
    tenant.services.reduce<string[]>((names, service) => {
      const name = visibleText(service.name);
      if (
        name &&
        // Service metadata is rendered on the server, where the default ICU
        // locale can differ between a developer machine and CI. Use the
        // locale-independent Unicode case mapping so equivalent display names
        // are consistently de-duplicated in the indexed description.
        !names.some((existingName) => existingName.toLowerCase() === name.toLowerCase())
      ) {
        names.push(name);
      }
      return names;
    }, [])
  ).slice(0, 3);

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
