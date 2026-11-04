import { randomBytes } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";

export type MerchantAccount = {
  userId: string;
  tenantId: string;
};

const SLUG_ATTEMPTS = 5;

const globalForAccount = globalThis as unknown as { merchantAccountDb?: PrismaClient };

/**
 * Phone lookup is cross-tenant: verification does not know the tenant until the
 * owner row is found. The shared client rejects User reads that omit tenantId,
 * so account provisioning uses an unguarded client.
 */
function accountDb(): PrismaClient {
  if (!globalForAccount.merchantAccountDb) {
    globalForAccount.merchantAccountDb = new PrismaClient();
  }
  return globalForAccount.merchantAccountDb;
}

function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

function slugFromPhone(phone: string): string {
  return `m-${digits(phone)}`;
}

function ownerEmail(phone: string): string {
  return `owner.${digits(phone)}@merchants.bukay.local`;
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function findUserByPhone(phone: string) {
  return accountDb().user.findUnique({ where: { phone } });
}

/**
 * Return the owner for this phone, creating a tenant and owner on first sign-in.
 * Later calls for the same phone reuse those rows.
 */
export async function findOrCreateAccountByPhone(phone: string): Promise<MerchantAccount> {
  const normalized = phone.trim();
  if (!normalized) {
    throw new Error("phone is required");
  }

  const existing = await findUserByPhone(normalized);
  if (existing) {
    return { userId: existing.id, tenantId: existing.tenantId };
  }

  const db = accountDb();
  const baseSlug = slugFromPhone(normalized);

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomBytes(3).toString("hex")}`;
    try {
      const tenant = await db.tenant.create({
        data: {
          name: `Shop ${digits(normalized)}`,
          slug,
          users: {
            create: {
              email: ownerEmail(normalized),
              name: normalized,
              phone: normalized,
              role: "owner",
            },
          },
        },
        include: { users: true },
      });
      const owner = tenant.users.find((user) => user.phone === normalized);
      if (!owner) {
        throw new Error("owner user was not created");
      }
      return { userId: owner.id, tenantId: tenant.id };
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const raced = await findUserByPhone(normalized);
      if (raced) {
        return { userId: raced.id, tenantId: raced.tenantId };
      }
    }
  }

  throw new Error("could not allocate a unique tenant slug");
}
