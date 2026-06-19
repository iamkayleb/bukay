-- Rename Service.priceCents → Service.priceKobo so the column name reflects
-- the stored unit (kobo, the minor unit of NGN). Values are preserved 1:1
-- because kobo and the previously-named "cents" column already held the same
-- integer minor-unit amount.

-- SQLite path (dev): use the modern ALTER TABLE ... RENAME COLUMN form.
ALTER TABLE "Service" RENAME COLUMN "priceCents" TO "priceKobo";
