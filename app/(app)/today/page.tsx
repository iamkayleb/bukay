import { prisma } from "@/app/db/prisma";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";
import { resolveSignedInTenantId } from "../services/services-list";

export const dynamic = "force-dynamic";

const DEFAULT_TIME_ZONE = "Africa/Lagos";

export type TodayBooking = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  clientName: string;
  serviceName: string;
};

type BookingRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  client: { name: string };
  service: { name: string };
};

export function zonedDayRange(timeZone: string, now: Date): { start: Date; end: Date } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  let hour = Number(parts.hour);
  if (hour === 24) {
    hour = 0;
  }
  const asUtc = Date.UTC(year, month - 1, day, hour, Number(parts.minute), Number(parts.second));
  const offsetMs = asUtc - now.getTime();
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function listTodaysBookings(
  tenantId: string,
  now = new Date()
): Promise<{ timeZone: string; bookings: TodayBooking[] }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { timezone: true },
  });
  const timeZone = tenant?.timezone?.trim() || DEFAULT_TIME_ZONE;
  const { start, end } = zonedDayRange(timeZone, now);

  const rows = await runWithTenantContext({ tenantId }, () =>
    prisma.booking.findMany({
      where: {
        tenantId,
        startsAt: { gte: start, lt: end },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        client: { select: { name: true } },
        service: { select: { name: true } },
      },
    })
  );

  return {
    timeZone,
    bookings: rows.map((row: BookingRow) => ({
      id: row.id,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status,
      clientName: row.client.name,
      serviceName: row.service.name,
    })),
  };
}

function formatBookingTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export async function TodaySchedule({ now = new Date() }: { now?: Date } = {}) {
  const tenantId = await resolveSignedInTenantId();
  const schedule = tenantId
    ? await listTodaysBookings(tenantId, now)
    : { timeZone: DEFAULT_TIME_ZONE, bookings: [] };
  const { timeZone, bookings } = schedule;

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Today</p>
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">Today</h2>
        <p className="max-w-xl text-sm text-slate-300 sm:text-base">
          Appointments scheduled for this business today.
        </p>
      </div>

      {bookings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-5 py-8 text-center">
          <p className="text-sm text-slate-400">No appointments yet.</p>
        </div>
      ) : (
        <ul
          aria-label="Today bookings"
          className="divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800"
        >
          {bookings.map((booking) => (
            <li
              className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              key={booking.id}
            >
              <div>
                <p className="font-medium text-white">{booking.clientName}</p>
                <p className="mt-1 text-sm text-slate-400">{booking.serviceName}</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
                <time dateTime={booking.startsAt.toISOString()}>
                  {formatBookingTime(booking.startsAt, timeZone)}
                </time>
                <span>{booking.status}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function TodayPage() {
  return TodaySchedule();
}
