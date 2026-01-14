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
      dealer_receivable_changes: {
        Row: {
          id: string
          receivable_id: string
          changed_at: string
          field_diffs: Json
          import_id: string | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          receivable_id: string
          changed_at?: string
          field_diffs?: Json
          import_id?: string | null
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          receivable_id?: string
          changed_at?: string
          field_diffs?: Json
          import_id?: string | null
          note?: string | null
          created_at?: string
        }
      }
      dealer_receivable_matches: {
        Row: {
          id: string
          receivable_id: string
          transaction_id: string
          matched_amount: string
          match_type: string
          created_at: string
        }
        Insert: {
          id?: string
          receivable_id: string
          transaction_id: string
          matched_amount: string
          match_type: string
          created_at?: string
        }
        Update: {
          id?: string
          receivable_id?: string
          transaction_id?: string
          matched_amount?: string
          match_type?: string
          created_at?: string
        }
      }
      dealer_receivables: {
        Row: {
          id: string
          loan_id: string
          date: string
          amount: string
          car: string | null
          client: string | null
          depositor: string | null
          method: string | null
          dealership: string | null
          status: string
          received_at: string | null
          manual_override_note: string | null
          manual_override_at: string | null
          sheet_order: number | null
          source_sheet_tab: string | null
          duplicate_check_hash: string | null
          row_fingerprint: string | null
          is_deleted: boolean
          deleted_reason: string | null
          previous_status: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          loan_id: string
          date: string
          amount: string
          car?: string | null
          client?: string | null
          depositor?: string | null
          method?: string | null
          dealership?: string | null
          status?: string
          received_at?: string | null
          manual_override_note?: string | null
          manual_override_at?: string | null
          sheet_order?: number | null
          source_sheet_tab?: string | null
          duplicate_check_hash?: string | null
          row_fingerprint?: string | null
          is_deleted?: boolean
          deleted_reason?: string | null
          previous_status?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          loan_id?: string
          date?: string
          amount?: string
          car?: string | null
          client?: string | null
          depositor?: string | null
          method?: string | null
          dealership?: string | null
          status?: string
          received_at?: string | null
          manual_override_note?: string | null
          manual_override_at?: string | null
          sheet_order?: number | null
          source_sheet_tab?: string | null
          duplicate_check_hash?: string | null
          row_fingerprint?: string | null
          is_deleted?: boolean
          deleted_reason?: string | null
          previous_status?: string | null
          created_at?: string
          updated_at?: string
        }
      }
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
          filter_start_date: string | null
          filter_end_date: string | null
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
          filter_start_date?: string | null
          filter_end_date?: string | null
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
          filter_start_date?: string | null
          filter_end_date?: string | null
          created_at?: string
        }
      }
      kingdom_transactions: {
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
          duplicate_check_hash?: string | null
          created_at?: string
        }
      }
      reconciliation_links: {
        Row: {
          id: string
          ledger_id: string
          target_id: string
          type: string
          gap_amount: string
          confidence_score: number
          is_confirmed: boolean
          created_at: string
        }
        Insert: {
          id?: string
          ledger_id: string
          target_id: string
          type: string
          gap_amount?: string
          confidence_score?: number
          is_confirmed?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          ledger_id?: string
          target_id?: string
          type?: string
          gap_amount?: string
          confidence_score?: number
          is_confirmed?: boolean
          created_at?: string
        }
      }
      reconciliation_settings: {
        Row: {
          id: string
          accuracy_threshold: string
          stripe_fee_percent: string
          stripe_fixed_fee: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          accuracy_threshold?: string
          stripe_fee_percent?: string
          stripe_fixed_fee?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          accuracy_threshold?: string
          stripe_fee_percent?: string
          stripe_fixed_fee?: string
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
          is_deleted: boolean
          deleted_reason: string | null
          previous_status: string | null
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
          is_deleted?: boolean
          deleted_reason?: string | null
          previous_status?: string | null
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
          is_deleted?: boolean
          deleted_reason?: string | null
          previous_status?: string | null
          created_at?: string
        }
      }
    }
  }
}

export type ImportHistory = Database['public']['Tables']['import_history']['Row'];
export type InsertImportHistory = Database['public']['Tables']['import_history']['Insert'];
export type UpdateImportHistory = Database['public']['Tables']['import_history']['Update'];

export type DealerReceivable = Database['public']['Tables']['dealer_receivables']['Row'];
export type InsertDealerReceivable = Database['public']['Tables']['dealer_receivables']['Insert'];
export type UpdateDealerReceivable = Database['public']['Tables']['dealer_receivables']['Update'];

export type DealerReceivableMatch = Database['public']['Tables']['dealer_receivable_matches']['Row'];
export type InsertDealerReceivableMatch = Database['public']['Tables']['dealer_receivable_matches']['Insert'];
export type UpdateDealerReceivableMatch = Database['public']['Tables']['dealer_receivable_matches']['Update'];

export type DealerReceivableChange = Database['public']['Tables']['dealer_receivable_changes']['Row'];
export type InsertDealerReceivableChange = Database['public']['Tables']['dealer_receivable_changes']['Insert'];
export type UpdateDealerReceivableChange = Database['public']['Tables']['dealer_receivable_changes']['Update'];

export type SheetConnection = Database['public']['Tables']['sheet_connections']['Row'];
export type InsertSheetConnection = Database['public']['Tables']['sheet_connections']['Insert'];
export type UpdateSheetConnection = Database['public']['Tables']['sheet_connections']['Update'];

export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type InsertTransaction = Database['public']['Tables']['transactions']['Insert'];
export type UpdateTransaction = Database['public']['Tables']['transactions']['Update'];

export type UnreconcileHistory = Database['public']['Tables']['unreconcile_history']['Row'];
export type InsertUnreconcileHistory = Database['public']['Tables']['unreconcile_history']['Insert'];
export type UpdateUnreconcileHistory = Database['public']['Tables']['unreconcile_history']['Update'];

export type ReconciliationLink = Database['public']['Tables']['reconciliation_links']['Row'];
export type InsertReconciliationLink = Database['public']['Tables']['reconciliation_links']['Insert'];
export type UpdateReconciliationLink = Database['public']['Tables']['reconciliation_links']['Update'];

export type ReconciliationSettings = Database['public']['Tables']['reconciliation_settings']['Row'];
export type InsertReconciliationSettings = Database['public']['Tables']['reconciliation_settings']['Insert'];
export type UpdateReconciliationSettings = Database['public']['Tables']['reconciliation_settings']['Update'];

export type KingdomTransaction = Database['public']['Tables']['kingdom_transactions']['Row'];
export type InsertKingdomTransaction = Database['public']['Tables']['kingdom_transactions']['Insert'];
export type UpdateKingdomTransaction = Database['public']['Tables']['kingdom_transactions']['Update'];

export type ReconciliationStatus = 'reconciled' | 'pending-ledger' | 'pending-statement';
