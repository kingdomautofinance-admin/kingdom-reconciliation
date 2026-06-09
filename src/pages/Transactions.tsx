import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, useRef, useMemo, useEffect, type RefObject } from 'react';
import { useSearch } from 'wouter';
import { supabase } from '@/lib/supabase';
import type { Transaction } from '@/lib/database.types';
import { queryClient } from '@/lib/queryClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, CheckCircle2, Loader2, Calendar, ChevronDown, ArrowRight, X } from 'lucide-react';
import { type SortConfig } from '@/lib/sorting';
import {
  formatDate,
  formatCurrency,
  parseUSDateToISO,
  formatUSDateInput,
  formatISODateToUS,
} from '@/lib/utils';
import {
  computeReconciliationProposals,
  applyMatches,
  type MatchProposal,
  type ReconciliationProposalsResult,
} from '@/lib/reconciliation-optimized';
import { applyStatementMatch, undoStatementMatch, type MatchActor } from '@/lib/matchWriter';
import { fetchPreferredMinTransactionDate, fetchPaymentMethods } from '@/lib/transactionFilters';
import { DeleteTransactionModal } from '@/components/DeleteTransactionModal';
import { EditTransactionModal } from '@/components/EditTransactionModal';
import { UnmatchTransactionModal } from '@/components/UnmatchTransactionModal';
import { ViewMatchedModal } from '@/components/ViewMatchedModal';
import { AutoReconcileReviewModal } from '@/components/AutoReconcileReviewModal';
import { TransactionColumn, type ColumnFilters } from '@/components/transactions/TransactionColumn';
import { useToast } from '@/components/ui/toast';

type ColumnSortColumn = 'date' | 'name' | 'value';
type ViewMode = 'match' | 'reconciled' | 'deleted';

// No authenticated identity yet — Supabase Auth lands in a later phase. The match
// writer already accepts the actor, so wiring real users later is a one-line swap.
const ACTOR: MatchActor = { userId: null, userEmail: null };

