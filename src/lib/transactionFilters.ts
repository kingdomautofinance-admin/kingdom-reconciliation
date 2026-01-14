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

export const STANDARD_PAYMENT_METHODS = [
  'Cash',
  'Credit Card',
  'Deposit',
  'Zelle',
  'Other',
  'Wire Transfer',
  'Stripe receipt',
  'Debt',
];

export async function fetchPaymentMethods(): Promise<string[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('payment_method')
    .not('payment_method', 'is', null)
    .order('payment_method');
  
  if (error) throw error;
  
  // Get unique payment methods
  const dbMethods = [...new Set(data.map(t => t.payment_method).filter(Boolean))] as string[];
  
  // Combine with standard methods
  return [
    ...STANDARD_PAYMENT_METHODS,
    ...dbMethods.filter(method => !STANDARD_PAYMENT_METHODS.includes(method))
  ];
}
