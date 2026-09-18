import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getShopfrontTenant } from "./data";

export const revalidate = 60;

type ShopfrontPageProps = {
  params: { slug: string };
};

function formatPrice(priceCents: number, currency: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(priceCents / 100);
}

function metadataBase(): URL {
  const rootHost = process.env.ROOT_HOST?.trim();
  return new URL(rootHost ? `https://${rootHost}` : "http://localhost:3000");
}

export async function generateMetadata({ params }: ShopfrontPageProps): Promise<Metadata> {
  const tenant = await getShopfrontTenant(params.slug);

  if (!tenant) {
    return {
      title: "Shop not found | Bukay",
      description: "The requested Bukay shopfront could not be found.",
    };
  }

  const title = `${tenant.name} | Book with Bukay`;
  const description =
    tenant.services.length > 0
      ? `Book ${tenant.services
          .slice(0, 3)
          .map((service) => service.name)
          .join(", ")} and more with ${tenant.name} on Bukay.`
      : `Book an appointment with ${tenant.name} on Bukay.`;
  const base = metadataBase();
  const pageUrl = new URL(`/${tenant.slug}`, base);
  const imageUrl = new URL("/favicon.ico", base);

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title,
      description,
      url: pageUrl,
      type: "website",
      siteName: "Bukay",
      images: [{ url: imageUrl }],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [imageUrl],
    },
  };
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
