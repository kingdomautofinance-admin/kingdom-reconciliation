/*
  # Multi-Audit Reconciliation & Discrepancy System

  ## New Tables

  ### 1. reconciliation_settings
  Stores global configuration for reconciliation logic.
  - `id` (uuid, primary key)
  - `accuracy_threshold` (decimal): Threshold for auto-matching and color coding.
  - `stripe_fee_percent` (decimal): Percentage fee for Stripe transactions.
  - `stripe_fixed_fee` (decimal): Fixed fee per Stripe transaction.
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. reconciliation_links
  Handles many-to-many relationships for independent audit states.
  - `id` (uuid, primary key)
  - `ledger_id` (uuid, FK to transactions): The primary ledger entry.
  - `target_id` (uuid): The linked entry (could be a transaction or kingdom_transaction).
  - `type` (text): 'SYSTEM' (Kingdom CRM) or 'STRIPE_PAYOUT'.
  - `gap_amount` (decimal): Difference between ledger and target.
  - `confidence_score` (integer): Match similarity score.
  - `is_confirmed` (boolean): Whether the user has confirmed a low-confidence match.
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on both tables.
  - Add permissive policies for internal use.
*/

-- ============================================================================
-- RECONCILIATION SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS reconciliation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accuracy_threshold decimal(10, 2) DEFAULT 1.00 NOT NULL,
  stripe_fee_percent decimal(10, 2) DEFAULT 2.9 NOT NULL,
  stripe_fixed_fee decimal(10, 2) DEFAULT 0.30 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Ensure there is only one settings record
CREATE UNIQUE INDEX IF NOT EXISTS single_reconciliation_settings_idx ON reconciliation_settings ((true));

-- Insert default settings
INSERT INTO reconciliation_settings (accuracy_threshold, stripe_fee_percent, stripe_fixed_fee)
VALUES (1.00, 2.9, 0.30)
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE reconciliation_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow all operations on reconciliation_settings"
  ON reconciliation_settings FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- RECONCILIATION LINKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS reconciliation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  target_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('SYSTEM', 'STRIPE_PAYOUT', 'STATEMENT')),
  gap_amount decimal(10, 2) DEFAULT 0 NOT NULL,
  confidence_score integer DEFAULT 0 NOT NULL,
  is_confirmed boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reconciliation_links_ledger_id ON reconciliation_links(ledger_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_links_target_id ON reconciliation_links(target_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_links_type ON reconciliation_links(type);

-- ============================================================================
-- SYSTEM AUDIT VIEW
-- ============================================================================

CREATE OR REPLACE VIEW system_audit_view AS
SELECT 
  t.id as ledger_id,
  t.date as ledger_date,
  t.value as ledger_value,
  t.name as ledger_name,
  t.source as ledger_source,
  kt.id as system_id,
  kt.date as system_date,
  kt.value as system_value,
  rl.gap_amount,
  rl.confidence_score,
  rl.is_confirmed,
  rl.id as link_id
FROM transactions t
LEFT JOIN reconciliation_links rl ON t.id = rl.ledger_id AND rl.type = 'SYSTEM'
LEFT JOIN kingdom_transactions kt ON rl.target_id = kt.id
WHERE t.is_deleted = false;

-- Enable RLS
ALTER TABLE reconciliation_links ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow all operations on reconciliation_links"
  ON reconciliation_links FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- DAILY DISCREPANCY SUMMARY
-- ============================================================================

CREATE OR REPLACE FUNCTION get_daily_summary(start_date date, end_date date)
RETURNS TABLE (
  summary_date date,
  kingdom_total decimal(12, 2),
  ledger_total decimal(12, 2),
  bank_total decimal(12, 2),
  ledger_kingdom_gap decimal(12, 2),
  ledger_bank_gap decimal(12, 2)
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH dates AS (
    SELECT generate_series(start_date, end_date, '1 day'::interval)::date as d
  ),
  kingdom AS (
    SELECT date::date, SUM(value::decimal) as total
    FROM kingdom_transactions
    WHERE date::date BETWEEN start_date AND end_date
    GROUP BY date::date
  ),
  ledger AS (
    SELECT date::date, SUM(value::decimal) as total
    FROM transactions
    WHERE source NOT IN ('Wells Fargo', 'Delta') -- Assuming these are bank sources
    AND date::date BETWEEN start_date AND end_date
    AND is_deleted = false
    GROUP BY date::date
  ),
  bank AS (
    SELECT date::date, SUM(value::decimal) as total
    FROM transactions
    WHERE source IN ('Wells Fargo', 'Delta')
    AND date::date BETWEEN start_date AND end_date
    AND is_deleted = false
    GROUP BY date::date
  )
  SELECT 
    d.d,
    COALESCE(k.total, 0),
    COALESCE(l.total, 0),
    COALESCE(b.total, 0),
    COALESCE(l.total, 0) - COALESCE(k.total, 0),
    COALESCE(l.total, 0) - COALESCE(b.total, 0)
  FROM dates d
  LEFT JOIN kingdom k ON d.d = k.date
  LEFT JOIN ledger l ON d.d = l.date
  LEFT JOIN bank b ON d.d = b.date
  WHERE k.total IS NOT NULL OR l.total IS NOT NULL OR b.total IS NOT NULL
  ORDER BY d.d DESC;
END;
$$;
