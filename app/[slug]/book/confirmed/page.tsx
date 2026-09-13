import { notFound } from "next/navigation";

import { getShopfrontTenant } from "../../data";

type ConfirmedBookingPageProps = {
  params: { slug: string };
};

export default async function ConfirmedBookingPage({ params }: ConfirmedBookingPageProps) {
  const tenant = await getShopfrontTenant(params.slug);

  if (!tenant) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12 text-slate-100">
      <section
        aria-labelledby="booking-confirmed-heading"
        className="w-full rounded-2xl border border-emerald-400/30 bg-slate-900/60 p-6 shadow-xl shadow-slate-950/20 sm:p-8"
      >
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">Bukay</p>
        <div className="mt-6 flex size-12 items-center justify-center rounded-full bg-emerald-400/15 text-2xl text-emerald-300">
          <span aria-hidden="true">✓</span>
        </div>
        <h1 id="booking-confirmed-heading" className="mt-5 text-3xl font-semibold text-white">
          Your booking is confirmed
        </h1>
        <p className="mt-3 text-slate-300">
          We&apos;ve reserved your appointment with {tenant.name}. Keep an eye on your phone for any
          updates from the business.
        </p>
        <p className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
          You can safely close this page. Your booking details will be available from the
          confirmation message.
        </p>
        <a
          className="mt-8 inline-flex rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
          href={`/${tenant.slug}`}
        >
          Back to {tenant.name}
        </a>
      </section>
    </main>
  );
}
