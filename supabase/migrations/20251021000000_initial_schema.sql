/*
  # Complete Database Schema for Conciliação Pro

  ## Overview
  Complete database schema for the financial reconciliation system that matches
  car financing payments between ledger entries and bank statements.

  ## Tables Created

  ### 1. transactions
  Core table storing all financial transactions from multiple sources.

  **Columns:**
  - `id` (uuid, primary key) - Unique transaction identifier
  - `date` (timestamptz) - Transaction date
  - `value` (decimal) - Transaction amount (10 digits, 2 decimal places)
  - `name` (text) - Customer/client name from ledger
  - `depositor` (text) - Person who made the payment
  - `car` (text) - Vehicle identifier
  - `payment_method` (text) - Payment type (Zelle, Credit Card, Deposit, etc.)
  - `historical_text` (text) - Original bank statement description
  - `source` (text) - Data source identifier
  - `status` (text) - Reconciliation status: 'reconciled', 'pending-ledger', 'pending-statement'
  - `confidence` (integer) - Match confidence score (0-100)
  - `matched_transaction_id` (uuid) - Links to matching transaction for reconciled pairs
  - `sheet_order` (integer) - Preserves original row order from Google Sheets
  - `duplicate_check_hash` (text) - Hash for duplicate prevention
  - `created_at` (timestamptz) - Record creation timestamp

  ### 2. sheet_connections
  Manages Google Sheets connections and authentication.

  **Columns:**
  - `id` (uuid, primary key)
  - `user_id` (uuid) - References auth.users (prepared for multi-user)
  - `spreadsheet_id` (text) - Google Sheets ID
  - `spreadsheet_url` (text) - Full URL
  - `spreadsheet_name` (text) - Display name
  - `access_token` (text) - OAuth access token
  - `refresh_token` (text) - OAuth refresh token
  - `token_expires_at` (timestamptz) - Token expiration
  - `google_client_id` (text) - OAuth Client ID
  - `google_api_key` (text) - Google API Key
  - `service_account_email` (text) - Service Account email
  - `service_account_key` (text) - Service Account private key
  - `is_active` (boolean) - Connection status
  - `last_sync_at` (timestamptz) - Last successful sync
  - `last_sync_records` (integer) - Records in last sync
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 3. import_history
  Tracks import operations and results.

  **Columns:**
  - `id` (uuid, primary key)
  - `spreadsheet_id` (text) - ID of the Google Sheet
  - `spreadsheet_name` (text) - Name of the sheet
  - `records_imported` (integer) - Number of new records imported
  - `total_records_processed` (integer) - Total records in the sheet
  - `duplicates_skipped` (integer) - Number of duplicates skipped
  - `import_started_at` (timestamptz) - When import started
  - `import_completed_at` (timestamptz) - When import finished
  - `status` (text) - Status: 'success', 'failed', 'in_progress'
  - `error_message` (text) - Error message if failed
  - `created_at` (timestamptz)

  ## Security

  ### Row Level Security (RLS)
  All tables have RLS enabled with policies allowing anonymous and authenticated access.
  This is appropriate for a single-user internal financial reconciliation system.

  ## Performance

  ### Indexes
  - Status filtering on transactions
  - Date range queries
  - Value lookups
  - Matched transaction lookups
  - Source tracking
  - Sheet order preservation
  - Composite index for reconciliation (status + date + value)
  - Spreadsheet ID lookups
  - Active connection filtering

  ## Data Integrity

  ### Duplicate Prevention
  - Computed hash column prevents duplicate transactions
  - Hash based on: date, value, name, depositor, car, payment_method
  - Automatic trigger updates hash on INSERT/UPDATE
  - Unique constraint enforces duplicate prevention at database level

  ## Important Notes

  1. **Status Values**: 'reconciled', 'pending-ledger', 'pending-statement'
  2. **Reconciliation Logic**: pending-ledger = awaiting payment, pending-statement = awaiting match
  3. **Bidirectional Links**: Reconciled transactions point to each other via matched_transaction_id
  4. **Authentication**: Currently allows anonymous access (single-user app)
*/

-- ============================================================================
-- TRANSACTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS transactions (
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
  status text NOT NULL DEFAULT 'pending-ledger',
  confidence integer DEFAULT 0,

  -- For matched pairs
  matched_transaction_id uuid,

  -- Preserve spreadsheet order
  sheet_order integer,

  -- Duplicate prevention
  duplicate_check_hash text,

  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create policy for anonymous and authenticated access
CREATE POLICY "Allow all operations on transactions"
  ON transactions
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for query performance
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_value ON transactions(value);
CREATE INDEX IF NOT EXISTS idx_transactions_matched_id ON transactions(matched_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source);
CREATE INDEX IF NOT EXISTS idx_transactions_sheet_order ON transactions(sheet_order DESC) WHERE sheet_order IS NOT NULL;

-- Create composite index for reconciliation queries
CREATE INDEX IF NOT EXISTS idx_transactions_reconciliation ON transactions(status, date, value);

-- ============================================================================
-- DUPLICATE PREVENTION SYSTEM
-- ============================================================================

-- Create function to compute the duplicate check hash
CREATE OR REPLACE FUNCTION compute_transaction_hash()
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
DROP TRIGGER IF EXISTS trigger_compute_transaction_hash ON transactions;
CREATE TRIGGER trigger_compute_transaction_hash
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION compute_transaction_hash();

-- Create unique constraint on the hash
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_unique_hash'
  ) THEN
    ALTER TABLE transactions
    ADD CONSTRAINT transactions_unique_hash UNIQUE (duplicate_check_hash);
  END IF;
END $$;

-- Add helpful comment
COMMENT ON COLUMN transactions.duplicate_check_hash IS
'MD5 hash of date+value+name+depositor+car+payment_method. Used to prevent duplicate transactions.';

-- ============================================================================
-- SHEET CONNECTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS sheet_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  spreadsheet_id text NOT NULL,
  spreadsheet_url text NOT NULL,
  spreadsheet_name text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  google_client_id text,
  google_api_key text,
  service_account_email text,
  service_account_key text,
  is_active boolean DEFAULT true,
  last_sync_at timestamptz,
  last_sync_records integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sheet_connections_spreadsheet_id
  ON sheet_connections(spreadsheet_id);

CREATE INDEX IF NOT EXISTS idx_sheet_connections_is_active
  ON sheet_connections(is_active);

-- Enable Row Level Security
ALTER TABLE sheet_connections ENABLE ROW LEVEL SECURITY;

-- Create policy for anonymous and authenticated access
CREATE POLICY "Allow all operations on sheet_connections"
  ON sheet_connections
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- IMPORT HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS import_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spreadsheet_id text NOT NULL,
  spreadsheet_name text,
  records_imported integer DEFAULT 0,
  total_records_processed integer DEFAULT 0,
  duplicates_skipped integer DEFAULT 0,
  import_started_at timestamptz DEFAULT now(),
  import_completed_at timestamptz,
  status text DEFAULT 'in_progress',
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE import_history ENABLE ROW LEVEL SECURITY;

-- Create policies for anonymous and authenticated access
CREATE POLICY "Anyone can read import history"
  ON import_history
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert import history"
  ON import_history
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update import history"
  ON import_history
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
