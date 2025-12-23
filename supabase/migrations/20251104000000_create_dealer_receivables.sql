/*
  # Dealer Receivables (Accounts Receivable) Schema

  Adds tables to track dealership-collected payments, allocations to bank transactions,
  and change alerts on re-import.
*/

-- ============================================================================
-- DEALER RECEIVABLES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS dealer_receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  loan_id text NOT NULL,
  date timestamptz NOT NULL,
  amount decimal(10, 2) NOT NULL,

  car text,
  client text,
  depositor text,
  method text,
  dealership text,

  status text NOT NULL DEFAULT 'pending',
  received_at timestamptz,
  manual_override_note text,
  manual_override_at timestamptz,

  sheet_order integer,
  source_sheet_tab text DEFAULT 'Received by Dealer',

  duplicate_check_hash text,
  row_fingerprint text,

  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE dealer_receivables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on dealer_receivables"
  ON dealer_receivables
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE dealer_receivables
  ADD CONSTRAINT dealer_receivables_status_check
  CHECK (status IN ('pending', 'received'));

CREATE INDEX IF NOT EXISTS idx_dealer_receivables_status ON dealer_receivables(status);
CREATE INDEX IF NOT EXISTS idx_dealer_receivables_date ON dealer_receivables(date);
CREATE INDEX IF NOT EXISTS idx_dealer_receivables_dealership ON dealer_receivables(dealership);
CREATE INDEX IF NOT EXISTS idx_dealer_receivables_dealership_status_date
  ON dealer_receivables(dealership, status, date);

-- ============================================================================
-- DEALER RECEIVABLE MATCHES (ALLOCATIONS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS dealer_receivable_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id uuid NOT NULL REFERENCES dealer_receivables(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  matched_amount decimal(10, 2) NOT NULL,
  match_type text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE dealer_receivable_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on dealer_receivable_matches"
  ON dealer_receivable_matches
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE dealer_receivable_matches
  ADD CONSTRAINT dealer_receivable_matches_type_check
  CHECK (match_type IN ('auto', 'manual'));

CREATE INDEX IF NOT EXISTS idx_dealer_receivable_matches_receivable
  ON dealer_receivable_matches(receivable_id);
CREATE INDEX IF NOT EXISTS idx_dealer_receivable_matches_transaction
  ON dealer_receivable_matches(transaction_id);

-- ============================================================================
-- CHANGE ALERTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS dealer_receivable_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id uuid NOT NULL REFERENCES dealer_receivables(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  field_diffs jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE dealer_receivable_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on dealer_receivable_changes"
  ON dealer_receivable_changes
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_dealer_receivable_changes_receivable
  ON dealer_receivable_changes(receivable_id);

-- ============================================================================
-- HASH / FINGERPRINT HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_dealer_receivable_hash()
RETURNS TRIGGER AS $$
BEGIN
  NEW.duplicate_check_hash := MD5(
    LOWER(TRIM(COALESCE(NEW.loan_id, ''))) || '|' ||
    (NEW.date::date)::text || '|' ||
    NEW.amount::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION compute_dealer_receivable_fingerprint()
RETURNS TRIGGER AS $$
BEGIN
  NEW.row_fingerprint := MD5(
    LOWER(TRIM(COALESCE(NEW.loan_id, ''))) || '|' ||
    (NEW.date::date)::text || '|' ||
    NEW.amount::text || '|' ||
    LOWER(TRIM(COALESCE(NEW.car, ''))) || '|' ||
    LOWER(TRIM(COALESCE(NEW.client, ''))) || '|' ||
    LOWER(TRIM(COALESCE(NEW.depositor, ''))) || '|' ||
    LOWER(TRIM(COALESCE(NEW.method, ''))) || '|' ||
    LOWER(TRIM(COALESCE(NEW.dealership, '')))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DROP TRIGGER IF EXISTS trigger_compute_dealer_receivable_hash ON dealer_receivables;
CREATE TRIGGER trigger_compute_dealer_receivable_hash
  BEFORE INSERT OR UPDATE ON dealer_receivables
  FOR EACH ROW
  EXECUTE FUNCTION compute_dealer_receivable_hash();

DROP TRIGGER IF EXISTS trigger_compute_dealer_receivable_fingerprint ON dealer_receivables;
CREATE TRIGGER trigger_compute_dealer_receivable_fingerprint
  BEFORE INSERT OR UPDATE ON dealer_receivables
  FOR EACH ROW
  EXECUTE FUNCTION compute_dealer_receivable_fingerprint();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dealer_receivables_unique_hash'
  ) THEN
    ALTER TABLE dealer_receivables
    ADD CONSTRAINT dealer_receivables_unique_hash UNIQUE (duplicate_check_hash);
  END IF;
END $$;

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_dealer_receivables_updated_at ON dealer_receivables;
CREATE TRIGGER trigger_dealer_receivables_updated_at
  BEFORE UPDATE ON dealer_receivables
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
