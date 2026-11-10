import { prisma } from "@/app/db/prisma";
import { resolveSignedInTenantId } from "../services/services-list";
import { DayView } from "./day-view";
import { NewBookingForm } from "./new-booking-form";
export const dynamic = "force-dynamic";
export default async function CalendarPage() {
  const tenantId = await resolveSignedInTenantId();
  const tenant = tenantId
    ? await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } })
    : null;
  const [services, clients] = tenantId
    ? await Promise.all([
        prisma.service.findMany({
          where: { tenantId, active: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        prisma.client.findMany({
          where: { tenantId },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ])
    : [[], []];
  const timeZone = tenant?.timezone ?? "Africa/Lagos";
  return (
    <>
      <DayView tenantId={tenantId} timeZone={timeZone} />
      {tenantId && (
        <NewBookingForm
          tenantId={tenantId}
          timeZone={timeZone}
          services={services}
          clients={clients}
        />
      )}
    </>
  );
}
