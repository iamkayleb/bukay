import { PrismaClient } from "../app/generated/prisma";
import { withTenantGuard } from "./tenant/prismaWithTenantGuard";

declare global {
  // eslint-disable-next-line no-var
  var _prismaBase: PrismaClient | undefined;
}

const basePrisma: PrismaClient =
  globalThis._prismaBase ?? new PrismaClient({ log: ["error"] });

if (process.env.NODE_ENV !== "production") {
  globalThis._prismaBase = basePrisma;
}

// Default export is the guarded client for application code.
// Import basePrisma directly only when querying tenant-root models (e.g. Tenant lookup).
export { basePrisma };
export const prisma = withTenantGuard(basePrisma);
