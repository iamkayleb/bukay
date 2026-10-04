import { headers } from "next/headers";

import { prisma } from "@/app/db/prisma";
import { getRemindersEnabled } from "@/app/lib/reminder-settings";
import { updateReminderSettings } from "./actions";
import { resolveTenantId } from "./tenant";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const tenantId = await resolveTenantId(await headers());
  const enabled = tenantId ? await getRemindersEnabled(prisma, tenantId) : false;

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
    </section>
  );
}
