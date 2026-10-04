import { headers } from "next/headers";

import { resolveTenantId } from "../settings/tenant";
import { ServiceForm } from "./service-form";
import { ServicesList } from "./services-list";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const headerList = headers();
  const tenantId = await resolveTenantId({ get: (name) => headerList.get(name) });

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          Services
        </p>
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">Services</h1>
      </div>
      {tenantId ? (
        <ServicesList tenantId={tenantId} />
      ) : (
        <p className="text-sm text-red-200">Sign in to a business to manage services.</p>
      )}
      <ServiceForm />
    </section>
  );
}
