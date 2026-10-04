import { randomUUID } from "node:crypto";

import { prisma } from "@/app/db/prisma";

export type Account = {
  userId: string;
  tenantId: string;
};

function ownerEmail(phone: string): string {
  return `${phone.replace(/[^\d]/g, "")}@owner.bukay.local`;
}

function tenantSlug(): string {
  return `business-${randomUUID().replace(/-/g, "")}`;
}

/**
 * Finds the owner account associated with a verified phone number, creating a
 * tenant and its owner account when that phone is seen for the first time.
 */
export async function findOrCreateAccount(phone: string): Promise<Account> {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    return { userId: existing.id, tenantId: existing.tenantId };
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: "My business",
      slug: tenantSlug(),
    },
  });
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      phone,
      email: ownerEmail(phone),
      name: "Owner",
      role: "owner",
    },
  });

  return { userId: user.id, tenantId: tenant.id };
}
