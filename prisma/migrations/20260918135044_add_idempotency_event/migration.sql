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
CREATE TABLE "IdempotencyEvent" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "DeadLetterEvent_provider_eventType_idx" ON "DeadLetterEvent"("provider", "eventType");

-- CreateIndex
CREATE INDEX "IdempotencyEvent_expiresAt_idx" ON "IdempotencyEvent"("expiresAt");
