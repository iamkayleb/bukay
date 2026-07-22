import { headers } from "next/headers";

import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

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

async function loadBookingFormOptions() {
  const tenantId = await getTenantId();

  if (!tenantId) {
    return { clients: [], services: [] };
  }

  return runWithTenantContext({ tenantId }, async () => {
    const [clients, services] = await Promise.all([
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

    return { clients, services };
  });
}

export default async function CalendarPage() {
  const { clients, services } = await loadBookingFormOptions();

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <ManualBookingForm clients={clients} services={services} />
        <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
                Calendar
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Upcoming bookings</h2>
            </div>
            <button
              className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:border-emerald-400"
              type="button"
            >
              Today
            </button>
          </div>
          <div className="mt-5 rounded-lg border border-dashed border-slate-800 px-5 py-12 text-center">
            <p className="text-sm text-slate-400">
              Confirmed appointments will populate the calendar.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
