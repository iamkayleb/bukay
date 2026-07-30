import Link from "next/link";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";

import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";
import {
  CLIENTS_PAGE_SIZE,
  buildClientPageHref,
  buildClientWhere,
  normalizeClientPage,
  normalizeClientSearch,
} from "./client-list";

export const dynamic = "force-dynamic";

type ClientsSearchParams = {
  page?: string | string[];
  q?: string | string[];
};

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  createdAt: Date | string;
  _count?: {
    bookings: number;
  };
};

type ClientDelegate = {
  count(args: { where: Prisma.ClientWhereInput }): Promise<number>;
  findMany(args: {
    where: Prisma.ClientWhereInput;
    orderBy: Array<{ name: "asc" } | { createdAt: "desc" }>;
    skip: number;
    take: number;
    select: {
      id: true;
      name: true;
      email: true;
      phone: true;
      createdAt: true;
      _count: { select: { bookings: true } };
    };
  }): Promise<ClientRow[]>;
};

type TenantDelegate = {
  findUnique(args: {
    where: { slug: string };
    select: { id: true };
  }): Promise<{ id: string } | null>;
};

async function resolveTenantIdForClientsPage() {
  const headerList = headers();
  const resolved = resolveTenant({
    headers: { get: (name) => headerList.get(name) },
    session: null,
  });

  if (resolved.tenantId?.trim()) {
    return resolved.tenantId.trim();
  }

  if (resolved.tenantSlug?.trim()) {
    const tenant = await (prisma.tenant as unknown as TenantDelegate).findUnique({
      where: { slug: resolved.tenantSlug.trim() },
      select: { id: true },
    });

    return tenant?.id ?? null;
  }

  return null;
}

async function loadClients(tenantId: string, search: string, page: number) {
  const where = buildClientWhere(tenantId, search);
  const skip = (page - 1) * CLIENTS_PAGE_SIZE;
  const clientDelegate = prisma.client as unknown as ClientDelegate;

  return runWithTenantContext({ tenantId }, async () => {
    const [totalClients, clients] = await Promise.all([
      clientDelegate.count({ where }),
      clientDelegate.findMany({
        where,
        orderBy: [{ name: "asc" }, { createdAt: "desc" }],
        skip,
        take: CLIENTS_PAGE_SIZE,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
          _count: { select: { bookings: true } },
        },
      }),
    ]);

    return { clients, totalClients };
  });
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function clientRange(page: number, totalClients: number, clientCount: number) {
  if (totalClients === 0) {
    return "0 clients";
  }

  if (clientCount === 0) {
    return `0 of ${totalClients} clients`;
  }

  const start = (page - 1) * CLIENTS_PAGE_SIZE + 1;
  const end = start + clientCount - 1;
  return `${start}-${end} of ${totalClients} clients`;
}

export default async function ClientsPage({
  searchParams = {},
}: {
  searchParams?: ClientsSearchParams;
}) {
  const tenantId = await resolveTenantIdForClientsPage();
  const search = normalizeClientSearch(searchParams.q);
  const requestedPage = normalizeClientPage(searchParams.page);

  if (!tenantId) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-3xl font-semibold text-white">Clients</h1>
          <p className="mt-4 rounded-md border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300">
            Select a tenant before viewing clients.
          </p>
        </div>
      </main>
    );
  }

  const { clients, totalClients } = await loadClients(tenantId, search, requestedPage);
  const totalPages = Math.max(1, Math.ceil(totalClients / CLIENTS_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const isPastLastPage = requestedPage > totalPages && totalClients > 0;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
              Clients
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Client roster</h1>
          </div>

          <form className="flex w-full max-w-xl flex-col gap-3 sm:flex-row" method="get">
            <label className="sr-only" htmlFor="client-search">
              Search clients
            </label>
            <input
              className="min-h-11 flex-1 rounded-md border border-slate-700 bg-slate-900 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400"
              defaultValue={search}
              id="client-search"
              name="q"
              placeholder="Search by name or phone"
              type="search"
            />
            <button
              className="min-h-11 rounded-md bg-emerald-400 px-5 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
              type="submit"
            >
              Search
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-800">
          <div className="flex flex-col justify-between gap-2 border-b border-slate-800 bg-slate-900 px-4 py-3 sm:flex-row sm:items-center">
            <p className="text-sm font-medium text-slate-200">
              {clientRange(page, totalClients, clients.length)}
            </p>
            {search ? (
              <Link
                className="text-sm font-medium text-emerald-300 hover:text-emerald-200"
                href="/clients"
              >
                Clear search
              </Link>
            ) : null}
          </div>

          {isPastLastPage ? (
            <p className="px-4 py-6 text-sm text-slate-400">
              Page {requestedPage} is outside the current client list.
            </p>
          ) : clients.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400">
              {search ? "No clients match that search." : "No clients added yet."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {clients.map((client) => (
                <li
                  className="grid gap-3 px-4 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_180px_120px_120px]"
                  key={client.id}
                >
                  <div className="min-w-0">
                    <Link
                      className="font-medium text-white hover:text-emerald-200"
                      href={`/clients/${client.id}`}
                    >
                      {client.name}
                    </Link>
                    <p className="mt-1 truncate text-slate-500">{client.email ?? "No email"}</p>
                  </div>
                  <span className="text-slate-300">{client.phone}</span>
                  <span className="text-slate-300">{client._count?.bookings ?? 0} bookings</span>
                  <span className="text-slate-500">Since {formatDate(client.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <nav className="flex items-center justify-between gap-3" aria-label="Client list pages">
          <Link
            aria-disabled={page <= 1}
            className={`rounded-md border px-4 py-2 text-sm font-medium ${
              page <= 1
                ? "pointer-events-none border-slate-800 text-slate-600"
                : "border-slate-700 text-slate-100 hover:border-emerald-400"
            }`}
            href={buildClientPageHref(page - 1, search)}
          >
            Previous
          </Link>
          <span className="text-sm text-slate-400">
            Page {page} of {totalPages}
          </span>
          <Link
            aria-disabled={page >= totalPages}
            className={`rounded-md border px-4 py-2 text-sm font-medium ${
              page >= totalPages
                ? "pointer-events-none border-slate-800 text-slate-600"
                : "border-slate-700 text-slate-100 hover:border-emerald-400"
            }`}
            href={buildClientPageHref(page + 1, search)}
          >
            Next
          </Link>
        </nav>
      </div>
    </main>
  );
}
