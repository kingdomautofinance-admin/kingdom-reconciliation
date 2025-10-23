/**
 * Stripe Card CSV Parser
 *
 * This module handles parsing of Stripe payment exports (CSV format).
 * It's specifically designed for credit/debit card transactions.
 *
 * IMPORTANT: This parser is independent from bank parsing and should NOT
 * be modified when making changes to bank import functionality.
 *
 * Supported formats:
 * - Stripe Payments Export (standard format)
 * - Stripe Balance Report (alternative format)
 *
 * Expected CSV columns (flexible):
 * - Created (UTC) or created or Date or date
 * - Amount or amount or Amount (USD)
 * - Card Type or card_type or Card Brand or card_brand
 * - Customer Description or customer_description or Customer Name or customer_name
 * - Description or description (fallback for customer info)
 *
 * Debugging features:
 * - Detailed console logging for troubleshooting
 * - Format detection with fallback options
 * - Row-by-row validation with skip tracking
 */

import Papa from 'papaparse';
import type { InsertTransaction } from '../database.types';
import { normalizeNumericValue, parseDate, isValidTransaction } from './shared-utils';

/**
 * Detects if a CSV row is from Stripe format
 *
 * Checks for card-specific fields that indicate Stripe export
 * Now supports multiple Stripe export formats:
 * - Stripe Payments Export
 * - Stripe Balance Transactions
 * - Stripe Charges Export
 * - Custom Stripe Reports
 *
 * @param row - Parsed CSV row object
 * @returns true if Stripe format detected
 */
export function isStripeFormat(row: any): boolean {
  // Check for card-related fields
  const hasCardField = !!(
    row['Card Type'] ||
    row['card_type'] ||
    row['Card Brand'] ||
    row['card_brand']
  );

  // Check for Stripe-specific ID patterns (charges, payment intents, etc.)
  const hasStripeId = !!(
    (row['id'] && typeof row['id'] === 'string' && (
      row['id'].startsWith('ch_') ||
      row['id'].startsWith('pi_') ||
      row['id'].startsWith('py_')
    ))
  );

  // Check for payment-related fields with amount
  const hasPaymentFields = !!(
    (row['id'] || row['payment_intent'] || row['charge_id']) &&
    (row['Amount'] || row['amount'] || row['Amount (USD)'] || row['Net'])
  );

  // Check for customer-related Stripe fields
  const hasCustomerFields = !!(
    row['Customer Description'] ||
    row['customer_description'] ||
    row['Customer Email'] ||
    row['customer_email']
  );

  // Check for Stripe date formats
  const hasStripeDateFormat = !!(
    row['Created (UTC)'] ||
    row['created'] ||
    (row['Created'] && row['Amount'])
  );

  return hasCardField || hasStripeId || hasPaymentFields || hasCustomerFields || hasStripeDateFormat;
}

/**
 * Extracts the amount value from various Stripe CSV formats
 *
 * Stripe exports can have different column names depending on export type:
 * - Payments export: "Amount"
 * - Balance report: "Net"
 * - Charges export: "Amount" or "Amount (USD)"
 * - Custom reports: Various formats
 *
 * @param row - Parsed CSV row object
 * @returns Amount string or null
 */
function extractStripeAmount(row: any): string | null {
  return (
    row['Amount'] ||
    row['amount'] ||
    row['Amount (USD)'] ||
    row['amount_usd'] ||
    row['Net'] ||
    row['net'] ||
    row['Gross'] ||
    row['gross'] ||
    row['Total'] ||
    row['total'] ||
    null
  );
}

/**
 * Extracts the date value from various Stripe CSV formats
 *
 * Supports multiple date column formats across different Stripe exports
 *
 * @param row - Parsed CSV row object
 * @returns Date string or null
 */
function extractStripeDate(row: any): string | null {
  return (
    row['Created (UTC)'] ||
    row['created'] ||
    row['Created'] ||
    row['Date'] ||
    row['date'] ||
    row['created_utc'] ||
    row['Transaction Date'] ||
    row['transaction_date'] ||
    row['Available On'] ||
    row['available_on'] ||
    null
  );
}

