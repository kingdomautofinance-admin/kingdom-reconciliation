/**
 * Wells Fargo Bank CSV Parser
 *
 * This module handles parsing of Wells Fargo bank statements (CSV format).
 * It's specifically designed for Zelle transactions and bank deposits.
 *
 * IMPORTANT: This parser is independent from card parsing and should NOT
 * be modified when making changes to card import functionality.
 *
 * Supported formats:
 * - Wells Fargo CSV with Zelle transactions
 * - Wells Fargo CSV with deposit information
 *
 * Expected CSV columns:
 * - Date or date
 * - Amount or amount
 * - Depositor Name or depositor_name
 * - Description or description (contains Zelle info)
 */

import Papa from 'papaparse';
import type { InsertTransaction } from '../database.types';
import { normalizeNumericValue, parseDate, isValidTransaction } from './shared-utils';

/**
 * Parses Stripe Transfer description to extract merchant name
 *
 * Handles formats like:
 * - "STRIPE TRANSFER ST-W6V3O5D5L9X1 KINGDOM AUTO FINANCE L 4270465600 ST-W6V3O5D5L9X1 R00000091003954230522N"
 *
 * @param description - Raw description from Wells Fargo CSV
 * @returns Merchant name or null if not a Stripe transfer
 */
export function parseStripeTransfer(description: string): string | null {
  if (!description) return null;

  const upperDesc = description.toUpperCase();

  if (upperDesc.startsWith('STRIPE TRANSFER') || upperDesc.includes('STRIPE TRANSFER')) {
    // Extract the merchant name between the transaction ID and the phone/reference numbers
    // Pattern: STRIPE TRANSFER ST-XXXXX [MERCHANT NAME] [NUMBERS...]
    const parts = description.split(/\s+/);

    // Find where ST- appears
    const stIndex = parts.findIndex(p => p.toUpperCase().startsWith('ST-'));

    if (stIndex >= 0 && stIndex + 1 < parts.length) {
      // Collect words after ST-XXXXX until we hit numbers or another ST-
      const merchantParts: string[] = [];
      for (let i = stIndex + 1; i < parts.length; i++) {
        const part = parts[i];
        // Stop if we hit a phone number pattern (all digits, 10+ chars) or another ST-
        if (/^\d{10,}$/.test(part) || part.toUpperCase().startsWith('ST-') || part.toUpperCase().startsWith('R0')) {
          break;
        }
        merchantParts.push(part);
      }

      if (merchantParts.length > 0) {
        return merchantParts.join(' ').trim();
      }
    }

    // Fallback: return the full description
    return description.trim();
  }

  return null;
}

/**
 * Parses Wire Transfer description to detect outgoing payments
 *
 * Handles formats like:
 * - "WT FED#02R01 JPMORGAN CHASE BAN /FTR/BNF=Driveway Direct Motors LLC SRF# GW00000079760164 TRN#251015175384 RFB# 117"
 *
 * @param description - Raw description from Wells Fargo CSV
 * @returns Beneficiary name or null if not a wire transfer
 */
