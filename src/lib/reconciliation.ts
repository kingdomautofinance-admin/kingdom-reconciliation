import { compareTwoStrings } from 'string-similarity';
import type { Transaction } from './database.types';
import { supabase } from './supabase';
import { autoReconcileAllOptimized } from './reconciliation-optimized';

interface ReconciliationResult {
  matched: number;
  totalProcessed: number;
  details: MatchDetail[];
}

interface MatchDetail {
  ledgerTransaction: Transaction;
  statementTransaction: Transaction | null;
  dateMatch: number;
  valueMatch: number;
  paymentMethodMatch: number;
  nameMatch: number;
  overallStatus: 'CORRECT' | 'INCORRECT';
  failures: string[];
}

// Date match with ±2 days tolerance (100%)
function checkDateMatch(date1: Date, date2: Date): number {
  const d1 = date1.toISOString().split('T')[0];
  const d2 = date2.toISOString().split('T')[0];

  if (d1 === d2) return 100;

  // Allow ±2 days tolerance
  const date1Only = new Date(d1);
  const date2Only = new Date(d2);
  const diffInDays = Math.abs((date1Only.getTime() - date2Only.getTime()) / (1000 * 60 * 60 * 24));

  if (diffInDays <= 2) return 100;

  return 0;
}

// Exact value match (100%)
function checkValueMatch(value1: number, value2: number): number {
  const v1 = Math.abs(typeof value1 === 'string' ? parseFloat(value1 as any) : value1);
  const v2 = Math.abs(typeof value2 === 'string' ? parseFloat(value2 as any) : value2);
  return Math.abs(v1 - v2) < 0.01 ? 100 : 0;
}

// Exact payment method match (100%)
function checkPaymentMethodMatch(method1: string | null, method2: string | null): number {
  if (!method1 || !method2) return 0;
  const m1 = method1.toLowerCase().trim();
  const m2 = method2.toLowerCase().trim();
  return m1 === m2 ? 100 : 0;
}

