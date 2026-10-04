"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { prisma } from "@/app/db/prisma";
import { parseRemindersToggle, setRemindersEnabled } from "@/app/lib/reminder-settings";
import { resolveTenantId } from "./tenant";

export async function updateReminderSettings(form: FormData): Promise<void> {
  const tenantId = await resolveTenantId(await headers());
  if (!tenantId) throw new Error("tenant_required");
  await setRemindersEnabled(prisma, tenantId, parseRemindersToggle(form));
  revalidatePath("/settings");
}
