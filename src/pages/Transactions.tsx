import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useState, useRef, useMemo, useEffect, type RefObject } from 'react';
import { useSearch } from 'wouter';
import { supabase } from '@/lib/supabase';
import type { Transaction } from '@/lib/database.types';
import { queryClient } from '@/lib/queryClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Eye, Search, CheckCircle2, Loader2, Link2Off, Calendar, ChevronDown, ArrowRight, X } from 'lucide-react';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { type SortConfig, getNextSortState } from '@/lib/sorting';
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
import { AutoReconcileReviewModal } from '@/components/AutoReconcileReviewModal';
import { TransactionColumn, type ColumnFilters } from '@/components/transactions/TransactionColumn';
import { useToast } from '@/components/ui/toast';
import { useColumnResizer } from '@/hooks/useColumnResizer';
import { ResizeHandle } from '@/components/ui/ResizeHandle';

const TRANSACTIONS_PER_PAGE = 50;
const DEFAULT_COLUMN_WIDTHS = ['100px', '1fr', '180px', '100px', '100px', '100px', '80px', '140px'];

type TransactionSortColumn = 'date' | 'name' | 'car' | 'payment_method' | 'value' | 'status' | 'confidence';
type ColumnSortColumn = 'date' | 'name' | 'value';
type ViewMode = 'match' | 'reconciled' | 'deleted';

// No authenticated identity yet — Supabase Auth lands in a later phase. The match
// writer already accepts the actor, so wiring real users later is a one-line swap.
const ACTOR: MatchActor = { userId: null, userEmail: null };

const escapeForIlike = (term: string) =>
  term.replace(/([*\\])/g, '\\$1').replace(/,/g, '\\,').replace(/_/g, '\\_').replace(/%/g, '\\%');

const buildAmountCondition = (rawTerm: string) => {
  const digitsOnly = rawTerm.replace(/[^\d.-]/g, '');
  if (!digitsOnly) return null;
  const numericValue = Number(digitsOnly);
  if (Number.isNaN(numericValue)) return null;
  return `value.eq.${encodeURIComponent(numericValue.toString())}`;
};

