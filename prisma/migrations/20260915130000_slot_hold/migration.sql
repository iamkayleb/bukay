-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "slotLock" TEXT;

-- CreateTable
CREATE TABLE "SlotHold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "sessionId" TEXT NOT NULL,
    "bookingId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SlotHold_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SlotHold_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_tenantId_slotLock_key" ON "Booking"("tenantId", "slotLock");

-- CreateIndex
CREATE INDEX "SlotHold_tenantId_idx" ON "SlotHold"("tenantId");

-- CreateIndex
CREATE INDEX "SlotHold_expiresAt_idx" ON "SlotHold"("expiresAt");

-- CreateIndex
CREATE INDEX "SlotHold_tenantId_expiresAt_idx" ON "SlotHold"("tenantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SlotHold_tenantId_serviceId_startsAt_key" ON "SlotHold"("tenantId", "serviceId", "startsAt");
