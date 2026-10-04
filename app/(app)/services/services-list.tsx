import { headers } from "next/headers";

import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

function formatPrice(priceCents: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}

async function currentTenantId() {
  const requestHeaders = headers();
  const tenant = resolveTenant({
    headers: { get: (name) => requestHeaders.get(name) },
    session: null,
  });

  if (tenant.tenantId) {
    return tenant.tenantId;
  }

  if (!tenant.tenantSlug) {
    return null;
  }

  const tenantRecord = await prisma.tenant.findUnique({
    where: { slug: tenant.tenantSlug },
    select: { id: true },
  });

  return tenantRecord?.id ?? null;
}

export async function ServicesList() {
  const tenantId = await currentTenantId();

  if (!tenantId) {
    return <p className="text-sm text-slate-400">Select a tenant to view its services.</p>;
  }

  const services = await runWithTenantContext({ tenantId }, () =>
    prisma.service.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        durationMinutes: true,
        priceCents: true,
        currency: true,
        active: true,
      },
    })
  );

  if (services.length === 0) {
    return <p className="text-sm text-slate-400">No services yet.</p>;
  }

  return (
    <ul className="divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800">
      {services.map((service) => (
        <li className="flex items-center justify-between gap-4 px-4 py-4" key={service.id}>
          <div>
            <p className="font-medium text-white">{service.name}</p>
            <p className="mt-1 text-sm text-slate-400">{service.durationMinutes} minutes</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-200">
              {formatPrice(service.priceCents, service.currency)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {service.active ? "Active" : "Inactive"}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
