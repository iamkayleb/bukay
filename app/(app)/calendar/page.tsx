import { headers } from "next/headers";
import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";
import { BookingCalendar } from "./components/booking-calendar";
import { SectionPlaceholder } from "../components/section-placeholder";

export const dynamic = "force-dynamic";

type ServiceRow = {
  id: string;
  name: string;
  durationMinutes: number;
  active: boolean;
};

type StaffRow = { id: string; name: string; active: boolean };

type BookingWithRelations = {
  id: string;
  serviceId: string;
  staffId: string | null;
  clientId: string;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  service: { name: string } | null;
  staff: { name: string } | null;
  client: { name: string } | null;
};

async function loadTenantCalendarData(tenantId: string) {
  const [services, staff, bookings] = await Promise.all([
    (prisma.service as unknown as {
      findMany(args: unknown): Promise<ServiceRow[]>;
    }).findMany({
      where: { tenantId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, durationMinutes: true, active: true },
    }),
    (prisma.staff as unknown as {
      findMany(args: unknown): Promise<StaffRow[]>;
    }).findMany({
      where: { tenantId, active: true },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, active: true },
    }),
    (prisma.booking as unknown as {
      findMany(args: unknown): Promise<BookingWithRelations[]>;
    }).findMany({
      where: { tenantId, status: { not: "cancelled" } },
      orderBy: [{ startsAt: "asc" }],
      take: 25,
      select: {
        id: true,
        serviceId: true,
        staffId: true,
        clientId: true,
        startsAt: true,
        endsAt: true,
        notes: true,
        service: { select: { name: true } },
        staff: { select: { name: true } },
        client: { select: { name: true } },
      },
    }),
  ]);

  return { services, staff, bookings };
}

export default async function CalendarPage() {
  const headerList = headers();
  const resolved = resolveTenant({
    headers: { get: (name) => headerList.get(name) },
    session: null,
  });

  let tenantId = resolved.tenantId?.trim();
  if (!tenantId && resolved.tenantSlug?.trim()) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: resolved.tenantSlug.trim() },
      select: { id: true },
    });
    tenantId = tenant?.id;
  }

  if (!tenantId) {
    return (
      <SectionPlaceholder
        description="Browse and manage upcoming bookings across the week or month."
        hint="Could not resolve tenant. Sign in again."
        title="Calendar"
      />
    );
  }

  const { services, staff, bookings } = await runWithTenantContext(
    { tenantId },
    () => loadTenantCalendarData(tenantId!),
  );

  return (
    <BookingCalendar
      services={services}
      staff={staff}
      initialBookings={bookings.map((b) => ({
        id: b.id,
        serviceId: b.serviceId,
        staffId: b.staffId,
        clientId: b.clientId,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        notes: b.notes,
        clientName: b.client?.name,
        serviceName: b.service?.name,
        staffName: b.staff?.name ?? null,
      }))}
    />
  );
}
