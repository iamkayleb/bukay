import { notFound } from "next/navigation";

const DEMO_SHOPFRONT_SLUG = "demo";

type ShopfrontPageProps = {
  params: { slug: string };
};

/**
 * The public shopfront is intentionally independent from the authenticated
 * application shell. The demo tenant is available without a database setup,
 * which also makes the route suitable for production smoke checks.
 */
export default function ShopfrontPage({ params }: ShopfrontPageProps) {
  if (params.slug !== DEMO_SHOPFRONT_SLUG) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-24">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">Bukay</p>
        <h1 className="text-4xl font-semibold text-white md:text-5xl">Bukay Demo Salon</h1>
        <p className="max-w-xl text-base text-slate-300">
          Browse services and book your next appointment online.
        </p>
      </div>
    </main>
  );
}
