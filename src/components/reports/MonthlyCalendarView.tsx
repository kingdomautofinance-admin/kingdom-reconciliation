import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CalendarGrid } from './CalendarGrid';
import type { DateSummary } from './DateSummaryCard';
import {
  getMonthCalendarGrid,
  formatMonthYear,
  getNextMonth,
  getPreviousMonth,
  getYearMonthFromISO,
} from '@/lib/calendar-utils';

interface MonthlyCalendarViewProps {
  dateSummaries: DateSummary[];
  dateRange: { from: string; to: string };
  onDateClick: (isoDate: string) => void;
  initialMonth?: number | null;
  initialYear?: number | null;
}

export function MonthlyCalendarView({
  dateSummaries,
  dateRange,
  onDateClick,
  initialMonth,
  initialYear,
}: MonthlyCalendarViewProps) {
  // Initialize month/year from props or dateRange
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    if (initialYear) return initialYear;
    const parsed = getYearMonthFromISO(dateRange.to);
    return parsed?.year ?? new Date().getFullYear();
  });

  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    if (initialMonth) return initialMonth;
    const parsed = getYearMonthFromISO(dateRange.to);
    return parsed?.month ?? new Date().getMonth() + 1;
  });

  // Update when initial values change (e.g., drill-down from yearly view)
  useEffect(() => {
    if (initialYear) setSelectedYear(initialYear);
    if (initialMonth) setSelectedMonth(initialMonth);
  }, [initialYear, initialMonth]);

  // Transform dateSummaries to Map for O(1) lookup
  const summaryMap = useMemo(() => {
    const map = new Map<string, DateSummary>();
    dateSummaries.forEach((summary) => {
      map.set(summary.date, summary);
    });
    return map;
  }, [dateSummaries]);

  // Generate calendar grid
  const calendarDays = useMemo(() => {
    return getMonthCalendarGrid(selectedYear, selectedMonth);
  }, [selectedYear, selectedMonth]);

  const handlePreviousMonth = () => {
    const { year, month } = getPreviousMonth(selectedYear, selectedMonth);
    setSelectedYear(year);
    setSelectedMonth(month);
  };

  const handleNextMonth = () => {
    const { year, month } = getNextMonth(selectedYear, selectedMonth);
    setSelectedYear(year);
    setSelectedMonth(month);
  };

  const monthYearDisplay = formatMonthYear(selectedYear, selectedMonth);

  return (
    <Card className="p-4 md:p-6">
      {/* Header with navigation */}
      <div className="flex items-center justify-between mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePreviousMonth}
          className="gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Previous</span>
        </Button>

        <h2 className="text-xl md:text-2xl font-bold">{monthYearDisplay}</h2>

        <Button
          variant="outline"
          size="sm"
          onClick={handleNextMonth}
          className="gap-2"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Calendar grid */}
      <CalendarGrid
        days={calendarDays}
        summaryMap={summaryMap}
        onDayClick={onDateClick}
      />
    </Card>
  );
}
