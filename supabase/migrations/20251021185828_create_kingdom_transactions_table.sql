/*
  # Create Kingdom Transactions Table

  ## Overview
  Creates a separate table for Kingdom System transactions with identical structure
  to the main transactions table. This enables independent reconciliation between
  Kingdom System data and both bank statements and card statements.

  ## New Table

  ### kingdom_transactions
  Stores financial transactions from the Kingdom System for reconciliation.

  **Columns:**
  - `id` (uuid, primary key) - Unique transaction identifier
  - `date` (timestamptz) - Transaction date
  - `value` (decimal) - Transaction amount (10 digits, 2 decimal places)
  - `name` (text) - Customer/client name
  - `depositor` (text) - Person who made the payment
  - `car` (text) - Vehicle identifier
  - `payment_method` (text) - Payment type (Zelle, Credit Card, Deposit, etc.)
  - `historical_text` (text) - Original description
  - `source` (text) - Data source identifier
  - `status` (text) - Reconciliation status: 'reconciled', 'pending-ledger', 'pending-statement'
  - `confidence` (integer) - Match confidence score (0-100)
  - `matched_transaction_id` (uuid) - Links to matching transaction for reconciled pairs
  - `duplicate_check_hash` (text) - Hash for duplicate prevention
  - `created_at` (timestamptz) - Record creation timestamp

  ## Security

  ### Row Level Security (RLS)
  - RLS enabled with policies allowing anonymous and authenticated access
  - Appropriate for single-user internal financial reconciliation system

  ## Performance

  ### Indexes
  - Status filtering
  - Date range queries
  - Value lookups
  - Matched transaction lookups
  - Source tracking
  - Composite index for reconciliation (status + date + value)

  ## Data Integrity

  ### Duplicate Prevention
  - Computed hash column prevents duplicate transactions
  - Hash based on: date, value, name, depositor, car, payment_method
  - Automatic trigger updates hash on INSERT/UPDATE
  - Unique constraint enforces duplicate prevention at database level

  ## Important Notes

  1. **Status Values**: 'reconciled', 'pending-ledger', 'pending-statement'
  2. **Reconciliation Logic**: pending-statement = awaiting match with statements
  3. **Bidirectional Links**: Reconciled transactions point to each other via matched_transaction_id
  4. **Authentication**: Currently allows anonymous access (single-user app)
*/

-- ============================================================================
-- KINGDOM TRANSACTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS kingdom_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Transaction details
  date timestamptz NOT NULL,
  value decimal(10, 2) NOT NULL,
  name text,
  depositor text,
  car text,
  payment_method text,
  historical_text text,

  -- Source tracking
  source text NOT NULL,

  -- Reconciliation status
  status text NOT NULL DEFAULT 'pending-statement',
  confidence integer DEFAULT 0,

  -- For matched pairs
  matched_transaction_id uuid,

  -- Duplicate prevention
  duplicate_check_hash text,

  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE kingdom_transactions ENABLE ROW LEVEL SECURITY;

-- Create policy for anonymous and authenticated access
CREATE POLICY "Allow all operations on kingdom_transactions"
  ON kingdom_transactions
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for query performance
CREATE INDEX IF NOT EXISTS idx_kingdom_transactions_status ON kingdom_transactions(status);
CREATE INDEX IF NOT EXISTS idx_kingdom_transactions_date ON kingdom_transactions(date);
CREATE INDEX IF NOT EXISTS idx_kingdom_transactions_value ON kingdom_transactions(value);
CREATE INDEX IF NOT EXISTS idx_kingdom_transactions_matched_id ON kingdom_transactions(matched_transaction_id);
CREATE INDEX IF NOT EXISTS idx_kingdom_transactions_source ON kingdom_transactions(source);

-- Create composite index for reconciliation queries
CREATE INDEX IF NOT EXISTS idx_kingdom_transactions_reconciliation ON kingdom_transactions(status, date, value);

-- ============================================================================
-- DUPLICATE PREVENTION SYSTEM FOR KINGDOM TRANSACTIONS
-- ============================================================================

-- Create function to compute the duplicate check hash for kingdom transactions
CREATE OR REPLACE FUNCTION compute_kingdom_transaction_hash()
RETURNS TRIGGER AS $$
BEGIN
  NEW.duplicate_check_hash := MD5(
    (NEW.date::date)::text || '|' ||
    NEW.value::text || '|' ||
    LOWER(TRIM(COALESCE(NEW.name, ''))) || '|' ||
    LOWER(TRIM(COALESCE(NEW.depositor, ''))) || '|' ||
    LOWER(TRIM(COALESCE(NEW.car, ''))) || '|' ||
    LOWER(TRIM(COALESCE(NEW.payment_method, '')))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create trigger to compute hash on INSERT and UPDATE
DROP TRIGGER IF EXISTS trigger_compute_kingdom_transaction_hash ON kingdom_transactions;
CREATE TRIGGER trigger_compute_kingdom_transaction_hash
  BEFORE INSERT OR UPDATE ON kingdom_transactions
  FOR EACH ROW
  EXECUTE FUNCTION compute_kingdom_transaction_hash();

-- Create unique constraint on the hash
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kingdom_transactions_unique_hash'
  ) THEN
    ALTER TABLE kingdom_transactions
    ADD CONSTRAINT kingdom_transactions_unique_hash UNIQUE (duplicate_check_hash);
  END IF;
END $$;

-- Add helpful comment
COMMENT ON COLUMN kingdom_transactions.duplicate_check_hash IS
'MD5 hash of date+value+name+depositor+car+payment_method. Used to prevent duplicate transactions.';
