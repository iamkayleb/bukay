import { ClientForm } from "./client-form";
import { ClientsList } from "./clients-list";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const list = await ClientsList();

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          Clients
        </p>
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">Clients</h2>
        <p className="max-w-xl text-sm text-slate-300 sm:text-base">
          Everyone who has booked with this business, plus walk-ins you add here.
        </p>
      </div>
      {list}
      <ClientForm />
    </section>
  );
}
