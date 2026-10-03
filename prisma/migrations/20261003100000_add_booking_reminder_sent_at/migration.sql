-- Timestamp used by the reminder dispatcher to atomically record a send.
ALTER TABLE "Booking" ADD COLUMN "reminderSentAt" DATETIME;

-- Tenants can opt out of future reminder dispatches.
ALTER TABLE "Tenant" ADD COLUMN "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Supports scans for upcoming bookings whose reminder has not been recorded.
CREATE INDEX "Booking_startsAt_reminderSentAt_idx" ON "Booking"("startsAt", "reminderSentAt");
