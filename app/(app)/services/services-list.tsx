import { prisma } from "@/app/db/prisma";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export type ListedService = {
  id: string;
  name: string;
  durationMinutes: number;
  priceKobo: number;
  bufferMinutes: number;
  active: boolean;
};

const serviceDelegate = prisma.service as unknown as {
  findMany(args: unknown): Promise<ListedService[]>;
};

export async function loadServicesForTenant(tenantId: string): Promise<ListedService[]> {
  return runWithTenantContext({ tenantId }, () =>
    serviceDelegate.findMany({
      where: { tenantId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    })
  );
}

function formatNaira(priceKobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(priceKobo / 100);
}

export async function ServicesList({ tenantId }: { tenantId: string }) {
  const services = await loadServicesForTenant(tenantId);

  if (services.length === 0) {
    return (
      <p className="rounded-lg border border-slate-800 px-4 py-6 text-sm text-slate-400">
        No services yet. Create your first service below.
      </p>
    );
  }

  return (
    <ul
      aria-label="Services"
      className="divide-y divide-slate-800 rounded-lg border border-slate-800"
    >
      {services.map((service) => (
        <li
          className="grid grid-cols-[1fr_92px_112px] items-center gap-3 px-4 py-4 text-sm"
          key={service.id}
        >
          <span className="font-medium text-white">{service.name}</span>
          <span className="text-slate-300">{service.durationMinutes} min</span>
          <span className="text-slate-300">{formatNaira(service.priceKobo)}</span>
        </li>
      ))}
    </ul>
  );
}
