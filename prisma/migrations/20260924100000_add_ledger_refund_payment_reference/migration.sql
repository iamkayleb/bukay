-- Refunds retain the provider payment reference they reverse. The field is
-- nullable because payment and payout entries do not have a related payment.
ALTER TABLE "LedgerEntry" ADD COLUMN "relatedPaymentRef" TEXT;
