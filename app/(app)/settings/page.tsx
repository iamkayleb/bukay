import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/lib/resolve-tenant";

async function currentTenant() {
  const requestHeaders = headers();
  const tenant = resolveTenant({
    headers: { get: (name) => requestHeaders.get(name) },
    session: null,
  });

  if (!tenant.tenantSlug) return null;
  return prisma.tenant.findUnique({
    where: { slug: tenant.tenantSlug },
    select: { id: true, remindersEnabled: true },
  });
}

export default async function SettingsPage() {
  const tenant = await currentTenant();

  async function updateReminderPreference(formData: FormData) {
    "use server";

    const current = await currentTenant();
    if (!current) throw new Error("A tenant is required to update reminder settings");

    await prisma.tenant.update({
      where: { id: current.id },
      data: { remindersEnabled: formData.get("remindersEnabled") === "on" },
    });
    revalidatePath("/settings");
  }

  if (!tenant) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">Settings</h2>
        <p className="mt-2 text-sm text-slate-300">Select a tenant to manage its preferences.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Settings</p>
      <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Booking reminders</h2>
      <p className="mt-2 max-w-xl text-sm text-slate-300">
        Send customers reminders before their upcoming bookings.
      </p>

      <form
        action={updateReminderPreference}
        className="mt-6 rounded-lg border border-slate-800 bg-slate-900/40 p-5"
      >
        <label
          className="flex cursor-pointer items-start gap-3 text-sm text-slate-200"
          htmlFor="remindersEnabled"
        >
          <input
            defaultChecked={tenant.remindersEnabled}
            id="remindersEnabled"
            name="remindersEnabled"
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-400"
          />
          <span>
            <span className="block font-medium">Enable booking reminders</span>
            <span className="mt-1 block text-slate-400">
              Stop future reminder messages when disabled.
            </span>
          </span>
        </label>
        <button
          className="mt-5 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
          type="submit"
        >
          Save reminder preference
        </button>
      </form>
    </section>
  );
}
