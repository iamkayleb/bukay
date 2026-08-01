-- Align the Service table with the API/UI contract:
--   - rename priceCents -> priceKobo (NGN is stored in kobo, the smallest unit)
--   - add bufferMinutes (defaults to 0 so existing rows stay valid)
--
-- Uses a table copy to stay portable across older SQLite builds that lack
-- ALTER TABLE ... RENAME COLUMN support.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "priceKobo" INTEGER NOT NULL,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Service_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Service" (
    "id",
    "tenantId",
    "name",
    "description",
    "durationMinutes",
    "priceKobo",
    "currency",
    "active",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "tenantId",
    "name",
    "description",
    "durationMinutes",
    "priceCents",
    "currency",
    "active",
    "createdAt",
    "updatedAt"
FROM "Service";

DROP TABLE "Service";
ALTER TABLE "new_Service" RENAME TO "Service";
CREATE UNIQUE INDEX "Service_tenantId_name_key" ON "Service"("tenantId", "name");
CREATE INDEX "Service_tenantId_idx" ON "Service"("tenantId");

PRAGMA foreign_keys=ON;