/**
 * Extracts customer name from various Stripe CSV formats
 *
 * Tries multiple fields to identify the customer/payer
 *
 * @param row - Parsed CSV row object
 * @returns Customer name or null
 */
function extractStripeCustomerName(row: any): string | null {
  return (
    row['Customer Description'] ||
    row['customer_description'] ||
    row['Customer Name'] ||
    row['customer_name'] ||
    row['Customer Email'] ||
    row['customer_email'] ||
    row['Description'] ||
    row['description'] ||
    row['Statement Descriptor'] ||
    row['statement_descriptor'] ||
    row['Customer'] ||
    row['customer'] ||
    null
  );
}

/**
 * Parses a single Stripe CSV row into a transaction
 *
 * Uses column position indexing:
 * - Column B (index 1): Date
 * - Column C (index 2): Value
 * - Column F (index 5): True/False filter
 *
 * @param rowArray - Array of values from CSV row
 * @param fileName - Original CSV file name for source tracking
 * @returns Parsed transaction or null if invalid
 */
export function parseStripeRow(rowArray: any[], fileName: string): InsertTransaction | null {
  console.log('[CARD PARSER] Processing row array:', rowArray);

  // Column F (index 5) - Filter: only process if "true"
  const filterValue = rowArray[5];
  const shouldImport = filterValue?.toString().toLowerCase() === 'true';

  if (!shouldImport) {
    console.log('[CARD PARSER] Skipping row - Column F is not true:', filterValue);
    return null;
  }

  // Column B (index 1) - Date
  const dateStr = rowArray[1];
  if (!dateStr) {
    console.warn('[CARD PARSER] Missing date in column B');
    return null;
  }

  // Column C (index 2) - Value
  const value = rowArray[2];
  if (!value) {
    console.warn('[CARD PARSER] Missing value in column C');
    return null;
  }

  const parsedDate = parseDate(dateStr);
  if (!parsedDate) {
    console.warn('[CARD PARSER] Invalid date format:', dateStr);
    return null;
  }

  const normalizedValue = normalizeNumericValue(value);
  if (normalizedValue === '0') {
    console.warn('[CARD PARSER] Zero or invalid amount:', value);
    return null;
  }

  const transaction: InsertTransaction = {
    date: parsedDate,
    value: normalizedValue,
    depositor: null, // Leave name blank as requested
    payment_method: 'Credit Card',
    historical_text: JSON.stringify(rowArray),
    source: `Stripe CSV: ${fileName}`,
    status: 'pending-statement',
    confidence: 0,
  };

  console.log('[CARD PARSER] Transaction created:', {
    date: transaction.date,
    value: transaction.value,
    columnF: filterValue,
  });

  return isValidTransaction(transaction) ? transaction : null;
}

/**
 * Parses a Stripe CSV file into an array of transactions
 *
 * This is the main entry point for Stripe card import.
 * Use this function when you want to import only card transactions.
 *
 * Features:
 * - Detailed logging for debugging
 * - Format validation
 * - Row-by-row error handling
 * - Skip tracking
 *
 * @param file - CSV file to parse
 * @returns Promise resolving to array of transactions
 */
