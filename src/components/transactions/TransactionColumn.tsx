import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Transaction } from '@/lib/database.types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Eye, Link2, Link2Off, Loader2, Pencil, Trash2 } from 'lucide-react';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { type SortConfig, getNextSortState } from '@/lib/sorting';
import { formatCurrency, formatDate } from '@/lib/utils';

const ITEMS_PER_PAGE = 50;

type ColumnSortColumn = 'date' | 'name' | 'value';
export type ColumnMode = 'match' | 'reconciled' | 'deleted';

export interface ColumnFilters {
  appliedSearchTerm: string;
  appliedMethodFilter: string;
  effectiveStartDate?: string;
  effectiveEndExclusive?: string;
}

interface TransactionColumnProps {
  mode: ColumnMode;
  /** 'ledger' = Google Sheets; 'statement' = Zelle/Credit Card (bank). */
  side: 'ledger' | 'statement';
  title: string;
  filters: ColumnFilters;
  canRunQueries: boolean;
  accent: 'blue' | 'orange';
  sortConfig: SortConfig<ColumnSortColumn>;
  onSortChange: (config: SortConfig<ColumnSortColumn>) => void;
  // match mode
  selectedId?: string | null;
  onSelect?: (transaction: Transaction) => void;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
  // reconciled mode
  onViewMatch?: (transaction: Transaction) => void;
  onUnmatch?: (transaction: Transaction) => void;
  // deleted mode
  onViewDeleteReason?: (transaction: Transaction) => void;
}

const escapeForIlike = (term: string) =>
  term.replace(/([*\\])/g, '\\$1').replace(/,/g, '\\,').replace(/_/g, '\\_').replace(/%/g, '\\%');

const buildAmountCondition = (rawTerm: string) => {
  const digitsOnly = rawTerm.replace(/[^\d.-]/g, '');
  if (!digitsOnly) return null;
  const numericValue = Number(digitsOnly);
  if (Number.isNaN(numericValue)) return null;
  return `value.eq.${encodeURIComponent(numericValue.toString())}`;
};

const LEDGER_SOURCE_PREFIX = 'Google Sheets%';

