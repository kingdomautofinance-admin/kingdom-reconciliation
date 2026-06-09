import { compareTwoStrings } from 'string-similarity';
import type { Transaction } from './database.types';
import { supabase } from './supabase';
import { applyStatementMatchesBatch } from './matchWriter';

interface ReconciliationSettings {
  accuracy_threshold: number;
  stripe_fee_percent: number;
  stripe_fixed_fee: number;
}

export interface ReconciliationResult {
  matched: number;
  totalProcessed: number;
  details: MatchDetail[];
  /** Echo of the date range the run actually used (after fall-back to MIN_DATE). */
  appliedRange?: {
    startDate: string;
    endDateExclusive: string | null;
  };
}

/** A statement-side row that landed on the same date as an unmatched ledger
 *  row but with a different value — surfaced so the user can see whether
 *  it's a data-presence problem (no candidates at all) or a value-mismatch
 *  problem (candidates exist but $ amounts don't line up). */
export interface NearMissCandidate {
  id: string;
  date: string;
  value: string;
  name: string | null;
  depositor: string | null;
  source: string;
  payment_method: string | null;
}

export interface MatchDetail {
  ledgerTransaction: Transaction;
  statementTransaction: Transaction | null;
  dateMatch: number;
  valueMatch: number;
  paymentMethodMatch: number;
  nameMatch: number;
  overallStatus: 'CORRECT' | 'INCORRECT';
  failures: string[];
  /** Up to 5 statement rows on the same date as the ledger row. Empty array
   *  means: no statement rows exist on that date at all. */
  sameDateCandidates?: NearMissCandidate[];
}

/**
 * Optional date range to scope an auto-reconcile run. Mirrors the date filter
 * the Transactions page applies to its list query so users can reconcile just
 * what they're looking at.
 */
export interface ReconciliationDateRange {
  /** Inclusive ISO start date (YYYY-MM-DD). Falls back to MIN_DATE if earlier. */
  startDate?: string;
  /** Exclusive ISO end date (YYYY-MM-DD); already +1 day from the user's "to". */
  endDateExclusive?: string;
}

interface IndexedTransaction extends Transaction {
  dateKey: string;
  valueKey: number;
  methodKey: string;
}

/** A proposed (not-yet-applied) statement match produced by the dry-run matcher. */
export interface MatchProposal {
  ledger: Transaction;
  statement: Transaction;
  confidence: number;
  gap: number;
}

/** Result of the dry-run matcher: proposals to review + unmatched diagnostics. */
export interface ReconciliationProposalsResult {
  proposals: MatchProposal[];
  details: MatchDetail[];
  totalProcessed: number;
  appliedRange: { startDate: string; endDateExclusive: string | null };
}

// Date match - exact same date only
function checkDateMatch(date1: Date, date2: Date): number {
  const d1 = date1.toISOString().split('T')[0];
  const d2 = date2.toISOString().split('T')[0];

  return d1 === d2 ? 100 : 0;
}

function checkValueMatch(value1: number, value2: number): number {
  const v1 = Math.abs(typeof value1 === 'string' ? parseFloat(value1 as any) : value1);
  const v2 = Math.abs(typeof value2 === 'string' ? parseFloat(value2 as any) : value2);
  return Math.abs(v1 - v2) < 0.01 ? 100 : 0;
}

function checkPaymentMethodMatch(method1: string | null, method2: string | null): number {
  if (!method1 || !method2) return 0;
  const m1 = method1.toLowerCase().trim();
  const m2 = method2.toLowerCase().trim();
  return m1 === m2 ? 100 : 0;
}

function checkNameMatch(trans1: any, trans2: any): number {
  const name1Options = [trans1.name, trans1.depositor].filter(Boolean);
  const name2Options = [trans2.name, trans2.depositor].filter(Boolean);

  if (name1Options.length === 0 || name2Options.length === 0) return 0;

  let maxSimilarity = 0;
  for (const n1 of name1Options) {
    for (const n2 of name2Options) {
      if (!n1 || !n2) continue;

      const clean1 = n1.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
      const clean2 = n2.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');

      const similarity = compareTwoStrings(clean1, clean2);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }
  }

  return Math.round(maxSimilarity * 100);
}