export async function parseStripeCSV(file: File): Promise<InsertTransaction[]> {
  return new Promise((resolve, reject) => {
    console.log('[CARD PARSER] Starting Stripe CSV parse');
    console.log('[CARD PARSER] File name:', file.name);
    console.log('[CARD PARSER] File size:', file.size, 'bytes');

    Papa.parse(file, {
      header: false, // Parse as array to access by column index
      skipEmptyLines: true,
      complete: (results) => {
        try {
          console.log('[CARD PARSER] Papa Parse complete');
          console.log('[CARD PARSER] Total rows:', results.data.length);

          const transactions: InsertTransaction[] = [];
          let rowsProcessed = 0;
          let rowsSkipped = 0;
          let filteredOut = 0;
          const skipReasons: Record<string, number> = {
            'filtered_column_f': 0,
            'missing_date': 0,
            'missing_amount': 0,
            'invalid_date': 0,
            'zero_amount': 0,
            'validation_failed': 0,
          };

          // Skip header row (first row)
          const dataRows = results.data.slice(1) as any[][];

          for (const rowArray of dataRows) {
            rowsProcessed++;

            // Skip empty rows
            if (!rowArray || rowArray.length === 0) {
              rowsSkipped++;
              continue;
            }

            const transaction = parseStripeRow(rowArray, file.name);

            if (transaction) {
              transactions.push(transaction);
            } else {
              rowsSkipped++;
              // Check if it was filtered by column F
              const filterValue = rowArray[5];
              if (filterValue?.toString().toLowerCase() !== 'true') {
                skipReasons['filtered_column_f']++;
                filteredOut++;
              }
            }
          }

          console.log('[CARD PARSER] ========== PARSE COMPLETE ==========');
          console.log(`[CARD PARSER] Processed: ${rowsProcessed} rows`);
          console.log(`[CARD PARSER] Valid transactions: ${transactions.length}`);
          console.log(`[CARD PARSER] Filtered out (Column F = false): ${filteredOut}`);
          console.log(`[CARD PARSER] Skipped (other reasons): ${rowsSkipped - filteredOut}`);
          console.log('[CARD PARSER] Skip reasons:', skipReasons);
          console.log('[CARD PARSER] =====================================');

          resolve(transactions);
        } catch (error) {
          console.error('[CARD PARSER] Error during parsing:', error);
          reject(error);
        }
      },
      error: (error) => {
        console.error('[CARD PARSER] Papa Parse error:', error);
        reject(error);
      },
    });
  });
}

/**
 * Validates a Stripe CSV file before parsing
 *
 * Can be used to show user-friendly error messages before attempting import
 *
 * @param file - CSV file to validate
 * @returns Promise resolving to validation result
 */
export async function validateStripeCSV(file: File): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  return new Promise((resolve) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!file.name.toLowerCase().endsWith('.csv')) {
      errors.push('File must be a CSV file');
    }

    if (file.size === 0) {
      errors.push('File is empty');
    }

    if (file.size > 10 * 1024 * 1024) {
      warnings.push('File is larger than 10MB, import may take longer');
    }

    Papa.parse(file, {
      header: true,
      preview: 5,
      complete: (results) => {
        if (!results.meta.fields || results.meta.fields.length === 0) {
          errors.push('No headers found in CSV');
          resolve({ valid: false, errors, warnings });
          return;
        }

        // Check for Stripe-specific fields (more flexible detection)
        const stripeIndicators = [
          // Payment/Card fields
          'Card Type', 'card_type', 'Card Brand', 'card_brand',
          // Date fields
          'Created (UTC)', 'created', 'Created',
          // Stripe-specific IDs
          'id', 'payment_intent', 'charge_id',
          // Amount fields specific to Stripe
          'Amount', 'amount', 'Amount (USD)',
          // Customer fields
          'Customer Description', 'customer_description', 'Customer Email', 'customer_email'
        ];

        const hasStripeFields = results.meta.fields.some(field =>
          stripeIndicators.includes(field)
        );

        // Check if it has typical payment CSV structure
        const hasAmount = results.meta.fields.some(f =>
          ['Amount', 'amount', 'Amount (USD)', 'Net', 'net'].includes(f)
        );
        const hasDate = results.meta.fields.some(f =>
          ['Date', 'date', 'Created', 'created', 'Created (UTC)', 'created_utc'].includes(f)
        );

        // Only warn if it doesn't look like Stripe OR a payment CSV at all
        if (!hasStripeFields && !(hasAmount && hasDate)) {
          warnings.push('CSV may not be a Stripe export - expected fields not found');
        }

        if (results.data.length === 0) {
          errors.push('No data rows found in CSV');
        }

        resolve({
          valid: errors.length === 0,
          errors,
          warnings,
        });
      },
      error: (error) => {
        errors.push(`Failed to parse CSV: ${error.message}`);
        resolve({ valid: false, errors, warnings });
      },
    });
  });
}
