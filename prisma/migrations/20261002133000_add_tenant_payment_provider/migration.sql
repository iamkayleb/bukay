-- Each tenant selects the payment adapter used for new payment attempts.
-- Existing tenants retain Paystack unless explicitly moved to another provider.
ALTER TABLE "Tenant" ADD COLUMN "paymentProvider" TEXT NOT NULL DEFAULT 'paystack';