// Evaluate if a candidate pair is a CORRECT match.
// Per user spec: a match requires only EXACT date and EXACT value.
// Payment method and name similarity are still computed and included in the
// telemetry payload for visibility but are NOT enforced as match requirements.
function evaluateReconciliation(ledger: Transaction, statement: Transaction): MatchDetail {
  const dateMatch = checkDateMatch(new Date(ledger.date), new Date(statement.date));
  const valueMatch = checkValueMatch(
    typeof ledger.value === 'string' ? parseFloat(ledger.value) : ledger.value,
    typeof statement.value === 'string' ? parseFloat(statement.value) : statement.value
  );
  const paymentMethodMatch = checkPaymentMethodMatch(ledger.payment_method, statement.payment_method);
  const nameMatch = checkNameMatch(ledger, statement);

  const failures: string[] = [];

  if (dateMatch !== 100) {
    failures.push(`Date mismatch: ${ledger.date} vs ${statement.date} (Required: exact match, Got: ${dateMatch}%)`);
  }
  if (valueMatch !== 100) {
    failures.push(`Value mismatch: ${ledger.value} vs ${statement.value} (Required: 100%, Got: ${valueMatch}%)`);
  }

  return {
    ledgerTransaction: ledger,
    statementTransaction: statement,
    dateMatch,
    valueMatch,
    paymentMethodMatch,
    nameMatch,
    overallStatus: failures.length === 0 ? 'CORRECT' : 'INCORRECT',
    failures,
  };
}

/**
 * NEW: Automated matching for System Audit (Ledger vs Kingdom CRM)
 */
export async function autoReconcileSystemAudit(): Promise<ReconciliationResult> {
  console.log('Starting System Audit reconciliation...');

  // 1. Fetch settings
  const { data: settingsData } = await supabase
    .from('reconciliation_settings')
    .select('*')
    .single();

  const settings: ReconciliationSettings = settingsData || {
    accuracy_threshold: 1.00,
    stripe_fee_percent: 2.9,
    stripe_fixed_fee: 0.30
  };

  // 2. Fetch data
  const [pendingLedger, pendingSystem] = await Promise.all([
    fetchAllTransactions('transactions', 'pending-ledger'),
    fetchAllTransactions('kingdom_transactions', 'pending-ledger') // Assuming they use the same status name
  ]);

  console.log(`Matching ${pendingLedger.length} ledger items against ${pendingSystem.length} system items...`);

  const matches: any[] = [];
  const details: MatchDetail[] = [];

  // Index system transactions for faster lookup
  const systemIndex = createLookupIndex(pendingSystem as any);

  for (const ledgerTrans of pendingLedger) {
    const dateObj = new Date(ledgerTrans.date);
    const dateKey = dateObj.toISOString().split('T')[0];
    const valueVal = Math.abs(typeof ledgerTrans.value === 'string' ? parseFloat(ledgerTrans.value) : ledgerTrans.value);
    const valueKey = Math.round(valueVal * 100);
    const methodKey = (ledgerTrans.payment_method || '').toLowerCase().trim();

    const key = `${dateKey}|${valueKey}|${methodKey}`;
    const candidates = systemIndex.get(key) || [];

    let bestMatch = null;
    if (candidates.length > 0) {
      // Find best name match among candidates with same date/value/method
      let maxScore = -1;
      for (const candidate of candidates) {
        const score = checkNameMatch(ledgerTrans, candidate);
        if (score > maxScore) {
          maxScore = score;
          bestMatch = candidate;
        }
      }
    }

    if (bestMatch) {
      const gap = valueVal - Math.abs(parseFloat(bestMatch.value));
      const confidence = checkNameMatch(ledgerTrans, bestMatch);

      matches.push({
        ledger_id: ledgerTrans.id,
        target_id: bestMatch.id,
        type: 'SYSTEM',
        gap_amount: gap,
        confidence_score: confidence,
        is_confirmed: confidence >= 100 && Math.abs(gap) < 0.01
      });

      // Remove from index to avoid double matching
      const filtered = (systemIndex.get(key) || []).filter(c => c.id !== bestMatch.id);
      if (filtered.length > 0) systemIndex.set(key, filtered);
      else systemIndex.delete(key);
    }
  }

  // Batch insert links
  if (matches.length > 0) {
    const BATCH_SIZE = 100;
    for (let i = 0; i < matches.length; i += BATCH_SIZE) {
      const batch = matches.slice(i, i + BATCH_SIZE);
      await supabase.from('reconciliation_links').insert(batch);
    }
  }

  return {
    matched: matches.length,
    totalProcessed: pendingLedger.length,
    details: []
  };
}

