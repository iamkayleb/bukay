import { prisma } from "@/app/db/prisma";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export type TenantClient = {
  id: string;
  name: string;
  phone: string;
};

export async function listTenantClients(tenantId: string): Promise<TenantClient[]> {
  return runWithTenantContext({ tenantId }, () =>
    prisma.client.findMany({
      where: { tenantId },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, phone: true },
    })
  );
}

export async function getTenantClientWithBookings(tenantId: string, clientId: string) {
  return runWithTenantContext({ tenantId }, async () => {
    const [client, tenant] = await Promise.all([
      prisma.client.findFirst({
        where: { tenantId, id: clientId },
        select: {
          id: true,
          name: true,
          phone: true,
          bookings: {
            where: { tenantId },
            orderBy: { startsAt: "desc" },
            select: {
              id: true,
              startsAt: true,
              status: true,
              service: { select: { name: true } },
            },
          },
        },
      }),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } }),
    ]);

    return client ? { client, timezone: tenant?.timezone ?? "Africa/Lagos" } : null;
  });
}
