-- CreateTable
CREATE TABLE "DeadLetter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeadLetter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DeadLetter_source_idx" ON "DeadLetter"("source");

-- CreateIndex
CREATE INDEX "DeadLetter_eventType_idx" ON "DeadLetter"("eventType");

-- CreateIndex
CREATE INDEX "DeadLetter_createdAt_idx" ON "DeadLetter"("createdAt");

-- CreateIndex
CREATE INDEX "DeadLetter_tenantId_idx" ON "DeadLetter"("tenantId");
