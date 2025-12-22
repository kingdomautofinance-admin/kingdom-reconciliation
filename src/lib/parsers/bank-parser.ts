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

/**
 * Delta Credit Union CSV Parser
 *
 * The following functions handle parsing of Delta Credit Union bank statements.
 * Delta format includes metadata rows and separate debit/credit columns.
 */

/**
 * Detects if a CSV row is from Delta Credit Union format
 *
 * @param row - Parsed CSV row object
 * @returns true if Delta format detected
 */
export function isDeltaFormat(row: any): boolean {
  return !!(
    (row['Amount Debit'] !== undefined || row['Amount Credit'] !== undefined) &&
    row['Memo'] !== undefined &&
    row['Date'] &&
    row['Description']
  );
}

/**
 * Parses Delta Credit Union memo field to extract depositor name and payment method
 *
 * Handles formats:
 * - Zelle: "Journal Voucher ZELLE [NAME] 800-544-3328 ZTID#[ID]"
 * - Stripe: "STRIPE" (in memo)
 * - Wire: "by Wire WIRE-IN [ID] [NAME]"
 * - Cash/ATM deposits: Empty memo or location info
 *
 * @param memo - Raw memo from Delta CSV
 * @param description - Description field for context
 * @returns Parsed name and method, or null
 */
export function parseDeltaMemo(
  memo: string,
  description: string
): { name: string; method: string } | null {
  if (!memo && !description) return null;

  const upperMemo = (memo || '').toUpperCase();
  const upperDesc = (description || '').toUpperCase();

  // PRIORITY 1: Zelle transactions
  if (upperMemo.includes('ZELLE')) {
    // Pattern: "Journal Voucher ZELLE [NAME] 800-544-3328 ZTID#..."
    // Extract name between "ZELLE" and "800-544-3328"
    const zelleMatch = memo.match(/ZELLE\s+([A-Z0-9\s]+?)\s+800-544-3/i);
    if (zelleMatch && zelleMatch[1]) {
      const name = zelleMatch[1].trim();
      return { name, method: 'Zelle' };
    }

    // Fallback: extract everything after ZELLE until phone or ZTID
    const fallbackMatch = memo.match(/ZELLE\s+(.+?)(?:\s+800-544|\s+ZTID)/i);
    if (fallbackMatch && fallbackMatch[1]) {
      return { name: fallbackMatch[1].trim(), method: 'Zelle' };
    }
  }

  // PRIORITY 2: Stripe deposits (ACH)
  if (upperMemo.includes('STRIPE') || upperDesc.includes('STRIPE')) {
    return { name: 'STRIPE', method: 'Stripe receipt' };
  }

  // PRIORITY 3: Wire transfers
  if (upperMemo.includes('WIRE-IN') || upperMemo.includes('BY WIRE')) {
    // Pattern: "by Wire WIRE-IN [ID] [NAME]"
    const wireMatch = memo.match(/WIRE-IN\s+\d+\s+(.+?)$/i);
    if (wireMatch && wireMatch[1]) {
      return { name: wireMatch[1].trim(), method: 'Wire Transfer' };
    }
    return { name: 'Wire Transfer', method: 'Wire Transfer' };
  }

  // PRIORITY 4: Cash deposits
  if (upperDesc.includes('CASH DEPOSIT')) {
    return { name: 'Cash Deposit', method: 'deposit' };
  }

  // PRIORITY 5: ATM deposits
  if (upperDesc.includes('ATM DEPOSIT')) {
    // Extract location from memo if available
    const atmLocation = memo.trim() || 'ATM Deposit';
    return { name: atmLocation, method: 'deposit' };
  }

  // PRIORITY 6: ACH deposits (generic)
  if (upperDesc.includes('ACH DEPOSIT')) {
    const depositor = memo.trim() || 'ACH Deposit';
    return { name: depositor, method: 'deposit' };
  }

  // PRIORITY 7: Online Transfer (generic fallback)
  if (upperDesc.includes('ONLINE TRANSFER')) {
    const depositor = memo.trim() || description.trim() || 'Online Transfer';
    return { name: depositor, method: 'deposit' };
  }

  return null;
}

/**
 * Parses a single Delta Credit Union CSV row into a transaction
 *
 * @param row - Parsed CSV row object
 * @param fileName - Original CSV file name for source tracking
 * @param accountNumber - Account number (last 4 digits)
 * @returns Parsed transaction or null if invalid
 */
