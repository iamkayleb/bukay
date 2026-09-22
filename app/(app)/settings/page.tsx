import { ReminderToggle } from "./reminder-toggle";
import { prisma } from "@/app/db/prisma";

type SettingsPageProps = {
  searchParams?: { tenantId?: string };
};

/**
 * Tenant settings. The reminders toggle is the first live control; remaining
 * preferences stay documented as upcoming.
 */
export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const tenantId = searchParams?.tenantId?.trim() || "";
  let initialEnabled = true;

  if (tenantId) {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { remindersEnabled: true },
      });
      if (tenant) {
        initialEnabled = tenant.remindersEnabled;
      }
    } catch {
      // Schema may not be migrated in some test environments; keep default on.
      initialEnabled = true;
    }
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          Settings
        </p>
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">Settings</h2>
        <p className="max-w-xl text-sm text-slate-300 sm:text-base">
          Manage tenant preferences, business hours, branding, and integrations.
        </p>
      </div>

      <ReminderToggle initialEnabled={initialEnabled} tenantId={tenantId || "default-tenant"} />

      <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-5 py-8 text-center">
        <p className="text-sm text-slate-400">
          Additional settings (business hours, branding, integrations) are not available yet.
        </p>
      </div>
    </section>
  );
}
