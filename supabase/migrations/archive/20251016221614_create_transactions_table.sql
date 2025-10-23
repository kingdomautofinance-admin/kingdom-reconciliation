/*
  # Create Transactions Table for Financial Reconciliation

  ## Purpose
  This migration creates the core transactions table for the Conciliação Pro system,
  which reconciles car financing payment records between ledger entries and bank statements.

  ## New Tables
  
  ### `transactions`
  Stores all financial transactions from multiple sources (Google Sheets ledger, bank statements, credit card statements).
  
  **Columns:**
  - `id` (uuid, primary key) - Unique transaction identifier
  - `date` (timestamptz) - Transaction date
  - `value` (decimal) - Transaction amount (10 digits, 2 decimal places)
  - `name` (text) - Customer/client name from ledger
  - `depositor` (text) - Person who made the payment (from bank statements)
  - `car` (text) - Vehicle identifier
  - `payment_method` (text) - Payment type: Zelle, Credit Card, Deposit, etc.
  - `historical_text` (text) - Original bank statement description/memo
  - `source` (text) - Data source identifier (e.g., "Google Sheets", "Wells Fargo CSV: filename.csv")
  - `status` (text) - Reconciliation status: 'reconciled', 'pending-ledger', 'pending-statement'
  - `confidence` (integer) - Match confidence score (0-100) for automatic reconciliations
  - `matched_transaction_id` (uuid) - Links to the matching transaction for reconciled pairs
  - `sheet_order` (integer) - Preserves original row order from Google Sheets
  - `created_at` (timestamptz) - Record creation timestamp

  ## Security
  
  ### Row Level Security (RLS)
  - RLS is enabled on the transactions table
  - Policy allows authenticated users full access to all transactions
  - This is appropriate for internal financial reconciliation system with trusted users

  ## Indexes
  
  Performance indexes are created for:
  - Status filtering (most common query pattern)
  - Date range queries (for matching within ±2 days)
  - Value lookups (exact match required for reconciliation)
  - Matched transaction lookups (for viewing reconciliation pairs)

  ## Important Notes
  
  1. **Status Values**: Must be one of: 'reconciled', 'pending-ledger', 'pending-statement'
  2. **Reconciliation Logic**: pending-ledger entries are from the ledger awaiting payment,
     pending-statement entries are payments awaiting matching to ledger entries
  3. **Bidirectional Links**: When reconciled, both transactions point to each other via matched_transaction_id
  4. **Data Integrity**: No cascading deletes - matches must be manually unlinked before deletion
*/

-- Create transactions table
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
  
  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users (full access)
CREATE POLICY "Authenticated users can manage all transactions"
  ON transactions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for query performance
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_value ON transactions(value);
CREATE INDEX IF NOT EXISTS idx_transactions_matched_id ON transactions(matched_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source);
CREATE INDEX IF NOT EXISTS idx_transactions_sheet_order ON transactions(sheet_order DESC) WHERE sheet_order IS NOT NULL;

-- Create composite index for reconciliation queries (status + date + value)
CREATE INDEX IF NOT EXISTS idx_transactions_reconciliation ON transactions(status, date, value);
