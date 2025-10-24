import { supabase } from './supabase';

export const SERVICE_ACCOUNT_SOURCE = 'Google Sheets (Service Account)';

function normalizeDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const isoSegment = date.split('T')[0];
  return isoSegment || null;
}

export async function fetchPreferredMinTransactionDate(): Promise<string | null> {
  const { data: serviceAccountRows, error: serviceAccountError } = await supabase
    .from('transactions')
    .select('date')
    .eq('source', SERVICE_ACCOUNT_SOURCE)
    .order('date', { ascending: true })
    .limit(1);

  if (serviceAccountError) {
    throw serviceAccountError;
  }

  const serviceAccountDate = normalizeDate(serviceAccountRows?.[0]?.date);
  if (serviceAccountDate) {
    return serviceAccountDate;
  }

  const { data: fallbackRows, error: fallbackError } = await supabase
    .from('transactions')
    .select('date')
    .order('date', { ascending: true })
    .limit(1);

  if (fallbackError) {
    throw fallbackError;
  }

  return normalizeDate(fallbackRows?.[0]?.date);
}
