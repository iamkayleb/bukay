import { notFound } from "next/navigation";

import { prisma } from "@/app/db/prisma";

type TenantLandingPageProps = {
  params: {
    slug: string;
  };
};

const weekdayLabels = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatPrice(priceCents: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}

function formatBusinessHour(
  dayOfWeek: number,
  opensAt: string,
  closesAt: string,
  isClosed: boolean
) {
  const day = weekdayLabels[dayOfWeek] ?? "Day";
  return isClosed ? `${day}: Closed` : `${day}: ${opensAt}-${closesAt}`;
}

export default async function TenantLandingPage({ params }: TenantLandingPageProps) {
  const tenant = await prisma.tenant.findFirst({
    where: {
      slug: params.slug,
      active: true,
    },
    select: {
      id: true,
      name: true,
      currency: true,
      services: {
        where: {
          active: true,
        },
        orderBy: {
          name: "asc",
        },
        select: {
          id: true,
          name: true,
          description: true,
          durationMinutes: true,
          priceCents: true,
        },
      },
      businessHours: {
        orderBy: {
          dayOfWeek: "asc",
        },
        select: {
          id: true,
          dayOfWeek: true,
          opensAt: true,
          closesAt: true,
          isClosed: true,
        },
      },
    },
  });

  if (!tenant) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto grid min-h-screen max-w-6xl gap-10 px-6 py-10 md:grid-cols-[1.1fr_0.9fr] md:items-center md:px-10">
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <div
              aria-label={`${tenant.name} logo`}
              className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-400 text-lg font-bold text-slate-950"
            >
              {tenant.name.slice(0, 1).toUpperCase()}
            </div>
            <p className="text-sm font-medium uppercase text-emerald-300">{tenant.name}</p>
          </div>

          <div className="space-y-5">
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
              Book your next appointment with {tenant.name}.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
              Choose a service, find a time that works, and reserve your visit in minutes.
            </p>
          </div>

          <a
            href={`/${params.slug}/book`}
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-emerald-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
          >
            Book now
          </a>
        </div>

        <div className="grid gap-6">
          <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold">Services</h2>
            <div className="mt-4 divide-y divide-slate-800">
              {tenant.services.length > 0 ? (
                tenant.services.map((service) => (
                  <article key={service.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-medium text-slate-100">{service.name}</h3>
                        {service.description ? (
                          <p className="mt-1 text-sm leading-6 text-slate-400">
                            {service.description}
                          </p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-emerald-300">
                        {formatPrice(service.priceCents, tenant.currency)}
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{service.durationMinutes} minutes</p>
                  </article>
                ))
              ) : (
                <p className="py-4 text-sm text-slate-400">Services will be available soon.</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold">Hours</h2>
            <ul className="mt-4 grid gap-2 text-sm text-slate-300">
              {tenant.businessHours.length > 0 ? (
                tenant.businessHours.map((hour) => (
                  <li key={hour.id}>
                    {formatBusinessHour(hour.dayOfWeek, hour.opensAt, hour.closesAt, hour.isClosed)}
                  </li>
                ))
              ) : (
                <li>Hours will be available soon.</li>
              )}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}
