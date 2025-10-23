/*
  # Add Unique Constraint to Prevent Duplicate Transactions

  ## Overview
  This migration prevents duplicate transactions from being inserted into the database by adding a computed hash column and unique constraint.

  ## Changes
  
  1. **Add Computed Hash Column**
     - Creates a `duplicate_check_hash` column that stores a hash of the unique transaction fields
     - Uses MD5 hash of concatenated key fields
     - Generated automatically on INSERT/UPDATE
     
  2. **Unique Constraint**
     - Creates a unique constraint on the hash column
     - Prevents duplicate transactions at database level

  ## Duplicate Detection Logic
  
  A transaction is considered a duplicate if ALL of the following match:
  - Same date (day, month, year)
  - Same transaction value/amount
  - Same client name
  - Same depositor
  - Same car/vehicle
  - Same payment method

  ## Impact
  
  - **PREVENTS**: Future duplicate imports will be rejected at database level
  - **ENSURES**: Data integrity is maintained automatically
  - **PROTECTS**: Against accidental duplicate imports from Google Sheets
  
  ## Notes
  
  - Hash is computed automatically using a trigger
  - Provides a safety net if application checks are bypassed
  - Existing records will have their hash computed on next update
*/

-- Add a column to store the duplicate check hash
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS duplicate_check_hash TEXT;

-- Create a function to compute the duplicate check hash
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

-- Compute hash for all existing records
UPDATE transactions SET duplicate_check_hash = MD5(
  (date::date)::text || '|' ||
  value::text || '|' ||
  LOWER(TRIM(COALESCE(name, ''))) || '|' ||
  LOWER(TRIM(COALESCE(depositor, ''))) || '|' ||
  LOWER(TRIM(COALESCE(car, ''))) || '|' ||
  LOWER(TRIM(COALESCE(payment_method, '')))
)
WHERE duplicate_check_hash IS NULL;

-- Create unique constraint on the hash
ALTER TABLE transactions
ADD CONSTRAINT transactions_unique_hash UNIQUE (duplicate_check_hash);

-- Add helpful comment
COMMENT ON COLUMN transactions.duplicate_check_hash IS 
'MD5 hash of date+value+name+depositor+car+payment_method. Used to prevent duplicate transactions.';
