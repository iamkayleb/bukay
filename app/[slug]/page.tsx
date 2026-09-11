import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getShopfrontTenant } from "./data";

// Public shopfront pages are the entry point for every booking link, so they
// are rendered per-request but cached at the edge for a minute (see the
// stale-while-revalidate headers in next.config.js) rather than served
// force-dynamic on every hit.
export const revalidate = 60;

type ShopfrontPageProps = {
  params: { slug: string };
};

export async function generateMetadata({ params }: ShopfrontPageProps): Promise<Metadata> {
  const tenant = await getShopfrontTenant(params.slug);

  if (!tenant) {
    return { title: "Shop not found" };
  }

  const title = `${tenant.name} | Book with Bukay`;
  const description =
    tenant.services.length > 0
      ? `Book ${tenant.services
          .slice(0, 3)
          .map((service) => service.name)
          .join(", ")} and more with ${tenant.name} on Bukay.`
      : `Book an appointment with ${tenant.name} on Bukay.`;

  const path = `/${tenant.slug}`;
  const rootHost = process.env.ROOT_HOST?.trim();
  // Open Graph requires an absolute og:url, and Lighthouse's canonical audit
  // flags relative canonicals, so resolve both against metadataBase instead
  // of emitting a bare path when ROOT_HOST isn't configured.
  const metadataBase = new URL(rootHost ? `https://${rootHost}` : "http://localhost:3000");

  return {
    title,
    description,
    metadataBase,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "Bukay",
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
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
