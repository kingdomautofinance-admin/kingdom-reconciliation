-- Adds support for soft-deleting transactions with an optional reason.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS deleted_reason text;

-- No constraint on status values exists, but document the intended options.
COMMENT ON COLUMN transactions.status IS
  'Reconciliation status: reconciled, pending-ledger, pending-statement, deleted';

COMMENT ON COLUMN transactions.deleted_reason IS
  'Reason provided when a transaction is marked as deleted';
