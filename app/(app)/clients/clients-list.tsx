import Link from "next/link";

import { MerchantEmptyState } from "../components/merchant-empty-state";
import { resolveSignedInTenantId } from "../services/services-list";
import { listTenantClients } from "./data";

export async function ClientsList() {
  const tenantId = await resolveSignedInTenantId();
  const clients = tenantId ? await listTenantClients(tenantId) : [];

  if (clients.length === 0) {
    return (
      <MerchantEmptyState message="No clients yet — they appear here after their first booking." />
    );
  }

  return (
    <ul
      aria-label="Clients"
      className="divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800"
    >
      {clients.map((client) => (
        <li key={client.id}>
          <Link
            className="flex flex-col gap-1 px-4 py-4 hover:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between"
            href={`/clients/${client.id}`}
          >
            <span className="font-medium text-white">{client.name}</span>
            <span className="text-sm text-slate-300">{client.phone}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