/**
 * OPTIMIZED: Creates lookup indexes for O(1) candidate filtering
 * Instead of O(n) search for each transaction, we use hash maps.
 *
 * @param includeMethod when true (default), the bucket key is `date|value|method`.
 *   When false, it's just `date|value` so that ledger/statement entries with
 *   differing payment_method strings (e.g. "Stripe" vs "Stripe receipt") still
 *   land in the same bucket.
 */
function createLookupIndex(transactions: Transaction[], includeMethod = true): Map<string, IndexedTransaction[]> {
  const index = new Map<string, IndexedTransaction[]>();

  for (const trans of transactions) {
    if (trans.matched_transaction_id) continue;

    const dateKey = new Date(trans.date).toISOString().split('T')[0];
    const valueKey = Math.round(Math.abs(
      typeof trans.value === 'string' ? parseFloat(trans.value) : trans.value
    ) * 100);
    const methodKey = (trans.payment_method || '').toLowerCase().trim();

    const key = includeMethod
      ? `${dateKey}|${valueKey}|${methodKey}`
      : `${dateKey}|${valueKey}`;

    const indexed: IndexedTransaction = {
      ...trans,
      dateKey,
      valueKey,
      methodKey
    };

    if (!index.has(key)) {
      index.set(key, []);
    }
    index.get(key)!.push(indexed);
  }

  return index;
}

/**
 * OPTIMIZED: Find match using indexed lookup O(1) instead of O(n)
 */
export async function findMatchForTransactionOptimized(
  transaction: Transaction,
  candidatesIndex: Map<string, IndexedTransaction[]>
): Promise<Transaction | null> {
  // Use the raw UTC date — same construction as createLookupIndex (line ~251)
  // and the by-date diagnostic index. The previous version called
  // setHours(0, 0, 0, 0) which shifts to LOCAL midnight, so for any browser
  // running in a non-UTC timezone the lookup key landed on a different
  // calendar day than the bucket key, and *every* match silently missed.
  const dateKey = new Date(transaction.date).toISOString().split('T')[0];

  const valueKey = Math.round(Math.abs(
    typeof transaction.value === 'string' ? parseFloat(transaction.value) : transaction.value
  ) * 100);

  // Match purely on EXACT date + EXACT value. payment_method is NOT part of
  // the key — Sheets entries (e.g. "Stripe") and bank-parser auto-tagged
  // entries (e.g. "Stripe receipt") would otherwise never align.
  const key = `${dateKey}|${valueKey}`;
  const candidates = candidatesIndex.get(key) || [];

  for (const candidate of candidates) {
    if (candidate.matched_transaction_id) continue;

    const evaluation = evaluateReconciliation(transaction, candidate);
    if (evaluation.overallStatus === 'CORRECT') {
      return candidate;
    }
  }

  // Stripe-fee fallback: for Credit Card ledger entries, also try the net
  // amount the bank would have deposited after Stripe's fee.
  const isCreditCard = (transaction.payment_method || '').toLowerCase().includes('credit card');
  if (isCreditCard) {
    const { data: settings } = await supabase.from('reconciliation_settings').select('*').single();
    const feePercent = parseFloat(settings?.stripe_fee_percent || '2.9') / 100;
    const fixedFee = parseFloat(settings?.stripe_fixed_fee || '0.30');

    const val = Math.abs(typeof transaction.value === 'string' ? parseFloat(transaction.value) : transaction.value);
    const expectedNet = val - (val * feePercent + fixedFee);
    const expectedNetKey = Math.round(expectedNet * 100);

    const feeKey = `${dateKey}|${expectedNetKey}`;
    const feeCandidates = candidatesIndex.get(feeKey) || [];
    for (const candidate of feeCandidates) {
      if (candidate.matched_transaction_id) continue;
      return candidate;
    }
  }

  return null;
}

