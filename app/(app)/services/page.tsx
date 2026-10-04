import { ServiceForm } from "./service-form";
import { ServicesList } from "./services-list";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const list = await ServicesList();

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          Services
        </p>
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">Services</h2>
        <p className="max-w-xl text-sm text-slate-300 sm:text-base">
          Every service offered by this business.
        </p>
      </div>
      {list}
      <ServiceForm />
    </section>
  );
}
