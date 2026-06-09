/*
  # Record the real user on unreconcile (undo) events

  Adds a typed FK to the acting auth user. The existing `unreconciled_by` text
  column is kept for human-readable history (we now store the user's email there
  instead of the hardcoded literal 'user'). Both are nullable so undo keeps
  working before Supabase Auth ships.
*/

ALTER TABLE unreconcile_history
  ADD COLUMN IF NOT EXISTS unreconciled_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN unreconcile_history.unreconciled_by_id IS
  'auth.users id of who reversed the match (NULL for pre-Auth / legacy rows).';
