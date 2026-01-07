/*
  # Add Unreconcile Audit Trail

  This migration adds audit tracking for unreconcile operations.

  ## Changes

  1. Add `unreconcile_history` table to track all unreconcile actions
  2. Stores reason, timestamps, and which transactions were affected
  3. Links to both transactions involved in the reconciliation
*/

-- Create unreconcile history table
CREATE TABLE IF NOT EXISTS unreconcile_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction1_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  transaction2_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  reason text NOT NULL,
  unreconciled_by text,
  unreconciled_at timestamptz DEFAULT now() NOT NULL,
  transaction1_previous_status text NOT NULL,
  transaction2_previous_status text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE unreconcile_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on unreconcile_history"
  ON unreconcile_history
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Add indexes for querying
CREATE INDEX IF NOT EXISTS idx_unreconcile_history_transaction1
  ON unreconcile_history(transaction1_id);
CREATE INDEX IF NOT EXISTS idx_unreconcile_history_transaction2
  ON unreconcile_history(transaction2_id);
CREATE INDEX IF NOT EXISTS idx_unreconcile_history_created_at
  ON unreconcile_history(created_at DESC);

-- Add helpful comments
COMMENT ON TABLE unreconcile_history IS
  'Audit trail for all unreconcile operations. Tracks who, when, why, and which transactions were affected.';

COMMENT ON COLUMN unreconcile_history.reason IS
  'Required text explanation for why the reconciliation was reversed.';
