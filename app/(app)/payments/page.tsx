import { formatPrice } from "../services/services-list";
import { PaymentsList, loadSignedInPayments, paidTotalCents } from "./payments-list";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const payments = await loadSignedInPayments();
  const totalCents = paidTotalCents(payments);
  const currency = payments.find((payment) => payment.status === "paid")?.currency ?? "NGN";

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          Payments
        </p>
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">Payments</h2>
        <p className="max-w-xl text-sm text-slate-300 sm:text-base">
          Money taken for bookings on this business.
        </p>
        <p className="text-sm text-slate-200 sm:text-base">
          Total paid: {formatPrice(totalCents, currency)}
        </p>
      </div>
      <PaymentsList payments={payments} />
    </section>
  );
}