export default function Transactions() {
  const { showToast } = useToast();
  const searchString = useSearch();

  const { widths, updateWidth, gridTemplateColumns } = useColumnResizer('transactions-grid-cols', DEFAULT_COLUMN_WIDTHS);

  const urlParams = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return {
      dateFrom: params.get('dateFrom') || '',
      dateTo: params.get('dateTo') || '',
      search: params.get('q') || '',
    };
  }, [searchString]);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig<TransactionSortColumn>>({ column: 'date', direction: 'desc' });
  const [viewMode, setViewMode] = useState<ViewMode>('match');
  const [methodFilter, setMethodFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(urlParams.dateFrom);
  const [dateTo, setDateTo] = useState(urlParams.dateTo);

  // Match-mode selection (one per side) + per-side sort.
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
  const [reviewState, setReviewState] = useState<ReconciliationProposalsResult | null>(null);

  const observerTarget = useRef<HTMLDivElement>(null);
  const dateFromPickerRef = useRef<HTMLInputElement>(null);
  const dateToPickerRef = useRef<HTMLInputElement>(null);
  const openDatePicker = (ref: RefObject<HTMLInputElement>) => {
    const input = ref.current;
    if (input && typeof input.showPicker === 'function') {
      input.showPicker();
    }
  };

  const handleSort = (column: TransactionSortColumn) => {
    setSortConfig(getNextSortState(sortConfig, column));
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

  // Single table query — only used for the Reconciled / Deleted views.
  const isTableMode = viewMode === 'reconciled' || viewMode === 'deleted';
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<Transaction[]>({
    queryKey: ['transactions', 'table', viewMode, appliedSearchTerm, appliedMethodFilter, effectiveStartDate ?? null, appliedIsoDateTo ?? null, minDate ?? null, sortConfig.column, sortConfig.direction],
    queryFn: async ({ pageParam = 0 }) => {
      const start = pageParam as number;
      const end = start + TRANSACTIONS_PER_PAGE - 1;

      let query = supabase
        .from('transactions')
        .select('*')
        .gte('value', 0)
        .order(sortConfig.column, { ascending: sortConfig.direction === 'asc', nullsFirst: false })
        .order('sheet_order', { ascending: false, nullsFirst: false });

      if (effectiveStartDate) {
        query = query.gte('date', effectiveStartDate);
      }

      if (viewMode === 'deleted') {
        query = query.eq('is_deleted', true);
      } else {
        query = query.eq('status', 'reconciled').eq('is_deleted', false);
      }
      if (effectiveEndExclusive) {
        query = query.lt('date', effectiveEndExclusive);
      }

      if (appliedMethodFilter) {
        query = query.eq('payment_method', appliedMethodFilter);
      }

      if (appliedSearchTerm) {
        const sanitizedTerm = escapeForIlike(appliedSearchTerm);
        const searchPattern = `*${sanitizedTerm}*`;
        const orConditions = [
          `name.ilike.${searchPattern}`,
          `depositor.ilike.${searchPattern}`,
          `car.ilike.${searchPattern}`,
          `historical_text.ilike.${searchPattern}`,
          `source.ilike.${searchPattern}`,
        ];

        const amountCondition = buildAmountCondition(appliedSearchTerm);
        if (amountCondition) {
          orConditions.push(amountCondition);
        }

        query = query.or(orConditions.join(','));
      }

      const { data, error } = await query.range(start, end);

      if (error) throw error;
      return data || [];
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < TRANSACTIONS_PER_PAGE) return undefined;
      return allPages.length * TRANSACTIONS_PER_PAGE;
    },
    initialPageParam: 0,
    staleTime: 30000,
    enabled: canRunQueries && isTableMode,
  });

  const tableTransactions = useMemo(() => data?.pages.flat() || [], [data]);

  const { data: counts } = useQuery({
    queryKey: ['transaction-counts', effectiveStartDate ?? null, appliedIsoDateTo ?? null, minDate ?? null],
    staleTime: 30000,
    queryFn: async () => {
      const buildCountQuery = (status?: string) => {
        let query = supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .gte('value', 0);

        if (status && status !== 'all') {
          query = query.eq('status', status).eq('is_deleted', false);
        } else if (!status || status === 'all') {
          query = query.eq('is_deleted', false);
        }

        if (effectiveStartDate) {
          query = query.gte('date', effectiveStartDate);
        }

        if (effectiveEndExclusive) {
          query = query.lt('date', effectiveEndExclusive);
        }

        return query;
      };

      const { count: reconciledCount, error: reconciledError } = await buildCountQuery('reconciled');
      const { count: pendingLedgerCount, error: pendingLedgerError } = await buildCountQuery('pending-ledger');
      const { count: pendingStatementCount, error: pendingStatementError } = await buildCountQuery('pending-statement');

      let deletedQuery = supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', true)
        .gte('value', 0);

      if (effectiveStartDate) {
        deletedQuery = deletedQuery.gte('date', effectiveStartDate);
      }
      if (effectiveEndExclusive) {
        deletedQuery = deletedQuery.lt('date', effectiveEndExclusive);
      }

      const { count: deletedCount, error: deletedError } = await deletedQuery;

      if (reconciledError || pendingLedgerError || pendingStatementError || deletedError) {
        throw reconciledError || pendingLedgerError || pendingStatementError || deletedError;
      }

      return {
        reconciled: reconciledCount || 0,
        'pending-ledger': pendingLedgerCount || 0,
        'pending-statement': pendingStatementCount || 0,
        deleted: deletedCount || 0,
      };
    },
    enabled: canRunQueries,
  });

  const filteredTotal = useMemo(() => {
    return tableTransactions.reduce((sum, transaction) => {
      const rawValue = transaction.value;
      const numeric = typeof rawValue === 'number'
        ? rawValue
        : parseFloat((rawValue ?? '0').toString().replace(/[^\d.-]/g, ''));
      if (Number.isNaN(numeric)) return sum;
      return sum + numeric;
    }, 0);
  }, [tableTransactions]);

  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: ['transactions-column'] });
    queryClient.invalidateQueries({ queryKey: ['transactions', 'table'] });
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

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const target = observerTarget.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const switchView = (next: ViewMode) => {
    setViewMode(next);
    if (next !== 'match') {
      setSelectedLedger(null);
      setSelectedStatement(null);
      setMatchNote('');
    }
  };

  const toggleLedger = (t: Transaction) =>
    setSelectedLedger((prev) => (prev?.id === t.id ? null : t));
  const toggleStatement = (t: Transaction) =>
    setSelectedStatement((prev) => (prev?.id === t.id ? null : t));

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

      {reviewState && (
        <AutoReconcileReviewModal
          proposals={reviewState.proposals}
          details={reviewState.details}
          isApplying={applyMatchesMutation.isPending}
          onApply={(accepted) => applyMatchesMutation.mutate(accepted)}
          onClose={() => setReviewState(null)}
        />
      )}

      {viewMode === 'match' ? (
        <div className="space-y-4">
          {(selectedLedger || selectedStatement) && (
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
              side="ledger"
              title="Google Sheets"
              accent="blue"
              count={counts?.['pending-ledger']}
              filters={columnFilters}
              canRunQueries={canRunQueries}
              selectedId={selectedLedger?.id ?? null}
              onSelect={toggleLedger}
              onEdit={(t) => { setTransactionToEdit(t); setEditModalOpen(true); }}
              onDelete={(t) => { setSelectedTransaction(t); setDeleteModalMode('delete'); setDeleteModalOpen(true); }}
              sortConfig={ledgerSort}
              onSortChange={setLedgerSort}
            />
            <TransactionColumn
              side="statement"
              title="Zelle / Credit Card"
              accent="orange"
              count={counts?.['pending-statement']}
              filters={columnFilters}
              canRunQueries={canRunQueries}
              selectedId={selectedStatement?.id ?? null}
              onSelect={toggleStatement}
              onEdit={(t) => { setTransactionToEdit(t); setEditModalOpen(true); }}
              onDelete={(t) => { setSelectedTransaction(t); setDeleteModalMode('delete'); setDeleteModalOpen(true); }}
              sortConfig={statementSort}
              onSortChange={setStatementSort}
            />
          </div>
        </div>
      ) : (
        <>
          <Card>
            <div
              className="grid gap-3 border-b px-4 py-3 text-xs font-semibold items-center bg-muted/50 sticky top-0 z-10"
              style={{ gridTemplateColumns }}
            >
              <div className="relative flex items-center h-full">
                <SortableHeader label="Date" column="date" currentSort={sortConfig} onSort={handleSort} />
                <ResizeHandle width={widths[0]} onResize={(w) => updateWidth(0, w)} />
              </div>
              <div className="relative flex items-center h-full">
                <SortableHeader label="Client / Depositor" column="name" currentSort={sortConfig} onSort={handleSort} />
                <ResizeHandle width={widths[1]} onResize={(w) => updateWidth(1, w)} />
              </div>
              <div className="relative flex items-center h-full">
                <SortableHeader label="Car" column="car" currentSort={sortConfig} onSort={handleSort} />
                <ResizeHandle width={widths[2]} onResize={(w) => updateWidth(2, w)} />
              </div>
              <div className="relative flex items-center h-full">
                <SortableHeader label="Method" column="payment_method" currentSort={sortConfig} onSort={handleSort} />
                <ResizeHandle width={widths[3]} onResize={(w) => updateWidth(3, w)} />
              </div>
              <div className="relative flex items-center h-full">
                <SortableHeader label="Amount" column="value" currentSort={sortConfig} onSort={handleSort} />
                <ResizeHandle width={widths[4]} onResize={(w) => updateWidth(4, w)} />
              </div>
              <div className="relative flex items-center h-full">
                <SortableHeader label="Status" column="status" currentSort={sortConfig} onSort={handleSort} />
                <ResizeHandle width={widths[5]} onResize={(w) => updateWidth(5, w)} />
              </div>
              <div className="relative flex items-center h-full">
                <SortableHeader label="Confidence" column="confidence" currentSort={sortConfig} onSort={handleSort} />
                <ResizeHandle width={widths[6]} onResize={(w) => updateWidth(6, w)} />
              </div>
              <div className="text-right px-2">Actions</div>
            </div>

            <div className="divide-y">
              {isLoading ? (
                <div className="p-12 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" /></div>
              ) : tableTransactions.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  {viewMode === 'reconciled' ? 'No reconciled transactions.' : 'No deleted transactions.'}
                </div>
              ) : (
                tableTransactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    gridTemplateColumns={gridTemplateColumns}
                    transaction={transaction}
                    viewMode={viewMode}
                    onViewDeleteReason={(t) => {
                      setSelectedTransaction(t);
                      setDeleteModalMode('view');
                      setDeleteModalOpen(true);
                    }}
                    onUnmatch={(t) => {
                      setTransactionToUnmatch(t);
                      setUnmatchModalOpen(true);
                    }}
                  />
                ))
              )}
            </div>
          </Card>

          <div ref={observerTarget} className="py-4 text-center space-y-1">
            {isFetchingNextPage && (
              <div className="text-muted-foreground">Loading more...</div>
            )}
            <div className="text-muted-foreground">
              Showing {tableTransactions.length} transactions
            </div>
            <div className="text-muted-foreground">
              Total of transactions: {formatCurrency(filteredTotal)}
            </div>
          </div>
        </>
      )}
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

