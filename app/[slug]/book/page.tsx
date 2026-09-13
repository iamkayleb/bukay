import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getShopfrontTenant } from "../data";
import { BookingStepper } from "./booking-stepper";

export const revalidate = 60;

type BookingPageProps = {
  params: { slug: string };
};

export async function generateMetadata({ params }: BookingPageProps): Promise<Metadata> {
  const tenant = await getShopfrontTenant(params.slug);

  if (!tenant) {
    return { title: "Shop not found" };
  }

  return { title: `Book with ${tenant.name} | Bukay` };
}

export default async function BookingPage({ params }: BookingPageProps) {
  const tenant = await getShopfrontTenant(params.slug);

  if (!tenant) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 px-6 py-16 text-slate-100">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Bukay</p>
        <h1 className="text-2xl font-semibold text-white md:text-3xl">Book with {tenant.name}</h1>
        <p className="text-sm text-slate-300">Pick a service, choose a time, and confirm.</p>
      </header>

      <BookingStepper slug={tenant.slug} currency={tenant.currency} services={tenant.services} />
    </main>
  );
}
