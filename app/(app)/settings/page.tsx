import { headers } from "next/headers";

import { prisma } from "@/app/db/prisma";
import { getRemindersEnabled } from "@/app/lib/reminder-settings";
import { updateReminderSettings } from "./actions";
import { resolveTenantId } from "./tenant";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const tenantId = await resolveTenantId(await headers());
  const enabled = tenantId ? await getRemindersEnabled(prisma, tenantId) : false;
  const tenant = tenantId
    ? await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } })
    : null;
  const qrHref = tenant ? `/api/qr/${encodeURIComponent(tenant.slug)}` : null;

  return (
    <section>
      <h1>Settings</h1>
      <form action={updateReminderSettings}>
        <label>
          <input
            defaultChecked={enabled}
            disabled={!tenantId}
            name="remindersEnabled"
            type="checkbox"
          />{" "}
          Send booking reminders (24 hours and 2 hours before)
        </label>
        <button disabled={!tenantId} type="submit">
          Save
        </button>
      </form>
      <h2>Booking QR code</h2>
      <p>Print this and display it in your shop so walk-in customers can scan and book.</p>
      {qrHref ? (
        <p>
          <a download href={qrHref}>
            Download PDF
          </a>{" "}
          <a download href={`${qrHref}?format=png`}>
            Download PNG
          </a>
        </p>
      ) : (
        <p>Sign in to a shop to download its QR code.</p>
      )}
    </section>
  );
}
