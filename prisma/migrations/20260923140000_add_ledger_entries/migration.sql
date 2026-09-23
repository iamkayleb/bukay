-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "grossKobo" INTEGER NOT NULL,
    "providerFeeKobo" INTEGER NOT NULL DEFAULT 0,
    "platformFeeKobo" INTEGER NOT NULL DEFAULT 0,
    "netKobo" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "provider" TEXT,
    "providerRef" TEXT,
    "reference" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_reference_key" ON "LedgerEntry"("reference");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenantId_idx" ON "LedgerEntry"("tenantId");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenantId_occurredAt_idx" ON "LedgerEntry"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_providerRef_idx" ON "LedgerEntry"("providerRef");

-- Ledger rows are immutable: offset an incorrect entry with a new row instead.
CREATE TRIGGER "LedgerEntry_append_only_update"
BEFORE UPDATE ON "LedgerEntry"
BEGIN
    SELECT RAISE(ABORT, 'LedgerEntry is append-only');
END;

CREATE TRIGGER "LedgerEntry_append_only_delete"
BEFORE DELETE ON "LedgerEntry"
BEGIN
    SELECT RAISE(ABORT, 'LedgerEntry is append-only');
END;
