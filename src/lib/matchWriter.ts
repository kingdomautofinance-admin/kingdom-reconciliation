import { supabase } from './supabase';
import type { Transaction } from './database.types';

/**
 * Unified write/undo path for Transactions-page reconciliation matches.
 *
 * Every STATEMENT match (manual OR auto) is written the SAME way here so that it
 * is a single canonical, attributed, undoable record:
 *   - both `transactions` rows get `matched_transaction_id` + `confidence`
 *   - one `reconciliation_links` row (type 'STATEMENT') carries attribution
 *     (`created_by`, `source`, `note`).
 *
 * Strict scoping (so Stripe & System Audit are never disturbed):
 *   - We only ever create/delete links of type 'STATEMENT'.
 *   - Undo refuses any transaction that participates in a STRIPE_PAYOUT or SYSTEM
 *     link, or whose counterpart is not a `transactions` row (i.e. a System-audit
 *     match into `kingdom_transactions`). Those are managed on their own pages.
 *
 * Note: the project's hand-written `Database` type is partial, so the Supabase
 * client infers `never` for table ops (see the @ts-expect-error usage across the
 * codebase). We use one untyped handle here and keep `Transaction` in the public
 * signatures, where type-safety actually matters for callers.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = supabase;

export interface MatchActor {
  /** auth.users id of the acting user, or null before Supabase Auth ships. */
  userId: string | null;
  /** Human-readable identity (email) for history rows, or null. */
  userEmail: string | null;
}

export interface StatementPair {
  ledger: Transaction;
  statement: Transaction;
  confidence?: number;
}

const isLedgerSide = (t: Pick<Transaction, 'status' | 'source'>) =>
  t.status === 'pending-ledger' || (t.source ?? '').startsWith('Google Sheets');

/**
 * Normalize an unordered pair into { ledger, statement }. Prefers status, falls
 * back to source. Returns null if both rows are on the same side (invalid match).
 */
export function orderLedgerStatement(
  a: Transaction,
  b: Transaction,
): { ledger: Transaction; statement: Transaction } | null {
  if (a.status === 'pending-ledger' && b.status === 'pending-statement') return { ledger: a, statement: b };
  if (a.status === 'pending-statement' && b.status === 'pending-ledger') return { ledger: b, statement: a };
  const aLedger = isLedgerSide(a);
  const bLedger = isLedgerSide(b);
  if (aLedger && !bLedger) return { ledger: a, statement: b };
  if (bLedger && !aLedger) return { ledger: b, statement: a };
  return null;
}

/**
 * Create a single STATEMENT match between two transactions. Inserts the link
 * first (so a failure there aborts before any row is mutated), then updates both
 * rows, compensating (deleting the link / reverting the first row) on failure.
 */
export async function applyStatementMatch(
  a: Transaction,
  b: Transaction,
  opts: { source: 'manual' | 'auto'; note?: string; confidence?: number } & MatchActor,
): Promise<{ ledgerId: string; statementId: string }> {
  const ordered = orderLedgerStatement(a, b);
  if (!ordered) {
    throw new Error('Cannot match two transactions from the same side (both ledger or both statement).');
  }
  const { ledger, statement } = ordered;
  const confidence = opts.confidence ?? 100;

  // 1. Canonical link first.
  const { data: link, error: linkError } = await db
    .from('reconciliation_links')
    .insert({
      ledger_id: ledger.id,
      target_id: statement.id,
      type: 'STATEMENT',
      confidence_score: confidence,
      is_confirmed: true,
      created_by: opts.userId,
      source: opts.source,
      note: opts.note ?? null,
    })
    .select('id')
    .single();
  if (linkError) throw linkError;
  const linkId = link.id as string;

  // 2. Ledger row.
  const { error: e1 } = await db
    .from('transactions')
    .update({ status: 'reconciled', matched_transaction_id: statement.id, confidence })
    .eq('id', ledger.id);
  if (e1) {
    await db.from('reconciliation_links').delete().eq('id', linkId);
    throw e1;
  }

  // 3. Statement row (compensate both on failure).
  const { error: e2 } = await db
    .from('transactions')
    .update({ status: 'reconciled', matched_transaction_id: ledger.id, confidence })
    .eq('id', statement.id);
  if (e2) {
    await db
      .from('transactions')
      .update({ status: ledger.status, matched_transaction_id: null, confidence: null })
      .eq('id', ledger.id);
    await db.from('reconciliation_links').delete().eq('id', linkId);
    throw e2;
  }

  return { ledgerId: ledger.id, statementId: statement.id };
}

/**
 * Apply many STATEMENT matches. Used by auto-reconcile (post-import and the
 * review-then-apply flow). Link inserts are chunked; matched_transaction_id /
 * confidence are set per-pair (each row needs a distinct counterpart id).
 *
 * When `verifyPending` is true (the review flow, where time may have passed since
 * the proposals were computed) each side is re-checked and stale pairs are
 * skipped rather than overwriting an already-matched row.
 */
