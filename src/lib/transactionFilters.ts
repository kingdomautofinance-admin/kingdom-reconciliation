import { supabase } from './supabase';

export const SERVICE_ACCOUNT_SOURCE = 'Google Sheets (Service Account)';

export interface DateRange {
  min: string | null;
  max: string | null;
}

function normalizeDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const isoSegment = date.split('T')[0];
  return isoSegment || null;
}

async function fetchDateRange(source?: string): Promise<DateRange> {
  let minQuery = supabase.from('transactions').select('date');
  let maxQuery = supabase.from('transactions').select('date');

  if (source) {
    minQuery = minQuery.eq('source', source);
    maxQuery = maxQuery.eq('source', source);
  }

  const [{ data: minData, error: minError }, { data: maxData, error: maxError }] = await Promise.all([
    minQuery.order('date', { ascending: true }).limit(1),
    maxQuery.order('date', { ascending: false }).limit(1),
  ]);

  if (minError) throw minError;
  if (maxError) throw maxError;

  return {
    min: normalizeDate(minData?.[0]?.date),
    max: normalizeDate(maxData?.[0]?.date),
  };
}

export async function fetchPreferredDateRange(): Promise<DateRange> {
  const serviceAccountRange = await fetchDateRange(SERVICE_ACCOUNT_SOURCE);
  if (serviceAccountRange.min || serviceAccountRange.max) {
    return serviceAccountRange;
  }

  return fetchDateRange();
}
