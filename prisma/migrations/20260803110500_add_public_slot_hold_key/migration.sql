-- Add an atomic guard for duplicate public slot holds created by racing requests.
ALTER TABLE "Booking" ADD COLUMN "slotHoldKey" TEXT;

CREATE UNIQUE INDEX "Booking_slotHoldKey_key" ON "Booking"("slotHoldKey");
