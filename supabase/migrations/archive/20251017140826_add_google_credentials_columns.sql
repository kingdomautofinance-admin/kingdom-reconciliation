/*
  # Add Google API Credentials Columns

  1. Changes
    - Add `google_client_id` column to store OAuth Client ID
    - Add `google_api_key` column to store Google API Key
  
  2. Notes
    - These columns allow users to input their own Google credentials
    - Used when environment variables are not configured
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sheet_connections' AND column_name = 'google_client_id'
  ) THEN
    ALTER TABLE sheet_connections ADD COLUMN google_client_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sheet_connections' AND column_name = 'google_api_key'
  ) THEN
    ALTER TABLE sheet_connections ADD COLUMN google_api_key text;
  END IF;
END $$;