const MIN_DATE = '2024-05-01';

/**
 * Resolve the inclusive start date for a reconciliation run, never going
 * earlier than MIN_DATE. Exported for the alert/log so the UI can show
 * exactly what range was used.
 */
function resolveStartDate(requested?: string): string {
  if (!requested) return MIN_DATE;
  return requested < MIN_DATE ? MIN_DATE : requested;
}

/**
 * Fetch all transactions with pagination to handle datasets larger than 1000 records.
 * Date range defaults to [MIN_DATE, ∞); pass `dateRange` to scope tighter.
 */
async function fetchAllTransactions(
  tableName: 'transactions' | 'kingdom_transactions',
  status: string,
  dateRange?: ReconciliationDateRange
): Promise<Transaction[]> {
  const PAGE_SIZE = 1000;
  const startDate = resolveStartDate(dateRange?.startDate);
  const endDateExclusive = dateRange?.endDateExclusive;
  const allTransactions: Transaction[] = [];
  let hasMore = true;
  let offset = 0;

  while (hasMore) {
    let query = supabase
      .from(tableName)
      .select('*')
      .eq('status', status)
      .is('matched_transaction_id', null)
      .gte('date', startDate);

    if (endDateExclusive) {
      query = query.lt('date', endDateExclusive);
    }

    const { data, error } = await query
      .order('date', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch ${status} transactions: ${error.message}`);
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allTransactions.push(...data);
      console.log(`Fetched ${data.length} ${status} transactions (total: ${allTransactions.length})`);

      if (data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
      }
    }
  }

  return allTransactions;
}

/**
 * DRY-RUN matcher: computes proposed STATEMENT matches WITHOUT writing anything.
 *
 * This is the pure matching core shared by both the post-import auto-reconcile
 * (which applies all proposals immediately) and the Transactions-page review
 * flow (which lets the user keep/skip each proposal before applying). It keeps
 * the indexed lookups, the Stripe-fee fallback, double-match prevention, and the
 * same-date diagnostics intact.
 */
export async function computeReconciliationProposals(
  tableName: 'transactions' | 'kingdom_transactions' = 'transactions',
  dateRange?: ReconciliationDateRange
): Promise<ReconciliationProposalsResult> {
  const appliedRange = {
    startDate: resolveStartDate(dateRange?.startDate),
    endDateExclusive: dateRange?.endDateExclusive ?? null,
  };

  const [pendingLedger, pendingStatements] = await Promise.all([
    fetchAllTransactions(tableName, 'pending-ledger', dateRange),
    fetchAllTransactions(tableName, 'pending-statement', dateRange),
  ]);

  if (pendingLedger.length === 0) {
    return { proposals: [], details: [], totalProcessed: 0, appliedRange };
  }

  if (pendingStatements.length === 0) {
    return {
      proposals: [],
      details: pendingLedger.map(ledgerTrans => ({
        ledgerTransaction: ledgerTrans,
        statementTransaction: null,
        dateMatch: 0,
        valueMatch: 0,
        paymentMethodMatch: 0,
        nameMatch: 0,
        overallStatus: 'INCORRECT' as const,
        failures: ['No pending-statement transactions available'],
      })),
      totalProcessed: pendingLedger.length,
      appliedRange,
    };
  }

  // Index by date+value only — payment_method strings often differ between
  // sources (e.g. Sheets "Stripe" vs bank parser "Stripe receipt").
  const candidatesIndex = createLookupIndex(pendingStatements, false);

  // Diagnostic-only: same-date index so we can show, for unmatched ledger rows,
  // which statement rows landed on the same date with different values.
  const byDateIndex = new Map<string, Transaction[]>();
  for (const stmt of pendingStatements) {
    if (stmt.matched_transaction_id) continue;
    const dateKey = new Date(stmt.date).toISOString().split('T')[0];
    if (!byDateIndex.has(dateKey)) byDateIndex.set(dateKey, []);
    byDateIndex.get(dateKey)!.push(stmt);
  }

  const details: MatchDetail[] = [];
  const proposals: MatchProposal[] = [];

  for (const ledgerTrans of pendingLedger) {
    const match = await findMatchForTransactionOptimized(ledgerTrans, candidatesIndex);

    if (match) {
      proposals.push({ ledger: ledgerTrans, statement: match, confidence: 100, gap: 0 });
      details.push(evaluateReconciliation(ledgerTrans, match));

      // Remove from index to prevent double-matching. Key mirrors the
      // date+value-only format used when the index was built above.
      const dateKey = new Date(match.date).toISOString().split('T')[0];
      const valueKey = Math.round(Math.abs(
        typeof match.value === 'string' ? parseFloat(match.value) : match.value
      ) * 100);
      const key = `${dateKey}|${valueKey}`;

      const candidates = candidatesIndex.get(key);
      if (candidates) {
        const filtered = candidates.filter(c => c.id !== match.id);
        if (filtered.length > 0) {
          candidatesIndex.set(key, filtered);
        } else {
          candidatesIndex.delete(key);
        }
      }
    } else {
      const ledgerDateKey = new Date(ledgerTrans.date).toISOString().split('T')[0];
      const sameDate = byDateIndex.get(ledgerDateKey) || [];
      const sameDateCandidates: NearMissCandidate[] = sameDate
        .filter(s => !s.matched_transaction_id)
        .slice(0, 5)
        .map(s => ({
          id: s.id,
          date: s.date,
          value: String(s.value),
          name: s.name,
          depositor: s.depositor,
          source: s.source,
          payment_method: s.payment_method,
        }));

      const failureReason = sameDateCandidates.length === 0
        ? `No statement entries exist on ${ledgerDateKey}`
        : `Statement entries exist on ${ledgerDateKey} but with different amounts`;

      details.push({
        ledgerTransaction: ledgerTrans,
        statementTransaction: null,
        dateMatch: 0,
        valueMatch: 0,
        paymentMethodMatch: 0,
        nameMatch: 0,
        overallStatus: 'INCORRECT',
        failures: [failureReason],
        sameDateCandidates,
      });
    }
  }

  return { proposals, details, totalProcessed: pendingLedger.length, appliedRange };
}

/**
 * Apply a set of accepted proposals through the unified match writer so the
 * results are attributed + undoable exactly like manual matches. Re-verifies
 * each side is still pending before writing (the user may have acted between
 * computing and applying).
 */
export async function applyMatches(
  accepted: MatchProposal[],
  actor: { userId: string | null; userEmail: string | null } = { userId: null, userEmail: null },
): Promise<{ applied: number; skipped: number }> {
  return applyStatementMatchesBatch(
    accepted.map(p => ({ ledger: p.ledger, statement: p.statement, confidence: p.confidence })),
    { source: 'auto', verifyPending: true, userId: actor.userId, userEmail: actor.userEmail },
  );
}

/**
 * OPTIMIZED: Auto reconcile — computes proposals then applies them all.
 *
 * Kept for the post-import "Run auto-reconciliation after import" flows
 * (BankUpload / CardUpload / GoogleSheetsConnection / KingdomUpload). It now
 * routes its writes through the unified match writer so post-import auto matches
 * also set matched_transaction_id + an attributed STATEMENT link and are
 * therefore undoable like every other match. External signature/return are
 * unchanged.
 */
export async function autoReconcileAllOptimized(
  tableName: 'transactions' | 'kingdom_transactions' = 'transactions',
  dateRange?: ReconciliationDateRange
): Promise<ReconciliationResult> {
  const { proposals, details, totalProcessed, appliedRange } =
    await computeReconciliationProposals(tableName, dateRange);

  let matched = 0;
  if (proposals.length > 0) {
    const { applied } = await applyStatementMatchesBatch(
      proposals.map(p => ({ ledger: p.ledger, statement: p.statement, confidence: p.confidence })),
      { source: 'auto', userId: null, userEmail: null },
    );
    matched = applied;
  }

  return { matched, totalProcessed, details, appliedRange };
}
