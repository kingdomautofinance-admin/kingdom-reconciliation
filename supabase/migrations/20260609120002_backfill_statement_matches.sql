/*
  # Backfill legacy STATEMENT matches so they become undoable

  Context: before unification, auto-reconcile inserted a reconciliation_links row
  (type 'STATEMENT') and flipped both transactions to 'reconciled', but it NEVER
  set transactions.matched_transaction_id. The undo UI keys off
  matched_transaction_id, so those auto-created matches could not be undone.

  This migration sets matched_transaction_id + confidence on both endpoints of
  every existing STATEMENT link, and stamps the legacy links as source='auto', so
  they behave exactly like newly-created matches.

  Scope & safety:
    - STATEMENT links only (never touches SYSTEM or STRIPE_PAYOUT links).
    - Only fills rows that are 'reconciled' with a NULL matched_transaction_id, so
      it never clobbers an existing manual match or a Stripe/System relationship.
    - Idempotent: re-running is a no-op once matched_transaction_id is set.
*/

-- 1. Ledger side: point at the linked statement row.
UPDATE transactions t
SET matched_transaction_id = rl.target_id,
    confidence = COALESCE(t.confidence, rl.confidence_score)
FROM reconciliation_links rl
WHERE rl.type = 'STATEMENT'
  AND rl.ledger_id = t.id
  AND t.matched_transaction_id IS NULL
  AND t.status = 'reconciled'
  AND EXISTS (SELECT 1 FROM transactions s WHERE s.id = rl.target_id);

-- 2. Statement side: point back at the linked ledger row.
UPDATE transactions t
SET matched_transaction_id = rl.ledger_id,
    confidence = COALESCE(t.confidence, rl.confidence_score)
FROM reconciliation_links rl
WHERE rl.type = 'STATEMENT'
  AND rl.target_id = t.id
  AND t.matched_transaction_id IS NULL
  AND t.status = 'reconciled'
  AND EXISTS (SELECT 1 FROM transactions l WHERE l.id = rl.ledger_id);

-- 3. Stamp legacy STATEMENT links as auto-created (they were all from auto-reconcile).
UPDATE reconciliation_links
SET source = 'auto'
WHERE type = 'STATEMENT' AND source IS NULL;
