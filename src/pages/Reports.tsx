import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useRef, type RefObject } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar, ChevronRight, TrendingUp, CheckCircle2, Clock } from 'lucide-react';
import { formatCurrency, formatDate, parseUSDateToISO, formatUSDateInput, formatISODateToUS } from '@/lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface DateSummary {
  date: string;
  reconciled_count: number;
  pending_count: number;
  total_count: number;
  reconciled_amount: number;
  pending_amount: number;
  total_amount: number;
  reconciliation_percentage: number;
}

export default function Reports() {
  const [, setLocation] = useLocation();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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

  const normalizedDateFrom = useMemo(() => normalizeDateInput(dateFrom), [dateFrom]);
  const normalizedDateTo = useMemo(() => normalizeDateInput(dateTo), [dateTo]);

  const [appliedDateFrom, setAppliedDateFrom] = useState<string | undefined>(undefined);
  const [appliedDateTo, setAppliedDateTo] = useState<string | undefined>(undefined);

  const filtersChanged = 
    normalizedDateFrom !== appliedDateFrom || 
    normalizedDateTo !== appliedDateTo;

  const hasActiveFilters = Boolean(appliedDateFrom || appliedDateTo);

  const handleApplyFilters = () => {
    setAppliedDateFrom(normalizedDateFrom);
    setAppliedDateTo(normalizedDateTo);
  };

  const handleClearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setAppliedDateFrom(undefined);
    setAppliedDateTo(undefined);
  };

  // Calculate default date range (last 30 days)
  const defaultDateRange = useMemo(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    return {
      from: thirtyDaysAgo.toISOString().split('T')[0],
      to: today.toISOString().split('T')[0],
    };
  }, []);

  const effectiveStartDate = appliedDateFrom || defaultDateRange.from;
  const effectiveEndDate = appliedDateTo || defaultDateRange.to;

  const toNextDay = (isoDate: string) => {
    const [year, month, day] = isoDate.split('-').map(Number);
    if (!year || !month || !day) return isoDate;
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return next.toISOString().slice(0, 10);
  };

  const effectiveEndExclusive = toNextDay(effectiveEndDate);

  const { data: dateSummaries, isLoading } = useQuery<DateSummary[]>({
    queryKey: ['reports-date-summaries', effectiveStartDate, effectiveEndDate],
    queryFn: async () => {
      // Fetch all transactions in the date range (excluding deleted)
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('date, value, status')
        .eq('is_deleted', false)
        .gte('date', effectiveStartDate)
        .lt('date', effectiveEndExclusive)
        .order('date', { ascending: false });

      if (error) throw error;

      // Group by date
      const groupedByDate = new Map<string, {
        reconciled: { count: number; amount: number };
        pending: { count: number; amount: number };
        total: { count: number; amount: number };
      }>();

      transactions?.forEach((transaction) => {
        const dateKey = transaction.date.split('T')[0]; // Extract YYYY-MM-DD
        
        if (!groupedByDate.has(dateKey)) {
          groupedByDate.set(dateKey, {
            reconciled: { count: 0, amount: 0 },
            pending: { count: 0, amount: 0 },
            total: { count: 0, amount: 0 },
          });
        }

        const group = groupedByDate.get(dateKey)!;
        const amount = parseFloat(transaction.value) || 0;

        group.total.count++;
        group.total.amount += amount;

        if (transaction.status === 'reconciled') {
          group.reconciled.count++;
          group.reconciled.amount += amount;
        } else if (transaction.status === 'pending-ledger' || transaction.status === 'pending-statement') {
          group.pending.count++;
          group.pending.amount += amount;
        }
      });

      // Convert to array and calculate percentages
      const summaries: DateSummary[] = Array.from(groupedByDate.entries()).map(([date, data]) => ({
        date,
        reconciled_count: data.reconciled.count,
        pending_count: data.pending.count,
        total_count: data.total.count,
        reconciled_amount: data.reconciled.amount,
        pending_amount: data.pending.amount,
        total_amount: data.total.amount,
        reconciliation_percentage: data.total.count > 0 
          ? Math.round((data.reconciled.count / data.total.count) * 100) 
          : 0,
      }));

      // Sort by date descending
      return summaries.sort((a, b) => b.date.localeCompare(a.date));
    },
    staleTime: 30000,
  });

  const summaryStats = useMemo(() => {
    if (!dateSummaries) return null;

    const totalDates = dateSummaries.length;
    const fullyReconciledDates = dateSummaries.filter(d => d.reconciliation_percentage === 100).length;
    const totalTransactions = dateSummaries.reduce((sum, d) => sum + d.total_count, 0);
    const totalReconciled = dateSummaries.reduce((sum, d) => sum + d.reconciled_count, 0);
    const overallPercentage = totalTransactions > 0 
      ? Math.round((totalReconciled / totalTransactions) * 100) 
      : 0;

    return {
      totalDates,
      fullyReconciledDates,
      totalTransactions,
      totalReconciled,
      overallPercentage,
    };
  }, [dateSummaries]);

  const handleDateClick = (date: string) => {
    // Format date as MM/DD/YYYY for the transaction page filter
    const formattedDate = formatISODateToUS(date);
    setLocation(`/transactions?dateFrom=${encodeURIComponent(formattedDate)}&dateTo=${encodeURIComponent(formattedDate)}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading reports...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Reconciliation status by transaction date
        </p>
      </div>

      {/* Summary Cards */}
      {summaryStats && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Transaction Dates</p>
                <p className="text-2xl font-bold">{summaryStats.totalDates}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overall Reconciliation</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {summaryStats.overallPercentage}%
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fully Reconciled Dates</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {summaryStats.fullyReconciledDates}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Date Range Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium mb-2 block">Date Range</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
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
                  className="pl-9 cursor-pointer"
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
              <div className="relative flex-1">
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
                  className="pl-9 cursor-pointer"
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
            <p className="text-xs text-muted-foreground mt-1">
              Default: Last 30 days
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleApplyFilters} disabled={!filtersChanged} size="sm">
              Apply
            </Button>
            <Button
              variant="outline"
              onClick={handleClearFilters}
              disabled={!hasActiveFilters && dateFrom === '' && dateTo === ''}
              size="sm"
            >
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {/* Date Summaries List */}
      <div className="space-y-3">
        {dateSummaries?.length === 0 ? (
          <Card className="p-8">
            <div className="text-center text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No transactions found in the selected date range</p>
            </div>
          </Card>
        ) : (
          dateSummaries?.map((summary) => (
            <DateSummaryCard
              key={summary.date}
              summary={summary}
              onClick={() => handleDateClick(summary.date)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DateSummaryCard({ summary, onClick }: { summary: DateSummary; onClick: () => void }) {
  const getPercentageColor = (percentage: number) => {
    if (percentage === 100) return 'text-green-600 dark:text-green-400';
    if (percentage >= 80) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-orange-600 dark:text-orange-400';
  };

  const getChartColors = (percentage: number) => {
    if (percentage === 100) return { fill: '#16a34a', empty: '#dcfce7' };
    if (percentage >= 80) return { fill: '#ca8a04', empty: '#fef9c3' };
    return { fill: '#ea580c', empty: '#fed7aa' };
  };

  const chartColors = getChartColors(summary.reconciliation_percentage);

  // Data for pie chart
  const chartData = [
    { name: 'Reconciled', value: summary.reconciled_count },
    { name: 'Pending', value: summary.pending_count },
  ];

  return (
    <Card 
      className="p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        {/* Circular Progress Chart */}
        <div className="flex-shrink-0 w-12 h-12">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={14}
                outerRadius={22}
                paddingAngle={0}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
              >
                <Cell fill={chartColors.fill} />
                <Cell fill={chartColors.empty} />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Date */}
        <div className="flex-shrink-0 w-32">
          <p className="text-sm text-muted-foreground">Date</p>
          <p className="font-semibold">{formatDate(summary.date)}</p>
        </div>

        {/* Reconciled */}
        <div className="flex-1 min-w-[120px]">
          <p className="text-sm text-muted-foreground">Reconciled</p>
          <p className="font-semibold text-green-600 dark:text-green-400">
            {summary.reconciled_count} txns
          </p>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(summary.reconciled_amount)}
          </p>
        </div>

        {/* Pending */}
        <div className="flex-1 min-w-[120px]">
          <p className="text-sm text-muted-foreground">Pending</p>
          <p className="font-semibold text-orange-600 dark:text-orange-400">
            {summary.pending_count} txns
          </p>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(summary.pending_amount)}
          </p>
        </div>

        {/* Total */}
        <div className="flex-1 min-w-[120px]">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="font-semibold">
            {summary.total_count} txns
          </p>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(summary.total_amount)}
          </p>
        </div>

        {/* Percentage Badge */}
        <div className="flex-shrink-0">
          <Badge 
            variant="outline" 
            className={`${getPercentageColor(summary.reconciliation_percentage)} border-current text-lg font-bold px-3 py-1`}
          >
            {summary.reconciliation_percentage}%
          </Badge>
        </div>

        {/* Arrow Icon */}
        <div className="flex-shrink-0">
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
}
