import { prisma } from "@/app/db/prisma";

export type RoutedTenant = {
  tenantId: string;
  name: string;
};

/** Meta reports numbers as bare digits ("234801..."); we store E.164 ("+234801..."). */
export function normalizeWhatsAppNumber(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/[\s()\-.]/g, "").replace(/^\+/, "");
  if (!/^\d{7,15}$/.test(digits)) return null;
  return `+${digits}`;
}

const tenantDelegate = prisma.tenant as unknown as {
  findFirst(args: unknown): Promise<{ id: string; name: string } | null>;
};

/** Resolves the active tenant that owns the given WhatsApp business number. */
export async function resolveTenantByNumber(
  businessNumber: string | null | undefined
): Promise<RoutedTenant | null> {
  const whatsappNumber = normalizeWhatsAppNumber(businessNumber);
  if (!whatsappNumber) return null;

  const tenant = await tenantDelegate.findFirst({
    where: { whatsappNumber, active: true },
    select: { id: true, name: true },
  });
  return tenant ? { tenantId: tenant.id, name: tenant.name } : null;
}
