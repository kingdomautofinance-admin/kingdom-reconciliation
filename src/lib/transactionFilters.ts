import { supabase } from './supabase';

export const SERVICE_ACCOUNT_SOURCE = 'Google Sheets (Service Account)';

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

  const serviceAccountDate = serviceAccountRows?.[0]?.date ?? null;
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

  return fallbackRows?.[0]?.date ?? null;
}