export function TransactionColumn({
  mode,
  side,
  title,
  filters,
  canRunQueries,
  accent,
  sortConfig,
  onSortChange,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onViewMatch,
  onUnmatch,
  onViewDeleteReason,
}: TransactionColumnProps) {
  const observerTarget = useRef<HTMLDivElement>(null);
  const { appliedSearchTerm, appliedMethodFilter, effectiveStartDate, effectiveEndExclusive } = filters;

  // Apply the mode/side + shared filters to a query builder.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withFilters = (query: any) => {
    if (mode === 'match') {
      query = query.eq('status', side === 'ledger' ? 'pending-ledger' : 'pending-statement').eq('is_deleted', false);
    } else {
      // reconciled / deleted: both sides share a status, so split by source.
      query = side === 'ledger'
        ? query.ilike('source', LEDGER_SOURCE_PREFIX)
        : query.not('source', 'ilike', LEDGER_SOURCE_PREFIX);
      query = mode === 'deleted'
        ? query.eq('is_deleted', true)
        : query.eq('status', 'reconciled').eq('is_deleted', false);
    }

    if (effectiveStartDate) query = query.gte('date', effectiveStartDate);
    if (effectiveEndExclusive) query = query.lt('date', effectiveEndExclusive);
    if (appliedMethodFilter) query = query.eq('payment_method', appliedMethodFilter);

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
      if (amountCondition) orConditions.push(amountCondition);
      query = query.or(orConditions.join(','));
    }

    return query;
  };

  const filterKey = [
    mode,
    side,
    appliedSearchTerm,
    appliedMethodFilter,
    effectiveStartDate ?? null,
    effectiveEndExclusive ?? null,
  ];

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery<Transaction[]>({
    queryKey: ['transactions-column', ...filterKey, sortConfig.column, sortConfig.direction],
    queryFn: async ({ pageParam = 0 }) => {
      const start = pageParam as number;
      const end = start + ITEMS_PER_PAGE - 1;
      const query = withFilters(
        supabase.from('transactions').select('*').gte('value', 0),
      )
        .order(sortConfig.column, { ascending: sortConfig.direction === 'asc', nullsFirst: false })
        .order('sheet_order', { ascending: false, nullsFirst: false });

      const { data, error } = await query.range(start, end);
      if (error) throw error;
      return data || [];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < ITEMS_PER_PAGE ? undefined : allPages.length * ITEMS_PER_PAGE,
    initialPageParam: 0,
    staleTime: 30000,
    enabled: canRunQueries,
  });

  const { data: count } = useQuery({
    queryKey: ['transactions-column-count', ...filterKey],
    staleTime: 30000,
    enabled: canRunQueries,
    queryFn: async () => {
      const { count, error } = await withFilters(
        supabase.from('transactions').select('*', { count: 'exact', head: true }).gte('value', 0),
      );
      if (error) throw error;
      return count || 0;
    },
  });

  const rows = useMemo(() => data?.pages.flat() ?? [], [data]);
  const loadedTotal = useMemo(
    () => rows.reduce((sum, t) => {
      const n = parseFloat(String(t.value ?? '0').replace(/[^\d.-]/g, ''));
      return Number.isNaN(n) ? sum : sum + n;
    }, 0),
    [rows],
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    const target = observerTarget.current;
    if (target) observer.observe(target);
    return () => {
      if (target) observer.unobserve(target);
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleSort = (column: ColumnSortColumn) => onSortChange(getNextSortState(sortConfig, column));

  const accentRing = accent === 'blue'
    ? 'ring-blue-400 bg-blue-50 dark:bg-blue-950/40'
    : 'ring-orange-400 bg-orange-50 dark:bg-orange-950/40';
  const accentDot = accent === 'blue' ? 'bg-blue-500' : 'bg-orange-500';

  return (
    <Card className="flex flex-col min-h-0 h-[70vh]">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${accentDot}`} />
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        {typeof count === 'number' && (
          <Badge variant="secondary" className="text-xs">{count}</Badge>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-semibold">
        <div className="flex items-center gap-3">
          <SortableHeader label="Date" column="date" currentSort={sortConfig} onSort={handleSort} />
          <SortableHeader label="Client / Depositor" column="name" currentSort={sortConfig} onSort={handleSort} />
        </div>
        <SortableHeader label="Amount" column="value" currentSort={sortConfig} onSort={handleSort} />
      </div>

      <div className="flex-1 overflow-y-auto divide-y">
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {mode === 'match' ? 'No pending transactions.' : mode === 'reconciled' ? 'No reconciled transactions.' : 'No deleted transactions.'}
          </div>
        ) : (
          rows.map((t) => (
            <ColumnRow
              key={t.id}
              t={t}
              mode={mode}
              accentRing={accentRing}
              accentDot={accentDot}
              isSelected={selectedId === t.id}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              onViewMatch={onViewMatch}
              onUnmatch={onUnmatch}
              onViewDeleteReason={onViewDeleteReason}
            />
          ))
        )}
        <div ref={observerTarget} className="py-3 text-center text-xs text-muted-foreground">
          {isFetchingNextPage ? 'Loading more...' : rows.length > 0 ? `${rows.length} shown · ${formatCurrency(loadedTotal)}` : ''}
        </div>
      </div>
    </Card>
  );
}

function ColumnRow({
  t,
  mode,
  accentRing,
  accentDot,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onViewMatch,
  onUnmatch,
  onViewDeleteReason,
}: {
  t: Transaction;
  mode: ColumnMode;
  accentRing: string;
  accentDot: string;
  isSelected: boolean;
  onSelect?: (t: Transaction) => void;
  onEdit?: (t: Transaction) => void;
  onDelete?: (t: Transaction) => void;
  onViewMatch?: (t: Transaction) => void;
  onUnmatch?: (t: Transaction) => void;
  onViewDeleteReason?: (t: Transaction) => void;
}) {
  const content = (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{formatDate(t.date)}</div>
      <div className="truncate text-xs font-medium" title={t.name || t.depositor || ''}>
        {t.name || t.depositor || '-'}
      </div>
      {(t.car || t.payment_method) && (
        <div className="truncate text-[11px] text-muted-foreground">
          {[t.car, t.payment_method].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  );

  const amount = <span className="font-mono text-xs font-semibold whitespace-nowrap">{formatCurrency(t.value)}</span>;

  if (mode === 'match') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect?.(t)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect?.(t);
          }
        }}
        className={`group grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
          isSelected ? `ring-2 ring-inset ${accentRing}` : 'hover:bg-muted/50'
        }`}
      >
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-full border ${
            isSelected ? `${accentDot} border-transparent text-white` : 'border-muted-foreground/30'
          }`}
        >
          {isSelected ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5 text-muted-foreground/40" />}
        </div>
        {content}
        <div className="flex items-center gap-1">
          {amount}
          <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEdit?.(t); }} title="Edit transaction">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onDelete?.(t); }} title="Delete transaction">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'reconciled') {
    return (
      <div className="group grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors">
        {content}
        <div className="flex items-center gap-1">
          {amount}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onViewMatch?.(t)} title="View matched transaction">
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onUnmatch?.(t)} title="Unmatch transaction">
            <Link2Off className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  // deleted
  return (
    <div className="group grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 opacity-70 hover:opacity-100 hover:bg-muted/50 transition-all">
      {content}
      <div className="flex items-center gap-1">
        {amount}
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onViewDeleteReason?.(t)} title="View deletion reason and restore">
          <Eye className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
