import Link from "next/link";
import { notFound } from "next/navigation";

import { resolveSignedInTenantId } from "../../services/services-list";
import { getTenantClientWithBookings } from "../data";

export const dynamic = "force-dynamic";

function formatStartsAt(startsAt: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(startsAt);
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const tenantId = await resolveSignedInTenantId();
  const result = tenantId ? await getTenantClientWithBookings(tenantId, params.id) : null;

  if (!result) {
    notFound();
  }

  const { client, timezone } = result;

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <div className="space-y-2">
        <Link className="text-sm text-emerald-300 hover:text-emerald-200" href="/clients">
          ← All clients
        </Link>
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">{client.name}</h2>
        <p className="text-sm text-slate-300 sm:text-base">{client.phone}</p>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Booking history</h3>
        {client.bookings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-5 py-8 text-center">
            <p className="text-sm text-slate-400">{client.name} has no bookings yet.</p>
          </div>
        ) : (
          <ul
            aria-label="Bookings"
            className="divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800"
          >
            {client.bookings.map((booking) => (
              <li
                className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                key={booking.id}
              >
                <div>
                  <p className="font-medium text-white">{booking.service.name}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {formatStartsAt(booking.startsAt, timezone)}
                  </p>
                </div>
                <span className="text-sm capitalize text-slate-300">{booking.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
