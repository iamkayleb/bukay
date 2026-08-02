-- Persist OTP and rate-limit state outside of a single application process.

CREATE TABLE "OtpCode" (
    "phone" TEXT NOT NULL PRIMARY KEY,
    "hash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "OtpRateLimit" (
    "phone" TEXT NOT NULL PRIMARY KEY,
    "windowStart" DATETIME NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "OtpCode_expiresAt_idx" ON "OtpCode"("expiresAt");

CREATE INDEX "OtpRateLimit_windowStart_idx" ON "OtpRateLimit"("windowStart");
