-- Add explicit slot hold expiry for pending-payment public bookings.
ALTER TABLE "Booking" ADD COLUMN "holdExpiresAt" DATETIME;

CREATE INDEX "Booking_tenantId_status_holdExpiresAt_idx" ON "Booking"("tenantId", "status", "holdExpiresAt");
