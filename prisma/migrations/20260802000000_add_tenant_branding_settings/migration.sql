-- Add tenant branding and policy settings used by the settings form and public booking pages.
ALTER TABLE "Tenant" ADD COLUMN "brandColor" TEXT NOT NULL DEFAULT '#10b981';
ALTER TABLE "Tenant" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "cancellationPolicy" TEXT;
