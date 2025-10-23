export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      import_history: {
        Row: {
          id: string
          spreadsheet_id: string
          spreadsheet_name: string | null
          records_imported: number
          total_records_processed: number
          duplicates_skipped: number
          import_started_at: string
          import_completed_at: string | null
          status: string
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          spreadsheet_id: string
          spreadsheet_name?: string | null
          records_imported?: number
          total_records_processed?: number
          duplicates_skipped?: number
          import_started_at?: string
          import_completed_at?: string | null
          status?: string
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          spreadsheet_id?: string
          spreadsheet_name?: string | null
          records_imported?: number
          total_records_processed?: number
          duplicates_skipped?: number
          import_started_at?: string
          import_completed_at?: string | null
          status?: string
          error_message?: string | null
          created_at?: string
        }
      }
      sheet_connections: {
        Row: {
          id: string
          user_id: string | null
          spreadsheet_id: string
          spreadsheet_url: string
          spreadsheet_name: string | null
          access_token: string | null
          refresh_token: string | null
          token_expires_at: string | null
          is_active: boolean
          last_sync_at: string | null
          last_sync_records: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          spreadsheet_id: string
          spreadsheet_url: string
          spreadsheet_name?: string | null
          access_token?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_records?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          spreadsheet_id?: string
          spreadsheet_url?: string
          spreadsheet_name?: string | null
          access_token?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_records?: number
          created_at?: string
          updated_at?: string
        }
      }
      transactions: {
        Row: {
          id: string
          date: string
          value: string
          name: string | null
          depositor: string | null
          car: string | null
          payment_method: string | null
          historical_text: string | null
          source: string
          status: string
          confidence: number | null
          matched_transaction_id: string | null
          sheet_order: number | null
          duplicate_check_hash: string | null
          created_at: string
        }
        Insert: {
          id?: string
          date: string
          value: string
          name?: string | null
          depositor?: string | null
          car?: string | null
          payment_method?: string | null
          historical_text?: string | null
          source: string
          status?: string
          confidence?: number | null
          matched_transaction_id?: string | null
          sheet_order?: number | null
          duplicate_check_hash?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          date?: string
          value?: string
          name?: string | null
          depositor?: string | null
          car?: string | null
          payment_method?: string | null
          historical_text?: string | null
          source?: string
          status?: string
          confidence?: number | null
          matched_transaction_id?: string | null
          sheet_order?: number | null
          duplicate_check_hash?: string | null
          created_at?: string
        }
      }
    }
  }
}

export type ImportHistory = Database['public']['Tables']['import_history']['Row'];
export type InsertImportHistory = Database['public']['Tables']['import_history']['Insert'];
export type UpdateImportHistory = Database['public']['Tables']['import_history']['Update'];

export type SheetConnection = Database['public']['Tables']['sheet_connections']['Row'];
export type InsertSheetConnection = Database['public']['Tables']['sheet_connections']['Insert'];
export type UpdateSheetConnection = Database['public']['Tables']['sheet_connections']['Update'];

export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type InsertTransaction = Database['public']['Tables']['transactions']['Insert'];
export type UpdateTransaction = Database['public']['Tables']['transactions']['Update'];

export type ReconciliationStatus = 'reconciled' | 'pending-ledger' | 'pending-statement';