export default function Transactions() {
  const { showToast } = useToast();
  const searchString = useSearch();

  const urlParams = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return {
      dateFrom: params.get('dateFrom') || '',
      dateTo: params.get('dateTo') || '',
      search: params.get('q') || '',
    };
  }, [searchString]);

  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('match');
  const [methodFilter, setMethodFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(urlParams.dateFrom);
  const [dateTo, setDateTo] = useState(urlParams.dateTo);

  // Match-mode selection (one per side) + per-side sort (reused across modes).
  const [selectedLedger, setSelectedLedger] = useState<Transaction | null>(null);
  const [selectedStatement, setSelectedStatement] = useState<Transaction | null>(null);
  const [matchNote, setMatchNote] = useState('');
  const [ledgerSort, setLedgerSort] = useState<SortConfig<ColumnSortColumn>>({ column: 'date', direction: 'desc' });
  const [statementSort, setStatementSort] = useState<SortConfig<ColumnSortColumn>>({ column: 'date', direction: 'desc' });

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalMode, setDeleteModalMode] = useState<'delete' | 'view'>('delete');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
  const [unmatchModalOpen, setUnmatchModalOpen] = useState(false);
  const [transactionToUnmatch, setTransactionToUnmatch] = useState<Transaction | null>(null);
  const [viewMatchOpen, setViewMatchOpen] = useState(false);
  const [transactionToView, setTransactionToView] = useState<Transaction | null>(null);
  const [reviewState, setReviewState] = useState<ReconciliationProposalsResult | null>(null);

  const dateFromPickerRef = useRef<HTMLInputElement>(null);
  const dateToPickerRef = useRef<HTMLInputElement>(null);
  const openDatePicker = (ref: RefObject<HTMLInputElement>) => {
    const input = ref.current;
    if (input && typeof input.showPicker === 'function') {
      input.showPicker();
    }
  };

  const normalizeDateInput = (value: string) => {
    if (!value || value.length !== 10) return undefined;
    const iso = parseUSDateToISO(value);
    return iso || undefined;
  };

  const normalizedSearchInput = useMemo(() => searchTerm.trim(), [searchTerm]);
  const pendingIsoDateFrom = useMemo(() => normalizeDateInput(dateFrom), [dateFrom]);
  const pendingIsoDateTo = useMemo(() => normalizeDateInput(dateTo), [dateTo]);

  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
  const [appliedMethodFilter, setAppliedMethodFilter] = useState('');
  const [appliedIsoDateFrom, setAppliedIsoDateFrom] = useState<string | undefined>(normalizeDateInput(urlParams.dateFrom));
  const [appliedIsoDateTo, setAppliedIsoDateTo] = useState<string | undefined>(normalizeDateInput(urlParams.dateTo));

  const filtersChanged =
    normalizedSearchInput !== appliedSearchTerm ||
    methodFilter !== appliedMethodFilter ||
    pendingIsoDateFrom !== appliedIsoDateFrom ||
    pendingIsoDateTo !== appliedIsoDateTo;

  const hasActiveFilters = filtersChanged;

  useEffect(() => {
    if (urlParams.dateFrom || urlParams.dateTo || urlParams.search) {
      setSearchTerm(urlParams.search);
      setDateFrom(urlParams.dateFrom);
      setDateTo(urlParams.dateTo);

      if (dateFromPickerRef.current) {
        dateFromPickerRef.current.value = normalizeDateInput(urlParams.dateFrom) || '';
      }
      if (dateToPickerRef.current) {
        dateToPickerRef.current.value = normalizeDateInput(urlParams.dateTo) || '';
      }

      setAppliedSearchTerm(urlParams.search.trim());
      setAppliedIsoDateFrom(normalizeDateInput(urlParams.dateFrom));
      setAppliedIsoDateTo(normalizeDateInput(urlParams.dateTo));
    }
  }, [urlParams]);

  const handleApplyFilters = () => {
    setAppliedSearchTerm(normalizedSearchInput);
    setAppliedMethodFilter(methodFilter);
    setAppliedIsoDateFrom(pendingIsoDateFrom);
    setAppliedIsoDateTo(pendingIsoDateTo);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setMethodFilter('');
    setDateFrom('');
    setDateTo('');
    setAppliedSearchTerm('');
    setAppliedMethodFilter('');
    setAppliedIsoDateFrom(undefined);
    setAppliedIsoDateTo(undefined);
  };

  const toNextDay = (isoDate: string) => {
    const [year, month, day] = isoDate.split('-').map(Number);
    if (!year || !month || !day) return isoDate;
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return next.toISOString().slice(0, 10);
  };

  const {
    data: preferredMinDate,
    isLoading: isLoadingPreferredMinDate,
    isError: isPreferredMinDateError,
  } = useQuery({
    queryKey: ['preferred-min-transaction-date'],
    queryFn: fetchPreferredMinTransactionDate,
    staleTime: 5 * 60 * 1000,
  });

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: fetchPaymentMethods,
    staleTime: 5 * 60 * 1000,
  });

  const minDate = preferredMinDate ?? undefined;

  const effectiveStartDate = useMemo(() => {
    if (!appliedIsoDateFrom) return undefined;
    if (!minDate) return appliedIsoDateFrom;
    return appliedIsoDateFrom < minDate ? minDate : appliedIsoDateFrom;
  }, [appliedIsoDateFrom, minDate]);

  const effectiveEndExclusive = useMemo(() => {
    if (!appliedIsoDateTo) return undefined;
    return toNextDay(appliedIsoDateTo);
  }, [appliedIsoDateTo]);

  const canRunQueries = !isLoadingPreferredMinDate || isPreferredMinDateError;

  const columnFilters: ColumnFilters = {
    appliedSearchTerm,
    appliedMethodFilter,
    effectiveStartDate,
    effectiveEndExclusive,
  };

  const { data: counts } = useQuery({
    queryKey: ['transaction-counts', effectiveStartDate ?? null, appliedIsoDateTo ?? null, minDate ?? null],
    staleTime: 30000,
    enabled: canRunQueries,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dated = (q: any) => {
        if (effectiveStartDate) q = q.gte('date', effectiveStartDate);
        if (effectiveEndExclusive) q = q.lt('date', effectiveEndExclusive);
        return q;
      };

      const { count: reconciledCount, error: reconciledError } = await dated(
        supabase.from('transactions').select('*', { count: 'exact', head: true }).gte('value', 0)
          .eq('status', 'reconciled').eq('is_deleted', false),
      );
      const { count: deletedCount, error: deletedError } = await dated(
        supabase.from('transactions').select('*', { count: 'exact', head: true }).gte('value', 0)
          .eq('is_deleted', true),
      );

      if (reconciledError || deletedError) throw reconciledError || deletedError;
      return { reconciled: reconciledCount || 0, deleted: deletedCount || 0 };
    },
  });

  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: ['transactions-column'] });
    queryClient.invalidateQueries({ queryKey: ['transactions-column-count'] });
    queryClient.invalidateQueries({ queryKey: ['transaction-counts'] });
  };

  const manualMatchMutation = useMutation({
    mutationFn: async ({ ledger, statement, note }: { ledger: Transaction; statement: Transaction; note?: string }) =>
      applyStatementMatch(ledger, statement, { source: 'manual', note, ...ACTOR }),
    onSuccess: () => {
      invalidateLists();
      setSelectedLedger(null);
      setSelectedStatement(null);
      setMatchNote('');
      showToast('Match created successfully!', 'success');
    },
    onError: (error: Error) => {
      showToast(`Match failed\n\n${error.message}`, 'error');
      console.error('Manual match error:', error);
    },
  });

  const deleteTransactionMutation = useMutation({
    mutationFn: async ({ transactionId, reason }: { transactionId: string; reason: string }) => {
      const { data: currentTransaction, error: fetchError } = await supabase
        .from('transactions')
        .select('status')
        .eq('id', transactionId)
        .single();

      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from('transactions')
        .update({
          is_deleted: true,
          deleted_reason: reason,
          previous_status: currentTransaction.status,
        })
        .eq('id', transactionId);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateLists();
      showToast('Transaction deleted successfully!', 'success');
    },
    onError: (error) => {
      showToast(`Failed to delete transaction\n\n${error.message}`, 'error');
      console.error('Delete transaction error:', error);
    },
  });

  const restoreTransactionMutation = useMutation({
    mutationFn: async (transactionId: string) => {
      const { data: transaction, error: fetchError } = await supabase
        .from('transactions')
        .select('previous_status')
        .eq('id', transactionId)
        .single();

      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from('transactions')
        .update({
          is_deleted: false,
          deleted_reason: null,
          status: transaction.previous_status || 'pending-ledger',
          previous_status: null,
        })
        .eq('id', transactionId);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateLists();
      showToast('Transaction restored successfully!', 'success');
    },
    onError: (error) => {
      showToast(`Failed to restore transaction\n\n${error.message}`, 'error');
      console.error('Restore transaction error:', error);
    },
  });

  const unmatchMutation = useMutation({
    mutationFn: async ({ transactionId, reason }: { transactionId: string; reason: string }) =>
      undoStatementMatch(transactionId, { reason, ...ACTOR }),
    onSuccess: () => {
      invalidateLists();
      queryClient.invalidateQueries({ queryKey: ['dealer-receivables'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-receivable-matches'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-receivables-outstanding-summary'] });
      setUnmatchModalOpen(false);
      setTransactionToUnmatch(null);
      showToast('Reconciliation reversed successfully!', 'success');
    },
    onError: (error: Error) => {
      showToast(`Failed to unmatch transaction\n\n${error.message}`, 'error');
      console.error('Unmatch transaction error:', error);
    },
  });

  const editTransactionMutation = useMutation({
    mutationFn: async ({ transactionId, updates }: { transactionId: string; updates: Partial<Transaction> }) => {
      const { error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', transactionId);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateLists();
      showToast('Transaction updated successfully!', 'success');
    },
    onError: (error) => {
      showToast(`Failed to update transaction\n\n${error.message}`, 'error');
      console.error('Edit transaction error:', error);
    },
  });

  // Auto reconcile: compute proposals (no writes), then open the review modal.
  const autoReconcileMutation = useMutation({
    mutationFn: () => computeReconciliationProposals('transactions', {
      startDate: effectiveStartDate,
      endDateExclusive: effectiveEndExclusive,
    }),
    onSuccess: (result) => {
      setReviewState(result);
    },
    onError: (error) => {
      showToast(`Auto Reconcile Failed\n\n${error.message}`, 'error');
      console.error('Auto reconcile error:', error);
    },
  });

  // Apply only the proposals the user kept.
  const applyMatchesMutation = useMutation({
    mutationFn: (accepted: MatchProposal[]) => applyMatches(accepted, ACTOR),
    onSuccess: ({ applied, skipped }) => {
      invalidateLists();
      setReviewState(null);
      const skippedNote = skipped > 0 ? ` (${skipped} skipped — already changed)` : '';
      showToast(`Applied ${applied} ${applied === 1 ? 'match' : 'matches'}${skippedNote}`, 'success');
    },
    onError: (error: Error) => {
      showToast(`Failed to apply matches\n\n${error.message}`, 'error');
      console.error('Apply matches error:', error);
    },
  });

  const switchView = (next: ViewMode) => {
    setViewMode(next);
    if (next !== 'match') {
      setSelectedLedger(null);
      setSelectedStatement(null);
      setMatchNote('');
    }
  };

  const toggleLedger = (t: Transaction) => setSelectedLedger((prev) => (prev?.id === t.id ? null : t));
  const toggleStatement = (t: Transaction) => setSelectedStatement((prev) => (prev?.id === t.id ? null : t));

  const openEdit = (t: Transaction) => { setTransactionToEdit(t); setEditModalOpen(true); };
  const openDelete = (t: Transaction) => { setSelectedTransaction(t); setDeleteModalMode('delete'); setDeleteModalOpen(true); };
  const openViewDeleteReason = (t: Transaction) => { setSelectedTransaction(t); setDeleteModalMode('view'); setDeleteModalOpen(true); };
  const openUnmatch = (t: Transaction) => { setTransactionToUnmatch(t); setUnmatchModalOpen(true); };
  const openViewMatch = (t: Transaction) => { setTransactionToView(t); setViewMatchOpen(true); };

  if (isLoadingPreferredMinDate) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading transactions...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">
            View and confirm all payments have been included in the spreadsheet.
          </p>
        </div>
        <Button
          onClick={() => autoReconcileMutation.mutate()}
          disabled={autoReconcileMutation.isPending}
          className="min-w-[160px]"
          aria-busy={autoReconcileMutation.isPending}
          aria-live="polite"
        >
          {autoReconcileMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Matching...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Auto Reconcile
            </>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, depositor, car, or amount..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleApplyFilters();
              }
            }}
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          <div className="relative">
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="flex h-10 w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none pr-8 truncate"
            >
              <option value="">All Methods</option>
              {paymentMethods.map((method: string) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50" />
          </div>

          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="MM/DD/YYYY"
              value={dateFrom}
              onChange={(e) => setDateFrom(formatUSDateInput(e.target.value))}
              onClick={() => openDatePicker(dateFromPickerRef)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleApplyFilters();
                }
              }}
              className="pl-9 w-40 cursor-pointer"
              maxLength={10}
            />
            <input
              ref={dateFromPickerRef}
              type="date"
              lang="en-US"
              tabIndex={-1}
              aria-hidden="true"
              value={parseUSDateToISO(dateFrom) ?? ''}
              onChange={(e) => setDateFrom(e.target.value ? formatISODateToUS(e.target.value) : '')}
              className="absolute inset-0 h-0 w-0 opacity-0 pointer-events-none"
            />
          </div>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="MM/DD/YYYY"
              value={dateTo}
              onChange={(e) => setDateTo(formatUSDateInput(e.target.value))}
              onClick={() => openDatePicker(dateToPickerRef)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleApplyFilters();
                }
              }}
              className="pl-9 w-40 cursor-pointer"
              maxLength={10}
            />
            <input
              ref={dateToPickerRef}
              type="date"
              lang="en-US"
              tabIndex={-1}
              aria-hidden="true"
              value={parseUSDateToISO(dateTo) ?? ''}
              onChange={(e) => setDateTo(e.target.value ? formatISODateToUS(e.target.value) : '')}
              className="absolute inset-0 h-0 w-0 opacity-0 pointer-events-none"
            />
          </div>
        </div>

        <div className="flex gap-2 items-end">
          <Button onClick={handleApplyFilters} disabled={!filtersChanged} size="sm">
            Apply Filters
          </Button>
          <Button
            variant="outline"
            onClick={handleClearFilters}
            disabled={!hasActiveFilters && searchTerm === '' && dateFrom === '' && dateTo === '' && methodFilter === ''}
            size="sm"
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant={viewMode === 'match' ? 'default' : 'outline'} onClick={() => switchView('match')} size="sm">
          Match
        </Button>
        <Button variant={viewMode === 'reconciled' ? 'default' : 'outline'} onClick={() => switchView('reconciled')} size="sm">
          Reconciled {counts && <span className="ml-1.5 text-xs opacity-70">({counts.reconciled})</span>}
        </Button>
        <Button variant={viewMode === 'deleted' ? 'default' : 'outline'} onClick={() => switchView('deleted')} size="sm">
          Deleted {counts && <span className="ml-1.5 text-xs opacity-70">({counts.deleted})</span>}
        </Button>
      </div>

      <EditTransactionModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setTransactionToEdit(null);
        }}
        onConfirm={(updates) => {
          if (transactionToEdit) {
            editTransactionMutation.mutate({ transactionId: transactionToEdit.id, updates });
          }
        }}
        transaction={transactionToEdit}
      />

      <DeleteTransactionModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setSelectedTransaction(null);
        }}
        onConfirm={(reason) => {
          if (selectedTransaction) {
            deleteTransactionMutation.mutate({ transactionId: selectedTransaction.id, reason });
          }
        }}
        mode={deleteModalMode}
        existingReason={selectedTransaction?.deleted_reason || undefined}
        onRestore={
          deleteModalMode === 'view' && selectedTransaction
            ? () => restoreTransactionMutation.mutate(selectedTransaction.id)
            : undefined
        }
      />

      <UnmatchTransactionModal
        isOpen={unmatchModalOpen}
        onClose={() => {
          setUnmatchModalOpen(false);
          setTransactionToUnmatch(null);
        }}
        onConfirm={(reason) => {
          if (transactionToUnmatch) {
            unmatchMutation.mutate({ transactionId: transactionToUnmatch.id, reason });
          }
        }}
        transaction={transactionToUnmatch}
        isPending={unmatchMutation.isPending}
      />

      <ViewMatchedModal
        isOpen={viewMatchOpen}
        onClose={() => {
          setViewMatchOpen(false);
          setTransactionToView(null);
        }}
        transaction={transactionToView}
      />

      {reviewState && (
        <AutoReconcileReviewModal
          proposals={reviewState.proposals}
          details={reviewState.details}
          isApplying={applyMatchesMutation.isPending}
          onApply={(accepted) => applyMatchesMutation.mutate(accepted)}
          onClose={() => setReviewState(null)}
        />
      )}

      {viewMode === 'match' && (selectedLedger || selectedStatement) && (
        <Card className="p-3 sticky top-0 z-10 border-primary/40 bg-primary/5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid flex-1 grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
              <SelectionChip label="Google Sheets" t={selectedLedger} onClear={() => setSelectedLedger(null)} />
              <ArrowRight className="hidden sm:block h-4 w-4 text-muted-foreground mx-auto" />
              <SelectionChip label="Zelle / Credit Card" t={selectedStatement} onClear={() => setSelectedStatement(null)} />
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Note (optional)"
                value={matchNote}
                onChange={(e) => setMatchNote(e.target.value)}
                className="h-9 w-48"
              />
              <Button
                onClick={() =>
                  selectedLedger && selectedStatement &&
                  manualMatchMutation.mutate({ ledger: selectedLedger, statement: selectedStatement, note: matchNote.trim() || undefined })
                }
                disabled={!selectedLedger || !selectedStatement || manualMatchMutation.isPending}
                className="min-w-[110px]"
              >
                {manualMatchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Match
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TransactionColumn
          mode={viewMode}
          side="ledger"
          title="Google Sheets"
          accent="blue"
          filters={columnFilters}
          canRunQueries={canRunQueries}
          sortConfig={ledgerSort}
          onSortChange={setLedgerSort}
          selectedId={selectedLedger?.id ?? null}
          onSelect={toggleLedger}
          onEdit={openEdit}
          onDelete={openDelete}
          onViewMatch={openViewMatch}
          onUnmatch={openUnmatch}
          onViewDeleteReason={openViewDeleteReason}
        />
        <TransactionColumn
          mode={viewMode}
          side="statement"
          title="Zelle / Credit Card"
          accent="orange"
          filters={columnFilters}
          canRunQueries={canRunQueries}
          sortConfig={statementSort}
          onSortChange={setStatementSort}
          selectedId={selectedStatement?.id ?? null}
          onSelect={toggleStatement}
          onEdit={openEdit}
          onDelete={openDelete}
          onViewMatch={openViewMatch}
          onUnmatch={openUnmatch}
          onViewDeleteReason={openViewDeleteReason}
        />
      </div>
    </div>
  );
}

function SelectionChip({ label, t, onClear }: { label: string; t: Transaction | null; onClear: () => void }) {
  if (!t) {
    return (
      <div className="rounded-md border border-dashed bg-background/60 px-3 py-2 text-xs text-muted-foreground italic">
        Select a {label} entry…
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate text-xs font-medium" title={t.name || t.depositor || ''}>
          {formatDate(t.date)} · {t.name || t.depositor || '-'}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <span className="font-mono text-xs font-semibold whitespace-nowrap">{formatCurrency(t.value)}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClear} title="Clear selection">
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
