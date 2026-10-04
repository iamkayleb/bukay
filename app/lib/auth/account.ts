import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { accountPrisma } from "@/app/lib/auth/account-db";

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
  const existing = await accountPrisma.user.findUnique({ where: { phone } });
  if (existing) {
    return { userId: existing.id, tenantId: existing.tenantId };
  }

  try {
    const tenant = await accountPrisma.tenant.create({
      data: {
        name: "My business",
        slug: tenantSlug(),
        users: {
          create: {
            phone,
            email: ownerEmail(phone),
            name: "Owner",
            role: "owner",
          },
        },
      },
      include: { users: { select: { id: true } } },
    });

    return { userId: tenant.users[0].id, tenantId: tenant.id };
  } catch (error) {
    // Concurrent successful verifications can both miss the initial lookup.
    // The phone constraint chooses one owner; then reuse that persisted row.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const racedAccount = await accountPrisma.user.findUnique({ where: { phone } });
      if (racedAccount) {
        return { userId: racedAccount.id, tenantId: racedAccount.tenantId };
      }
    }
    throw error;
  }
}
