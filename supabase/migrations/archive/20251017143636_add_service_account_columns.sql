/*
  # Add Service Account Credentials to Sheet Connections

  1. Changes
    - Add `service_account_email` column to store Google Service Account email
    - Add `service_account_key` column to store private key (encrypted)
    
  2. Security
    - Credentials stored securely in database
    - Only accessible through Edge Function
    - RLS policies already in place
    
  3. Notes
    - This enables Service Account authentication for Google Sheets
    - Eliminates need for OAuth popup and redirect_uri configuration
    - More suitable for automated/server-side access
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sheet_connections' AND column_name = 'service_account_email'
  ) THEN
    ALTER TABLE sheet_connections ADD COLUMN service_account_email TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sheet_connections' AND column_name = 'service_account_key'
  ) THEN
    ALTER TABLE sheet_connections ADD COLUMN service_account_key TEXT;
  END IF;
END $$;
