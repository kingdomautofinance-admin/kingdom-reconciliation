/*
  # Create Google Sheets Connections Table

  1. New Tables
    - `sheet_connections`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users) - Not used yet but prepared for multi-user
      - `spreadsheet_id` (text) - Google Sheets ID
      - `spreadsheet_url` (text) - Full URL
      - `spreadsheet_name` (text) - Display name
      - `access_token` (text) - OAuth access token (encrypted)
      - `refresh_token` (text) - OAuth refresh token (encrypted)
      - `token_expires_at` (timestamptz) - Token expiration
      - `is_active` (boolean) - Connection status
      - `last_sync_at` (timestamptz) - Last successful sync
      - `last_sync_records` (integer) - Records in last sync
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `sheet_connections` table
    - Add policy for public access (single-user app for now)

  3. Indexes
    - Index on `spreadsheet_id` for faster lookups
    - Index on `is_active` for filtering
*/

CREATE TABLE IF NOT EXISTS sheet_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  spreadsheet_id text NOT NULL,
  spreadsheet_url text NOT NULL,
  spreadsheet_name text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  is_active boolean DEFAULT true,
  last_sync_at timestamptz,
  last_sync_records integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sheet_connections_spreadsheet_id 
  ON sheet_connections(spreadsheet_id);

CREATE INDEX IF NOT EXISTS idx_sheet_connections_is_active 
  ON sheet_connections(is_active);

ALTER TABLE sheet_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public access to sheet connections"
  ON sheet_connections
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);