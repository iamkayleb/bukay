-- Enable GiST equality operators for text columns used by the exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlapping appointments for the same staff member within a tenant.
-- The half-open range allows adjacent bookings where one ends exactly as the next starts.
ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_staffId_time_overlap_excl"
EXCLUDE USING gist (
    "tenantId" WITH =,
    "staffId" WITH =,
    tstzrange("startsAt" AT TIME ZONE 'UTC', "endsAt" AT TIME ZONE 'UTC', '[)') WITH &&
)
WHERE ("staffId" IS NOT NULL);
