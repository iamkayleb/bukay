-- Timestamp used by the reminder dispatcher to atomically record a send.
ALTER TABLE "Booking" ADD COLUMN "reminderSentAt" DATETIME;

-- Supports scans for upcoming bookings whose reminder has not been recorded.
CREATE INDEX "Booking_startsAt_reminderSentAt_idx" ON "Booking"("startsAt", "reminderSentAt");
