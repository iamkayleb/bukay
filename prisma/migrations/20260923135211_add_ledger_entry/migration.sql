-- CreateTable
CREATE TABLE "DeadLetterEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "paymentId" TEXT,
    "providerRef" TEXT,
    "payoutRef" TEXT,
    "grossCents" INTEGER NOT NULL,
    "providerFeeCents" INTEGER NOT NULL DEFAULT 0,
    "platformFeeCents" INTEGER NOT NULL DEFAULT 0,
    "netCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DeadLetterEvent_provider_eventType_idx" ON "DeadLetterEvent"("provider", "eventType");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenantId_idx" ON "LedgerEntry"("tenantId");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenantId_occurredAt_idx" ON "LedgerEntry"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_paymentId_idx" ON "LedgerEntry"("paymentId");

-- CreateIndex
CREATE INDEX "LedgerEntry_payoutRef_idx" ON "LedgerEntry"("payoutRef");

-- AppendOnly: LedgerEntry rows are a financial audit trail and must never be
-- mutated or removed once written. These triggers reject UPDATE and DELETE at
-- the database layer regardless of what application code attempts.
CREATE TRIGGER "LedgerEntry_no_update"
BEFORE UPDATE ON "LedgerEntry"
BEGIN
  SELECT RAISE(ABORT, 'LedgerEntry is append-only: UPDATE is not allowed');
END;

CREATE TRIGGER "LedgerEntry_no_delete"
BEFORE DELETE ON "LedgerEntry"
BEGIN
  SELECT RAISE(ABORT, 'LedgerEntry is append-only: DELETE is not allowed');
END;
