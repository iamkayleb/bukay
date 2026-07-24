import { headers } from "next/headers";

import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

import { CalendarView, type CalendarBooking } from "./calendar-view";
import { ManualBookingForm } from "./manual-booking-form";

export const dynamic = "force-dynamic";

async function getTenantId() {
  const headerList = headers();
  const resolved = resolveTenant({
    headers: { get: (name) => headerList.get(name) },
    session: null,
  });

  if (resolved.tenantId?.trim()) {
    return resolved.tenantId.trim();
  }

  if (resolved.tenantSlug?.trim()) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: resolved.tenantSlug.trim() },
      select: { id: true },
    });

    return tenant?.id ?? null;
  }

  return null;
}

async function loadCalendarData() {
  const tenantId = await getTenantId();

  if (!tenantId) {
    return { bookings: [], clients: [], services: [] };
  }

  return runWithTenantContext({ tenantId }, async () => {
    const [bookings, clients, services] = await Promise.all([
      prisma.booking.findMany({
        where: { tenantId },
        orderBy: { startsAt: "asc" },
        take: 100,
        select: {
          id: true,
          serviceId: true,
          startsAt: true,
          endsAt: true,
          status: true,
          notes: true,
          client: { select: { name: true } },
          service: { select: { name: true } },
          staff: { select: { name: true } },
        },
      }),
      prisma.client.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, phone: true, email: true },
      }),
      prisma.service.findMany({
        where: { tenantId, active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, durationMinutes: true },
      }),
    ]);

    return {
      bookings: bookings.map(
        (booking): CalendarBooking => ({
          id: booking.id,
          serviceId: booking.serviceId,
          clientName: booking.client.name,
          serviceName: booking.service.name,
          staffName: booking.staff?.name ?? null,
          startsAt: booking.startsAt.toISOString(),
          endsAt: booking.endsAt.toISOString(),
          status: booking.status,
          notes: booking.notes,
        })
      ),
      clients,
      services,
    };
  });
}

export default async function CalendarPage() {
  const { bookings, clients, services } = await loadCalendarData();

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <ManualBookingForm clients={clients} services={services} />
        <CalendarView
          bookings={bookings}
          initialDate={new Date().toISOString()}
          services={services}
        />
      </div>
    </main>
  );
}
