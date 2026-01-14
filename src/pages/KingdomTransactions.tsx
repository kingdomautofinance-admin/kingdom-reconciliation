import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useState, useMemo, useRef, useEffect, type RefObject } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  formatCurrency, 
  formatDate,
  parseUSDateToISO,
  formatUSDateInput,
  formatISODateToUS
} from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Loader2, 
  Search, 
  X,
  Link2,
  Calendar
} from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { queryClient } from '@/lib/queryClient';
import { useColumnResizer } from '@/hooks/useColumnResizer';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { type SortConfig, getNextSortState } from '@/lib/sorting';

const ITEMS_PER_PAGE = 50;
const DEFAULT_COLUMN_WIDTHS = ['100px', '1fr', '150px', '120px', '120px', '110px', '100px', '120px'];

type AuditSortColumn = 'date' | 'name' | 'car' | 'origin' | 'payment_method' | 'value' | 'status';

interface UnifiedAuditItem {
  origin: 'ledger' | 'system';
  id: string;
  date: string;
  value: string;
  name: string | null;
  depositor: string | null;
  car: string | null;
  payment_method: string | null;
  source: string;
  status: string;
  matched_transaction_id: string | null;
}

export default function KingdomTransactions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [originFilter, setOriginFilter] = useState<'all' | 'ledger' | 'system'>('all');
  const [selectedForMatch, setSelectedForMatch] = useState<UnifiedAuditItem | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig<AuditSortColumn>>({ column: 'date', direction: 'desc' });
  
  const { widths, updateWidth, gridTemplateColumns } = useColumnResizer('audit-grid-cols', DEFAULT_COLUMN_WIDTHS);
  
  const observerTarget = useRef<HTMLDivElement>(null);
  const dateFromPickerRef = useRef<HTMLInputElement>(null);
  const dateToPickerRef = useRef<HTMLInputElement>(null);

  const openDatePicker = (ref: RefObject<HTMLInputElement>) => {
    const input = ref.current;
    if (input && typeof input.showPicker === 'function') {
      input.showPicker();
    }
  };

  const handleSort = (column: AuditSortColumn) => {
    setSortConfig(getNextSortState(sortConfig, column));
  };

  const normalizeDateInput = (value: string) => {
    if (!value || value.length !== 10) return undefined;
    const iso = parseUSDateToISO(value);
    return iso || undefined;
  };

  const pendingIsoDateFrom = useMemo(() => normalizeDateInput(dateFrom), [dateFrom]);
  const pendingIsoDateTo = useMemo(() => normalizeDateInput(dateTo), [dateTo]);

  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
  const [appliedIsoDateFrom, setAppliedIsoDateFrom] = useState<string | undefined>(undefined);
  const [appliedIsoDateTo, setAppliedIsoDateTo] = useState<string | undefined>(undefined);

  const handleApplyFilters = () => {
    setAppliedSearchTerm(searchTerm.trim());
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

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['audit-unified-list', appliedSearchTerm, originFilter, appliedIsoDateFrom, appliedIsoDateTo, sortConfig],
    queryFn: async ({ pageParam = 0 }) => {
      const start = pageParam as number;
      const end = start + ITEMS_PER_PAGE - 1;

      // @ts-expect-error - unified_audit_list is a view not yet in Database types
      let query = supabase
        .from('unified_audit_list')
        .select('*')
        .neq('status', 'reconciled')
        .order(sortConfig.column, { ascending: sortConfig.direction === 'asc' });

      if (appliedSearchTerm) {
        query = query.or(`name.ilike.%${appliedSearchTerm}%,depositor.ilike.%${appliedSearchTerm}%,car.ilike.%${appliedSearchTerm}%`);
      }

      if (originFilter !== 'all') {
        query = query.eq('origin', originFilter);
      }

      if (appliedIsoDateFrom) {
        query = query.gte('date', appliedIsoDateFrom);
      }

      if (appliedIsoDateTo) {
        query = query.lte('date', appliedIsoDateTo);
      }

      const { data, error } = await query.range(start, end);
      if (error) throw error;
      return data as UnifiedAuditItem[];
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === ITEMS_PER_PAGE ? allPages.length * ITEMS_PER_PAGE : undefined;
    },
    initialPageParam: 0,
  });

  const items = useMemo(() => data?.pages.flat() || [], [data]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const manualMatchMutation = useMutation({
    mutationFn: async ({ item1, item2 }: { item1: UnifiedAuditItem; item2: UnifiedAuditItem }) => {
      const ledger = item1.origin === 'ledger' ? item1 : item2;
      const system = item1.origin === 'system' ? item1 : item2;

      // @ts-expect-error - type mismatch in Supabase client
      const { error: linkError } = await supabase
        .from('reconciliation_links')
        .insert({
          ledger_id: ledger.id,
          target_id: system.id,
          type: 'SYSTEM',
          gap_amount: (parseFloat(ledger.value) - parseFloat(system.value)).toFixed(2),
          confidence_score: 100,
          is_confirmed: true
        });
      if (linkError) throw linkError;

      // @ts-expect-error - type mismatch in Supabase client
      const { error: ledgerError } = await supabase
        .from('transactions')
        .update({ status: 'reconciled', matched_transaction_id: system.id })
        .eq('id', ledger.id);
      if (ledgerError) throw ledgerError;

      // @ts-expect-error - type mismatch in Supabase client
      const { error: systemError } = await supabase
        .from('kingdom_transactions')
        .update({ status: 'reconciled', matched_transaction_id: ledger.id })
        .eq('id', system.id);
      if (systemError) throw systemError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-unified-list'] });
      setSelectedForMatch(null);
      toast({ title: 'System Audit Match successful' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error matching', description: error.message, variant: 'destructive' });
    }
  });

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Audit</h1>
          <p className="text-muted-foreground">Match CRM transactions (Kingdom) with Ledger entries.</p>
        </div>
      </div>

      <Card className="p-4 space-y-4 sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by client, car, description..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
            />
          </div>

          <div className="flex gap-2">
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="MM/DD/YYYY"
                value={dateFrom}
                onChange={(e) => setDateFrom(formatUSDateInput(e.target.value))}
                onClick={() => openDatePicker(dateFromPickerRef)}
                className="pl-9 w-40 cursor-pointer"
                maxLength={10}
              />
              <input
                ref={dateFromPickerRef}
                type="date"
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
                className="pl-9 w-40 cursor-pointer"
                maxLength={10}
              />
              <input
                ref={dateToPickerRef}
                type="date"
                value={parseUSDateToISO(dateTo) ?? ''}
                onChange={(e) => setDateTo(e.target.value ? formatISODateToUS(e.target.value) : '')}
                className="absolute inset-0 h-0 w-0 opacity-0 pointer-events-none"
              />
            </div>
            <Button variant="secondary" onClick={handleApplyFilters}>Apply</Button>
            <Button variant="ghost" onClick={handleClearFilters}>Clear</Button>
          </div>

          <div className="flex bg-muted p-1 rounded-md ml-auto">
            <Button
              variant={originFilter === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setOriginFilter('all')}
            >
              All
            </Button>
            <Button
              variant={originFilter === 'ledger' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setOriginFilter('ledger')}
            >
              Ledger
            </Button>
            <Button
              variant={originFilter === 'system' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setOriginFilter('system')}
            >
              System (CRM)
            </Button>
          </div>
        </div>

        {selectedForMatch && (
          <div className="flex items-center justify-between bg-accent/50 p-3 rounded-lg border border-accent animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-accent rounded-full">
                <Link2 className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selected for Match</div>
                <div className="font-medium">
                  {formatDate(selectedForMatch.date)} - {selectedForMatch.name || selectedForMatch.depositor || 'Unnamed'} ({formatCurrency(selectedForMatch.value)})
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedForMatch(null)}>
              <X className="h-4 w-4 mr-2" /> Cancel
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <div 
          className="grid gap-4 px-4 py-3 font-semibold text-sm border-b bg-muted/50 items-center"
          style={{ gridTemplateColumns }}
        >
          <div className="relative flex items-center h-full">
            <SortableHeader label="Date" column="date" currentSort={sortConfig} onSort={handleSort} />
            <ResizeHandle width={widths[0]} onResize={(w) => updateWidth(0, w)} />
          </div>
          <div className="relative flex items-center h-full">
            <SortableHeader label="Description / Client" column="name" currentSort={sortConfig} onSort={handleSort} />
            <ResizeHandle width={widths[1]} onResize={(w) => updateWidth(1, w)} />
          </div>
          <div className="relative flex items-center h-full">
            <SortableHeader label="Car" column="car" currentSort={sortConfig} onSort={handleSort} />
            <ResizeHandle width={widths[2]} onResize={(w) => updateWidth(2, w)} />
          </div>
          <div className="relative flex items-center h-full">
            <SortableHeader label="Origin" column="origin" currentSort={sortConfig} onSort={handleSort} />
            <ResizeHandle width={widths[3]} onResize={(w) => updateWidth(3, w)} />
          </div>
          <div className="relative flex items-center h-full">
            <SortableHeader label="Method" column="payment_method" currentSort={sortConfig} onSort={handleSort} />
            <ResizeHandle width={widths[4]} onResize={(w) => updateWidth(4, w)} />
          </div>
          <div className="relative flex items-center h-full">
            <SortableHeader label="Amount" column="value" currentSort={sortConfig} onSort={handleSort} />
            <ResizeHandle width={widths[5]} onResize={(w) => updateWidth(5, w)} />
          </div>
          <div className="relative flex items-center h-full">
            <SortableHeader label="Status" column="status" currentSort={sortConfig} onSort={handleSort} />
            <ResizeHandle width={widths[6]} onResize={(w) => updateWidth(6, w)} />
          </div>
          <div className="text-right pr-4">Actions</div>
        </div>
        
        <div className="divide-y">
          {isLoading ? (
            <div className="p-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No transactions found matching your filters.</div>
          ) : (
            items.map((item) => (
              <div 
                key={`${item.origin}-${item.id}`} 
                className={`group hover:bg-muted/50 transition-colors ${selectedForMatch?.id === item.id ? 'bg-accent/30' : ''}`}
              >
                <div 
                  className="grid gap-4 px-4 py-3 items-center text-sm"
                  style={{ gridTemplateColumns }}
                >
                  <div className="text-xs">{formatDate(item.date)}</div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{item.name || '-'}</div>
                    {item.depositor && <div className="text-xs text-muted-foreground truncate">{item.depositor}</div>}
                  </div>
                  <div className="truncate text-xs">{item.car || '-'}</div>
                  <div>
                    <Badge variant="outline" className={item.origin === 'ledger' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-purple-200 bg-purple-50 text-purple-700'}>
                      {item.origin === 'ledger' ? 'Ledger' : 'System'}
                    </Badge>
                  </div>
                  <div className="truncate text-xs">{item.payment_method || '-'}</div>
                  <div className="font-medium text-xs">{formatCurrency(item.value)}</div>
                  <div>
                    <Badge variant="secondary" className="capitalize text-[10px]">{item.status}</Badge>
                  </div>
                  <div className="flex items-center justify-end gap-1 pr-2">
                    <Button
                      size="icon"
                      variant={selectedForMatch?.id === item.id ? 'default' : 'ghost'}
                      className="h-8 w-8"
                      disabled={manualMatchMutation.isPending || !!(selectedForMatch && selectedForMatch.origin === item.origin)}
                      onClick={() => {
                        if (selectedForMatch?.id === item.id) {
                          setSelectedForMatch(null);
                        } else if (selectedForMatch) {
                          manualMatchMutation.mutate({ item1: selectedForMatch, item2: item });
                        } else {
                          setSelectedForMatch(item);
                        }
                      }}
                      title={selectedForMatch?.id === item.id ? 'Cancel selection' : selectedForMatch ? 'Match with selected' : 'Select for matching'}
                    >
                      {manualMatchMutation.isPending && selectedForMatch?.id === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Link2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <div ref={observerTarget} className="py-8 flex justify-center">
        {isFetchingNextPage && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
        {!hasNextPage && items.length > 0 && <p className="text-sm text-muted-foreground">No more transactions to load</p>}
      </div>
    </div>
  );
}
