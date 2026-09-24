-- LedgerEntry is an append-only financial ledger: rows must never be
-- mutated or removed after insert. Prisma's schema/query layer cannot
-- enforce this on its own (a raw query or a future migration could still
-- issue UPDATE/DELETE), so these triggers enforce it at the database level
-- as the final backstop.
CREATE TRIGGER "LedgerEntry_prevent_update"
BEFORE UPDATE ON "LedgerEntry"
BEGIN
  SELECT RAISE(ABORT, 'LedgerEntry rows are append-only and cannot be updated');
END;

CREATE TRIGGER "LedgerEntry_prevent_delete"
BEFORE DELETE ON "LedgerEntry"
BEGIN
  SELECT RAISE(ABORT, 'LedgerEntry rows are append-only and cannot be deleted');
END;
