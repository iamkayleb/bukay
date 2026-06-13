import { PrismaClient } from "@prisma/client";
import { tenantGuardExtension } from "@/app/db/tenant-guard";

const createPrismaClient = () => new PrismaClient().$extends(tenantGuardExtension);

type TenantGuardedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma?: TenantGuardedPrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
