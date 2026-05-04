import { compareTwoStrings } from 'string-similarity';
import type { Transaction } from './database.types';
import { supabase } from './supabase';

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
  const transDate = new Date(transaction.date);
  transDate.setHours(0, 0, 0, 0);

  const valueKey = Math.round(Math.abs(
    typeof transaction.value === 'string' ? parseFloat(transaction.value) : transaction.value
  ) * 100);

  // Match purely on EXACT date + EXACT value. payment_method is NOT part of
  // the key — Sheets entries (e.g. "Stripe") and bank-parser auto-tagged
  // entries (e.g. "Stripe receipt") would otherwise never align.
  const dateKey = transDate.toISOString().split('T')[0];
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
 * OPTIMIZED: Auto reconcile with batched updates and indexed lookups
 * Performance improvements:
 * - Paginated fetching to handle unlimited transaction counts (removes 1000 limit)
 * - Hash map indexing for O(1) lookups (was O(n) per transaction)
 * - Batched database updates (was 2 queries per match)
 * - Progress tracking for large datasets
 */
export async function autoReconcileAllOptimized(
  tableName: 'transactions' | 'kingdom_transactions' = 'transactions',
  dateRange?: ReconciliationDateRange
): Promise<ReconciliationResult> {
  const appliedRange = {
    startDate: resolveStartDate(dateRange?.startDate),
    endDateExclusive: dateRange?.endDateExclusive ?? null,
  };

  console.log('Starting OPTIMIZED auto reconciliation...');
  console.log('Criteria:');
  console.log('  • Date: exact match');
  console.log('  • Value: 100% exact match');
  console.log(`  • Date range: ${appliedRange.startDate} to ${appliedRange.endDateExclusive ?? '(no end)'}\n`);

  const startTime = performance.now();

  // OPTIMIZATION 1: Fetch all data with pagination (no 1000 limit)
  console.log('Fetching pending transactions with pagination...');
  const fetchStartTime = performance.now();

  const [pendingLedger, pendingStatements] = await Promise.all([
    fetchAllTransactions(tableName, 'pending-ledger', dateRange),
    fetchAllTransactions(tableName, 'pending-statement', dateRange)
  ]);

  const fetchTime = Math.round(performance.now() - fetchStartTime);
  console.log(`\nFetch completed in ${fetchTime}ms`);
  console.log(`  • Ledger transactions: ${pendingLedger.length}`);
  console.log(`  • Statement transactions: ${pendingStatements.length}\n`);

  if (pendingLedger.length === 0) {
    console.log('No pending-ledger transactions to process.');
    return {
      matched: 0,
      totalProcessed: 0,
      details: [],
      appliedRange,
    };
  }

  if (pendingStatements.length === 0) {
    console.log('No pending-statement transactions available for matching.');
    return {
      matched: 0,
      totalProcessed: pendingLedger.length,
      details: pendingLedger.map(ledgerTrans => ({
        ledgerTransaction: ledgerTrans,
        statementTransaction: null,
        dateMatch: 0,
        valueMatch: 0,
        paymentMethodMatch: 0,
        nameMatch: 0,
        overallStatus: 'INCORRECT' as const,
        failures: ['No pending-statement transactions available']
      })),
      appliedRange,
    };
  }

  console.log(`Processing ${pendingLedger.length} pending-ledger transactions...`);
  console.log(`Candidates: ${pendingStatements.length} pending-statement transactions\n`);

  // OPTIMIZATION 2: Create indexed lookup for O(1) search.
  // Index by date+value only — payment_method strings often differ between
  // sources (e.g. Sheets "Stripe" vs bank parser "Stripe receipt"), which
  // would otherwise cause every lookup to miss.
  const indexTime = performance.now();
  const candidatesIndex = createLookupIndex(pendingStatements, false);

  // Diagnostic-only: same-date index so we can show, for unmatched ledger
  // rows, which statement rows landed on the same date with different values.
  // Lets the user distinguish "no statement data exists for this date" from
  // "data exists but the amounts are off by some delta".
  const byDateIndex = new Map<string, Transaction[]>();
  for (const stmt of pendingStatements) {
    if (stmt.matched_transaction_id) continue;
    const dateKey = new Date(stmt.date).toISOString().split('T')[0];
    if (!byDateIndex.has(dateKey)) byDateIndex.set(dateKey, []);
    byDateIndex.get(dateKey)!.push(stmt);
  }
  console.log(`Index created in ${Math.round(performance.now() - indexTime)}ms`);

  const details: MatchDetail[] = [];
  const matches: Array<{ ledgerId: string; statementId: string }> = [];

  // OPTIMIZATION 3: Find all matches first, update in batch
  console.log('Starting reconciliation matching...');
  const PROGRESS_INTERVAL = 500;
  let processedCount = 0;

  for (const ledgerTrans of pendingLedger) {
    const match = await findMatchForTransactionOptimized(ledgerTrans, candidatesIndex);
    processedCount++;

    // Log progress every 500 transactions
    if (processedCount % PROGRESS_INTERVAL === 0 || processedCount === pendingLedger.length) {
      const percentage = Math.round((processedCount / pendingLedger.length) * 100);
      console.log(`Progress: ${processedCount}/${pendingLedger.length} (${percentage}%) - Matches found: ${matches.length}`);
    }

    if (match) {
      matches.push({
        ledgerId: ledgerTrans.id,
        statementId: match.id
      });

      const evaluation = evaluateReconciliation(ledgerTrans, match);
      details.push(evaluation);

      // Remove from index to prevent double-matching.
      // Key must mirror the date+value-only format used when the index was
      // built above (createLookupIndex(..., false)).
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

      console.log(`✗ INCORRECT: ${ledgerTrans.name || ledgerTrans.depositor} - $${ledgerTrans.value} - ${ledgerTrans.date} — ${failureReason}`);

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

  // OPTIMIZATION 4: Batch update all matches
  let matched = 0;
  if (matches.length > 0) {
    console.log(`\nUpdating ${matches.length} matches in database...`);

    // Update in batches of 50 to avoid payload limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < matches.length; i += BATCH_SIZE) {
      const batch = matches.slice(i, i + BATCH_SIZE);

      // 1. Insert links
      const links = batch.map(({ ledgerId, statementId }) => ({
        ledger_id: ledgerId,
        target_id: statementId,
        type: 'STATEMENT',
        confidence_score: 100,
        is_confirmed: true
      }));
      
      const { error: linkError } = await supabase.from('reconciliation_links').insert(links);
      
      // 2. Update statuses
      const ledgerIds = batch.map(m => m.ledgerId);
      const statementIds = batch.map(m => m.statementId);

      const [ledgerUpdate, statementUpdate] = await Promise.all([
        supabase.from('transactions').update({ status: 'reconciled' }).in('id', ledgerIds),
        supabase.from('transactions').update({ status: 'reconciled' }).in('id', statementIds)
      ]);

      if (!linkError && !ledgerUpdate.error && !statementUpdate.error) {
        matched += batch.length;
      }
    }
  }

  const totalTime = Math.round(performance.now() - startTime);

  console.log(`\n${'='.repeat(60)}`);
  console.log('RECONCILIATION COMPLETE');
  console.log(`${'='.repeat(60)}`);
  console.log(`Total Time: ${totalTime}ms`);
  console.log(`Total Processed: ${pendingLedger.length}`);
  console.log(`Reconciliation CORRECT: ${matched}`);
  console.log(`Reconciliation INCORRECT: ${pendingLedger.length - matched}`);
  console.log(`Performance: ${Math.round(pendingLedger.length / (totalTime / 1000))} transactions/sec`);
  console.log(`${'='.repeat(60)}\n`);

  const incorrectDetails = details.filter(d => d.overallStatus === 'INCORRECT');
  if (incorrectDetails.length > 0) {
    console.log('Failed Reconciliations Summary:');
    incorrectDetails.slice(0, 10).forEach((detail, idx) => {
      console.log(`\n${idx + 1}. ${detail.ledgerTransaction.name || detail.ledgerTransaction.depositor}`);
      detail.failures.forEach(failure => console.log(`   - ${failure}`));
    });
    if (incorrectDetails.length > 10) {
      console.log(`\n... and ${incorrectDetails.length - 10} more failed reconciliations`);
    }
  }

  return {
    matched,
    totalProcessed: pendingLedger.length,
    details,
    appliedRange,
  };
}
