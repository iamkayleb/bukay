-- Multi-window BusinessHour + Blackout support
--
-- Historically each (tenantId, dayOfWeek) had a UNIQUE index, forcing one
-- open→close window per weekday. This migration relaxes that constraint so
-- tenants can define split shifts (e.g. 09:00–12:00 and 14:00–18:00 on the
-- same weekday) and introduces a Blackout table for one-off date closures.

-- Step 1: Resolve any pre-existing duplicate BusinessHour rows for a given
-- (tenantId, dayOfWeek). The old UNIQUE index would have prevented these, but
-- if a prior migration ever failed partway through, or if rows were inserted
-- via a raw path that bypassed Prisma, we defensively collapse duplicates
-- before dropping the unique index. We keep the row with the lowest id (an
-- arbitrary but deterministic winner) per group and delete the rest so the
-- transition to a non-unique index does not silently change query results.
DELETE FROM "BusinessHour"
WHERE "id" NOT IN (
    SELECT MIN("id")
    FROM "BusinessHour"
    GROUP BY "tenantId", "dayOfWeek"
);

-- Step 2: Drop the single-window uniqueness so multiple windows per weekday
-- become legal.
DROP INDEX "BusinessHour_tenantId_dayOfWeek_key";

-- Step 3: Replace with a non-unique lookup index so weekday-scoped queries
-- (used by getOpenWindows) still hit an index.
CREATE INDEX "BusinessHour_tenantId_dayOfWeek_idx" ON "BusinessHour"("tenantId", "dayOfWeek");

-- Step 4: Blackout table for one-off closures.
-- `date` is a text column carrying an ISO YYYY-MM-DD wall-clock date in the
-- tenant's timezone. Storing as text (rather than DATETIME) keeps the value
-- stable across DST transitions and independent of UTC offset.
CREATE TABLE "Blackout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Blackout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Blackout_tenantId_idx" ON "Blackout"("tenantId");
CREATE UNIQUE INDEX "Blackout_tenantId_date_key" ON "Blackout"("tenantId", "date");
