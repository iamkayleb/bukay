// Per-tenant reminder toggle. The reminder job only considers tenants with
// `remindersEnabled = true`, so turning it off stops every later reminder.

export interface ReminderSettingsClient {
  tenant: {
    findUnique(args: {
      where: { id: string };
      select: { remindersEnabled: true };
    }): Promise<{ remindersEnabled: boolean } | null>;
    update(args: {
      where: { id: string };
      data: { remindersEnabled: boolean };
    }): Promise<unknown>;
  };
}

export async function getRemindersEnabled(
  client: ReminderSettingsClient,
  tenantId: string
): Promise<boolean> {
  const tenant = await client.tenant.findUnique({
    where: { id: tenantId },
    select: { remindersEnabled: true },
  });
  return tenant?.remindersEnabled ?? false;
}

export async function setRemindersEnabled(
  client: ReminderSettingsClient,
  tenantId: string,
  enabled: boolean
): Promise<void> {
  await client.tenant.update({ where: { id: tenantId }, data: { remindersEnabled: enabled } });
}

/** Reads the checkbox from a submitted settings form. */
export function parseRemindersToggle(form: FormData): boolean {
  return form.get("remindersEnabled") === "on";
}
