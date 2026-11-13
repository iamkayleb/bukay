import { prisma } from "@/app/db/prisma";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";
import { formatPrice, resolveSignedInTenantId } from "../services/services-list";

export type PaymentRow = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: Date;
  clientName: string;
  serviceName: string;
};

type PaymentQueryRow = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: Date;
  booking: {
    client: { name: string };
    service: { name: string };
  };
};

export async function listTenantPayments(tenantId: string): Promise<PaymentRow[]> {
  const rows = await runWithTenantContext({ tenantId }, () =>
    prisma.payment.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amountCents: true,
        currency: true,
        status: true,
        createdAt: true,
        booking: {
          select: {
            client: { select: { name: true } },
            service: { select: { name: true } },
          },
        },
      },
    })
  );

  return rows.map((row: PaymentQueryRow) => ({
    id: row.id,
    amountCents: row.amountCents,
    currency: row.currency,
    status: row.status,
    createdAt: row.createdAt,
    clientName: row.booking.client.name,
    serviceName: row.booking.service.name,
  }));
}

export async function loadSignedInPayments(): Promise<PaymentRow[]> {
  const tenantId = await resolveSignedInTenantId();
  return tenantId ? listTenantPayments(tenantId) : [];
}

export function paidTotalCents(payments: PaymentRow[]): number {
  return payments
    .filter((payment) => payment.status === "paid")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
}

function formatPaymentDate(value: Date): string {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function PaymentsList({ payments }: { payments: PaymentRow[] }) {
  if (payments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-5 py-8 text-center">
        <p className="text-sm text-slate-400">No payments yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800">
      <table aria-label="Payments" className="w-full text-left text-sm">
        <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium">Client</th>
            <th className="px-4 py-3 font-medium">Service</th>
            <th className="px-4 py-3 font-medium">Amount</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td className="px-4 py-3 font-medium text-white">{payment.clientName}</td>
              <td className="px-4 py-3 text-slate-300">{payment.serviceName}</td>
              <td className="px-4 py-3 text-slate-300">
                {formatPrice(payment.amountCents, payment.currency)}
              </td>
              <td className="px-4 py-3 text-slate-300">{payment.status}</td>
              <td className="px-4 py-3 text-slate-300">
                <time dateTime={payment.createdAt.toISOString()}>
                  {formatPaymentDate(payment.createdAt)}
                </time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
