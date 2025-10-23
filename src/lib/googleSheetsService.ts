import { supabase } from './supabase';

interface FetchSheetsParams {
  spreadsheetId: string;
  serviceAccountEmail?: string;
  serviceAccountKey?: string;
}

interface SheetData {
  values: string[][];
}

export async function fetchSpreadsheetWithServiceAccount(
  params: FetchSheetsParams
): Promise<string[][]> {
  const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-google-sheets`;

  const headers = {
    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch spreadsheet');
  }

  const data: SheetData = await response.json();
  return data.values || [];
}

export async function getStoredServiceAccountCredentials(): Promise<{
  email: string | null;
  key: string | null;
} | null> {
  // Get the most recent connection with credentials
  const { data, error } = await supabase
    .from('sheet_connections')
    .select('service_account_email, service_account_key')
    .not('service_account_email', 'is', null)
    .not('service_account_key', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching credentials:', error);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    email: data.service_account_email,
    key: data.service_account_key,
  };
}

export async function saveServiceAccountCredentials(
  email: string,
  key: string
): Promise<void> {
  // Get the most recent connection
  const { data: existing } = await supabase
    .from('sheet_connections')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('sheet_connections')
      .update({
        service_account_email: email,
        service_account_key: key,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('sheet_connections')
      .insert({
        service_account_email: email,
        service_account_key: key,
        spreadsheet_id: '',
        spreadsheet_url: '',
        is_active: false,
      });

    if (error) throw error;
  }
}
