import Link from "next/link";

import { resolveSignedInTenantId } from "../services/services-list";
import { listTenantClients } from "./data";

export async function ClientsList() {
  const tenantId = await resolveSignedInTenantId();
  const clients = tenantId ? await listTenantClients(tenantId) : [];

  if (clients.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-5 py-8 text-center">
        <p className="text-sm text-slate-400">No clients yet.</p>
      </div>
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
