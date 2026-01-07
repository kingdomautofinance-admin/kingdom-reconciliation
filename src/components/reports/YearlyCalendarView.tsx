import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MonthGridCard } from './MonthGridCard';
import type { DateSummary } from './DateSummaryCard';
import { getMonthsInYear } from '@/lib/calendar-utils';

interface YearlyCalendarViewProps {
  dateSummaries: DateSummary[];
  year: number;
  onMonthClick: (month: number, year: number) => void;
}

interface MonthStats {
  summaries: DateSummary[];
}

export function YearlyCalendarView({ dateSummaries, year: initialYear, onMonthClick }: YearlyCalendarViewProps) {
  const [selectedYear, setSelectedYear] = useState(initialYear);

  // Update when initialYear changes
  useEffect(() => {
    setSelectedYear(initialYear);
  }, [initialYear]);

  // Group summaries by month
  const monthlyStats = useMemo(() => {
    const stats = new Map<number, MonthStats>();

    // Initialize all 12 months
    for (let month = 1; month <= 12; month++) {
      stats.set(month, { summaries: [] });
    }

    // Populate with actual data
    dateSummaries.forEach((summary) => {
      const [summaryYear, summaryMonth] = summary.date.split('-').map(Number);
      if (summaryYear === selectedYear && summaryMonth >= 1 && summaryMonth <= 12) {
        const monthData = stats.get(summaryMonth);
        if (monthData) {
          monthData.summaries.push(summary);
        }
      }
    });

    return stats;
  }, [dateSummaries, selectedYear]);

  const months = getMonthsInYear(selectedYear);

  const handlePreviousYear = () => {
    setSelectedYear((prev) => prev - 1);
  };

  const handleNextYear = () => {
    setSelectedYear((prev) => prev + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePreviousYear}
          className="gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Previous</span>
        </Button>

        <h2 className="text-2xl md:text-3xl font-bold">{selectedYear}</h2>

        <Button
          variant="outline"
          size="sm"
          onClick={handleNextYear}
          className="gap-2"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {months.map((monthInfo) => {
          const stats = monthlyStats.get(monthInfo.month);
          return (
            <MonthGridCard
              key={monthInfo.month}
              month={monthInfo.month}
              year={monthInfo.year}
              monthName={monthInfo.name}
              summaries={stats?.summaries || []}
              onClick={() => onMonthClick(monthInfo.month, selectedYear)}
            />
          );
        })}
      </div>
    </div>
  );
}
