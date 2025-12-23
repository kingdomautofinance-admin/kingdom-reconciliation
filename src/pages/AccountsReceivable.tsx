import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { AlertCircle, Link2, Loader2, Search, SlidersHorizontal, X, Calendar, Download, Copy, ChevronDown, Eye, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import type {
  DealerReceivable,
  DealerReceivableMatch,
  DealerReceivableChange,
  Transaction,
} from '@/lib/database.types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { formatCurrency, formatISODateToUS, parseUSDateToISO } from '@/lib/utils';
import { DeleteReceivableModal } from '@/components/DeleteReceivableModal';
import { EditReceivableModal } from '@/components/EditReceivableModal';
import { ViewReceivableDetailsModal } from '@/components/ViewReceivableDetailsModal';

const RECEIVABLES_PER_PAGE = 50;
const DATE_TOLERANCE_DAYS = 2;

const normalizeText = (value?: string | null) =>
  (value ?? '').toString().trim();

const normalizeKey = (value?: string | null) =>
  normalizeText(value).toLowerCase();

const toNumber = (value?: string | number | null) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const toNextDay = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
};

const dateWithinTolerance = (dateA: string, dateB: string) => {
  const a = new Date(dateA);
  const b = new Date(dateB);
  const diff = Math.abs(a.getTime() - b.getTime());
  return diff <= DATE_TOLERANCE_DAYS * 24 * 60 * 60 * 1000;
};

const buildCsvRow = (values: Array<string | number | null>) =>
  values
    .map(value => {
      if (value === null || value === undefined) return '';
      const stringValue = value.toString();
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    })
    .join(',');

type AllocationDraft = {
  receivableId: string;
  amount: string;
};

type TransactionOption = Transaction & { remaining: number };

