-- Promote transactions.status to a PostgreSQL enum for better data integrity.

DO $$
BEGIN
  CREATE TYPE transaction_status AS ENUM (
    'pending-ledger',
    'pending-statement',
    'reconciled',
    'deleted'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE transactions
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE transaction_status USING status::transaction_status,
  ALTER COLUMN status SET DEFAULT 'pending-ledger';

COMMENT ON COLUMN transactions.status IS
  'Reconciliation status: reconciled, pending-ledger, pending-statement, deleted';
