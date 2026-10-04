import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/lib/resolve-tenant";

export async function resolveTenantId(headers: { get(name: string): string | null }) {
  const resolved = resolveTenant({ headers });
  if (resolved.tenantId?.trim()) return resolved.tenantId.trim();
  if (resolved.tenantSlug?.trim()) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: resolved.tenantSlug.trim() },
      select: { id: true },
    });
    return tenant?.id ?? null;
  }
  return null;
}
