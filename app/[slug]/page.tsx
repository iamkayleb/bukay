import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { buildPublicTenantMetadata } from "./head";
import { getPublicTenantBySlug, isPublicTenantInactive } from "./tenant";

/** Cache the shopfront briefly; CDN may serve stale while revalidating (see next.config.js). */
export const revalidate = 60;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatPrice(priceCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(priceCents / 100);
  } catch {
    return `${(priceCents / 100).toFixed(2)} ${currency}`;
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
}

type PageProps = {
  params: { slug: string };
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const slug = params.slug?.trim().toLowerCase();
  if (!slug) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const tenant = await getPublicTenantBySlug(slug);
  if (!tenant || isPublicTenantInactive(tenant)) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  return buildPublicTenantMetadata(tenant);
}

export default async function PublicTenantPage({ params }: PageProps) {
  const slug = params.slug?.trim().toLowerCase();
  if (!slug) {
    notFound();
  }

  const tenant = await getPublicTenantBySlug(slug);
  if (!tenant || isPublicTenantInactive(tenant)) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-10 px-6 py-16 text-slate-100">
      <header className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          {tenant.name}
        </p>
        <h1 className="text-4xl font-semibold text-white md:text-5xl">Book with {tenant.name}</h1>
        <p className="max-w-2xl text-base text-slate-300">
          Choose a service and reserve a time that works for you. Times shown in {tenant.timezone}.
        </p>
        <a
          href="#book"
          className="inline-flex w-fit items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
        >
          Book now
        </a>
      </header>

      <section aria-labelledby="services-heading" className="space-y-4" id="book">
        <h2 id="services-heading" className="text-xl font-semibold text-white">
          Services
        </h2>
        {tenant.services.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-5 py-8 text-sm text-slate-400">
            No services are listed yet. Check back soon or contact the business directly.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {tenant.services.map((service) => (
              <li
                key={service.id}
                className="rounded-lg border border-slate-800 bg-slate-900/60 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-white">{service.name}</h3>
                  <p className="shrink-0 text-sm font-medium text-emerald-300">
                    {formatPrice(service.priceCents, service.currency || tenant.currency)}
                  </p>
                </div>
                {service.description ? (
                  <p className="mt-2 text-sm text-slate-300">{service.description}</p>
                ) : null}
                <p className="mt-3 text-xs uppercase tracking-wide text-slate-400">
                  {formatDuration(service.durationMinutes)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="hours-heading" className="space-y-4">
        <h2 id="hours-heading" className="text-xl font-semibold text-white">
          Hours
        </h2>
        {tenant.businessHours.length === 0 ? (
          <p className="text-sm text-slate-400">Hours available by appointment.</p>
        ) : (
          <ul className="divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60">
            {tenant.businessHours.map((hour) => (
              <li
                key={hour.id}
                className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
              >
                <span className="font-medium text-slate-200">
                  {DAY_NAMES[hour.dayOfWeek] ?? `Day ${hour.dayOfWeek}`}
                </span>
                <span className="text-slate-400">
                  {hour.isClosed ? "Closed" : `${hour.opensAt} – ${hour.closesAt}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="border-t border-slate-800 pt-6 text-sm text-slate-500">
        Powered by Bukay · /{tenant.slug}
      </footer>
    </main>
  );
}
