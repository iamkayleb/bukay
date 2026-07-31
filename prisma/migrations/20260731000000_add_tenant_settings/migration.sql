-- Add tenant settings fields used by the settings form and public booking branding.
ALTER TABLE "Tenant" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "brandColor" TEXT NOT NULL DEFAULT '#10b981';
ALTER TABLE "Tenant" ADD COLUMN "cancellationPolicy" TEXT NOT NULL DEFAULT '';
