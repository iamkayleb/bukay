import { prisma } from "@/app/db/prisma";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";
import { resolveSignedInTenantId } from "../services/services-list";
import { TodaySummaryPanel, type TodaySummaryFigures } from "./summary";

export type { TodaySummaryFigures } from "./summary";

const DEFAULT_TIME_ZONE = "Africa/Lagos";

export type TodayBooking = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  clientName: string;
  serviceName: string;
};

export type TodaySummary = TodaySummaryFigures;

type BookingRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  client: { name: string };
  service: { name: string };
};

type TenantDayContext = {
  timeZone: string;
  currency: string;
  start: Date;
  end: Date;
};

async function resolveTenantDayContext(tenantId: string, now: Date): Promise<TenantDayContext> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { timezone: true, currency: true },
  });
  const timeZone = tenant?.timezone?.trim() || DEFAULT_TIME_ZONE;
  const currency = tenant?.currency?.trim() || "NGN";
  const { start, end } = zonedDayRange(timeZone, now);
  return { timeZone, currency, start, end };
}

function bookingsInDayWhere(tenantId: string, start: Date, end: Date) {
  return {
    tenantId,
    startsAt: { gte: start, lt: end },
  };
}

function paidPaymentsInDayWhere(tenantId: string, start: Date, end: Date) {
  return {
    tenantId,
    status: "paid" as const,
    createdAt: { gte: start, lt: end },
  };
}

async function sumPaidTodayCents(tenantId: string, start: Date, end: Date): Promise<number> {
  const paidToday = await prisma.payment.aggregate({
    where: paidPaymentsInDayWhere(tenantId, start, end),
    _sum: { amountCents: true },
  });
  return paidToday._sum.amountCents ?? 0;
}

function mapBookingRows(rows: BookingRow[]): TodayBooking[] {
  return rows.map((row) => ({
    id: row.id,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    clientName: row.client.name,
    serviceName: row.service.name,
  }));
}

function summarizeUnpaidBookings(
  bookings: { payments: { status: string }[] }[]
): { bookingsCount: number; unpaidCount: number } {
  const bookingsCount = bookings.length;
  const unpaidCount = bookings.filter(
    (booking) => !booking.payments.some((payment) => payment.status === "paid")
  ).length;
  return { bookingsCount, unpaidCount };
}

/** Booking count, paid cents created today, and unpaid booking count for the tenant day window. */
export function computeTodaySummaryFigures(
  bookings: { payments: { status: string }[] }[],
  moneyTakenCents: number,
  currency: string
): TodaySummaryFigures {
  const { bookingsCount, unpaidCount } = summarizeUnpaidBookings(bookings);
  return { bookingsCount, moneyTakenCents, unpaidCount, currency };
}

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

/** Loads today's booking count, paid cents (by payment `createdAt`), and unpaid booking count. */
export async function queryTodaySummaryFigures(
  tenantId: string,
  start: Date,
  end: Date,
  currency: string
): Promise<TodaySummaryFigures> {
  const [bookingRows, moneyTakenCents] = await Promise.all([
    prisma.booking.findMany({
      where: bookingsInDayWhere(tenantId, start, end),
      select: {
        payments: { select: { status: true } },
      },
    }),
    sumPaidTodayCents(tenantId, start, end),
  ]);

  return computeTodaySummaryFigures(bookingRows, moneyTakenCents, currency);
}

async function loadTodayScheduleData(
  tenantId: string,
  now = new Date()
): Promise<{ timeZone: string; bookings: TodayBooking[]; summary: TodaySummary }> {
  const { timeZone, currency, start, end } = await resolveTenantDayContext(tenantId, now);

  return runWithTenantContext({ tenantId }, async () => {
    const [bookingRows, moneyTakenCents] = await Promise.all([
      prisma.booking.findMany({
        where: bookingsInDayWhere(tenantId, start, end),
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          client: { select: { name: true } },
          service: { select: { name: true } },
          payments: { select: { status: true } },
        },
      }),
      sumPaidTodayCents(tenantId, start, end),
    ]);

    return {
      timeZone,
      bookings: mapBookingRows(bookingRows),
      summary: computeTodaySummaryFigures(bookingRows, moneyTakenCents, currency),
    };
  });
}

export async function listTodaysBookings(
  tenantId: string,
  now = new Date()
): Promise<{ timeZone: string; bookings: TodayBooking[] }> {
  const { timeZone, bookings } = await loadTodayScheduleData(tenantId, now);
  return { timeZone, bookings };
}

/**
 * Today dashboard figures for the signed-in tenant's calendar day (boundaries from `zonedDayRange`):
 * - `bookingsCount`: bookings whose `startsAt` falls in [start, end)
 * - `moneyTakenCents`: sum of `amountCents` for payments with status `paid` and `createdAt` in [start, end)
 * - `unpaidCount`: today's bookings with no related payment in status `paid`
 */
export async function getTodaySummary(
  tenantId: string,
  now = new Date()
): Promise<{ timeZone: string; summary: TodaySummary }> {
  const { timeZone, currency, start, end } = await resolveTenantDayContext(tenantId, now);

  const summary = await runWithTenantContext({ tenantId }, () =>
    queryTodaySummaryFigures(tenantId, start, end, currency)
  );

  return { timeZone, summary };
}

/** Booking count, paid cents created today, and unpaid booking count for the tenant calendar day. */
export async function getTodaySummaryFigures(
  tenantId: string,
  now = new Date()
): Promise<TodaySummaryFigures> {
  const { summary } = await getTodaySummary(tenantId, now);
  return summary;
}

function formatBookingTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

const emptySummary: TodaySummary = {
  bookingsCount: 0,
  moneyTakenCents: 0,
  unpaidCount: 0,
  currency: "NGN",
};

export async function TodaySchedule({ now = new Date() }: { now?: Date } = {}) {
  const tenantId = await resolveSignedInTenantId();
  const { timeZone, bookings, summary } = tenantId
    ? await loadTodayScheduleData(tenantId, now)
    : { timeZone: DEFAULT_TIME_ZONE, bookings: [], summary: emptySummary };

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Today</p>
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">Today</h2>
        <p className="max-w-xl text-sm text-slate-300 sm:text-base">
          Appointments scheduled for this business today.
        </p>
      </div>

      <TodaySummaryPanel summary={summary} />

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
