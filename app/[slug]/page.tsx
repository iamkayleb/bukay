import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getShopfrontTenant } from "./data";
import { getShopfrontMetadata } from "./metadata";

export const revalidate = 60;

type ShopfrontPageProps = {
  params: { slug: string };
};

// `head.tsx` remains the explicit metadata surface for this route, while this
// API is what Next uses when composing the document head for a dynamic segment.
export async function generateMetadata({ params }: ShopfrontPageProps): Promise<Metadata> {
  const tenant = await getShopfrontTenant(params.slug);

  // Metadata is resolved before the page is rendered. Stop here for an
  // unknown slug so Next emits its 404 document instead of route metadata
  // describing a shopfront that does not exist.
  if (!tenant) {
    notFound();
  }

  const metadata = getShopfrontMetadata(tenant, params.slug);

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

function formatPrice(priceCents: number, currency: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(priceCents / 100);
}

export default async function ShopfrontPage({ params }: ShopfrontPageProps) {
  const tenant = await getShopfrontTenant(params.slug);

  if (!tenant) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16 text-slate-100">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Bukay</p>
        <h1 className="text-3xl font-semibold text-white md:text-4xl">{tenant.name}</h1>
        <p className="text-sm text-slate-300">Book an appointment in a few taps.</p>
      </header>

      <section aria-labelledby="shopfront-services-heading" className="space-y-4">
        <h2 id="shopfront-services-heading" className="text-lg font-medium text-white">
          Services
        </h2>
        {tenant.services.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-5 py-8 text-center text-sm text-slate-400">
            No services are available for booking yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
            {tenant.services.map((service) => (
              <li key={service.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <div>
                  <p className="font-medium text-white">{service.name}</p>
                  {service.description ? (
                    <p className="text-sm text-slate-400">{service.description}</p>
                  ) : null}
                  <p className="text-sm text-slate-400">{service.durationMinutes} min</p>
                </div>
                <p className="font-semibold text-emerald-400">
                  {formatPrice(service.priceCents, tenant.currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
