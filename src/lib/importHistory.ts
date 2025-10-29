import { supabase } from '@/lib/supabase';
import type {
  ImportHistory,
  InsertImportHistory,
  UpdateImportHistory,
} from '@/lib/database.types';

export const IMPORT_SOURCE_IDS = {
  bank: 'bank_wells_fargo',
  card: 'card_stripe',
  kingdom: 'kingdom_system',
} as const;

type StartOptions = {
  spreadsheetName?: string | null;
  initialValues?: Partial<Omit<InsertImportHistory, 'spreadsheet_id'>>;
};

export async function startImportHistory(
  spreadsheetId: string,
  { spreadsheetName = null, initialValues }: StartOptions = {}
): Promise<ImportHistory | null> {
  try {
    const payload: InsertImportHistory = {
      spreadsheet_id: spreadsheetId,
      spreadsheet_name: spreadsheetName,
      status: 'in_progress',
      import_started_at: new Date().toISOString(),
      ...initialValues,
    };

    const { data, error } = await supabase
      .from('import_history')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Failed to create import history record:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Unexpected error creating import history record:', error);
    return null;
  }
}

export async function updateImportHistory(
  recordId: string,
  updates: UpdateImportHistory
) {
  try {
    const { error } = await supabase
      .from('import_history')
      .update({
        import_completed_at: new Date().toISOString(),
        ...updates,
      })
      .eq('id', recordId);

    if (error) {
      console.error('Failed to update import history record:', error);
    }
  } catch (error) {
    console.error('Unexpected error updating import history record:', error);
  }
}

