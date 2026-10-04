import { randomBytes } from "node:crypto";
import { prisma } from "@/app/db/prisma";

export type Account = { userId: string; tenantId: string; created: boolean };

// Tenant is not tenant-scoped, so the user is located through it: the guard
// requires a tenantId in every User where clause.
export async function findAccountByPhone(phone: string): Promise<Account | null> {
  const tenant = await prisma.tenant.findFirst({
    where: { users: { some: { phone } } },
    select: { id: true },
  });
  if (!tenant) return null;
  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, phone },
    select: { id: true },
  });
  return user ? { userId: user.id, tenantId: tenant.id, created: false } : null;
}

function generateSlug(phone: string): string {
  const digits = phone.replace(/\D/g, "").slice(-4);
  return `biz-${digits}-${randomBytes(4).toString("hex")}`;
}

// Nested create so the tenant and its owner are written atomically.
export async function createAccount(phone: string): Promise<Account> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Business ${phone}`,
      slug: generateSlug(phone),
      users: {
        create: {
          phone,
          email: `${phone.replace(/\D/g, "")}@phone.bukay.invalid`,
          name: phone,
          role: "owner",
        },
      },
    },
    select: { id: true, users: { select: { id: true } } },
  });
  return { userId: tenant.users[0].id, tenantId: tenant.id, created: true };
}

export async function findOrCreateAccount(phone: string): Promise<Account> {
  const existing = await findAccountByPhone(phone);
  if (existing) return existing;
  try {
    return await createAccount(phone);
  } catch (err) {
    // Concurrent first sign-in lost the unique(phone) race; reuse the winner.
    const raced = await findAccountByPhone(phone);
    if (raced) return raced;
    throw err;
  }
}
