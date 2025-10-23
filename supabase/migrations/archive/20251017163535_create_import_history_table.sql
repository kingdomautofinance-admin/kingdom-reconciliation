/*
  # Create Import History Table

  1. New Tables
    - `import_history`
      - `id` (uuid, primary key)
      - `spreadsheet_id` (text) - ID of the Google Sheet
      - `spreadsheet_name` (text) - Name of the sheet
      - `records_imported` (integer) - Number of new records imported
      - `total_records_processed` (integer) - Total records in the sheet
      - `duplicates_skipped` (integer) - Number of duplicates skipped
      - `import_started_at` (timestamp) - When import started
      - `import_completed_at` (timestamp) - When import finished
      - `status` (text) - Status: 'success', 'failed', 'in_progress'
      - `error_message` (text) - Error message if failed
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `import_history` table
    - Add policy for anyone to read import history
    - Add policy for anyone to insert import history
*/

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

ALTER TABLE import_history ENABLE ROW LEVEL SECURITY;

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