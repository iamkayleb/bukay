import { notFound } from "next/navigation";

import { buildBookingIcs, ICS_CONTENT_TYPE } from "@/app/lib/ics";
import { getConfirmedBooking } from "./data";

export const dynamic = "force-dynamic";

type ConfirmedPageProps = {
  params: { slug: string };
  searchParams: { token?: string };
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(date);
}

export default async function BookingConfirmedPage({ params, searchParams }: ConfirmedPageProps) {
  const result = await getConfirmedBooking(params.slug, searchParams.token);

  if (!result.ok) {
    if (result.status === 404) {
      notFound();
    }

    const message =
      result.status === 410
        ? "This confirmation link has expired. Please contact the business for your booking details."
        : "This confirmation link is invalid.";

    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 py-16 text-center text-slate-100">
        <h1 className="text-2xl font-semibold text-white">We couldn&apos;t verify this link</h1>
        <p className="text-sm text-slate-300">{message}</p>
      </main>
    );
  }

  const { booking } = result;
  const icsContent = buildBookingIcs({
    uid: `${booking.id}@bukay`,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    summary: `${booking.serviceName} with ${booking.tenantName}`,
    description: `Booking confirmed for ${booking.clientName}.`,
  });
  const icsHref = `data:${ICS_CONTENT_TYPE},${encodeURIComponent(icsContent)}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-16 text-slate-100">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
        Booking confirmed
      </p>
      <h1 className="text-3xl font-semibold text-white">{booking.serviceName}</h1>
      <dl className="space-y-3 text-sm text-slate-300">
        <div>
          <dt className="text-slate-500">With</dt>
          <dd>{booking.tenantName}</dd>
        </div>
        <div>
          <dt className="text-slate-500">When</dt>
          <dd>{formatDateTime(booking.startsAt)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Booked for</dt>
          <dd>{booking.clientName}</dd>
        </div>
      </dl>
      <a
        href={icsHref}
        download={`booking-${booking.id}.ics`}
        className="inline-flex w-fit items-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
      >
        Add to calendar
      </a>
    </main>
  );
}