export default function AccountsReceivable() {
  const { showToast } = useToast();
  const [location] = useLocation();
  const urlParams = useMemo(() => new URLSearchParams(location.split('?')[1] || ''), [location]);
  const initialDealership = urlParams.get('dealership') || '';
  const initialSearch = urlParams.get('q') || '';

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'received' | 'deleted'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dealershipFilter, setDealershipFilter] = useState(initialDealership);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    search: '',
    dealership: initialDealership,
    dateFrom: '',
    dateTo: '',
  });

  useEffect(() => {
    if (initialSearch) {
      setSearchTerm(initialSearch);
      setAppliedFilters((prev) => ({
        ...prev,
        search: initialSearch.trim(),
      }));
      void queryClient.invalidateQueries({ queryKey: ['dealer-receivables'] });
    }
  }, [initialSearch]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [overrideTarget, setOverrideTarget] = useState<DealerReceivable | null>(null);
  const [overrideMode, setOverrideMode] = useState<'mark' | 'undo'>('mark');
  const [overrideNote, setOverrideNote] = useState('');
  const [overrideStep, setOverrideStep] = useState<'note' | 'confirm'>('note');
  const [isOutstandingOpen, setIsOutstandingOpen] = useState(false);

  const [allocationsTarget, setAllocationsTarget] = useState<DealerReceivable | null>(null);
  const [matchModalOpen, setMatchModalOpen] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [receivableToEdit, setReceivableToEdit] = useState<DealerReceivable | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [receivableToDelete, setReceivableToDelete] = useState<DealerReceivable | null>(null);
  const [deleteModalMode, setDeleteModalMode] = useState<'delete' | 'view'>('delete');

  const applyFilters = () => {
    setAppliedFilters({
      search: searchTerm.trim(),
      dealership: dealershipFilter.trim().toUpperCase(),
      dateFrom,
      dateTo,
    });
    void queryClient.invalidateQueries({ queryKey: ['dealer-receivables'] });
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDealershipFilter('');
    setDateFrom('');
    setDateTo('');
    setAppliedFilters({
      search: '',
      dealership: '',
      dateFrom: '',
      dateTo: '',
    });
    void queryClient.invalidateQueries({ queryKey: ['dealer-receivables'] });
  };

  const appliedDateFrom = useMemo(() => {
    if (!appliedFilters.dateFrom || appliedFilters.dateFrom.length !== 10) return undefined;
    return parseUSDateToISO(appliedFilters.dateFrom) || undefined;
  }, [appliedFilters.dateFrom]);

  const appliedDateTo = useMemo(() => {
    if (!appliedFilters.dateTo || appliedFilters.dateTo.length !== 10) return undefined;
    return parseUSDateToISO(appliedFilters.dateTo) || undefined;
  }, [appliedFilters.dateTo]);

  const effectiveEndExclusive = appliedDateTo ? toNextDay(appliedDateTo) : undefined;

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<DealerReceivable[]>({
    queryKey: ['dealer-receivables', statusFilter, appliedFilters.search, appliedFilters.dealership, appliedDateFrom ?? null, appliedDateTo ?? null],
    queryFn: async ({ pageParam = 0 }) => {
      const start = pageParam as number;
      const end = start + RECEIVABLES_PER_PAGE - 1;

      let query = supabase
        .from('dealer_receivables')
        .select('*')
        .order('date', { ascending: false })
        .order('sheet_order', { ascending: false, nullsFirst: false });

      if (statusFilter === 'deleted') {
        query = query.eq('is_deleted', true);
      } else {
        query = query.eq('is_deleted', false);
        if (statusFilter !== 'all') {
          query = query.eq('status', statusFilter);
        }
      }

      if (appliedFilters.dealership) {
        query = query.eq('dealership', appliedFilters.dealership);
      }

      if (appliedDateFrom) {
        query = query.gte('date', appliedDateFrom);
      }

      if (effectiveEndExclusive) {
        query = query.lt('date', effectiveEndExclusive);
      }

      if (appliedFilters.search) {
        const search = `*${appliedFilters.search.replace(/\*/g, '').replace(/%/g, '\\%')}*`;
        query = query.or([
          `loan_id.ilike.${search}`,
          `client.ilike.${search}`,
          `depositor.ilike.${search}`,
          `car.ilike.${search}`,
          `dealership.ilike.${search}`,
        ].join(','));
      }

      const { data, error } = await query.range(start, end);
      if (error) throw error;
      return data || [];
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < RECEIVABLES_PER_PAGE) return undefined;
      return allPages.length * RECEIVABLES_PER_PAGE;
    },
    initialPageParam: 0,
    staleTime: 30000,
  });

  const receivables = useMemo(() => data?.pages.flat() || [], [data]);

  useEffect(() => {
    if (!initialDealership) return;
    setDealershipFilter(initialDealership);
    setAppliedFilters(prev => ({ ...prev, dealership: initialDealership.toUpperCase() }));
  }, [initialDealership]);

  const receivableIds = useMemo(() => receivables.map(item => item.id), [receivables]);

  const { data: matches } = useQuery<DealerReceivableMatch[]>({
    queryKey: ['dealer-receivable-matches', receivableIds],
    queryFn: async () => {
      if (receivableIds.length === 0) return [];
      const { data, error } = await supabase
        .from('dealer_receivable_matches')
        .select('*')
        .in('receivable_id', receivableIds);
      if (error) throw error;
      return data || [];
    },
    enabled: receivableIds.length > 0,
    staleTime: 30000,
  });

  const { data: changes } = useQuery<DealerReceivableChange[]>({
    queryKey: ['dealer-receivable-changes', receivableIds],
    queryFn: async () => {
      if (receivableIds.length === 0) return [];
      const { data, error } = await supabase
        .from('dealer_receivable_changes')
        .select('*')
        .in('receivable_id', receivableIds)
        .order('changed_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: receivableIds.length > 0,
    staleTime: 30000,
  });

  const matchedTotals = useMemo(() => {
    const totals = new Map<string, number>();
    (matches || []).forEach(match => {
      totals.set(match.receivable_id, (totals.get(match.receivable_id) || 0) + toNumber(match.matched_amount));
    });
    return totals;
  }, [matches]);

  const { data: outstandingSummary } = useQuery<{
    total: number;
    byDealership: Array<{ dealership: string; amount: number }>;
  }>({
    queryKey: ['dealer-receivables-outstanding-summary'],
    queryFn: async () => {
      const [receivablesResult, matchesResult] = await Promise.all([
        supabase.from('dealer_receivables').select('id, amount, dealership'),
        supabase.from('dealer_receivable_matches').select('receivable_id, matched_amount'),
      ]);

      if (receivablesResult.error) throw receivablesResult.error;
      if (matchesResult.error) throw matchesResult.error;

      const totals = new Map<string, number>();
      (matchesResult.data || []).forEach(match => {
        totals.set(match.receivable_id, (totals.get(match.receivable_id) || 0) + toNumber(match.matched_amount));
      });

      const byDealership = new Map<string, number>();
      let total = 0;
      (receivablesResult.data || []).forEach(receivable => {
        const matched = totals.get(receivable.id) || 0;
        const outstanding = Math.max(0, toNumber(receivable.amount) - matched);
        if (outstanding <= 0) return;
        const dealership = receivable.dealership || 'UNKNOWN';
        byDealership.set(dealership, (byDealership.get(dealership) || 0) + outstanding);
        total += outstanding;
      });

      return {
        total,
        byDealership: Array.from(byDealership.entries())
          .map(([dealership, amount]) => ({ dealership, amount }))
          .sort((a, b) => b.amount - a.amount),
      };
    },
    staleTime: 60000,
  });

  const changeNotes = useMemo(() => {
    const grouped = new Map<string, DealerReceivableChange[]>();
    (changes || []).forEach(change => {
      if (!grouped.has(change.receivable_id)) {
        grouped.set(change.receivable_id, []);
      }
      grouped.get(change.receivable_id)?.push(change);
    });
    return grouped;
  }, [changes]);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllOnPage = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      receivables.forEach(item => next.add(item.id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const openOverrideModal = (receivable: DealerReceivable, mode: 'mark' | 'undo') => {
    setOverrideTarget(receivable);
    setOverrideMode(mode);
    setOverrideNote('');
    setOverrideStep('note');
  };

  const closeOverrideModal = () => {
    setOverrideTarget(null);
    setOverrideNote('');
    setOverrideStep('note');
  };

  const confirmOverride = async () => {
    if (!overrideTarget || !overrideNote.trim()) return;
    const now = new Date().toISOString();
    const payload =
      overrideMode === 'mark'
        ? {
          status: 'received',
          received_at: now,
          manual_override_note: overrideNote.trim(),
          manual_override_at: now,
        }
        : {
          status: 'pending',
          received_at: null,
          manual_override_note: overrideNote.trim(),
          manual_override_at: now,
        };

    const { error } = await supabase
      .from('dealer_receivables')
      .update(payload)
      .eq('id', overrideTarget.id);

    if (error) {
      showToast(`Manual override failed: ${error.message}`, 'error');
      return;
    }

    await supabase.from('dealer_receivable_changes').insert({
      receivable_id: overrideTarget.id,
      field_diffs: {
        status: {
          from: overrideTarget.status,
          to: payload.status,
        },
        note: {
          from: null,
          to: overrideNote.trim(),
        },
      },
      changed_at: now,
    });

    showToast('Manual override saved.', 'success');
    closeOverrideModal();
    void queryClient.invalidateQueries({ queryKey: ['dealer-receivables'] });
    void queryClient.invalidateQueries({ queryKey: ['dealer-receivable-changes'] });
  };

  const editReceivableMutation = useMutation({
    mutationFn: async ({ receivableId, updates }: { receivableId: string, updates: Partial<DealerReceivable> }) => {
      const { error } = await supabase
        .from('dealer_receivables')
        .update(updates)
        .eq('id', receivableId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-receivables'] });
      showToast('Receivable updated successfully!', 'success');
    },
    onError: (error: any) => {
      showToast(`Failed to update receivable: ${error.message}`, 'error');
    },
  });

  const deleteReceivableMutation = useMutation({
    mutationFn: async ({ receivableId, reason, currentStatus }: { receivableId: string, reason: string, currentStatus: string }) => {
      const { error } = await supabase
        .from('dealer_receivables')
        .update({
          is_deleted: true,
          deleted_reason: reason,
          previous_status: currentStatus,
        })
        .eq('id', receivableId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-receivables'] });
      showToast('Receivable deleted successfully!', 'success');
    },
    onError: (error: any) => {
      showToast(`Failed to delete receivable: ${error.message}`, 'error');
    },
  });

  const restoreReceivableMutation = useMutation({
    mutationFn: async (receivable: DealerReceivable) => {
      const { error } = await supabase
        .from('dealer_receivables')
        .update({
          is_deleted: false,
          deleted_reason: null,
          status: receivable.previous_status || 'pending',
          previous_status: null,
        })
        .eq('id', receivable.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-receivables'] });
      showToast('Receivable restored successfully!', 'success');
    },
    onError: (error: any) => {
      showToast(`Failed to restore receivable: ${error.message}`, 'error');
    },
  });

  const autoMatchReceivables = async () => {
    showToast('Running auto-match...', 'info');

    const fetchAllReceivables = async () => {
      const PAGE_SIZE = 500;
      let offset = 0;
      let allRows: DealerReceivable[] = [];
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('dealer_receivables')
          .select('*')
          .eq('status', 'pending')
          .order('date', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (appliedFilters.dealership) {
          query = query.eq('dealership', appliedFilters.dealership);
        }

        if (appliedDateFrom) {
          query = query.gte('date', appliedDateFrom);
        }

        if (effectiveEndExclusive) {
          query = query.lt('date', effectiveEndExclusive);
        }

        if (appliedFilters.search) {
          const search = `*${appliedFilters.search.replace(/\*/g, '').replace(/%/g, '\\%')}*`;
          query = query.or([
            `loan_id.ilike.${search}`,
            `client.ilike.${search}`,
            `depositor.ilike.${search}`,
            `car.ilike.${search}`,
            `dealership.ilike.${search}`,
          ].join(','));
        }

        const { data, error } = await query;
        if (error) throw error;

        allRows = allRows.concat(data || []);
        if (!data || data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          offset += PAGE_SIZE;
        }
      }
      return allRows;
    };

    let pendingReceivables: DealerReceivable[] = [];
    try {
      pendingReceivables = await fetchAllReceivables();
    } catch (error: any) {
      showToast(`Auto-match failed: ${error.message}`, 'error');
      return;
    }

    if (pendingReceivables.length === 0) {
      showToast('No pending receivables to match.', 'info');
      return;
    }

    const { data: transactionData, error: transactionError } = await supabase
      .from('transactions')
      .select('*')
      .eq('status', 'pending-statement')
      .is('matched_transaction_id', null)
      .eq('is_deleted', false)
      .order('date', { ascending: true });

    if (transactionError) {
      showToast(`Auto-match failed: ${transactionError.message}`, 'error');
      return;
    }

    const { data: existingAllocations, error: allocationError } = await supabase
      .from('dealer_receivable_matches')
      .select('transaction_id, matched_amount');

    if (allocationError) {
      showToast(`Auto-match failed: ${allocationError.message}`, 'error');
      return;
    }

    const allocationTotals = new Map<string, number>();
    (existingAllocations || []).forEach(match => {
      allocationTotals.set(
        match.transaction_id,
        (allocationTotals.get(match.transaction_id) || 0) + toNumber(match.matched_amount)
      );
    });

    const transactionOptions: TransactionOption[] = (transactionData || []).map(transaction => {
      const allocated = allocationTotals.get(transaction.id) || 0;
      return {
        ...transaction,
        remaining: Math.max(0, toNumber(transaction.value) - allocated),
      };
    });

    const newMatches: Array<{ receivable_id: string; transaction_id: string; matched_amount: number; match_type: 'auto' }> = [];

    for (const receivable of pendingReceivables) {
      const amountNeeded = toNumber(receivable.amount);
      const match = transactionOptions.find(transaction =>
        transaction.remaining === amountNeeded && dateWithinTolerance(receivable.date, transaction.date)
      );
      if (!match) continue;

      newMatches.push({
        receivable_id: receivable.id,
        transaction_id: match.id,
        matched_amount: amountNeeded,
        match_type: 'auto',
      });

      match.remaining -= amountNeeded;
    }

    if (newMatches.length === 0) {
      showToast('No perfect matches found.', 'info');
      return;
    }

    const { error: insertError } = await supabase
      .from('dealer_receivable_matches')
      .insert(newMatches);

    if (insertError) {
      showToast(`Auto-match failed: ${insertError.message}`, 'error');
      return;
    }

    const receivableIds = newMatches.map(match => match.receivable_id);
    await updateReceivableStatuses(receivableIds);

    showToast(`Auto-matched ${newMatches.length} receivable(s).`, 'success');
    void queryClient.invalidateQueries({ queryKey: ['dealer-receivables'] });
    void queryClient.invalidateQueries({ queryKey: ['dealer-receivable-matches'] });
  };

  const updateReceivableStatuses = async (ids: string[]) => {
    if (ids.length === 0) return;

    const { data: receivableData, error: receivableError } = await supabase
      .from('dealer_receivables')
      .select('id, amount, status')
      .in('id', ids);

    if (receivableError) {
      showToast(`Status update failed: ${receivableError.message}`, 'error');
      return;
    }

    const { data: matchData, error: matchError } = await supabase
      .from('dealer_receivable_matches')
      .select('receivable_id, matched_amount')
      .in('receivable_id', ids);

    if (matchError) {
      showToast(`Status update failed: ${matchError.message}`, 'error');
      return;
    }

    const totals = new Map<string, number>();
    (matchData || []).forEach(match => {
      totals.set(match.receivable_id, (totals.get(match.receivable_id) || 0) + toNumber(match.matched_amount));
    });

    const now = new Date().toISOString();
    for (const receivable of receivableData || []) {
      const matchedTotal = totals.get(receivable.id) || 0;
      if (matchedTotal >= toNumber(receivable.amount) && receivable.status !== 'received') {
        await supabase
          .from('dealer_receivables')
          .update({
            status: 'received',
            received_at: now,
          })
          .eq('id', receivable.id);
      }
    }
  };

  const removeAllocation = async (allocationId: string, receivableId: string) => {
    const { error } = await supabase
      .from('dealer_receivable_matches')
      .delete()
      .eq('id', allocationId);

    if (error) {
      showToast(`Failed to remove allocation: ${error.message}`, 'error');
      return;
    }

    const { data: receivableData } = await supabase
      .from('dealer_receivables')
      .select('id, amount, status')
      .eq('id', receivableId)
      .maybeSingle();

    const { data: matchData } = await supabase
      .from('dealer_receivable_matches')
      .select('matched_amount')
      .eq('receivable_id', receivableId);

    const totalMatched = (matchData || []).reduce((sum, match) => sum + toNumber(match.matched_amount), 0);
    if (receivableData && totalMatched < toNumber(receivableData.amount)) {
      const now = new Date().toISOString();
      await supabase
        .from('dealer_receivables')
        .update({
          status: 'pending',
          received_at: null,
        })
        .eq('id', receivableId);

      await supabase.from('dealer_receivable_changes').insert({
        receivable_id: receivableId,
        field_diffs: {
          status: {
            from: receivableData.status,
            to: 'pending',
          },
          note: {
            from: null,
            to: 'Allocation reduced or removed',
          },
        },
        changed_at: now,
      });
    }

    showToast('Allocation removed.', 'success');
    void queryClient.invalidateQueries({ queryKey: ['dealer-receivables'] });
    void queryClient.invalidateQueries({ queryKey: ['dealer-receivable-matches'] });
    void queryClient.invalidateQueries({ queryKey: ['dealer-receivable-changes'] });
  };

  const exportCsv = () => {
    if (receivables.length === 0) {
      showToast('No receivables to export.', 'info');
      return;
    }
    const header = buildCsvRow([
      'Date',
      'LoanId',
      'Client',
      'Depositor',
      'Car',
      'Method',
      'Dealership',
      'Amount',
      'Matched',
      'Outstanding',
      'Status',
    ]);
    const rows = receivables.map(receivable => {
      const matched = matchedTotals.get(receivable.id) || 0;
      const outstanding = Math.max(0, toNumber(receivable.amount) - matched);
      return buildCsvRow([
        receivable.date.slice(0, 10),
        receivable.loan_id,
        receivable.client,
        receivable.depositor,
        receivable.car,
        receivable.method,
        receivable.dealership,
        receivable.amount,
        matched.toFixed(2),
        outstanding.toFixed(2),
        receivable.status,
      ]);
    });
    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'dealer-receivables.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const renderStatusBadge = (status: string) => {
    if (status === 'received') {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Received</Badge>;
    }
    return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Pending</Badge>;
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Loan ID copied to clipboard', 'success');
    } catch (err) {
      showToast('Failed to copy to clipboard', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounts Receivables</h1>
          <p className="text-muted-foreground">
            Track dealership-collected payments and confirm transfers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={autoMatchReceivables} disabled={receivables.length === 0}>
            <Link2 className="h-4 w-4" />
            Auto-match
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={receivables.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setIsOutstandingOpen((prev) => !prev)}
          aria-expanded={isOutstandingOpen}
          aria-controls="outstanding-by-dealership"
        >
          <div>
            <h2 className="text-sm font-semibold">Outstanding by Dealership</h2>
            <p className="text-xs text-muted-foreground">
              Total outstanding: {formatCurrency(outstandingSummary?.total || 0)}
            </p>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${isOutstandingOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {isOutstandingOpen && (
          <div id="outstanding-by-dealership" className="space-y-2">
            {outstandingSummary?.byDealership.length === 0 && (
              <div className="text-sm text-muted-foreground">No outstanding balances.</div>
            )}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {outstandingSummary?.byDealership.map(entry => (
                <Button
                  key={entry.dealership}
                  variant="outline"
                  className="flex items-center justify-between h-auto py-3"
                  onClick={() => {
                    setDealershipFilter(entry.dealership);
                    setAppliedFilters(prev => ({
                      ...prev,
                      dealership: entry.dealership,
                    }));
                    void queryClient.invalidateQueries({ queryKey: ['dealer-receivables'] });
                  }}
                >
                  <span className="font-normal">{entry.dealership}</span>
                  <span className="font-semibold ml-3">{formatCurrency(entry.amount)}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by loan, client, dealership..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyFilters();
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
              onChange={(e) => setDateFrom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyFilters();
                }
              }}
              className="pl-9 w-40"
              maxLength={10}
            />
          </div>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="MM/DD/YYYY"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyFilters();
                }
              }}
              className="pl-9 w-40"
              maxLength={10}
            />
          </div>
        </div>

        <div className="flex gap-2 items-end">
          <Button onClick={applyFilters} size="sm">
            Apply Filters
          </Button>
          <Button variant="outline" onClick={clearFilters} size="sm">
            Clear
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          onClick={() => setStatusFilter('all')}
          size="sm"
        >
          All
        </Button>
        <Button
          variant={statusFilter === 'pending' ? 'default' : 'outline'}
          onClick={() => setStatusFilter('pending')}
          size="sm"
        >
          Pending
        </Button>
        <Button
          variant={statusFilter === 'received' ? 'default' : 'outline'}
          onClick={() => setStatusFilter('received')}
          size="sm"
        >
          Received
        </Button>
        <Button
          variant={statusFilter === 'deleted' ? 'default' : 'outline'}
          onClick={() => setStatusFilter('deleted')}
          size="sm"
        >
          Deleted
        </Button>
      </div>

      {selectedIds.size > 0 && (
        <Card className="p-3 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {selectedIds.size} receivable{selectedIds.size > 1 ? 's' : ''} selected
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setMatchModalOpen(true)}
                disabled={selectedIds.size === 0}
                size="sm"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Match selected
              </Button>
              <Button variant="ghost" onClick={clearSelection} size="sm">
                Clear
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[75px_40px_1fr_100px_70px_100px_90px_90px_140px] gap-3 border-b px-4 py-3 text-xs font-semibold text-muted-foreground">
          <span>Date</span>
          <span />
          <span>Client / Depositor</span>
          <span>Car</span>
          <span>Method</span>
          <span>Dealership</span>
          <span className="text-right">Amount</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading receivables...
          </div>
        )}
        {!isLoading && receivables.length === 0 && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            No receivables found.
          </div>
        )}
        {receivables.map(receivable => {
          const matched = matchedTotals.get(receivable.id) || 0;
          const outstanding = Math.max(0, toNumber(receivable.amount) - matched);
          const isSelected = selectedIds.has(receivable.id);
          const notes = changeNotes.get(receivable.id) || [];
          const alertTextParts: string[] = [];

          if (receivable.manual_override_note) {
            alertTextParts.push(`Manual override: ${receivable.manual_override_note}`);
          }

          notes.forEach(note => {
            const diffs = note.field_diffs as Record<string, { from: string | null; to: string | null }>;
            Object.entries(diffs || {}).forEach(([field, change]) => {
              if (field === 'note') return;
              alertTextParts.push(`${field}: ${change.from ?? 'empty'} → ${change.to ?? 'empty'}`);
            });
          });

          return (
            <div
              key={receivable.id}
              className="grid grid-cols-[75px_40px_1fr_100px_70px_100px_90px_90px_140px] gap-3 border-b px-4 py-3 text-sm items-center"
            >
              <div className="text-xs">{formatISODateToUS(receivable.date.slice(0, 10))}</div>
              <div className="flex items-center justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => copyToClipboard(receivable.loan_id)}
                  title={`Copy Loan ID: ${receivable.loan_id}`}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <div className="min-w-0">
                <div className="font-medium text-xs truncate" title={receivable.client || ''}>{receivable.client || '—'}</div>
                <div className="text-xs text-muted-foreground truncate" title={receivable.depositor || ''}>{receivable.depositor || '—'}</div>
              </div>
              <div className="text-xs truncate">{receivable.car || '—'}</div>
              <div className="text-xs truncate">{receivable.method || '—'}</div>
              <div className="text-xs truncate">{receivable.dealership || '—'}</div>
              <div className="font-medium text-xs text-right">{formatCurrency(toNumber(receivable.amount))}</div>
              <div className="flex items-center">
                {renderStatusBadge(receivable.status)}
                {alertTextParts.length > 0 && (
                  <span title={alertTextParts.join('\n')} className="ml-1">
                    <AlertCircle className="h-4 w-4 text-orange-500" />
                  </span>
                )}
              </div>
              <div className="flex items-center justify-end gap-1">
                {receivable.status === 'pending' && (
                  <Button
                    size="icon"
                    variant={isSelected ? 'default' : 'outline'}
                    className="h-8 w-8"
                    onClick={() => toggleSelection(receivable.id)}
                    title={isSelected ? 'Unselect' : 'Select for matching'}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                {matched > 0 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setAllocationsTarget(receivable)}
                    title="View allocations"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                )}
                {!receivable.is_deleted && receivable.status === 'pending' ? (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => {
                        setReceivableToEdit(receivable);
                        setEditModalOpen(true);
                      }}
                      title="Edit receivable"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => {
                        setReceivableToDelete(receivable);
                        setDeleteModalMode('delete');
                        setDeleteModalOpen(true);
                      }}
                      title="Delete receivable"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => openOverrideModal(receivable, 'mark')}
                      title="Mark as received"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : receivable.is_deleted ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      setReceivableToDelete(receivable);
                      setDeleteModalMode('view');
                      setDeleteModalOpen(true);
                    }}
                    title="View deletion reason and restore"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                ) : !receivable.is_deleted && receivable.status === 'received' ? (
                  <div className="h-8 w-8 flex items-center justify-center" title="Received">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </Card>

      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}

      {overrideTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {overrideMode === 'mark' ? 'Manual Receive Override' : 'Undo Manual Override'}
              </h2>
              <Button variant="ghost" size="icon" onClick={closeOverrideModal}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {overrideStep === 'note' && (
              <>
                <p className="text-sm text-muted-foreground">
                  Add a note explaining this manual override. A confirmation step is required.
                </p>
                <Input
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  placeholder="Required note"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={closeOverrideModal}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (!overrideNote.trim()) return;
                      showToast('Please confirm this manual override.', 'warning');
                      setOverrideStep('confirm');
                    }}
                    disabled={!overrideNote.trim()}
                  >
                    Continue
                  </Button>
                </div>
              </>
            )}

            {overrideStep === 'confirm' && (
              <>
                <p className="text-sm text-muted-foreground">
                  Please confirm this manual override. This will be logged for audit purposes.
                </p>
                <div className="bg-muted p-3 rounded text-sm">
                  <div className="font-medium">Note</div>
                  <div>{overrideNote}</div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setOverrideStep('note')}>
                    Back
                  </Button>
                  <Button onClick={confirmOverride}>Confirm Override</Button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {allocationsTarget && (
        <AllocationsModal
          receivable={allocationsTarget}
          onClose={() => setAllocationsTarget(null)}
          onRemoveAllocation={removeAllocation}
        />
      )}

      {matchModalOpen && (
        <MatchModal
          onClose={() => setMatchModalOpen(false)}
          selectedReceivables={receivables.filter(item => selectedIds.has(item.id))}
          matchedTotals={matchedTotals}
          onMatched={async (ids) => {
            await updateReceivableStatuses(ids);
            setSelectedIds(new Set());
            setMatchModalOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['dealer-receivables'] });
            void queryClient.invalidateQueries({ queryKey: ['dealer-receivable-matches'] });
          }}
        />
      )}

      <EditReceivableModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setReceivableToEdit(null);
        }}
        onConfirm={(updates) => {
          if (receivableToEdit) {
            editReceivableMutation.mutate({ receivableId: receivableToEdit.id, updates });
          }
        }}
        receivable={receivableToEdit}
      />

      <DeleteReceivableModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setReceivableToDelete(null);
        }}
        onConfirm={(reason) => {
          if (receivableToDelete) {
            deleteReceivableMutation.mutate({
              receivableId: receivableToDelete.id,
              reason,
              currentStatus: receivableToDelete.status,
            });
          }
        }}
        mode={deleteModalMode}
        existingReason={receivableToDelete?.deleted_reason || undefined}
        onRestore={
          deleteModalMode === 'view' && receivableToDelete
            ? () => restoreReceivableMutation.mutate(receivableToDelete)
            : undefined
        }
      />
    </div>
  );
}

