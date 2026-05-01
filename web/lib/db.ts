import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { withTenantGuard } from "./tenant/prismaWithTenantGuard";

declare global {
  // eslint-disable-next-line no-var
  var _prismaBase: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

const pool: Pool =
  globalThis._pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL });

const basePrisma: PrismaClient =
  globalThis._prismaBase ?? new PrismaClient({ adapter: new PrismaPg(pool) });

if (process.env.NODE_ENV !== "production") {
  globalThis._pgPool = pool;
  globalThis._prismaBase = basePrisma;
}

// Default export is the guarded client for application code.
// Import basePrisma directly only when querying tenant-root models (e.g. Tenant lookup).
export { basePrisma };
export const prisma = withTenantGuard(basePrisma);
