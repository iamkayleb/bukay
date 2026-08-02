import type { CSSProperties } from "react";
import { headers } from "next/headers";

import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/lib/resolve-tenant";

export const dynamic = "force-dynamic";

type TenantBranding = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  brandColor: string;
  logoUrl: string | null;
  cancellationPolicy: string | null;
};

type PublicService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents?: number | null;
  priceKobo?: number | null;
};

const tenantSelect = {
  id: true,
  name: true,
  slug: true,
  currency: true,
  brandColor: true,
  logoUrl: true,
  cancellationPolicy: true,
};

const serviceSelect = {
  id: true,
  name: true,
  description: true,
  durationMinutes: true,
  priceCents: true,
};

const tenantDelegate = prisma.tenant as unknown as {
  findUnique(args: unknown): Promise<TenantBranding | null>;
};

const serviceDelegate = prisma.service as unknown as {
  findMany(args: unknown): Promise<PublicService[]>;
};

type BrandStyle = CSSProperties & {
  "--brand-color": string;
};

function fallbackBrandColor(color: string | null | undefined) {
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }

  return "#047857";
}

function formatPrice(service: PublicService, currency: string) {
  const minorUnits = service.priceCents ?? service.priceKobo ?? 0;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minorUnits / 100);
}

async function findPublicTenant() {
  const tenant = resolveTenant({
    headers: headers(),
  });

  if (tenant.tenantId) {
    return tenantDelegate.findUnique({
      where: { id: tenant.tenantId },
      select: tenantSelect,
    });
  }

  if (tenant.tenantSlug) {
    return tenantDelegate.findUnique({
      where: { slug: tenant.tenantSlug },
      select: tenantSelect,
    });
  }

  return null;
}

export default async function HomePage() {
  const tenant = await findPublicTenant();

  if (!tenant) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-20 text-white">
        <p className="text-sm font-semibold uppercase text-emerald-400">Bukay</p>
        <h1 className="mt-4 text-4xl font-semibold">Booking page unavailable</h1>
        <p className="mt-3 text-base text-slate-300">
          Use your salon's public Bukay URL to book an appointment.
        </p>
      </main>
    );
  }

  const services = await serviceDelegate.findMany({
    where: { tenantId: tenant.id, active: true },
    orderBy: { name: "asc" },
    select: serviceSelect,
  });
  const brandColor = fallbackBrandColor(tenant.brandColor);
  const brandStyle: BrandStyle = { "--brand-color": brandColor };

  return (
    <main
      className="min-h-screen bg-slate-950 px-5 py-8 text-white sm:px-8"
      style={brandStyle}
      data-testid="public-booking-page"
    >
      <section className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-8">
          <header className="space-y-6">
            {tenant.logoUrl ? (
              <img
                src={tenant.logoUrl}
                alt={`${tenant.name} logo`}
                className="h-16 max-w-56 rounded-md object-contain"
              />
            ) : (
              <div
                className="flex h-16 w-16 items-center justify-center rounded-md text-2xl font-semibold text-white"
                style={{ backgroundColor: "var(--brand-color)" }}
                aria-label={`${tenant.name} logo placeholder`}
              >
                {tenant.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="space-y-3">
              <p
                className="text-sm font-semibold uppercase"
                style={{ color: "var(--brand-color)" }}
              >
                Book an appointment
              </p>
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">
                {tenant.name}
              </h1>
              <p className="max-w-2xl text-base text-slate-300">
                Choose a service and request a booking time with {tenant.name}.
              </p>
            </div>
          </header>

          <section className="space-y-3" aria-labelledby="services-heading">
            <h2 id="services-heading" className="text-xl font-semibold">
              Services
            </h2>
            <div className="grid gap-3">
              {services.length > 0 ? (
                services.map((service) => (
                  <article
                    key={service.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/70 p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-semibold">{service.name}</h3>
                        {service.description ? (
                          <p className="mt-1 text-sm text-slate-300">{service.description}</p>
                        ) : null}
                      </div>
                      <p className="text-sm font-semibold" style={{ color: "var(--brand-color)" }}>
                        {formatPrice(service, tenant.currency)}
                      </p>
                    </div>
                    <p className="mt-3 text-sm text-slate-400">
                      {service.durationMinutes} minutes
                    </p>
                  </article>
                ))
              ) : (
                <p className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
                  No services are available for online booking yet.
                </p>
              )}
            </div>
          </section>
        </div>

        <aside className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-lg font-semibold">Booking details</h2>
          <button
            type="button"
            className="mt-4 w-full rounded-md px-4 py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--brand-color)" }}
          >
            Request appointment
          </button>
          {tenant.cancellationPolicy ? (
            <div className="mt-5 border-t border-slate-800 pt-4">
              <h3 className="text-sm font-semibold text-slate-200">Cancellation policy</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{tenant.cancellationPolicy}</p>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
