import type { Metadata } from "next";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type TenantMetaInput = {
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  services: Array<{ name: string }>;
  businessHours: Array<{
    dayOfWeek: number;
    opensAt: string;
    closesAt: string;
    isClosed: boolean;
  }>;
};

function formatHoursSummary(hours: TenantMetaInput["businessHours"]): string {
  const openDays = hours.filter((h) => !h.isClosed);
  if (openDays.length === 0) {
    return "Hours by appointment";
  }

  const first = openDays[0];
  const sameWindow = openDays.every(
    (h) => h.opensAt === first.opensAt && h.closesAt === first.closesAt
  );

  if (sameWindow) {
    const names = openDays.map((h) => DAY_NAMES[h.dayOfWeek] ?? `Day ${h.dayOfWeek}`);
    return `${names[0]}–${names[names.length - 1]} ${first.opensAt}–${first.closesAt}`;
  }

  return openDays
    .map((h) => `${DAY_NAMES[h.dayOfWeek] ?? `Day ${h.dayOfWeek}`} ${h.opensAt}–${h.closesAt}`)
    .join(", ");
}

function absoluteUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.ROOT_HOST ?? "http://localhost:3000")
    .trim()
    .replace(/\/$/, "");
  const withProtocol = /^https?:\/\//i.test(base) ? base : `https://${base}`;
  return `${withProtocol}${path.startsWith("/") ? path : `/${path}`}`;
}

/** SEO meta tags for a public tenant shopfront. */
export function buildSeoMeta(
  tenant: TenantMetaInput
): Pick<Metadata, "title" | "description" | "keywords" | "robots" | "alternates"> {
  const serviceNames = tenant.services.map((s) => s.name).filter(Boolean);
  const hours = formatHoursSummary(tenant.businessHours);
  const description = [
    `Book with ${tenant.name}.`,
    serviceNames.length > 0 ? `Services: ${serviceNames.slice(0, 5).join(", ")}.` : null,
    `Open ${hours}.`,
    `Timezone ${tenant.timezone}, prices in ${tenant.currency}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title: `${tenant.name} | Book online`,
    description,
    keywords: [tenant.name, "booking", "appointments", ...serviceNames].slice(0, 12),
    robots: { index: true, follow: true },
    alternates: {
      canonical: absoluteUrl(`/${tenant.slug}`),
    },
  };
}

/** Open Graph tags for social previews of a public tenant shopfront. */
export function buildOpenGraphMeta(
  tenant: Pick<TenantMetaInput, "name" | "slug" | "services">
): NonNullable<Metadata["openGraph"]> & { twitter: NonNullable<Metadata["twitter"]> } {
  const url = absoluteUrl(`/${tenant.slug}`);
  const description =
    tenant.services.length > 0
      ? `Book ${tenant.services
          .map((s) => s.name)
          .slice(0, 3)
          .join(", ")} at ${tenant.name}.`
      : `Book an appointment with ${tenant.name}.`;

  return {
    type: "website",
    locale: "en_US",
    url,
    title: `${tenant.name} | Book online`,
    description,
    siteName: "Bukay",
    images: [
      {
        url: absoluteUrl("/og-default.png"),
        width: 1200,
        height: 630,
        alt: `${tenant.name} on Bukay`,
      },
    ],
    twitter: {
      card: "summary_large_image",
      title: `${tenant.name} | Book online`,
      description,
      images: [absoluteUrl("/og-default.png")],
    },
  };
}

/** Combine SEO + Open Graph metadata for a public tenant page. */
export function buildPublicTenantMetadata(tenant: TenantMetaInput): Metadata {
  const seo = buildSeoMeta(tenant);
  const { twitter, ...openGraph } = buildOpenGraphMeta(tenant);
  return {
    ...seo,
    openGraph,
    twitter,
  };
}