export async function applyStatementMatchesBatch(
  pairs: StatementPair[],
  opts: { source: 'manual' | 'auto'; verifyPending?: boolean } & MatchActor,
): Promise<{ applied: number; skipped: number }> {
  let working = pairs;
  let skipped = 0;

  if (opts.verifyPending && working.length > 0) {
    const ids = working.flatMap((p) => [p.ledger.id, p.statement.id]);
    const { data: current, error } = await db
      .from('transactions')
      .select('id, status, matched_transaction_id')
      .in('id', ids);
    if (error) throw error;
    const byId = new Map<string, { status: string; matched_transaction_id: string | null }>(
      (current ?? []).map((r: { id: string; status: string; matched_transaction_id: string | null }) => [r.id, r]),
    );
    const stillPending = (id: string) => {
      const r = byId.get(id);
      return !!r && r.matched_transaction_id == null
        && (r.status === 'pending-ledger' || r.status === 'pending-statement');
    };
    const before = working.length;
    working = working.filter((p) => stillPending(p.ledger.id) && stillPending(p.statement.id));
    skipped = before - working.length;
  }

  let applied = 0;
  const BATCH = 50;
  for (let i = 0; i < working.length; i += BATCH) {
    const batch = working.slice(i, i + BATCH);

    const links = batch.map((p) => ({
      ledger_id: p.ledger.id,
      target_id: p.statement.id,
      type: 'STATEMENT',
      confidence_score: p.confidence ?? 100,
      is_confirmed: true,
      created_by: opts.userId,
      source: opts.source,
    }));
    const { error: linkError } = await db.from('reconciliation_links').insert(links);
    if (linkError) {
      // Don't flip statuses without a canonical link (avoids orphaned reconciled
      // rows). Skip this batch and keep going — mirrors the prior resilient
      // behavior so unrelated callers (e.g. the kingdom path) never hard-fail.
      console.error('Failed to insert statement match links; skipping batch:', linkError);
      continue;
    }

    for (const p of batch) {
      const confidence = p.confidence ?? 100;
      const [ledgerUpdate, statementUpdate] = await Promise.all([
        db.from('transactions')
          .update({ status: 'reconciled', matched_transaction_id: p.statement.id, confidence })
          .eq('id', p.ledger.id),
        db.from('transactions')
          .update({ status: 'reconciled', matched_transaction_id: p.ledger.id, confidence })
          .eq('id', p.statement.id),
      ]);
      if (!ledgerUpdate.error && !statementUpdate.error) applied++;
    }
  }

  return { applied, skipped };
}

/**
 * Reverse a STATEMENT match (manual or auto), by transaction id. Requires a
 * reason and records who/when. Preserves the dealer-receivable auto-revert.
 *
 * Refuses (without touching anything) when the match is managed elsewhere:
 *   - a STRIPE_PAYOUT or SYSTEM link involves this transaction, or
 *   - the matched counterpart is not a `transactions` row (System-audit match).
 */
