import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useRef, type RefObject } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar, TrendingUp, CheckCircle2, Clock } from 'lucide-react';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { type SortConfig, getNextSortState } from '@/lib/sorting';
import { parseUSDateToISO, formatUSDateInput, formatISODateToUS, formatCurrency, formatDate } from '@/lib/utils';
import { getMonthDateRange, getYearDateRange, formatMonthYear } from '@/lib/calendar-utils';
import { DateSummaryCard, type DateSummary } from '@/components/reports/DateSummaryCard';
import { ReportViewToggle, type ViewType } from '@/components/reports/ReportViewToggle';
import { MonthlyCalendarView } from '@/components/reports/MonthlyCalendarView';
import { YearlyCalendarView } from '@/components/reports/YearlyCalendarView';

type ReportSortColumn = 'date' | 'reconciled_count' | 'pending_count' | 'total_count' | 'reconciliation_percentage';

const GRID_COLS = "grid-cols-[120px_1fr_1fr_1fr_80px]";

export default function Reports() {
  const [, setLocation] = useLocation();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const dateFromPickerRef = useRef<HTMLInputElement>(null);
  const dateToPickerRef = useRef<HTMLInputElement>(null);

  // View state management
  const [view, setView] = useState<ViewType>('list');
  const [calendarMonth, setCalendarMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [calendarYear, setCalendarYear] = useState<number>(() => new Date().getFullYear());
  const [sortConfig, setSortConfig] = useState<SortConfig<ReportSortColumn>>({ column: 'date', direction: 'desc' });

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

  // Calculate date range based on current view
  const viewDateRange = useMemo(() => {
    const today = new Date();

    switch (view) {
      case 'monthly':
        return getMonthDateRange(calendarYear, calendarMonth);
      case 'yearly':
        return getYearDateRange(calendarYear);
      case 'list':
      default:
        // Keep 30-day default for list view (backwards compatibility)
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);
        return {
          from: thirtyDaysAgo.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0],
        };
    }
  }, [view, calendarYear, calendarMonth]);

  const effectiveStartDate = appliedDateFrom || viewDateRange.from;
  const effectiveEndDate = appliedDateTo || viewDateRange.to;

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
      // Using pagination to overcome Supabase's default 1000 row limit
      const PAGE_SIZE = 1000;
      let allTransactions: { date: string; value: string; status: string }[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: transactions, error } = await supabase
          .from('transactions')
          .select('date, value, status')
          .eq('is_deleted', false)
          .gte('date', effectiveStartDate)
          .lt('date', effectiveEndExclusive)
          .order('date', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;

        if (transactions && transactions.length > 0) {
          allTransactions = allTransactions.concat(transactions);
          offset += PAGE_SIZE;
          hasMore = transactions.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      const transactions = allTransactions;

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

  const handleSort = (column: ReportSortColumn) => {
    setSortConfig(getNextSortState(sortConfig, column));
  };

  const sortedSummaries = useMemo(() => {
    if (!dateSummaries) return [];

    return [...dateSummaries].sort((a, b) => {
      const aValue = a[sortConfig.column];
      const bValue = b[sortConfig.column];

      // Handle string (date) vs number comparison
      if (sortConfig.column === 'date') {
        return sortConfig.direction === 'asc'
          ? (aValue as string).localeCompare(bValue as string)
          : (bValue as string).localeCompare(aValue as string);
      }

      // Numeric comparison
      return sortConfig.direction === 'asc'
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });
  }, [dateSummaries, sortConfig]);

  const handleDateClick = (date: string) => {
    // Format date as MM/DD/YYYY for the transaction page filter
    const formattedDate = formatISODateToUS(date);
    // Navigate and the useEffect in Transactions.tsx will auto-apply the filters
    setLocation(`/transactions?dateFrom=${formattedDate}&dateTo=${formattedDate}`);
  };

  const handleMonthClick = (month: number, year: number) => {
    setCalendarMonth(month);
    setCalendarYear(year);
    setView('monthly');
  };

  const handleMonthlyNavigate = (year: number, month: number) => {
    setCalendarYear(year);
    setCalendarMonth(month);
  };

  const handleYearlyNavigate = (year: number) => {
    setCalendarYear(year);
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

      {/* Date Range Filters and View Toggle */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-end lg:justify-between">
          {/* Date Range Section */}
          <div className="flex flex-wrap gap-4 items-end flex-1">
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

          {/* View Toggle */}
          <div className="flex">
            <ReportViewToggle view={view} onViewChange={setView} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          {view === 'list' && !hasActiveFilters && 'Default: Last 30 days'}
          {view === 'monthly' && !hasActiveFilters && `Showing: ${formatMonthYear(calendarYear, calendarMonth)}`}
          {view === 'yearly' && !hasActiveFilters && `Showing: ${calendarYear}`}
          {hasActiveFilters && `Filtered: ${formatISODateToUS(effectiveStartDate)} - ${formatISODateToUS(effectiveEndDate)}`}
        </p>
      </Card>

      {/* List View */}
      {view === 'list' && (
        <Card className="overflow-hidden">
          <div className={`grid ${GRID_COLS} gap-4 p-4 text-xs font-semibold border-b bg-muted/40 items-center`}>
            <SortableHeader label="Date" column="date" currentSort={sortConfig} onSort={handleSort} />
            <SortableHeader label="Reconciled" column="reconciled_count" currentSort={sortConfig} onSort={handleSort} />
            <SortableHeader label="Pending" column="pending_count" currentSort={sortConfig} onSort={handleSort} />
            <SortableHeader label="Total" column="total_count" currentSort={sortConfig} onSort={handleSort} />
            <SortableHeader label="%" column="reconciliation_percentage" currentSort={sortConfig} onSort={handleSort} />
          </div>

          <div className="divide-y">
            {sortedSummaries.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No transactions found in the selected date range</p>
              </div>
            ) : (
              sortedSummaries.map((summary) => (
                <div
                  key={summary.date}
                  className={`grid ${GRID_COLS} gap-4 p-4 items-center text-sm hover:bg-muted/50 transition-colors cursor-pointer`}
                  onClick={() => handleDateClick(summary.date)}
                >
                  <div className="font-medium">{formatDate(summary.date)}</div>
                  <div>
                    <span className="font-medium text-green-600 dark:text-green-400">{summary.reconciled_count}</span>
                    <span className="text-muted-foreground text-xs ml-2">{formatCurrency(summary.reconciled_amount)}</span>
                  </div>
                  <div>
                    <span className="font-medium">{summary.pending_count}</span>
                    <span className="text-muted-foreground text-xs ml-2">{formatCurrency(summary.pending_amount)}</span>
                  </div>
                  <div>
                    <span className="font-medium">{summary.total_count}</span>
                    <span className="text-muted-foreground text-xs ml-2">{formatCurrency(summary.total_amount)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${
                      summary.reconciliation_percentage === 100 ? 'text-green-600' :
                      summary.reconciliation_percentage >= 80 ? 'text-yellow-600' :
                      'text-orange-600'
                    }`}>
                      {summary.reconciliation_percentage}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* Monthly Calendar View */}
      {view === 'monthly' && (
        <MonthlyCalendarView
          dateSummaries={dateSummaries || []}
          dateRange={{ from: effectiveStartDate, to: effectiveEndDate }}
          onDateClick={handleDateClick}
          initialMonth={calendarMonth}
          initialYear={calendarYear}
          onNavigate={handleMonthlyNavigate}
        />
      )}

      {/* Yearly Calendar View */}
      {view === 'yearly' && (
        <YearlyCalendarView
          dateSummaries={dateSummaries || []}
          year={calendarYear}
          onMonthClick={handleMonthClick}
          onNavigate={handleYearlyNavigate}
        />
      )}
    </div>
  );
}

