import { ServiceForm } from "./service-form";
import { ServicesList } from "./services-list";

export default function ServicesPage() {
  return (
    <section className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Services</p>
        <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Your service menu</h1>
      </div>
      <ServicesList />
      <ServiceForm />
    </section>
  );
}
