-- Distinguish temporary public slot holds from ordinary pending-payment bookings.
ALTER TABLE "Booking" ADD COLUMN "isSlotHold" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Booking_tenantId_isSlotHold_holdExpiresAt_idx" ON "Booking"("tenantId", "isSlotHold", "holdExpiresAt");
