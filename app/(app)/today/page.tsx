import { headers } from "next/headers";

import { prisma } from "@/app/db/prisma";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";
import { resolveTenantId } from "../settings/tenant";

export const dynamic = "force-dynamic";

type TodayBooking = {
  id: string;
  startsAt: Date;
  status: string;
  client: { name: string };
  service: { name: string };
};

const bookingDelegate = prisma.booking as unknown as {
  findMany(args: unknown): Promise<TodayBooking[]>;
};

export function todayRange(now: Date = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export default async function TodayPage() {
  const headerList = headers();
  const tenantId = await resolveTenantId({ get: (name) => headerList.get(name) });

  let bookings: TodayBooking[] = [];
  if (tenantId) {
    const { start, end } = todayRange();
    bookings = await runWithTenantContext({ tenantId }, () =>
      bookingDelegate.findMany({
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
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold text-white sm:text-3xl">Today</h1>
      {bookings.length === 0 ? (
        <p className="rounded-lg border border-slate-800 px-4 py-6 text-sm text-slate-400">
          No appointments yet. Bookings will appear in this view.
        </p>
      ) : (
        <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
          {bookings.map((booking) => (
            <li
              className="grid grid-cols-[80px_1fr_100px] gap-3 px-4 py-4 text-sm"
              key={booking.id}
            >
              <time className="text-slate-300" dateTime={booking.startsAt.toISOString()}>
                {booking.startsAt.toISOString().slice(11, 16)}
              </time>
              <span className="text-white">
                {booking.client.name} · {booking.service.name}
              </span>
              <span className="text-slate-400">{booking.status}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
