import { PrismaClient } from "@prisma/client";
import { tenantGuardExtension } from "@/app/lib/tenant-guard";

function buildClient() {
  return new PrismaClient().$extends(tenantGuardExtension());
}

type GuardedClient = ReturnType<typeof buildClient>;

const globalForPrisma = globalThis as unknown as { prisma?: GuardedClient };

export const prisma: GuardedClient = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
