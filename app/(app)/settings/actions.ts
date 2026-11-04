"use server";

import { prisma } from "@/app/db/prisma";

export type SetRemindersEnabledInput = {
  tenantId: string;
  enabled: boolean;
};

export type SetRemindersEnabledResult =
  { ok: true; remindersEnabled: boolean } | { ok: false; error: string };

/**
 * Persist the tenant-level reminders toggle used by the reminder cron.
 */
export async function setRemindersEnabledAction(
  input: SetRemindersEnabledInput
): Promise<SetRemindersEnabledResult> {
  const tenantId = input.tenantId?.trim();
  if (!tenantId) {
    return { ok: false, error: "tenantId is required" };
  }

  try {
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { remindersEnabled: Boolean(input.enabled) },
      select: { remindersEnabled: true },
    });
    return { ok: true, remindersEnabled: updated.remindersEnabled };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    return { ok: false, error: message };
  }
}
