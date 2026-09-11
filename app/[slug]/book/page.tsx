import { notFound } from "next/navigation";

import { BookingStepper } from "./booking-stepper";
import { getShopfrontTenant } from "../data";

type BookingPageProps = {
  params: { slug: string };
};

export default async function BookingPage({ params }: BookingPageProps) {
  const tenant = await getShopfrontTenant(params.slug);

  if (!tenant) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12 text-slate-100">
      <header className="mb-10 space-y-2">
        <a
          className="text-sm font-medium text-emerald-300 hover:text-emerald-200"
          href={`/${tenant.slug}`}
        >
          ← {tenant.name}
        </a>
        <h1 className="text-3xl font-semibold text-white">Book an appointment</h1>
        <p className="text-sm text-slate-300">Complete these steps to reserve your time.</p>
      </header>
      <BookingStepper
        currency={tenant.currency}
        services={tenant.services}
        tenantName={tenant.name}
      />
    </main>
  );
}