export function parseDeltaRow(
  row: any,
  fileName: string,
  accountNumber: string
): InsertTransaction | null {
  const description = row['Description'] || '';
  const memo = row['Memo'] || '';
  const dateStr = row['Date'];

  // Delta has separate debit/credit columns
  const debit = row['Amount Debit'] || '';
  const credit = row['Amount Credit'] || '';

  // Use credit for deposits (positive), debit for outgoing (negative)
  let amount: string;
  if (credit && credit.trim() !== '') {
    amount = credit;
  } else if (debit && debit.trim() !== '') {
    // Negate debit amounts
    const debitValue = parseFloat(debit.replace(/[^0-9.-]/g, ''));
    amount = (-Math.abs(debitValue)).toString();
  } else {
    // No amount, skip this row
    return null;
  }

  let paymentMethod: string;
  let depositor: string | null;

  const parsed = parseDeltaMemo(memo, description);
  if (parsed) {
    paymentMethod = parsed.method;
    depositor = parsed.name;
  } else {
    // Fallback: use description as depositor
    paymentMethod = 'deposit';
    depositor = description.trim() || 'deposito';
  }

  if (!dateStr) {
    return null;
  }

  const parsedDate = parseDate(dateStr);
  if (!parsedDate) {
    return null;
  }

  const transaction: InsertTransaction = {
    date: parsedDate,
    value: normalizeNumericValue(amount),
    depositor,
    payment_method: paymentMethod,
    historical_text: JSON.stringify(row),
    source: `Bank: Delta Credit Union - Account: ${accountNumber} - CSV: ${fileName}`,
    status: 'pending-statement',
    confidence: 0,
  };

  return isValidTransaction(transaction) ? transaction : null;
}

/**
 * Parses a Delta Credit Union CSV file into an array of transactions
 *
 * Handles Delta's unique format:
 * - First 3 lines are metadata (account info, date range)
 * - Line 4 is headers
 * - Two amount columns: "Amount Debit" and "Amount Credit"
 *
 * @param file - CSV file to parse
 * @returns Promise resolving to array of transactions
 */
export async function parseDeltaCSV(file: File): Promise<InsertTransaction[]> {
  return new Promise((resolve, reject) => {
    console.log('[BANK PARSER] Starting Delta Credit Union CSV parse');

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n');

        // Extract account number from line 2
        let accountNumber = 'XXXX'; // default
        if (lines[1]) {
          const match = lines[1].match(/Account Number\s*:\s*(\w+)/i);
          if (match && match[1]) {
            const fullAccountNumber = match[1];
            accountNumber = fullAccountNumber.slice(-4); // Last 4 digits
            console.log('[BANK PARSER] Extracted account number (last 4):', accountNumber);
          }
        }

        // Skip first 3 metadata lines, keep header (line 4) and data
        const csvWithoutMetadata = lines.slice(3).join('\n');

        // Now parse with PapaParse
        Papa.parse(csvWithoutMetadata, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            try {
              const transactions: InsertTransaction[] = [];
              let rowsProcessed = 0;
              let rowsSkipped = 0;

              for (const row of results.data as any[]) {
                rowsProcessed++;

                if (!isDeltaFormat(row)) {
                  console.warn('[BANK PARSER] Row does not match Delta format, skipping:', row);
                  rowsSkipped++;
                  continue;
                }

                const transaction = parseDeltaRow(row, file.name, accountNumber);

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
      } catch (error) {
        console.error('[BANK PARSER] Error reading file:', error);
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}

/**
 * Auto-detects bank format and parses accordingly
 *
 * This is the generic entry point that automatically detects whether
 * a CSV is from Wells Fargo or Delta Credit Union and routes to the
 * appropriate parser.
 *
 * @param file - CSV file to parse
 * @returns Promise resolving to transactions and detected bank type
 */
export async function parseBankStatementCSV(
  file: File
): Promise<{ transactions: InsertTransaction[]; bankType: 'wells_fargo' | 'delta' }> {
  return new Promise((resolve, reject) => {
    console.log('[BANK PARSER] Auto-detecting bank statement format');

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n');

        // Check for Delta metadata pattern in first 3 lines
        const hasDeltaMetadata =
          lines[0]?.includes('Account Name') &&
          lines[1]?.includes('Account Number') &&
          lines[2]?.includes('Date Range');

        if (hasDeltaMetadata) {
          console.log('[BANK PARSER] Detected Delta Credit Union format');
          const transactions = await parseDeltaCSV(file);
          resolve({ transactions, bankType: 'delta' });
          return;
        }

        // Otherwise, try Wells Fargo
        console.log('[BANK PARSER] Defaulting to Wells Fargo format');
        const transactions = await parseWellsFargoCSV(file);
        resolve({ transactions, bankType: 'wells_fargo' });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}
