-- Prevent double-booking the same staff member at the database boundary.
-- SQLite has no exclusion constraints, so triggers enforce the interval overlap invariant.

CREATE INDEX "Booking_tenantId_staffId_startsAt_endsAt_idx" ON "Booking"("tenantId", "staffId", "startsAt", "endsAt");

CREATE TRIGGER "Booking_prevent_staff_overlap_insert"
BEFORE INSERT ON "Booking"
WHEN NEW."staffId" IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'BOOKING_OVERLAP')
    WHERE EXISTS (
        SELECT 1
        FROM "Booking" AS existing
        WHERE existing."tenantId" = NEW."tenantId"
          AND existing."staffId" = NEW."staffId"
          AND existing."startsAt" < NEW."endsAt"
          AND existing."endsAt" > NEW."startsAt"
    );
END;

CREATE TRIGGER "Booking_prevent_staff_overlap_update"
BEFORE UPDATE OF "tenantId", "staffId", "startsAt", "endsAt" ON "Booking"
WHEN NEW."staffId" IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'BOOKING_OVERLAP')
    WHERE EXISTS (
        SELECT 1
        FROM "Booking" AS existing
        WHERE existing."id" <> NEW."id"
          AND existing."tenantId" = NEW."tenantId"
          AND existing."staffId" = NEW."staffId"
          AND existing."startsAt" < NEW."endsAt"
          AND existing."endsAt" > NEW."startsAt"
    );
END;
