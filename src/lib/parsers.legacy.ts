import Papa from 'papaparse';
import type { InsertTransaction } from './database.types';

function normalizeNumericValue(value: string): string {
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

export async function parseCSV(
  file: File
): Promise<InsertTransaction[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const transactions: InsertTransaction[] = [];

          for (const row of results.data as any[]) {
            let source = `CSV: ${file.name}`;
            let paymentMethod = '';
            let depositor: string | null = null;
            let value: string;
            let dateStr: string;

            if (row['Depositor Name'] || row['depositor_name'] || row['Description']) {
              source = `Wells Fargo CSV: ${file.name}`;

              const description = row['Description'] || row['description'] || '';
              const parsed = parseWellsFargoDescription(description);

              if (parsed) {
                paymentMethod = parsed.method;
                depositor = parsed.name;
              } else {
                paymentMethod = 'Zelle';
                depositor = row['Depositor Name'] || row['depositor_name'] || null;
              }

              value = row['Amount'] || row['amount'];
              dateStr = row['Date'] || row['date'];
            } else if (row['Card Type'] || row['card_type'] || row['Card Brand'] || row['card_brand']) {
              source = `Stripe CSV: ${file.name}`;
              paymentMethod = 'Credit Card';

              value = row['Amount'] || row['amount'] || row['Amount (USD)'];
              dateStr = row['Created (UTC)'] || row['created'] || row['Date'] || row['date'];

              const customerName = row['Customer Description'] || row['customer_description'] ||
                                   row['Customer Name'] || row['customer_name'] ||
                                   row['Description'] || row['description'];
              depositor = customerName || null;
            } else {
              value = row['Amount'] || row['amount'] || row['Value'] || row['value'];
              dateStr = row['Date'] || row['date'];
              depositor = row['Name'] || row['name'] || null;
            }

            if (!dateStr || !value) continue;

            const date = new Date(dateStr);
            if (isNaN(date.getTime())) continue;

            transactions.push({
              date: date.toISOString(),
              value: normalizeNumericValue(value),
              depositor,
              payment_method: paymentMethod || null,
              historical_text: JSON.stringify(row),
              source,
              status: 'pending-statement',
              confidence: 0,
            });
          }

          resolve(transactions);
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => reject(error),
    });
  });
}

export function detectDuplicates(
  newTransactions: InsertTransaction[],
  existingTransactions: { date: string; value: string | number; depositor: string | null; payment_method: string | null; source: string; name?: string | null; car?: string | null }[]
): InsertTransaction[] {
  const existingKeys = new Set<string>();
  const newKeys = new Set<string>();
  const internalDuplicates = new Map<string, number>();

  console.log('[DUPLICATE CHECK START]');
  console.log(`Total new transactions to check: ${newTransactions.length}`);
  console.log(`Total existing transactions in DB: ${existingTransactions.length}`);

  for (const existing of existingTransactions) {
    const date = new Date(existing.date);
    const dateStr = date.toISOString().split('T')[0];
    const valueStr = typeof existing.value === 'string' ? existing.value : existing.value.toString();
    const valueNum = Math.abs(parseFloat(normalizeNumericValue(valueStr))).toFixed(2);
    const name = (existing.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const depositor = (existing.depositor || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const car = (existing.car || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const paymentMethod = (existing.payment_method || '').trim().toLowerCase().replace(/\s+/g, ' ');

    const key = `${dateStr}|${valueNum}|${name}|${depositor}|${car}|${paymentMethod}`;
    existingKeys.add(key);
  }

  for (const newTrans of newTransactions) {
    const date = new Date(newTrans.date);
    const dateStr = date.toISOString().split('T')[0];
    const valueStr = typeof newTrans.value === 'string' ? newTrans.value : newTrans.value.toString();
    const valueNum = Math.abs(parseFloat(normalizeNumericValue(valueStr))).toFixed(2);
    const name = ((newTrans as any).name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const depositor = (newTrans.depositor || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const car = ((newTrans as any).car || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const paymentMethod = (newTrans.payment_method || '').trim().toLowerCase().replace(/\s+/g, ' ');

    const key = `${dateStr}|${valueNum}|${name}|${depositor}|${car}|${paymentMethod}`;

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
    const date = new Date(newTrans.date);
    const dateStr = date.toISOString().split('T')[0];
    const valueStr = typeof newTrans.value === 'string' ? newTrans.value : newTrans.value.toString();
    const valueNum = Math.abs(parseFloat(normalizeNumericValue(valueStr))).toFixed(2);
    const name = ((newTrans as any).name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const depositor = (newTrans.depositor || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const car = ((newTrans as any).car || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const paymentMethod = (newTrans.payment_method || '').trim().toLowerCase().replace(/\s+/g, ' ');

    const key = `${dateStr}|${valueNum}|${name}|${depositor}|${car}|${paymentMethod}`;

    if (existingKeys.has(key)) {
      console.log('Duplicate with DB detected:', { dateStr, valueNum, name, depositor, car, paymentMethod });
      return false;
    }

    if (seenInCurrentBatch.has(key)) {
      console.log('Internal duplicate detected (same batch):', { dateStr, valueNum, name, depositor, car, paymentMethod });
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
