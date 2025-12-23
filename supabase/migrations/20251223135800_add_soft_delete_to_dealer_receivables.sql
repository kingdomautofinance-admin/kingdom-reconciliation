/*
  # Add Soft Delete to Dealer Receivables

  Adds soft delete functionality to dealer_receivables table with deletion reason
  and previous status tracking, similar to the transactions table.
*/

-- Add soft delete columns to dealer_receivables
ALTER TABLE dealer_receivables
  ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS deleted_reason text,
  ADD COLUMN IF NOT EXISTS previous_status text;

-- Add index for is_deleted to improve query performance
CREATE INDEX IF NOT EXISTS idx_dealer_receivables_is_deleted
  ON dealer_receivables(is_deleted);

-- Add composite index for common queries (filtering out deleted items)
CREATE INDEX IF NOT EXISTS idx_dealer_receivables_not_deleted_status_date
  ON dealer_receivables(status, date DESC)
  WHERE is_deleted = false;

-- Add a note column to dealer_receivable_changes for manual changes
ALTER TABLE dealer_receivable_changes
  ADD COLUMN IF NOT EXISTS note text;