export async function undoStatementMatch(
  transactionId: string,
  opts: { reason: string } & MatchActor,
): Promise<{ transactionId: string; matchedId: string }> {
  // STEP 1: fetch + validate.
  const { data: transaction, error: fetchError } = await db
    .from('transactions')
    .select('id, status, matched_transaction_id, source')
    .eq('id', transactionId)
    .single();

  if (fetchError) throw new Error(`Failed to fetch transaction: ${fetchError.message}`);
  if (!transaction) throw new Error('Transaction not found');
  if (transaction.status !== 'reconciled') throw new Error('Transaction is not reconciled');
  if (!transaction.matched_transaction_id) throw new Error('No matched transaction found');

  // GUARD: refuse Stripe/System-managed matches (don't disturb their links).
  const { data: foreignLinks } = await db
    .from('reconciliation_links')
    .select('id, type')
    .in('type', ['STRIPE_PAYOUT', 'SYSTEM'])
    .or(`ledger_id.eq.${transaction.id},target_id.eq.${transaction.id}`);
  if (foreignLinks && foreignLinks.length > 0) {
    const kind = foreignLinks[0].type === 'STRIPE_PAYOUT' ? 'Stripe Payouts' : 'System Audit';
    throw new Error(`This match was created on the ${kind} page. Please manage it there.`);
  }

  // STEP 2: fetch the matched counterpart — must be a `transactions` row.
  const { data: matchedTransaction, error: matchedFetchError } = await db
    .from('transactions')
    .select('id, status, matched_transaction_id, source, is_deleted')
    .eq('id', transaction.matched_transaction_id)
    .maybeSingle();

  if (matchedFetchError) throw new Error(`Failed to fetch matched transaction: ${matchedFetchError.message}`);
  if (!matchedTransaction) {
    throw new Error('This match is managed on the System Audit page and cannot be undone here.');
  }

  // STEP 3: original statuses based on source.
  const transaction1NewStatus = transaction.source.startsWith('Google Sheets') ? 'pending-ledger' : 'pending-statement';
  const transaction2NewStatus = matchedTransaction.source.startsWith('Google Sheets') ? 'pending-ledger' : 'pending-statement';

  // STEP 4: update transaction 1.
  const { error: update1Error } = await db
    .from('transactions')
    .update({ status: transaction1NewStatus, matched_transaction_id: null, confidence: null })
    .eq('id', transaction.id);
  if (update1Error) throw new Error(`Failed to update transaction 1: ${update1Error.message}`);

  // STEP 5: update transaction 2 (rollback transaction 1 on failure).
  const { error: update2Error } = await db
    .from('transactions')
    .update({ status: transaction2NewStatus, matched_transaction_id: null, confidence: null })
    .eq('id', matchedTransaction.id);
  if (update2Error) {
    await db
      .from('transactions')
      .update({ status: 'reconciled', matched_transaction_id: matchedTransaction.id, confidence: 100 })
      .eq('id', transaction.id);
    throw new Error(`Failed to update transaction 2: ${update2Error.message}`);
  }

  // STEP 5b: delete the STATEMENT link(s) for this pair (never SYSTEM/STRIPE).
  await db
    .from('reconciliation_links')
    .delete()
    .eq('type', 'STATEMENT')
    .or(
      `and(ledger_id.eq.${transaction.id},target_id.eq.${matchedTransaction.id}),` +
        `and(ledger_id.eq.${matchedTransaction.id},target_id.eq.${transaction.id})`,
    );

  // STEP 6: dealer-receivable auto-revert (preserved verbatim from prior behavior).
  const { data: receivableMatches } = await db
    .from('dealer_receivable_matches')
    .select('id, receivable_id, transaction_id, matched_amount')
    .or(`transaction_id.eq.${transaction.id},transaction_id.eq.${matchedTransaction.id}`);

  if (receivableMatches && receivableMatches.length > 0) {
    const receivableIds = [...new Set(receivableMatches.map((m: { receivable_id: string }) => m.receivable_id))] as string[];

    for (const receivableId of receivableIds) {
      const { data: receivable } = await db
        .from('dealer_receivables')
        .select('id, amount, status, received_at')
        .eq('id', receivableId)
        .single();

      if (!receivable) continue;

      const { data: remainingMatches } = await db
        .from('dealer_receivable_matches')
        .select('matched_amount, transaction_id')
        .eq('receivable_id', receivableId);

      const totalMatched = (remainingMatches || [])
        .filter((m: { transaction_id: string }) => m.transaction_id !== transaction.id && m.transaction_id !== matchedTransaction.id)
        .reduce((sum: number, match: { matched_amount: string | number }) => sum + parseFloat(String(match.matched_amount)), 0);

      const receivableAmount = parseFloat(String(receivable.amount));

      if (totalMatched < receivableAmount && receivable.status === 'received') {
        await db
          .from('dealer_receivables')
          .update({ status: 'pending', received_at: null })
          .eq('id', receivableId);

        await db.from('dealer_receivable_changes').insert({
          receivable_id: receivableId,
          changed_at: new Date().toISOString(),
          field_diffs: {
            status: { from: 'received', to: 'pending' },
            received_at: { from: receivable.received_at, to: null },
          },
          note: `Auto-reverted due to unreconcile of transaction ${transaction.id}. Reason: ${opts.reason}`,
        });
      }
    }
  }

  // STEP 7: audit record (non-blocking — never fail the undo over the audit row).
  try {
    const { error: historyError } = await db.from('unreconcile_history').insert({
      transaction1_id: transaction.id,
      transaction2_id: matchedTransaction.id,
      reason: opts.reason,
      unreconciled_by: opts.userEmail ?? 'user',
      unreconciled_by_id: opts.userId,
      transaction1_previous_status: 'reconciled',
      transaction2_previous_status: 'reconciled',
    });
    if (historyError) console.error('Failed to create unreconcile audit record:', historyError);
  } catch (err) {
    console.error('Failed to create unreconcile audit record:', err);
  }

  return { transactionId: transaction.id, matchedId: matchedTransaction.id };
}

/**
 * "Edit a match": undo the current match (reason required, logged) then re-match
 * the same transaction to a new counterpart. Both legs go through the unified
 * scoped path above.
 */
export async function changeStatementMatch(
  transactionId: string,
  newCounterpart: Transaction,
  opts: { reason: string; note?: string } & MatchActor,
): Promise<{ ledgerId: string; statementId: string }> {
  await undoStatementMatch(transactionId, { reason: opts.reason, userId: opts.userId, userEmail: opts.userEmail });

  const { data: original, error } = await db
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .single();
  if (error || !original) throw new Error('Could not reload the transaction after unmatching.');

  return applyStatementMatch(original as Transaction, newCounterpart, {
    source: 'manual',
    note: opts.note,
    userId: opts.userId,
    userEmail: opts.userEmail,
  });
}
