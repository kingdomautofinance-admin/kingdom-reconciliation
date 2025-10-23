/**
 * CSV Parsers Module Index
 *
 * This file provides the main exports for the CSV parsing functionality.
 * It separates bank and card import logic into independent modules.
 *
 * ARCHITECTURE:
 * - shared-utils.ts: Common utilities used by both parsers
 * - bank-parser.ts: Wells Fargo bank statement parsing
 * - card-parser.ts: Stripe card transaction parsing
 *
 * USAGE:
 * Import only what you need to keep modules independent:
 *
 * For bank imports:
 *   import { parseWellsFargoCSV, detectDuplicates } from '@/lib/parsers';
 *
 * For card imports:
 *   import { parseStripeCSV, detectDuplicates } from '@/lib/parsers';
 */

export {
  normalizeNumericValue,
  parseDate,
  isValidTransaction,
  createDuplicateKey,
  detectDuplicates,
} from './shared-utils';

export {
  parseWellsFargoDescription,
  isWellsFargoFormat,
  parseWellsFargoRow,
  parseWellsFargoCSV,
} from './bank-parser';

export {
  isStripeFormat,
  parseStripeRow,
  parseStripeCSV,
  validateStripeCSV,
} from './card-parser';

/**
 * Legacy parseCSV function for backward compatibility
 * @deprecated Use parseWellsFargoCSV or parseStripeCSV directly
 */
export async function parseCSV(file: File) {
  console.warn('[DEPRECATED] parseCSV is deprecated. Use parseWellsFargoCSV or parseStripeCSV directly.');

  const { parseWellsFargoCSV } = await import('./bank-parser');
  const { parseStripeCSV } = await import('./card-parser');

  try {
    const Papa = (await import('papaparse')).default;

    return new Promise<any[]>((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        preview: 1,
        complete: async (results) => {
          if (results.data.length === 0) {
            resolve([]);
            return;
          }

          const firstRow = results.data[0] as any;
          const { isWellsFargoFormat } = await import('./bank-parser');
          const { isStripeFormat } = await import('./card-parser');

          if (isWellsFargoFormat(firstRow)) {
            console.log('[PARSER] Auto-detected Wells Fargo format');
            const transactions = await parseWellsFargoCSV(file);
            resolve(transactions);
          } else if (isStripeFormat(firstRow)) {
            console.log('[PARSER] Auto-detected Stripe format');
            const transactions = await parseStripeCSV(file);
            resolve(transactions);
          } else {
            console.warn('[PARSER] Unknown format, attempting generic parse');
            reject(new Error('Unrecognized CSV format. Please use specific parser.'));
          }
        },
        error: reject,
      });
    });
  } catch (error) {
    throw error;
  }
}
