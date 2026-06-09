/*
  # Unify reconciliation matches: attribution columns on reconciliation_links

  Adds the columns needed to make every Transactions-page match (manual + auto)
  a single canonical, attributed, undoable record:
    - created_by : the auth user who created the match. Nullable; populated once
                   Supabase Auth ships. NULL for matches made before then.
    - source     : 'manual' | 'auto' — how the match was created.
    - note       : optional free-text note captured when matching.

  Safe & additive: every column is nullable, so existing rows (including
  SYSTEM / STRIPE_PAYOUT links) remain valid and untouched.
*/

ALTER TABLE reconciliation_links
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS note text;

-- Constrain source to known values while still allowing NULL for legacy rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reconciliation_links_source_check'
  ) THEN
    ALTER TABLE reconciliation_links
      ADD CONSTRAINT reconciliation_links_source_check
      CHECK (source IS NULL OR source IN ('manual', 'auto'));
  END IF;
END $$;

-- Speeds up the undo lookup for statement pairs (delete the pair's STATEMENT link).
CREATE INDEX IF NOT EXISTS idx_reconciliation_links_statement_pair
  ON reconciliation_links(ledger_id, target_id)
  WHERE type = 'STATEMENT';

COMMENT ON COLUMN reconciliation_links.created_by IS
  'auth.users id of who created the match (NULL for pre-Auth / legacy rows).';
COMMENT ON COLUMN reconciliation_links.source IS
  'How the STATEMENT match was created: manual or auto.';
COMMENT ON COLUMN reconciliation_links.note IS
  'Optional free-text note captured when the match was made.';
