import { headers } from "next/headers";

import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export type TenantService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  active: boolean;
};

export async function resolveSignedInTenantId(): Promise<string | null> {
  const headerList = headers();
  const resolved = resolveTenant({
    headers: { get: (name) => headerList.get(name) },
  });

  const tenantId = resolved.tenantId?.trim();
  if (tenantId) {
    return tenantId;
  }

  const slug = resolved.tenantSlug?.trim();
  if (!slug) {
    return null;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true },
  });

  return tenant?.id ?? null;
}

export async function listTenantServices(tenantId: string): Promise<TenantService[]> {
  return runWithTenantContext({ tenantId }, () =>
    prisma.service.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        durationMinutes: true,
        priceCents: true,
        currency: true,
        active: true,
      },
    })
  );
}

function formatPrice(priceCents: number, currency: string): string {
  const amount = priceCents / 100;
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export async function ServicesList() {
  const tenantId = await resolveSignedInTenantId();
  const services = tenantId ? await listTenantServices(tenantId) : [];

  if (services.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-5 py-8 text-center">
        <p className="text-sm text-slate-400">No services yet.</p>
      </div>
    );
  }

  return (
    <ul
      aria-label="Services"
      className="divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800"
    >
      {services.map((service) => (
        <li
          className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
          key={service.id}
        >
          <div>
            <p className="font-medium text-white">{service.name}</p>
            {service.description ? (
              <p className="mt-1 text-sm text-slate-400">{service.description}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
            <span>{service.durationMinutes} min</span>
            <span>{formatPrice(service.priceCents, service.currency)}</span>
            <span>{service.active ? "Active" : "Inactive"}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
