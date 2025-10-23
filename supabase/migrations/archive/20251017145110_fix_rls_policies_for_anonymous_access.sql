/*
  # Fix RLS Policies for Anonymous Access

  1. Changes
    - Update transactions table policies to allow anonymous access
    - Update sheet_connections table policies to allow anonymous access
    - This enables the app to work without authentication

  2. Security Notes
    - Since this is a single-user application, anonymous access is acceptable
    - Consider adding authentication in the future for multi-user scenarios
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can manage all transactions" ON transactions;
DROP POLICY IF EXISTS "Authenticated users can manage connections" ON sheet_connections;

-- Create new policies that allow anonymous access
CREATE POLICY "Allow all operations on transactions"
  ON transactions
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on sheet_connections"
  ON sheet_connections
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
