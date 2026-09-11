import Link from "next/link";

import { prisma } from "@/app/db/prisma";

type ShopfrontPageProps = {
  params: { slug: string };
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatPrice(priceCents: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}

export default async function ShopfrontPage({ params }: ShopfrontPageProps) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.slug },
    include: {
      services: {
        where: { active: true },
        orderBy: { name: "asc" },
      },
      businessHours: {
        orderBy: { dayOfWeek: "asc" },
      },
    },
  });

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-16 text-slate-100">
      <header className="max-w-2xl space-y-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
          Book online
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{tenant?.name}</h1>
        <p className="text-lg text-slate-300">
          Choose a service and reserve a time that works for you.
        </p>
        <Link
          className="inline-flex rounded-lg bg-emerald-500 px-5 py-3 font-medium text-slate-950 transition hover:bg-emerald-400"
          href={`/${params.slug}/book`}
        >
          Book an appointment
        </Link>
      </header>

      <section aria-labelledby="services-heading" className="mt-16">
        <h2 id="services-heading" className="text-2xl font-semibold">
          Services
        </h2>
        {tenant?.services.length ? (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {tenant.services.map((service) => (
              <li
                key={service.id}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-medium">{service.name}</h3>
                  <span className="whitespace-nowrap text-sm text-emerald-400">
                    {formatPrice(service.priceCents, service.currency)}
                  </span>
                </div>
                {service.description ? (
                  <p className="mt-2 text-sm text-slate-300">{service.description}</p>
                ) : null}
                <p className="mt-3 text-sm text-slate-400">{service.durationMinutes} minutes</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-slate-300">Services will be available soon.</p>
        )}
      </section>

      <section aria-labelledby="hours-heading" className="mt-16 max-w-xl">
        <h2 id="hours-heading" className="text-2xl font-semibold">
          Opening hours
        </h2>
        {tenant?.businessHours.length ? (
          <dl className="mt-5 divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/60 px-5">
            {tenant.businessHours.map((hours) => (
              <div key={hours.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <dt>{WEEKDAYS[hours.dayOfWeek]}</dt>
                <dd className="text-slate-300">
                  {hours.isClosed ? "Closed" : `${hours.opensAt} – ${hours.closesAt}`}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 text-slate-300">Contact us for opening hours.</p>
        )}
      </section>
    </main>
  );
}