// Name similarity match (≥50% acceptable)
function checkNameMatch(trans1: Transaction, trans2: Transaction): number {
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

// Evaluate if reconciliation is correct based on strict criteria
function evaluateReconciliation(ledger: Transaction, statement: Transaction): MatchDetail {
  const dateMatch = checkDateMatch(new Date(ledger.date), new Date(statement.date));
  const valueMatch = checkValueMatch(
    typeof ledger.value === 'string' ? parseFloat(ledger.value) : ledger.value,
    typeof statement.value === 'string' ? parseFloat(statement.value) : statement.value
  );
  const paymentMethodMatch = checkPaymentMethodMatch(ledger.payment_method, statement.payment_method);
  const nameMatch = checkNameMatch(ledger, statement);

  const failures: string[] = [];

  // Check strict requirements
  if (dateMatch !== 100) {
    failures.push(`Date mismatch: ${ledger.date} vs ${statement.date} (Required: within ±2 days, Got: ${dateMatch}%)`);
  }

  if (valueMatch !== 100) {
    failures.push(`Value mismatch: ${ledger.value} vs ${statement.value} (Required: 100%, Got: ${valueMatch}%)`);
  }

  if (paymentMethodMatch !== 100) {
    failures.push(`Payment method mismatch: ${ledger.payment_method} vs ${statement.payment_method} (Required: 100%, Got: ${paymentMethodMatch}%)`);
  }

  // For credit card transactions, skip name matching requirement
  const isCreditCard =
    ledger.payment_method?.toLowerCase().includes('credit card') ||
    statement.payment_method?.toLowerCase().includes('credit card');

  if (!isCreditCard && nameMatch < 50) {
    failures.push(`Name similarity too low: (Required: ≥50%, Got: ${nameMatch}%)`);
  }

  const overallStatus = failures.length === 0 ? 'CORRECT' : 'INCORRECT';

  return {
    ledgerTransaction: ledger,
    statementTransaction: statement,
    dateMatch,
    valueMatch,
    paymentMethodMatch,
    nameMatch,
    overallStatus,
    failures
  };
}

// Find best match for a transaction using STRICT criteria
export async function findMatchForTransaction(transaction: Transaction): Promise<Transaction | null> {
  const targetStatus = transaction.status === 'pending-ledger'
    ? 'pending-statement'
    : 'pending-ledger';

  const { data: candidates, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('status', targetStatus);

  if (error || !candidates || candidates.length === 0) {
    return null;
  }

  // Find exact match based on strict criteria
  for (const candidate of candidates) {
    if (candidate.matched_transaction_id) continue;

    const evaluation = evaluateReconciliation(transaction, candidate);

    if (evaluation.overallStatus === 'CORRECT') {
      console.log(`✓ CORRECT Match found:`, {
        ledger: `${transaction.name || transaction.depositor} - $${transaction.value} - ${transaction.date}`,
        statement: `${candidate.name || candidate.depositor} - $${candidate.value} - ${candidate.date}`,
        scores: {
          date: `${evaluation.dateMatch}%`,
          value: `${evaluation.valueMatch}%`,
          paymentMethod: `${evaluation.paymentMethodMatch}%`,
          name: `${evaluation.nameMatch}%`
        }
      });
      return candidate;
    }
  }

  return null;
}

// Auto reconcile all pending ledger transactions with STRICT criteria (Legacy version)
async function autoReconcileAllLegacy(): Promise<ReconciliationResult> {
  console.log('Starting STRICT auto reconciliation...');
  console.log('Criteria:');
  console.log('  • Date: ±2 days tolerance');
  console.log('  • Value: 100% exact match');
  console.log('  • Payment Method: 100% exact match');
  console.log('  • Name: ≥50% similarity (skipped for Credit Card)\n');

  const { data: pendingLedger, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('status', 'pending-ledger')
    .is('matched_transaction_id', null)
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching pending-ledger transactions:', error);
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  if (!pendingLedger || pendingLedger.length === 0) {
    return {
      matched: 0,
      totalProcessed: 0,
      details: []
    };
  }

  console.log(`Processing ${pendingLedger.length} pending-ledger transactions...\n`);

  const details: MatchDetail[] = [];
  let matched = 0;

  for (const ledgerTrans of pendingLedger) {
    const match = await findMatchForTransaction(ledgerTrans);

    if (match) {
      // Update both transactions as reconciled
      const { error: updateError1 } = await supabase
        .from('transactions')
        .update({
          status: 'reconciled',
          matched_transaction_id: match.id,
          confidence: 100,
        })
        .eq('id', ledgerTrans.id);

      const { error: updateError2 } = await supabase
        .from('transactions')
        .update({
          status: 'reconciled',
          matched_transaction_id: ledgerTrans.id,
          confidence: 100,
        })
        .eq('id', match.id);

      if (!updateError1 && !updateError2) {
        matched++;
        const evaluation = evaluateReconciliation(ledgerTrans, match);
        details.push(evaluation);
      }
    } else {
      // Log why no match was found
      console.log(`✗ INCORRECT: No match found for ${ledgerTrans.name || ledgerTrans.depositor} - $${ledgerTrans.value} - ${ledgerTrans.date}`);

      details.push({
        ledgerTransaction: ledgerTrans,
        statementTransaction: null,
        dateMatch: 0,
        valueMatch: 0,
        paymentMethodMatch: 0,
        nameMatch: 0,
        overallStatus: 'INCORRECT',
        failures: ['No matching statement transaction found with all required criteria']
      });
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('RECONCILIATION COMPLETE');
  console.log(`${'='.repeat(60)}`);
  console.log(`Total Processed: ${pendingLedger.length}`);
  console.log(`Reconciliation CORRECT: ${matched}`);
  console.log(`Reconciliation INCORRECT: ${pendingLedger.length - matched}`);
  console.log(`${'='.repeat(60)}\n`);

  // Log summary of failures
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
    details
  };
}

// Export optimized version as default
export { autoReconcileAllOptimized as autoReconcileAll };
