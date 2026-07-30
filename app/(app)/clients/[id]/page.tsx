import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";
import { computeLifetimeValueCents, countNoShows, formatMoneyFromCents } from "../client-profile";

export const dynamic = "force-dynamic";

type ClientBookingRow = {
  id: string;
  startsAt: Date | string;
  endsAt: Date | string;
  status: string;
  notes: string | null;
  service: {
    name: string;
    priceCents: number;
    currency: string;
  };
  staff: {
    name: string;
  } | null;
  payments: Array<{
    amountCents: number;
    currency: string;
    status: string;
  }>;
};

type ClientProfileRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  notes: string | null;
  createdAt: Date | string;
  tenant: {
    currency: string;
  };
  clientTags: Array<{
    tag: {
      name: string;
    };
  }>;
  bookings: ClientBookingRow[];
};

type ClientDelegate = {
  findFirst(args: {
    where: Prisma.ClientWhereInput;
    select: {
      id: true;
      name: true;
      email: true;
      phone: true;
      notes: true;
      createdAt: true;
      tenant: { select: { currency: true } };
      clientTags: {
        orderBy: { tag: { name: "asc" } };
        select: { tag: { select: { name: true } } };
      };
      bookings: {
        orderBy: { startsAt: "desc" };
        select: {
          id: true;
          startsAt: true;
          endsAt: true;
          status: true;
          notes: true;
          service: { select: { name: true; priceCents: true; currency: true } };
          staff: { select: { name: true } };
          payments: {
            select: { amountCents: true; currency: true; status: true };
            orderBy: { createdAt: "desc" };
          };
        };
      };
    };
  }): Promise<ClientProfileRow | null>;
};

type TenantDelegate = {
  findUnique(args: {
    where: { slug: string };
    select: { id: true };
  }): Promise<{ id: string } | null>;
};

type ClientProfilePageParams = {
  id: string;
};

function formatDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function resolveTenantIdForClientProfile() {
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

async function loadClientProfile(tenantId: string, clientId: string) {
  const clientDelegate = prisma.client as unknown as ClientDelegate;

  return runWithTenantContext({ tenantId }, () =>
    clientDelegate.findFirst({
      where: { id: clientId, tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        notes: true,
        createdAt: true,
        tenant: { select: { currency: true } },
        clientTags: {
          orderBy: { tag: { name: "asc" } },
          select: { tag: { select: { name: true } } },
        },
        bookings: {
          orderBy: { startsAt: "desc" },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            notes: true,
            service: { select: { name: true, priceCents: true, currency: true } },
            staff: { select: { name: true } },
            payments: {
              select: { amountCents: true, currency: true, status: true },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    })
  );
}

export default async function ClientProfilePage({ params }: { params: ClientProfilePageParams }) {
  const tenantId = await resolveTenantIdForClientProfile();

  if (!tenantId) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Link className="text-sm font-medium text-emerald-300" href="/clients">
            Back to clients
          </Link>
          <h1 className="mt-4 text-3xl font-semibold text-white">Client profile</h1>
          <p className="mt-4 rounded-md border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300">
            Select a tenant before viewing this client.
          </p>
        </div>
      </main>
    );
  }

  const client = await loadClientProfile(tenantId, params.id);
  if (!client) {
    notFound();
  }

  const currency = client.tenant.currency;
  const lifetimeValueCents = computeLifetimeValueCents(client.bookings);
  const noShowCount = countNoShows(client.bookings);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="space-y-4">
          <Link
            className="text-sm font-medium text-emerald-300 hover:text-emerald-200"
            href="/clients"
          >
            Back to clients
          </Link>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
                Client profile
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-white">{client.name}</h1>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
                <span>{client.phone}</span>
                <span>{client.email ?? "No email"}</span>
              </div>
              {client.clientTags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {client.clientTags.map(({ tag }) => (
                    <Link
                      className="rounded-md border border-slate-700 px-2 py-1 text-xs font-medium text-emerald-200 hover:border-emerald-400"
                      href={`/clients?tag=${encodeURIComponent(tag.name)}`}
                      key={tag.name}
                    >
                      {tag.name}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
            <dl className="grid grid-cols-3 overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
              <div className="border-r border-slate-800 px-4 py-3">
                <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">LTV</dt>
                <dd className="mt-1 text-lg font-semibold text-white">
                  {formatMoneyFromCents(lifetimeValueCents, currency)}
                </dd>
              </div>
              <div className="border-r border-slate-800 px-4 py-3">
                <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">Bookings</dt>
                <dd className="mt-1 text-lg font-semibold text-white">{client.bookings.length}</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">No-shows</dt>
                <dd className="mt-1 text-lg font-semibold text-white">{noShowCount}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">
            Notes
          </h2>
          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-200">
            {client.notes?.trim() || "No notes recorded."}
          </p>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-800">
          <div className="border-b border-slate-800 bg-slate-900 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">
              Booking history
            </h2>
          </div>
          {client.bookings.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400">No bookings recorded.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {client.bookings.map((booking) => {
                const paidTotalCents = computeLifetimeValueCents([booking]);
                return (
                  <li
                    className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[1fr_160px_160px]"
                    key={booking.id}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-white">{booking.service.name}</p>
                      <p className="mt-1 text-slate-400">
                        {formatDateTime(booking.startsAt)} with{" "}
                        {booking.staff?.name ?? "Unassigned"}
                      </p>
                      {booking.notes ? (
                        <p className="mt-2 whitespace-pre-wrap text-slate-500">{booking.notes}</p>
                      ) : null}
                    </div>
                    <span className="capitalize text-slate-300">{booking.status}</span>
                    <span className="text-slate-300">
                      {formatMoneyFromCents(paidTotalCents, booking.service.currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
