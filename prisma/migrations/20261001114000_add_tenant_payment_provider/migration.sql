-- Existing tenants retain the current Paystack integration until an owner
-- explicitly switches their payment configuration to Flutterwave. SQLite does
-- not support Prisma enums, so enforce the supported provider set with CHECK.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "paymentProvider" TEXT NOT NULL DEFAULT 'PAYSTACK'
        CHECK ("paymentProvider" IN ('PAYSTACK', 'FLUTTERWAVE')),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Tenant" ("id", "name", "slug", "timezone", "currency", "createdAt", "updatedAt")
SELECT "id", "name", "slug", "timezone", "currency", "createdAt", "updatedAt"
FROM "Tenant";

DROP TABLE "Tenant";
ALTER TABLE "new_Tenant" RENAME TO "Tenant";
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
