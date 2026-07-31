-- CreateTable
CREATE TABLE "Blackout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Blackout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- DropIndex
DROP INDEX "BusinessHour_tenantId_dayOfWeek_key";

-- CreateIndex
CREATE INDEX "BusinessHour_tenantId_dayOfWeek_idx" ON "BusinessHour"("tenantId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "Blackout_tenantId_idx" ON "Blackout"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Blackout_tenantId_date_key" ON "Blackout"("tenantId", "date");
