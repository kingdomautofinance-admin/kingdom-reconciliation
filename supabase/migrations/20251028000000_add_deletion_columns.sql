/*
  # Add Transaction Deletion Support

  This migration adds support for soft-deleting transactions with reasons.

  ## Changes
  
  1. Add `is_deleted` boolean column (default false)
  2. Add `deleted_reason` text column (nullable, stores reason for deletion)
  3. Add `previous_status` text column (stores status before deletion for restoration)
  4. Add indexes for deleted transactions filtering
  
  ## Notes
  
  - Soft delete approach: transactions are marked as deleted but not removed
  - `previous_status` enables reverting deleted transactions to original state
  - `deleted_reason` is required when deleting, viewable later
  - Deleted transactions are excluded from reconciliation and totals
*/

-- Add deletion columns to transactions table
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS deleted_reason text,
  ADD COLUMN IF NOT EXISTS previous_status text;

-- Create index for filtering deleted transactions
CREATE INDEX IF NOT EXISTS idx_transactions_is_deleted 
  ON transactions(is_deleted) 
  WHERE is_deleted = true;

-- Create composite index for active (non-deleted) transactions
CREATE INDEX IF NOT EXISTS idx_transactions_active_status 
  ON transactions(status, is_deleted) 
  WHERE is_deleted = false;

-- Add helpful comments
COMMENT ON COLUMN transactions.is_deleted IS
  'Soft delete flag. When true, transaction is marked as deleted but data is preserved.';

COMMENT ON COLUMN transactions.deleted_reason IS
  'Required text explanation for why the transaction was deleted. Stored for audit purposes.';

COMMENT ON COLUMN transactions.previous_status IS
  'Stores the reconciliation status before deletion. Used when restoring a deleted transaction.';
