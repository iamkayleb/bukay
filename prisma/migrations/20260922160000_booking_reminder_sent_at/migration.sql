-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "reminderSentAt" DATETIME;
