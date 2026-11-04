import { prisma } from "@/app/db/prisma";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export type PublicTenant = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  /** Optional soft-active flag; absent tenants are treated as active. */
  active?: boolean | null;
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    priceCents: number;
    currency: string;
  }>;
  businessHours: Array<{
    id: string;
    dayOfWeek: number;
    opensAt: string;
    closesAt: string;
    isClosed: boolean;
  }>;
};

export function isPublicTenantInactive(tenant: { active?: boolean | null }): boolean {
  return tenant.active === false;
}

export async function getPublicTenantBySlug(slug: string): Promise<PublicTenant | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: normalized },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      currency: true,
    },
  });

  if (!tenant) {
    return null;
  }

  return runWithTenantContext({ tenantId: tenant.id }, async () => {
    const [services, businessHours] = await Promise.all([
      prisma.service.findMany({
        where: { tenantId: tenant.id, active: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          durationMinutes: true,
          priceCents: true,
          currency: true,
        },
      }),
      prisma.businessHour.findMany({
        where: { tenantId: tenant.id },
        orderBy: { dayOfWeek: "asc" },
        select: {
          id: true,
          dayOfWeek: true,
          opensAt: true,
          closesAt: true,
          isClosed: true,
        },
      }),
    ]);

    return {
      ...tenant,
      // No Tenant.active column yet; resolved rows are treated as public-active.
      active: true,
      services,
      businessHours,
    };
  });
}