type AllocationsModalProps = {
  receivable: DealerReceivable;
  onClose: () => void;
  onRemoveAllocation: (allocationId: string, receivableId: string) => void;
};

function AllocationsModal({ receivable, onClose, onRemoveAllocation }: AllocationsModalProps) {
  const { data: allocations, isLoading } = useQuery<DealerReceivableMatch[]>({
    queryKey: ['dealer-receivable-allocations', receivable.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dealer_receivable_matches')
        .select('*')
        .eq('receivable_id', receivable.id);
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Allocations for {receivable.loan_id}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {isLoading && <div className="text-sm text-muted-foreground">Loading allocations...</div>}
        {!isLoading && (!allocations || allocations.length === 0) && (
          <div className="text-sm text-muted-foreground">No allocations yet.</div>
        )}
        {!isLoading && allocations && allocations.length > 0 && (
          <div className="space-y-2">
            {allocations.map(allocation => (
              <div key={allocation.id} className="flex items-center justify-between text-sm border-b pb-2">
                <div>
                  <div className="font-medium">Transaction {allocation.transaction_id.slice(0, 8)}...</div>
                  <div className="text-xs text-muted-foreground">
                    {allocation.match_type} match
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span>{formatCurrency(toNumber(allocation.matched_amount))}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveAllocation(allocation.id, allocation.receivable_id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}

type MatchModalProps = {
  onClose: () => void;
  selectedReceivables: DealerReceivable[];
  matchedTotals: Map<string, number>;
  onMatched: (receivableIds: string[]) => void;
};

function MatchModal({ onClose, selectedReceivables, matchedTotals, onMatched }: MatchModalProps) {
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionOption | null>(null);
  const [allocationDrafts, setAllocationDrafts] = useState<AllocationDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAllocationDrafts(
      selectedReceivables.map(receivable => ({
        receivableId: receivable.id,
        amount: '',
      }))
    );
  }, [selectedReceivables]);

  const { data: transactions, isLoading } = useQuery<TransactionOption[]>({
    queryKey: ['dealer-receivable-transaction-search', searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('status', 'pending-statement')
        .is('matched_transaction_id', null)
        .eq('is_deleted', false)
        .order('date', { ascending: true })
        .limit(20);

      if (searchTerm.trim()) {
        const search = `*${searchTerm.trim().replace(/\*/g, '').replace(/%/g, '\\%')}*`;
        query = query.or([
          `name.ilike.${search}`,
          `depositor.ilike.${search}`,
          `historical_text.ilike.${search}`,
          `value.ilike.${search}`,
        ].join(','));
      }

      const { data: dataRows, error } = await query;
      if (error) throw error;

      const { data: allocations } = await supabase
        .from('dealer_receivable_matches')
        .select('transaction_id, matched_amount')
        .in('transaction_id', (dataRows || []).map(row => row.id));

      const allocationTotals = new Map<string, number>();
      (allocations || []).forEach(match => {
        allocationTotals.set(
          match.transaction_id,
          (allocationTotals.get(match.transaction_id) || 0) + toNumber(match.matched_amount)
        );
      });

      return (dataRows || [])
        .map(row => {
          const allocated = allocationTotals.get(row.id) || 0;
          return {
            ...row,
            remaining: Math.max(0, toNumber(row.value) - allocated),
          };
        })
        .filter(row => row.remaining > 0);
    },
  });

  const totalOutstanding = selectedReceivables.reduce((sum, receivable) => {
    const matched = matchedTotals.get(receivable.id) || 0;
    return sum + Math.max(0, toNumber(receivable.amount) - matched);
  }, 0);

  const totalAllocated = allocationDrafts.reduce((sum, draft) => sum + toNumber(draft.amount), 0);

  const updateDraft = (receivableId: string, amount: string) => {
    setAllocationDrafts(prev =>
      prev.map(draft => (draft.receivableId === receivableId ? { ...draft, amount } : draft))
    );
  };

  const handleSave = async () => {
    if (!selectedTransaction) {
      showToast('Select a bank transaction.', 'error');
      return;
    }

    const allocations = allocationDrafts
      .map(draft => ({
        receivableId: draft.receivableId,
        amount: toNumber(draft.amount),
      }))
      .filter(draft => draft.amount > 0);

    if (allocations.length === 0) {
      showToast('Enter at least one allocation amount.', 'error');
      return;
    }

    if (totalAllocated > selectedTransaction.remaining) {
      showToast('Allocated total exceeds transaction remaining amount.', 'error');
      return;
    }

    for (const allocation of allocations) {
      const receivable = selectedReceivables.find(item => item.id === allocation.receivableId);
      if (!receivable) continue;
      const matched = matchedTotals.get(receivable.id) || 0;
      const outstanding = Math.max(0, toNumber(receivable.amount) - matched);
      if (allocation.amount > outstanding) {
        showToast(`Allocation exceeds outstanding for loan ${receivable.loan_id}.`, 'error');
        return;
      }
    }

    setIsSaving(true);

    const insertPayload = allocations.map(allocation => ({
      receivable_id: allocation.receivableId,
      transaction_id: selectedTransaction.id,
      matched_amount: allocation.amount,
      match_type: 'manual' as const,
    }));

    const { error } = await supabase
      .from('dealer_receivable_matches')
      .insert(insertPayload);

    setIsSaving(false);

    if (error) {
      showToast(`Allocation failed: ${error.message}`, 'error');
      return;
    }

    showToast('Allocations saved.', 'success');
    onMatched(allocations.map(allocation => allocation.receivableId));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-4xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Match selected receivables</h2>
            <p className="text-sm text-muted-foreground">
              Allocate a bank transaction across selected receivables.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                ref={searchRef}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search bank transactions..."
              />
              <Button variant="outline" size="icon" onClick={() => searchRef.current?.focus()}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-2">
              {isLoading && <div className="text-sm text-muted-foreground">Loading transactions...</div>}
              {!isLoading && transactions && transactions.length === 0 && (
                <div className="text-sm text-muted-foreground">No transactions found.</div>
              )}
              {!isLoading && transactions?.map(transaction => {
                const isSelected = selectedTransaction?.id === transaction.id;
                return (
                  <button
                    key={transaction.id}
                    className={`w-full text-left border rounded-md p-2 text-sm ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:border-muted'
                      }`}
                    onClick={() => setSelectedTransaction(transaction)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{formatCurrency(toNumber(transaction.value))}</span>
                      <span className="text-xs text-muted-foreground">{transaction.date.slice(0, 10)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {transaction.depositor || transaction.name || transaction.historical_text || '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Remaining: {formatCurrency(transaction.remaining)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <Card className="p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Total outstanding</span>
                <span className="font-medium">{formatCurrency(totalOutstanding)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Allocated</span>
                <span className="font-medium">{formatCurrency(totalAllocated)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Remaining (transaction)</span>
                <span className="font-medium">
                  {selectedTransaction ? formatCurrency(selectedTransaction.remaining) : '—'}
                </span>
              </div>
            </Card>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {selectedReceivables.map(receivable => {
                const matched = matchedTotals.get(receivable.id) || 0;
                const outstanding = Math.max(0, toNumber(receivable.amount) - matched);
                const draft = allocationDrafts.find(item => item.receivableId === receivable.id);
                return (
                  <div key={receivable.id} className="flex items-center justify-between gap-3 text-sm border rounded-md p-2">
                    <div>
                      <div className="font-medium">{receivable.loan_id}</div>
                      <div className="text-xs text-muted-foreground">
                        Outstanding: {formatCurrency(outstanding)}
                      </div>
                    </div>
                    <Input
                      value={draft?.amount ?? ''}
                      onChange={(e) => updateDraft(receivable.id, e.target.value)}
                      placeholder="0.00"
                      className="w-28 text-right"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save allocations'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
