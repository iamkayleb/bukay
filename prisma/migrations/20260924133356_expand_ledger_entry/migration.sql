/*
  Warnings:

  - Added the required column `sourceRef` to the `LedgerEntry` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT,
    "paymentId" TEXT,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "sourceRef" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LedgerEntry" ("amountCents", "bookingId", "createdAt", "currency", "id", "notes", "tenantId", "type") SELECT "amountCents", "bookingId", "createdAt", "currency", "id", "notes", "tenantId", "type" FROM "LedgerEntry";
DROP TABLE "LedgerEntry";
ALTER TABLE "new_LedgerEntry" RENAME TO "LedgerEntry";
CREATE INDEX "LedgerEntry_tenantId_idx" ON "LedgerEntry"("tenantId");
CREATE INDEX "LedgerEntry_bookingId_idx" ON "LedgerEntry"("bookingId");
CREATE INDEX "LedgerEntry_tenantId_type_createdAt_idx" ON "LedgerEntry"("tenantId", "type", "createdAt");
CREATE UNIQUE INDEX "LedgerEntry_type_sourceRef_key" ON "LedgerEntry"("type", "sourceRef");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
