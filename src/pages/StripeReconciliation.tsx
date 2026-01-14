import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
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
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Loader2, 
  Search, 
  CheckCircle2, 
  X,
  CreditCard,
  Landmark,
  Calendar,
  Link2
} from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { queryClient } from '@/lib/queryClient';
import type { Transaction } from '@/lib/database.types';
import { useColumnResizer } from '@/hooks/useColumnResizer';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { type SortConfig, getNextSortState } from '@/lib/sorting';

const ITEMS_PER_PAGE = 50;
const DEFAULT_COLUMN_WIDTHS = ['100px', '1fr', '150px', '120px', '120px', '110px', '100px', '120px'];

type StripeSortColumn = 'date' | 'name' | 'car' | 'payment_method' | 'value' | 'status';

export default function StripeReconciliation() {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'payout' | 'charge'>('all');
  const [selectedPayout, setSelectedPayout] = useState<Transaction | null>(null);
  const [selectedCharges, setSelectedCharges] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig<StripeSortColumn>>({ column: 'date', direction: 'desc' });
  
  const { widths, updateWidth, gridTemplateColumns } = useColumnResizer('stripe-grid-cols', DEFAULT_COLUMN_WIDTHS);
  
  const observerTarget = useRef<HTMLDivElement>(null);
  const dateFromPickerRef = useRef<HTMLInputElement>(null);
  const dateToPickerRef = useRef<HTMLInputElement>(null);

  const openDatePicker = (ref: RefObject<HTMLInputElement>) => {
    const input = ref.current;
    if (input && typeof input.showPicker === 'function') {
      input.showPicker();
    }
  };

  const handleSort = (column: StripeSortColumn) => {
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

  const { data: settings } = useQuery({
    queryKey: ['reconciliation-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reconciliation_settings')
        .select('*')
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data || { stripe_fee_percent: 2.9, stripe_fixed_fee: 0.30 };
    },
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['stripe-unified-list', appliedSearchTerm, typeFilter, appliedIsoDateFrom, appliedIsoDateTo, sortConfig],
    queryFn: async ({ pageParam = 0 }) => {
      const start = pageParam as number;
      const end = start + ITEMS_PER_PAGE - 1;

      let query = supabase
        .from('transactions')
        .select('*')
        .eq('is_deleted', false)
        .order(sortConfig.column, { ascending: sortConfig.direction === 'asc' });

      // Condition for Payouts or Charges
      const condition = `and(status.eq.pending-statement,historical_text.ilike.%STRIPE%),and(status.eq.pending-ledger,payment_method.eq.Credit Card)`;
      query = query.or(condition);

      if (appliedSearchTerm) {
        query = query.or(`name.ilike.%${appliedSearchTerm}%,historical_text.ilike.%${appliedSearchTerm}%,depositor.ilike.%${appliedSearchTerm}%,car.ilike.%${appliedSearchTerm}%`);
      }

      if (typeFilter === 'payout') {
        query = query.eq('status', 'pending-statement');
      } else if (typeFilter === 'charge') {
        query = query.eq('status', 'pending-ledger');
      }

      if (appliedIsoDateFrom) {
        query = query.gte('date', appliedIsoDateFrom);
      }

      if (appliedIsoDateTo) {
        query = query.lte('date', appliedIsoDateTo);
      }

      const { data, error } = await query.range(start, end);
      if (error) throw error;
      return data as Transaction[];
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === ITEMS_PER_PAGE ? allPages.length * ITEMS_PER_PAGE : undefined;
    },
    initialPageParam: 0,
  });

  const transactions = useMemo(() => data?.pages.flat() || [], [data]);

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

  const selectedChargesList = useMemo(() => {
    return transactions.filter(t => selectedCharges.has(t.id));
  }, [transactions, selectedCharges]);

  const stats = useMemo(() => {
    const gross = selectedChargesList.reduce((sum, c) => sum + parseFloat(c.value), 0);
    const feePercent = parseFloat(settings?.stripe_fee_percent?.toString() || '2.9') / 100;
    const fixedFee = parseFloat(settings?.stripe_fixed_fee?.toString() || '0.30');
    const count = selectedChargesList.length;
    
    const expectedFees = gross * feePercent + fixedFee * count;
    const expectedNet = gross - expectedFees;
    const difference = selectedPayout ? parseFloat(selectedPayout.value) - expectedNet : 0;

    const suggestions = [];
    if (selectedPayout) {
      if (Math.abs(difference + 15.00) < 0.05) suggestions.push('Matches $15.00 chargeback fee');
      const intlFee = gross * 0.01;
      if (Math.abs(difference + intlFee) < 0.05) suggestions.push('Matches 1% international card fee');
      if (Math.abs(difference - 15.00) < 0.05) suggestions.push('Matches $15.00 refund/correction');
    }

    return {
      gross,
      expectedFees,
      expectedNet,
      difference,
      count,
      suggestions
    };
  }, [selectedChargesList, settings, selectedPayout]);

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPayout) return;
      
      const links = selectedChargesList.map(charge => ({
        ledger_id: charge.id,
        target_id: selectedPayout.id,
        type: 'STRIPE_PAYOUT',
        gap_amount: (stats.difference / stats.count).toFixed(2),
        confidence_score: 100,
        is_confirmed: true
      }));

      // @ts-expect-error - type mismatch in Supabase client
      const { error: linksError } = await supabase
        .from('reconciliation_links')
        .insert(links);
      if (linksError) throw linksError;

      // @ts-expect-error - type mismatch in Supabase client
      const { error: chargesError } = await supabase
        .from('transactions')
        .update({ status: 'reconciled', matched_transaction_id: selectedPayout.id })
        .in('id', Array.from(selectedCharges));
      if (chargesError) throw chargesError;

      // @ts-expect-error - type mismatch in Supabase client
      const { error: payoutError } = await supabase
        .from('transactions')
        .update({ status: 'reconciled' })
        .eq('id', selectedPayout.id);
      if (payoutError) throw payoutError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stripe-unified-list'] });
      setSelectedPayout(null);
      setSelectedCharges(new Set());
      toast({ title: 'Reconciliation successful' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error reconciling', description: error.message, variant: 'destructive' });
    }
  });

  const toggleCharge = (id: string) => {
    const newSet = new Set(selectedCharges);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedCharges(newSet);
  };

  const isPayout = (t: Transaction) => t.status === 'pending-statement';

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stripe Payouts</h1>
          <p className="text-muted-foreground">Match credit card charges to bank deposits.</p>
        </div>
      </div>

      <Card className="p-4 space-y-4 sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search charges or payouts..."
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
              variant={typeFilter === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTypeFilter('all')}
            >
              All
            </Button>
            <Button
              variant={typeFilter === 'payout' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTypeFilter('payout')}
            >
              Payouts
            </Button>
            <Button
              variant={typeFilter === 'charge' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTypeFilter('charge')}
            >
              Charges
            </Button>
          </div>
        </div>

        {(selectedPayout || selectedCharges.size > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-accent/30 p-4 rounded-lg border border-accent animate-in fade-in slide-in-from-top-1">
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Landmark className="h-3 w-3" /> Stripe Payout
              </div>
              {selectedPayout ? (
                <div className="flex items-center justify-between bg-background p-2 rounded border">
                  <div className="text-xs truncate font-medium">
                    {formatDate(selectedPayout.date)} - {formatCurrency(selectedPayout.value)}
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedPayout(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground italic p-2 border border-dashed rounded">Select a payout...</div>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <CreditCard className="h-3 w-3" /> Selected Charges ({stats.count})
              </div>
              <div className="text-xs font-medium p-2 bg-background rounded border">
                {formatCurrency(stats.gross)} Gross
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reconciliation Details</div>
              <div className="text-xs p-2 bg-background rounded border space-y-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>Est. Fees:</span>
                  <span>{formatCurrency(stats.expectedFees)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Difference:</span>
                  <span className={Math.abs(stats.difference) < 0.01 ? 'text-green-600' : 'text-red-600'}>
                    {formatCurrency(stats.difference)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-end">
              <Button 
                disabled={!selectedPayout || selectedCharges.size === 0 || reconcileMutation.isPending}
                onClick={() => reconcileMutation.mutate()}
                className="w-full"
              >
                {reconcileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Match & Reconcile
              </Button>
            </div>
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
            <SortableHeader label="Description" column="name" currentSort={sortConfig} onSort={handleSort} />
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
            <SortableHeader label="Type" column="status" currentSort={sortConfig} onSort={handleSort} />
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
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No Stripe transactions found.</div>
          ) : (
            transactions.map((t) => (
              <div 
                key={t.id} 
                className={`group hover:bg-muted/50 transition-colors ${selectedPayout?.id === t.id || selectedCharges.has(t.id) ? 'bg-accent/30' : ''}`}
              >
                <div 
                  className="grid gap-4 px-4 py-3 items-center text-sm"
                  style={{ gridTemplateColumns }}
                >
                  <div className="text-xs">{formatDate(t.date)}</div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.name || t.depositor || '-'}</div>
                    <div className="text-[10px] text-muted-foreground truncate italic">{t.historical_text}</div>
                  </div>
                  <div className="truncate text-xs">{t.car || '-'}</div>
                  <div className="truncate text-xs">{t.payment_method || '-'}</div>
                  <div>
                    {isPayout(t) ? (
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 flex items-center gap-1 w-fit">
                        <Landmark className="h-3 w-3" /> Payout
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700 flex items-center gap-1 w-fit">
                        <CreditCard className="h-3 w-3" /> Charge
                      </Badge>
                    )}
                  </div>
                  <div className="font-medium text-xs">{formatCurrency(t.value)}</div>
                  <div>
                    <Badge variant="secondary" className="capitalize text-[10px]">{t.status}</Badge>
                  </div>
                  <div className="flex items-center justify-end gap-1 pr-2">
                    {isPayout(t) ? (
                      <Button
                        size="icon"
                        variant={selectedPayout?.id === t.id ? 'default' : 'ghost'}
                        className="h-8 w-8"
                        onClick={() => setSelectedPayout(selectedPayout?.id === t.id ? null : t)}
                        title={selectedPayout?.id === t.id ? 'Deselect payout' : 'Select as payout'}
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Checkbox 
                          checked={selectedCharges.has(t.id)}
                          onCheckedChange={() => toggleCharge(t.id)}
                        />
                        <Button
                          size="icon"
                          variant={selectedCharges.has(t.id) ? 'default' : 'ghost'}
                          className="h-8 w-8"
                          onClick={() => toggleCharge(t.id)}
                          title={selectedCharges.has(t.id) ? 'Deselect charge' : 'Select charge'}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <div ref={observerTarget} className="py-8 flex justify-center">
        {isFetchingNextPage && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
        {!hasNextPage && transactions.length > 0 && <p className="text-sm text-muted-foreground">No more transactions to load</p>}
      </div>
    </div>
  );
}

