import { BusinessHoursForm } from "./business-hours-form";
import { ReminderToggle } from "./reminder-toggle";
import { resolveSignedInTenantId } from "../services/services-list";
import { prisma } from "@/app/db/prisma";
import type { BusinessHourRow } from "@/app/lib/business-hours";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export const dynamic = "force-dynamic";

type SettingsPageProps = {
  searchParams?: { tenantId?: string };
};

/**
 * Tenant settings: reminder delivery, weekly business hours and the booking QR
 * download. The signed-in session's tenant wins over the legacy ?tenantId param.
 */
export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  let sessionTenantId: string | null = null;
  try {
    sessionTenantId = await resolveSignedInTenantId();
  } catch {
    sessionTenantId = null;
  }
  const tenantId = sessionTenantId || searchParams?.tenantId?.trim() || "";
  let initialEnabled = true;
  let bookingSlug = "";
  // null = not loaded; the form is withheld so a failed read can't be saved as "all closed".
  let businessHours: BusinessHourRow[] | null = null;

  if (tenantId) {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { remindersEnabled: true, slug: true },
      });
      if (tenant) {
        initialEnabled = tenant.remindersEnabled;
        bookingSlug = tenant.slug.trim().toLowerCase();
      }
    } catch {
      // Schema may not be migrated in some test environments; keep default on.
      initialEnabled = true;
    }

  }

  // The editor saves through /api/business-hours, which resolves the tenant from the
  // session, so only offer it when the page is showing that same tenant.
  const editableTenantId = sessionTenantId;
  if (editableTenantId) {
    try {
      businessHours = await runWithTenantContext({ tenantId: editableTenantId }, () =>
        prisma.businessHour.findMany({
          where: { tenantId: editableTenantId },
          orderBy: { dayOfWeek: "asc" },
          select: { dayOfWeek: true, opensAt: true, closesAt: true, isClosed: true },
        })
      );
    } catch {
      businessHours = null;
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
          Manage reminders, business hours, and your booking QR.
        </p>
      </div>

      <ReminderToggle initialEnabled={initialEnabled} tenantId={tenantId || "default-tenant"} />

      {businessHours ? (
        <BusinessHoursForm initialHours={businessHours} />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-5 py-6">
          <h3 className="text-base font-medium text-white">Business hours</h3>
          <p className="mt-1 text-sm text-slate-400">
            Business hours could not be loaded for this account. Sign in again to edit them.
          </p>
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 px-5 py-6">
        <div className="space-y-1">
          <h3 className="text-base font-medium text-white">Booking QR</h3>
          <p className="text-sm text-slate-400">
            {bookingSlug
              ? `Download a branded PDF for the shop. The code opens /${bookingSlug}.`
              : "Download a branded PDF once this tenant has a public slug."}
          </p>
        </div>
        {bookingSlug ? (
          <a
            className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            download={`${bookingSlug}-booking-qr.pdf`}
            href={`/api/qr/${encodeURIComponent(bookingSlug)}`}
          >
            Download booking QR
          </a>
        ) : (
          <button
            className="inline-flex cursor-not-allowed items-center justify-center rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-500"
            disabled
            type="button"
          >
            Download booking QR
          </button>
        )}
      </div>
    </section>
  );
}