function TransactionRow({
  transaction,
  viewMode,
  onViewDeleteReason,
  onUnmatch,
  gridTemplateColumns,
}: {
  transaction: Transaction;
  viewMode: ViewMode;
  onViewDeleteReason: (transaction: Transaction) => void;
  onUnmatch: (transaction: Transaction) => void;
  gridTemplateColumns: string;
}) {
  const [showMatch, setShowMatch] = useState(false);

  const { data: matchedTransaction } = useQuery<Transaction | null>({
    queryKey: ['transaction', 'match', transaction.matched_transaction_id],
    queryFn: async () => {
      if (!transaction.matched_transaction_id) return null;
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transaction.matched_transaction_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: showMatch && !!transaction.matched_transaction_id,
  });

  const statusColors = {
    reconciled: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    'pending-ledger': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'pending-statement': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'pending-ledger':
      case 'pending-statement':
        return 'Pending';
      case 'reconciled':
        return 'Reconciled';
      default:
        return status;
    }
  };

  const getConfidenceColor = (confidence: number | null) => {
    if (!confidence) return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    if (confidence === 100) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (confidence >= 80) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  };

  return (
    <div className="group hover:bg-muted/50 transition-colors">
      <div className="grid gap-3 px-4 py-3 items-center text-sm" style={{ gridTemplateColumns }}>
        <div>
          <div className="font-medium text-xs">{formatDate(transaction.date)}</div>
        </div>

        <div className="min-w-0">
          {transaction.name && (
            <div className="font-medium text-xs truncate" title={`Client: ${transaction.name}`}>
              {transaction.name}
            </div>
          )}
          {transaction.depositor && (
            <div
              className={`${transaction.name ? 'text-xs text-muted-foreground' : 'font-medium text-xs'} truncate`}
              title={`Depositor: ${transaction.depositor}`}
            >
              {transaction.depositor}
            </div>
          )}
          {!transaction.name && !transaction.depositor && (
            <div className="font-medium text-xs">-</div>
          )}
        </div>

        <div>
          <div className="font-medium text-xs truncate">{transaction.car || '-'}</div>
        </div>

        <div>
          <div className="font-medium text-xs truncate">{transaction.payment_method || '-'}</div>
        </div>

        <div>
          <div className="font-medium text-xs">{formatCurrency(transaction.value)}</div>
        </div>

        <div>
          <Badge className={statusColors[transaction.status as keyof typeof statusColors]}>
            {getStatusLabel(transaction.status)}
          </Badge>
        </div>

        <div>
          {transaction.status === 'reconciled' && transaction.confidence !== null ? (
            <Badge className={getConfidenceColor(transaction.confidence)}>
              {transaction.confidence}%
            </Badge>
          ) : (
            <div className="font-medium text-xs text-muted-foreground">-</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-1">
          {viewMode === 'reconciled' && (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setShowMatch(!showMatch)}
                title="View matched transaction"
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onUnmatch(transaction)}
                title="Unmatch transaction"
              >
                <Link2Off className="h-4 w-4" />
              </Button>
            </>
          )}
          {viewMode === 'deleted' && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => onViewDeleteReason(transaction)}
              title="View deletion reason and restore"
            >
              <Eye className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {showMatch && matchedTransaction && (
        <div className="px-4 pb-4 bg-muted/30 border-t">
          <div className="py-3 px-4 mt-2 bg-background rounded-md border">
            <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
              Matched Transaction ({transaction.confidence}% confidence)
            </div>
            <div className="grid gap-3 text-sm" style={{ gridTemplateColumns }}>
              <div className="text-xs">{formatDate(matchedTransaction.date)}</div>

              <div className="min-w-0">
                {matchedTransaction.name && (
                  <div className="truncate text-xs" title={`Client: ${matchedTransaction.name}`}>
                    {matchedTransaction.name}
                  </div>
                )}
                {matchedTransaction.depositor && (
                  <div
                    className={`${matchedTransaction.name ? 'text-xs text-muted-foreground' : 'text-xs'} truncate`}
                    title={`Depositor: ${matchedTransaction.depositor}`}
                  >
                    {matchedTransaction.depositor}
                  </div>
                )}
                {!matchedTransaction.name && !matchedTransaction.depositor && (
                  <div className="text-xs">-</div>
                )}
              </div>

              <div className="truncate text-xs">{matchedTransaction.car || '-'}</div>
              <div className="truncate text-xs">{matchedTransaction.payment_method || '-'}</div>
              <div className="text-xs">{formatCurrency(matchedTransaction.value)}</div>

              <div className="col-span-3 text-xs text-muted-foreground truncate flex items-center">
                Source: {matchedTransaction.source}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
