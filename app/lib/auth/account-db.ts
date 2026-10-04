import { PrismaClient } from "@prisma/client";

// Authentication begins before a request has a tenant context. Keep this
// client private to account provisioning so normal application queries remain
// protected by the tenant guard.
const createAccountPrismaClient = () => new PrismaClient();

type AccountPrismaClient = ReturnType<typeof createAccountPrismaClient>;

const globalForAccountPrisma = globalThis as unknown as { accountPrisma?: AccountPrismaClient };

export const accountPrisma = globalForAccountPrisma.accountPrisma ?? createAccountPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForAccountPrisma.accountPrisma = accountPrisma;
}
