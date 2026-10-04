import { headers } from "next/headers";

import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

function todayBounds(now = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-NG", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

async function currentTenantId() {
  const requestHeaders = headers();
  const tenant = resolveTenant({
    headers: { get: (name) => requestHeaders.get(name) },
    session: null,
  });

  if (tenant.tenantId) {
    return tenant.tenantId;
  }

  if (!tenant.tenantSlug) {
    return null;
  }

  const tenantRecord = await prisma.tenant.findUnique({
    where: { slug: tenant.tenantSlug },
    select: { id: true },
  });
  return tenantRecord?.id ?? null;
}

export default async function TodayPage() {
  const tenantId = await currentTenantId();
  if (!tenantId) {
    return <p className="text-sm text-slate-400">Select a tenant to view today&apos;s bookings.</p>;
  }

  const { start, end } = todayBounds();
  const bookings = await runWithTenantContext({ tenantId }, () =>
    prisma.booking.findMany({
      where: { tenantId, startsAt: { gte: start, lt: end } },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        status: true,
        client: { select: { name: true } },
        service: { select: { name: true } },
      },
    })
  );

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Today</p>
      <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Today&apos;s bookings</h1>

      {bookings.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">No bookings scheduled for today.</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800">
          {bookings.map((booking) => (
            <li className="flex items-center justify-between gap-4 px-4 py-4" key={booking.id}>
              <div>
                <p className="font-medium text-white">{booking.client.name}</p>
                <p className="mt-1 text-sm text-slate-400">{booking.service.name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-200">{formatTime(booking.startsAt)}</p>
                <p className="mt-1 text-xs capitalize text-slate-500">{booking.status}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