export function parseWireTransfer(description: string): string | null {
  if (!description) return null;

  const upperDesc = description.toUpperCase();

  if (upperDesc.startsWith('WT FED') || upperDesc.includes('WT FED')) {
    // Try to extract beneficiary name after /BNF= or /FTR/BNF=
    const bnfMatch = description.match(/\/BNF=([^\/\s]+(?:\s+[^\/\s]+)*?)(?:\s+SRF#|\s+TRN#|\s+RFB#|$)/i);

    if (bnfMatch && bnfMatch[1]) {
      return bnfMatch[1].trim();
    }

    // Fallback: return the full description
    return description.trim();
  }

  return null;
}

/**
 * Parses Wells Fargo description field to extract depositor name and payment method
 *
 * Handles formats like:
 * - "ZELLE FROM John Doe ON 12/25/2023"
 * - "ZELLE FROM JANE SMITH ON 01/15/2024"
 *
 * @param description - Raw description from Wells Fargo CSV
 * @returns Parsed name and method, or null if not a Zelle transaction
 */
export function parseWellsFargoDescription(description: string): { name: string; method: string } | null {
  if (!description) return null;

  const upperDesc = description.toUpperCase();

  if (upperDesc.includes('ZELLE FROM')) {
    const fromIndex = upperDesc.indexOf('FROM') + 4;
    const onIndex = upperDesc.indexOf(' ON ', fromIndex);

    if (onIndex > fromIndex) {
      const name = description.substring(fromIndex, onIndex).trim();
      return { name, method: 'Zelle' };
    }
  }

  return null;
}

/**
 * Detects if a CSV row is from Wells Fargo format
 *
 * @param row - Parsed CSV row object
 * @returns true if Wells Fargo format detected
 */
export function isWellsFargoFormat(row: any): boolean {
  return !!(
    row['Depositor Name'] ||
    row['depositor_name'] ||
    (row['Description'] && typeof row['Description'] === 'string')
  );
}

/**
 * Parses a single Wells Fargo CSV row into a transaction
 *
 * @param row - Parsed CSV row object
 * @param fileName - Original CSV file name for source tracking
 * @returns Parsed transaction or null if invalid
 */
export function parseWellsFargoRow(row: any, fileName: string): InsertTransaction | null {
  const description = row['Description'] || row['description'] || '';
  const value = row['Amount'] || row['amount'];

  let paymentMethod: string;
  let depositor: string | null;

  // PRIORITY 1: Check for Stripe Transfer (card receipts)
  const stripeTransfer = parseStripeTransfer(description);
  if (stripeTransfer) {
    paymentMethod = 'Stripe receipt';
    depositor = stripeTransfer;
  }
  // PRIORITY 2: Check for Wire Transfer (outgoing payments)
  else if (parseWireTransfer(description)) {
    const beneficiary = parseWireTransfer(description);
    paymentMethod = 'Wire Transfer';
    depositor = beneficiary || 'Wire Transfer';
  }
  // PRIORITY 3: Check for branch/store deposit pattern
  else if (description.toUpperCase().includes('DEPOSIT MADE IN A BRANCH/STORE')) {
    paymentMethod = 'deposit';
    depositor = 'Deposit';
  }
  // PRIORITY 4: Check for Zelle from description
  else {
    const parsed = parseWellsFargoDescription(description);
    if (parsed) {
      paymentMethod = parsed.method;
      depositor = parsed.name;
    } else {
      // PRIORITY 5: Check if there's a depositor name (Zelle) or generic deposit
      const depositorName = row['Depositor Name'] || row['depositor_name'];

      if (depositorName && depositorName.trim()) {
        // Has depositor name, likely Zelle
        paymentMethod = 'Zelle';
        depositor = depositorName;
      } else {
        // No depositor name - use full description from column D as depositor
        paymentMethod = 'deposit';
        depositor = description.trim() || 'deposito';
      }
    }
  }

  const dateStr = row['Date'] || row['date'];

  if (!dateStr || !value) {
    return null;
  }

  const parsedDate = parseDate(dateStr);
  if (!parsedDate) {
    return null;
  }

  const transaction: InsertTransaction = {
    date: parsedDate,
    value: normalizeNumericValue(value),
    depositor,
    payment_method: paymentMethod,
    historical_text: JSON.stringify(row),
    source: `Wells Fargo CSV: ${fileName}`,
    status: 'pending-statement',
    confidence: 0,
  };

  return isValidTransaction(transaction) ? transaction : null;
}

/**
 * Parses a Wells Fargo CSV file into an array of transactions
 *
 * This is the main entry point for Wells Fargo bank import.
 * Use this function when you want to import only bank transactions.
 *
 * @param file - CSV file to parse
 * @returns Promise resolving to array of transactions
 */
export async function parseWellsFargoCSV(file: File): Promise<InsertTransaction[]> {
  return new Promise((resolve, reject) => {
    console.log('[BANK PARSER] Starting Wells Fargo CSV parse');

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const transactions: InsertTransaction[] = [];
          let rowsProcessed = 0;
          let rowsSkipped = 0;

          for (const row of results.data as any[]) {
            rowsProcessed++;

            if (!isWellsFargoFormat(row)) {
              console.warn('[BANK PARSER] Row does not match Wells Fargo format, skipping:', row);
              rowsSkipped++;
              continue;
            }

            const transaction = parseWellsFargoRow(row, file.name);

            if (transaction) {
              transactions.push(transaction);
            } else {
              rowsSkipped++;
            }
          }

          console.log('[BANK PARSER] Parse complete');
          console.log(`[BANK PARSER] Processed: ${rowsProcessed} rows`);
          console.log(`[BANK PARSER] Valid transactions: ${transactions.length}`);
          console.log(`[BANK PARSER] Skipped: ${rowsSkipped} rows`);

          resolve(transactions);
        } catch (error) {
          console.error('[BANK PARSER] Error during parsing:', error);
          reject(error);
        }
      },
      error: (error) => {
        console.error('[BANK PARSER] Papa Parse error:', error);
        reject(error);
      },
    });
  });
}
