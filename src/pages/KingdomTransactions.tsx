import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useState, useRef, useMemo, useEffect, type RefObject, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import type { Transaction, ReconciliationStatus } from '@/lib/database.types';
import { queryClient } from '@/lib/queryClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Eye, Search, CheckCircle2, Loader2, Link2, Calendar, Trash2, Plus, Undo2 } from 'lucide-react';
import {
  formatDate,
  formatCurrency,
  parseUSDateToISO,
  formatUSDateInput,
  formatISODateToUS,
} from '@/lib/utils';
import { autoReconcileAll } from '@/lib/reconciliation';
import { fetchPreferredMinTransactionDate } from '@/lib/transactionFilters';

const TRANSACTIONS_PER_PAGE = 50;

export default function KingdomTransactions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReconciliationStatus | 'all' | 'kingdom'>('all');
  const [selectedForMatch, setSelectedForMatch] = useState<Transaction | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ transaction: Transaction; mode: 'delete' | 'view' } | null>(null);
  const [deleteReasonInput, setDeleteReasonInput] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const observerTarget = useRef<HTMLDivElement>(null);
  const dateFromPickerRef = useRef<HTMLInputElement>(null);
  const dateToPickerRef = useRef<HTMLInputElement>(null);
  const openDatePicker = (ref: RefObject<HTMLInputElement>) => {
    const input = ref.current;
    if (input && typeof input.showPicker === 'function') {
      input.showPicker();
    }
  };
  const handleStatusFilterChange = (nextFilter: ReconciliationStatus | 'all' | 'kingdom') => {
    setStatusFilter(nextFilter);
    void queryClient.invalidateQueries({ queryKey: ['kingdom-transactions', 'infinite'] });
    void queryClient.invalidateQueries({ queryKey: ['kingdom-transaction-counts'] });
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
  const [appliedIsoDateFrom, setAppliedIsoDateFrom] = useState<string | undefined>(undefined);
  const [appliedIsoDateTo, setAppliedIsoDateTo] = useState<string | undefined>(undefined);

  const filtersChanged =
    normalizedSearchInput !== appliedSearchTerm ||
    pendingIsoDateFrom !== appliedIsoDateFrom ||
    pendingIsoDateTo !== appliedIsoDateTo;

  const hasActiveFilters = Boolean(appliedSearchTerm || appliedIsoDateFrom || appliedIsoDateTo);

  const handleApplyFilters = () => {
    setAppliedSearchTerm(normalizedSearchInput);
    setAppliedIsoDateFrom(pendingIsoDateFrom);
    setAppliedIsoDateTo(pendingIsoDateTo);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
    setAppliedSearchTerm('');
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

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<Transaction[]>({
    queryKey: ['kingdom-transactions', 'infinite', statusFilter, appliedSearchTerm, effectiveStartDate ?? null, appliedIsoDateTo ?? null, minDate ?? null],
    queryFn: async ({ pageParam = 0 }) => {
      const start = pageParam as number;
      const end = start + TRANSACTIONS_PER_PAGE - 1;

      let query = supabase
        .from('transactions')
        .select('*')
        .order('status', { ascending: true })
        .order('date', { ascending: false });

      if (effectiveStartDate) {
        query = query.gte('date', effectiveStartDate);
      }

      if (statusFilter === 'kingdom') {
        query = query.ilike('source', 'Kingdom System%');
      } else if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (effectiveEndExclusive) {
        query = query.lt('date', effectiveEndExclusive);
      }

      if (appliedSearchTerm) {
        const escapeForILike = (value: string) =>
          value.replace(/([%_\\])/g, '\\$1');
        const wildcard = `%${escapeForILike(appliedSearchTerm)}%`;
        const orFilters = [
          `name.ilike.${wildcard}`,
          `depositor.ilike.${wildcard}`,
          `car.ilike.${wildcard}`,
          `historical_text.ilike.${wildcard}`,
          `source.ilike.${wildcard}`,
        ];

        const numericSearch = appliedSearchTerm.replace(/[^\d.-]/g, '');
        if (numericSearch) {
          const numericWildcard = `%${escapeForILike(numericSearch)}%`;
          orFilters.push(`value::TEXT.ilike.${numericWildcard}`);
        } else {
          orFilters.push(`value::TEXT.ilike.${wildcard}`);
        }

        query = query.or(orFilters.join(','));
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
    enabled: canRunQueries,
  });

  const allTransactions = data?.pages.flat() || [];

  const { data: counts } = useQuery({
    queryKey: ['kingdom-transaction-counts', effectiveStartDate ?? null, appliedIsoDateTo ?? null, minDate ?? null],
    staleTime: 30000,
    queryFn: async () => {
      const buildCountQuery = (status?: string) => {
        let query = supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true });

        if (status === 'kingdom') {
          query = query.ilike('source', 'Kingdom System%');
        } else if (status && status !== 'all') {
          query = query.eq('status', status);
        }

        if (effectiveStartDate) {
          query = query.gte('date', effectiveStartDate);
        }

        if (effectiveEndExclusive) {
          query = query.lt('date', effectiveEndExclusive);
        }

        return query;
      };

      const { count: totalCount, error: totalError } = await buildCountQuery();
      const { count: reconciledCount, error: reconciledError } = await buildCountQuery('reconciled');
      const { count: pendingLedgerCount, error: pendingLedgerError } = await buildCountQuery('pending-ledger');
      const { count: pendingStatementCount, error: pendingStatementError } = await buildCountQuery('pending-statement');
      const { count: deletedCount, error: deletedError } = await buildCountQuery('deleted');
      const { count: kingdomCount, error: kingdomError } = await buildCountQuery('kingdom');

      if (totalError || reconciledError || pendingLedgerError || pendingStatementError || deletedError || kingdomError) {
        throw totalError || reconciledError || pendingLedgerError || pendingStatementError || deletedError || kingdomError;
      }

      return {
        all: totalCount || 0,
        reconciled: reconciledCount || 0,
        'pending-ledger': pendingLedgerCount || 0,
        'pending-statement': pendingStatementCount || 0,
        deleted: deletedCount || 0,
        kingdom: kingdomCount || 0,
      };
    },
    enabled: canRunQueries,
  });

  const filteredTransactions = useMemo(() => allTransactions, [allTransactions]);

  const { activeTotal, deletedTotal } = useMemo(() => {
    return filteredTransactions.reduce(
      (totals, transaction) => {
        const rawValue = transaction.value;
        const numeric = typeof rawValue === 'number'
          ? rawValue
          : parseFloat((rawValue ?? '0').toString().replace(/[^\d.-]/g, ''));

        if (Number.isNaN(numeric)) {
          return totals;
        }

        if (transaction.status === 'deleted') {
          totals.deletedTotal += numeric;
        } else {
          totals.activeTotal += numeric;
        }
        return totals;
      },
      { activeTotal: 0, deletedTotal: 0 }
    );
  }, [filteredTransactions]);

  const manualReconcileMutation = useMutation({
    mutationFn: async ({ transaction1, transaction2 }: { transaction1: Transaction; transaction2: Transaction }) => {
      const { error: error1 } = await supabase
        .from('transactions')
        .update({
          status: 'reconciled',
          matched_transaction_id: transaction2.id,
          confidence: 100,
        })
        .eq('id', transaction1.id);

      if (error1) throw error1;

      const { error: error2 } = await supabase
        .from('transactions')
        .update({
          status: 'reconciled',
          matched_transaction_id: transaction1.id,
          confidence: 100,
        })
        .eq('id', transaction2.id);

      if (error2) throw error2;

      return { transaction1, transaction2 };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kingdom-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['kingdom-transaction-counts'] });
      setSelectedForMatch(null);
      alert('✅ Manual reconciliation successful!');
    },
    onError: (error) => {
      alert(`❌ Manual reconciliation failed\n\n${error.message}`);
      console.error('Manual reconcile error:', error);
    },
  });

  const autoReconcileMutation = useMutation({
    mutationFn: () => autoReconcileAll('transactions'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kingdom-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['kingdom-transaction-counts'] });

      const summary = [
        '============================================================',
        'RECONCILIATION COMPLETE',
        '============================================================',
        '',
        `Total Processed: ${result.totalProcessed}`,
        `Reconciliation CORRECT: ${result.matched}`,
        `Reconciliation INCORRECT: ${result.totalProcessed - result.matched}`,
        '',
        'Criteria:',
        '  \u2022 Date: \u00b12 days tolerance',
        '  \u2022 Value: 100% exact match',
        '  \u2022 Payment Method: 100% exact match',
        '  \u2022 Name: \u226550% similarity (skipped for Credit Card)',
        '',
        '============================================================'
      ].join('\n');

      alert(summary);
    },
    onError: (error) => {
      alert(`❌ Auto Reconcile Failed\n\n${error.message}`);
      console.error('Auto reconcile error:', error);
    },
  });

  const deleteTransactionMutation = useMutation({
    mutationFn: async ({ transactionId, reason }: { transactionId: string; reason: string }) => {
      const { error } = await supabase
        .from('transactions')
        .update({
          status: 'deleted',
          deleted_reason: reason,
          matched_transaction_id: null,
          confidence: null,
        })
        .eq('id', transactionId);

      if (error) throw error;
      return { transactionId, reason };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['kingdom-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['kingdom-transaction-counts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transaction-counts'] });
      setDeleteDialog(null);
      setDeleteReasonInput('');
      if (selectedForMatch?.id === variables.transactionId) {
        setSelectedForMatch(null);
      }
      alert('✅ Transaction deleted.');
    },
    onError: (error) => {
      alert(`❌ Failed to delete transaction\n\n${error.message}`);
      console.error('Delete transaction error:', error);
    },
  });

  const revertTransactionMutation = useMutation({
    mutationFn: async ({ transactionId }: { transactionId: string }) => {
      const { error } = await supabase
        .from('transactions')
        .update({
          status: 'pending-ledger',
          deleted_reason: null,
          matched_transaction_id: null,
          confidence: null,
        })
        .eq('id', transactionId);

      if (error) throw error;
      return { transactionId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['kingdom-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['kingdom-transaction-counts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transaction-counts'] });
      if (deleteDialog?.transaction.id === variables.transactionId) {
        setDeleteDialog(null);
        setDeleteReasonInput('');
      }
      alert('✅ Transaction restored to pending-ledger.');
    },
    onError: (error) => {
      alert(`❌ Failed to restore transaction\n\n${error.message}`);
      console.error('Restore transaction error:', error);
    },
  });

  const closeDeleteDialog = () => {
    setDeleteDialog(null);
    setDeleteReasonInput('');
  };

  const handleDeleteSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deleteDialog?.transaction) return;
    const trimmed = deleteReasonInput.trim();
    if (!trimmed) return;
    deleteTransactionMutation.mutate({
      transactionId: deleteDialog.transaction.id,
      reason: trimmed,
    });
  };

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

  if (isLoadingPreferredMinDate) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading transactions...</div>
      </div>
    );
  }

  if (isLoadingPreferredMinDate) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading transactions...</div>
      </div>
    );
  }

  if (isLoading) {
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
          <h1 className="text-3xl font-bold tracking-tight">Transaction Kingdom System</h1>
          <p className="text-muted-foreground">
            View reconciled and pending transactions
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
              Reconciling...
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
            <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="MM/DD/YYYY"
              value={dateFrom}
              onChange={(e) => {
                const formatted = formatUSDateInput(e.target.value);
                setDateFrom(formatted);
              }}
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
              onChange={(e) => {
                const formatted = formatUSDateInput(e.target.value);
                setDateTo(formatted);
              }}
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
            disabled={!hasActiveFilters && searchTerm === '' && dateFrom === '' && dateTo === ''}
            size="sm"
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          onClick={() => handleStatusFilterChange('all')}
          size="sm"
        >
          All {counts && <span className="ml-1.5 text-xs opacity-70">({counts.all})</span>}
        </Button>
        <Button
          variant={statusFilter === 'kingdom' ? 'default' : 'outline'}
          onClick={() => handleStatusFilterChange('kingdom')}
          size="sm"
        >
          Kingdom {counts && <span className="ml-1.5 text-xs opacity-70">({counts.kingdom})</span>}
        </Button>
        <Button
          variant={statusFilter === 'reconciled' ? 'default' : 'outline'}
          onClick={() => handleStatusFilterChange('reconciled')}
          size="sm"
        >
          Reconciled {counts && <span className="ml-1.5 text-xs opacity-70">({counts.reconciled})</span>}
        </Button>
        <Button
          variant={statusFilter === 'pending-statement' ? 'default' : 'outline'}
          onClick={() => handleStatusFilterChange('pending-statement')}
          size="sm"
        >
          Pending Statement {counts && <span className="ml-1.5 text-xs opacity-70">({counts['pending-statement']})</span>}
        </Button>
        <Button
          variant={statusFilter === 'deleted' ? 'default' : 'outline'}
          onClick={() => handleStatusFilterChange('deleted')}
          size="sm"
        >
          Deleted {counts && <span className="ml-1.5 text-xs opacity-70">({counts.deleted})</span>}
        </Button>
      </div>

      {selectedForMatch && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 sticky top-0 z-10">
          <div className="flex items-center gap-6">
            <div className="font-semibold text-blue-900 dark:text-blue-100 whitespace-nowrap">
              Selected for Match:
            </div>
            <div className="flex-1 grid grid-cols-6 gap-4 text-sm text-blue-800 dark:text-blue-200">
              <div>
                <div className="font-medium text-blue-700 dark:text-blue-300 text-xs">Date</div>
                <div>{formatDate(selectedForMatch.date)}</div>
              </div>
              <div>
                <div className="font-medium text-blue-700 dark:text-blue-300 text-xs">Client / Depositor</div>
                {selectedForMatch.name && <div className="truncate" title={selectedForMatch.name}>{selectedForMatch.name}</div>}
                {selectedForMatch.depositor && (
                  <div className={selectedForMatch.name ? 'text-xs' : ''} title={selectedForMatch.depositor}>
                    {selectedForMatch.depositor}
                  </div>
                )}
                {!selectedForMatch.name && !selectedForMatch.depositor && <div>-</div>}
              </div>
              <div>
                <div className="font-medium text-blue-700 dark:text-blue-300 text-xs">Car</div>
                <div className="truncate">{selectedForMatch.car || '-'}</div>
              </div>
              <div>
                <div className="font-medium text-blue-700 dark:text-blue-300 text-xs">Method</div>
                <div className="truncate">{selectedForMatch.payment_method || '-'}</div>
              </div>
              <div>
                <div className="font-medium text-blue-700 dark:text-blue-300 text-xs">Amount</div>
                <div className="font-semibold">{formatCurrency(selectedForMatch.value)}</div>
              </div>
              <div>
                <div className="font-medium text-blue-700 dark:text-blue-300 text-xs">Source</div>
                <div className="truncate text-xs" title={selectedForMatch.source}>{selectedForMatch.source}</div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedForMatch(null)}
              className="h-8 px-3 whitespace-nowrap"
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {filteredTransactions.map((transaction) => (
          <TransactionCard
            key={transaction.id}
            transaction={transaction}
            selectedForMatch={selectedForMatch}
            onSelectForMatch={setSelectedForMatch}
            onManualMatch={(t2) => manualReconcileMutation.mutate({ transaction1: selectedForMatch!, transaction2: t2 })}
            isMatchInProgress={manualReconcileMutation.isPending}
            allTransactions={filteredTransactions}
            onRequestDelete={(t) => {
              setDeleteDialog({ transaction: t, mode: 'delete' });
              setDeleteReasonInput('');
            }}
            onViewDelete={(t) => {
              setDeleteDialog({ transaction: t, mode: 'view' });
              setDeleteReasonInput(t.deleted_reason ?? '');
            }}
            onRevertDelete={(t) => {
              if (window.confirm('Restore this transaction to pending-ledger status?')) {
                revertTransactionMutation.mutate({ transactionId: t.id });
              }
            }}
            isDeleteInProgress={
              deleteTransactionMutation.isPending &&
              deleteTransactionMutation.variables?.transactionId === transaction.id
            }
            isRevertInProgress={
              revertTransactionMutation.isPending &&
              revertTransactionMutation.variables?.transactionId === transaction.id
            }
          />
        ))}
      </div>

      <div ref={observerTarget} className="py-4 text-center space-y-1">
        {isFetchingNextPage && (
          <div className="text-muted-foreground">Loading more...</div>
        )}
        <div className="text-muted-foreground">
          Showing {filteredTransactions.length} transactions
        </div>
        <div className="text-muted-foreground">
          Total (excluding deleted): {formatCurrency(activeTotal)}
        </div>
        <div className="text-xs text-muted-foreground">
          Deleted total excluded: {formatCurrency(deletedTotal)}
        </div>
      </div>
    </div>

    {deleteDialog && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
        <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-lg dark:bg-slate-900">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">
              {deleteDialog.mode === 'delete' ? 'Delete transaction' : 'Deletion reason'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {deleteDialog.mode === 'delete'
                ? 'Explain why this transaction should be deleted. This note will be visible later.'
                : 'This transaction was deleted with the following note:'}
            </p>
          </div>

          {deleteDialog.mode === 'delete' ? (
            <form onSubmit={handleDeleteSubmit} className="space-y-4">
              <textarea
                className="w-full min-h-[120px] rounded-md border border-gray-300 bg-white p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-950"
                value={deleteReasonInput}
                onChange={(event) => setDeleteReasonInput(event.target.value)}
                placeholder="Describe the reason for deleting this transaction..."
                required
                disabled={deleteTransactionMutation.isPending}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeDeleteDialog}
                  disabled={deleteTransactionMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={deleteTransactionMutation.isPending || deleteReasonInput.trim() === ''}
                >
                  {deleteTransactionMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                {deleteDialog.transaction.deleted_reason?.trim()
                  ? deleteDialog.transaction.deleted_reason
                  : 'No reason was provided.'}
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={closeDeleteDialog}>
                  Close
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
  </div>
);
}

function TransactionCard({
  transaction,
  selectedForMatch,
  onSelectForMatch,
  onManualMatch,
  isMatchInProgress,
  allTransactions,
  onRequestDelete,
  onViewDelete,
  onRevertDelete,
  isDeleteInProgress,
  isRevertInProgress,
}: {
  transaction: Transaction;
  selectedForMatch: Transaction | null;
  onSelectForMatch: (transaction: Transaction | null) => void;
  onManualMatch: (transaction: Transaction) => void;
  isMatchInProgress: boolean;
  allTransactions: Transaction[];
  onRequestDelete: (transaction: Transaction) => void;
  onViewDelete: (transaction: Transaction) => void;
  onRevertDelete: (transaction: Transaction) => void;
  isDeleteInProgress: boolean;
  isRevertInProgress: boolean;
}) {
  const [showMatch, setShowMatch] = useState(false);
  void allTransactions;

  const { data: matchedTransaction } = useQuery<Transaction | null>({
    queryKey: ['kingdom-transaction', 'match', transaction.matched_transaction_id],
    queryFn: async () => {
      if (!transaction.matched_transaction_id) return null;

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transaction.matched_transaction_id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: showMatch && !!transaction.matched_transaction_id,
  });

  const statusColors = {
    reconciled: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    'pending-ledger': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'pending-statement': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    deleted: 'bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  } as const;

  const getConfidenceColor = (confidence: number | null) => {
    if (!confidence) return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    if (confidence === 100) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (confidence >= 80) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  };

  return (
    <Card className={`p-4 ${transaction.status === 'deleted' ? 'opacity-50' : ''}`}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 grid grid-cols-7 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Date</div>
              <div className="font-medium">{formatDate(transaction.date)}</div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Client / Depositor</div>
              {transaction.name && (
                <div className="font-medium truncate" title={`Client: ${transaction.name}`}>
                  {transaction.name}
                </div>
              )}
              {transaction.depositor && (
                <div
                  className={`${transaction.name ? 'text-xs text-muted-foreground' : 'font-medium'} truncate`}
                  title={`Depositor: ${transaction.depositor}`}
                >
                  {transaction.depositor}
                </div>
              )}
              {!transaction.name && !transaction.depositor && (
                <div className="font-medium">-</div>
              )}
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Car</div>
              <div className="font-medium">{transaction.car || '-'}</div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Method</div>
              <div className="font-medium">{transaction.payment_method || '-'}</div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Amount</div>
              <div className="font-medium">{formatCurrency(transaction.value)}</div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Status</div>
              <Badge
                className={
                  statusColors[transaction.status as keyof typeof statusColors] ??
                  'bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                }
              >
                {transaction.status}
              </Badge>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Confidence</div>
              {transaction.status === 'reconciled' && transaction.confidence !== null ? (
                <Badge className={getConfidenceColor(transaction.confidence)}>
                  {transaction.confidence}%
                </Badge>
              ) : (
                <div className="font-medium text-muted-foreground">-</div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {transaction.status !== 'reconciled' && transaction.status !== 'deleted' && (
              <Button
                size="icon"
                variant={selectedForMatch?.id === transaction.id ? 'default' : 'outline'}
                onClick={() => {
                  if (selectedForMatch?.id === transaction.id) {
                    onSelectForMatch(null);
                  } else if (selectedForMatch) {
                    onManualMatch(transaction);
                  } else {
                    onSelectForMatch(transaction);
                  }
                }}
                disabled={
                  isMatchInProgress ||
                  isDeleteInProgress ||
                  (selectedForMatch !== null &&
                    selectedForMatch.id !== transaction.id &&
                    selectedForMatch.source === transaction.source)
                }
                title={selectedForMatch?.id === transaction.id ? 'Cancel selection' : selectedForMatch ? 'Match with selected' : 'Select for matching'}
              >
                {isMatchInProgress && selectedForMatch?.id === transaction.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
              </Button>
            )}
            {transaction.status !== 'reconciled' && transaction.status !== 'deleted' && (
              <Button
                size="icon"
                variant="outline"
                onClick={() => onRequestDelete(transaction)}
                disabled={isDeleteInProgress}
                title="Delete transaction"
              >
                {isDeleteInProgress ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            )}
            {transaction.status === 'deleted' && (
              <Button
                size="icon"
                variant="outline"
                onClick={() => onViewDelete(transaction)}
                title="View deletion reason"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
            {transaction.status === 'deleted' && (
              <Button
                size="icon"
                variant="outline"
                onClick={() => onRevertDelete(transaction)}
                disabled={isRevertInProgress}
                title="Restore transaction"
              >
                {isRevertInProgress ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Undo2 className="h-4 w-4" />
                )}
              </Button>
            )}
            {transaction.status === 'reconciled' && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowMatch(!showMatch)}
              >
                <Eye className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {showMatch && matchedTransaction && (
          <div className="ml-8 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-muted-foreground mb-2">
              Matched Transaction ({transaction.confidence}% confidence)
            </div>
            <div className="grid grid-cols-5 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Date</div>
                <div>{formatDate(matchedTransaction.date)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Client / Depositor</div>
                {matchedTransaction.name && (
                  <div className="truncate" title={`Client: ${matchedTransaction.name}`}>
                    {matchedTransaction.name}
                  </div>
                )}
                {matchedTransaction.depositor && (
                  <div
                    className={`${matchedTransaction.name ? 'text-xs text-muted-foreground' : ''} truncate`}
                    title={`Depositor: ${matchedTransaction.depositor}`}
                  >
                    {matchedTransaction.depositor}
                  </div>
                )}
                {!matchedTransaction.name && !matchedTransaction.depositor && (
                  <div>-</div>
                )}
              </div>
              <div>
                <div className="text-muted-foreground">Car</div>
                <div>{matchedTransaction.car || '-'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Amount</div>
                <div>{formatCurrency(matchedTransaction.value)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Source</div>
                <div className="truncate text-xs">{matchedTransaction.source}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
