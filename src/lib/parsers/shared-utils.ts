/**
 * Shared Utilities for CSV Parsing
 *
 * This module contains utility functions that are used by both
 * bank and card import parsers. These are pure functions with
 * no side effects that can be safely shared across modules.
 */

import type { InsertTransaction } from '../database.types';

/**
 * Normalizes numeric values from various formats to a standard decimal string
 *
 * Handles:
 * - Comma as thousand separator (1,000.00)
 * - Comma as decimal separator (1.000,00)
 * - Currency symbols ($100.00)
 * - Negative values
 *
 * @param value - The raw string value to normalize
 * @returns Normalized decimal string (e.g., "1000.00")
 */
export function normalizeNumericValue(value: string): string {
  if (!value) return '0';

  let cleaned = value.toString().trim().replace(/[^0-9.,-]/g, '');

  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');

  if (hasDot && hasComma) {
    const lastDotPos = cleaned.lastIndexOf('.');
    const lastCommaPos = cleaned.lastIndexOf(',');

    if (lastDotPos > lastCommaPos) {
      cleaned = cleaned.replace(/,/g, '');
    } else {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
  } else if (hasComma && !hasDot) {
    cleaned = cleaned.replace(/,/g, '');
  }

  return cleaned;
}

/**
 * Parses a date string into an ISO 8601 format
 *
 * @param dateStr - Raw date string from CSV
 * @returns ISO 8601 formatted date string or null if invalid
 */
export function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;

  return date.toISOString();
}

/**
 * Validates that a transaction has the minimum required fields
 *
 * @param transaction - Partial transaction object to validate
 * @returns true if valid, false otherwise
 */
export function isValidTransaction(transaction: Partial<InsertTransaction>): boolean {
  return !!(transaction.date && transaction.value);
}

/**
 * Creates a unique key for duplicate detection
 * Used to identify if two transactions are the same
 *
 * @param transaction - Transaction or existing record
 * @returns Unique key string
 */
export function createDuplicateKey(transaction: {
  date: string;
  value: string | number;
  name?: string | null;
  depositor?: string | null;
  car?: string | null;
  payment_method?: string | null;
}): string {
  const date = new Date(transaction.date);
  const dateStr = date.toISOString().split('T')[0];
  const valueStr = typeof transaction.value === 'string' ? transaction.value : transaction.value.toString();
  const valueNum = Math.abs(parseFloat(normalizeNumericValue(valueStr))).toFixed(2);
  const name = ((transaction as any).name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const depositor = (transaction.depositor || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const car = ((transaction as any).car || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const paymentMethod = (transaction.payment_method || '').trim().toLowerCase().replace(/\s+/g, ' ');

  return `${dateStr}|${valueNum}|${name}|${depositor}|${car}|${paymentMethod}`;
}

/**
 * Generic duplicate detection function
 * Can be used by both bank and card parsers
 *
 * @param newTransactions - Transactions to check
 * @param existingTransactions - Transactions already in database
 * @returns Filtered array with duplicates removed
 */
export function detectDuplicates(
  newTransactions: InsertTransaction[],
  existingTransactions: Array<{
    date: string;
    value: string | number;
    depositor: string | null;
    payment_method: string | null;
    source: string;
    name?: string | null;
    car?: string | null;
  }>
): InsertTransaction[] {
  const existingKeys = new Set<string>();
  const newKeys = new Set<string>();
  const internalDuplicates = new Map<string, number>();

  console.log('[DUPLICATE CHECK START]');
  console.log(`Total new transactions to check: ${newTransactions.length}`);
  console.log(`Total existing transactions in DB: ${existingTransactions.length}`);

  for (const existing of existingTransactions) {
    const key = createDuplicateKey(existing);
    existingKeys.add(key);
  }

  for (const newTrans of newTransactions) {
    const key = createDuplicateKey(newTrans);

    if (newKeys.has(key)) {
      const count = (internalDuplicates.get(key) || 1) + 1;
      internalDuplicates.set(key, count);
    }
    newKeys.add(key);
  }

  if (internalDuplicates.size > 0) {
    console.warn('[INTERNAL DUPLICATES DETECTED]');
    console.warn(`Found ${internalDuplicates.size} unique transactions that appear multiple times in the import batch:`);
    let totalDups = 0;
    internalDuplicates.forEach((count, key) => {
      console.warn(`  - "${key}" appears ${count} times`);
      totalDups += count - 1;
    });
    console.warn(`Total internal duplicate entries: ${totalDups}`);
  }

  const seenInCurrentBatch = new Set<string>();
  const filtered = newTransactions.filter(newTrans => {
    const key = createDuplicateKey(newTrans);

    if (existingKeys.has(key)) {
      console.log('Duplicate with DB detected:', newTrans);
      return false;
    }

    if (seenInCurrentBatch.has(key)) {
      console.log('Internal duplicate detected (same batch):', newTrans);
      return false;
    }

    seenInCurrentBatch.add(key);
    return true;
  });

  console.log(`[DUPLICATE CHECK END]`);
  console.log(`Result: ${filtered.length} unique transactions to import`);
  console.log(`Duplicates with DB: ${newTransactions.length - filtered.length - (newTransactions.length - newKeys.size)}`);
  console.log(`Internal duplicates removed: ${newTransactions.length - newKeys.size}`);

  return filtered;
}
