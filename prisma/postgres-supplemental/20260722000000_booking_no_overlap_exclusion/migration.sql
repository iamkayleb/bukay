-- Prevent double-booking a staff member at the database level.
--
-- Uses a Postgres EXCLUDE constraint backed by a GiST index over
-- (staffId, tstzrange(startsAt, endsAt)). Two bookings assigned to the
-- same staffId whose time ranges overlap will be rejected by the DB.
--
-- Cancelled bookings are excluded from the constraint via a WHERE clause
-- so that a slot freed by cancellation can be re-booked.
--
-- Notes:
--   * Requires the btree_gist extension so equality on a scalar column
--     (staffId) can be combined with a range-overlap operator in the same
--     GiST index.
--   * The range is half-open [startsAt, endsAt) which matches how the
--     booking engine treats slot boundaries (endsAt == next.startsAt is
--     allowed).
--   * The constraint only applies when staffId IS NOT NULL because a null
--     staffId means "unassigned" and does not conflict with any staff row.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_no_overlap_per_staff"
  EXCLUDE USING gist (
    "staffId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE ("staffId" IS NOT NULL AND "status" <> 'cancelled');
