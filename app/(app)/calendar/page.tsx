import { prisma } from "@/app/db/prisma";
import { resolveSignedInTenantId } from "../services/services-list";
import { DayView } from "./day-view";
export const dynamic = "force-dynamic";
export default async function CalendarPage() {
  const tenantId = await resolveSignedInTenantId();
  const tenant = tenantId
    ? await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } })
    : null;
  return <DayView tenantId={tenantId} timeZone={tenant?.timezone ?? "Africa/Lagos"} />;
}
