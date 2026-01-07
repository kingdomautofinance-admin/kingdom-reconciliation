import { useMemo } from 'react';
import { MonthGridCard } from './MonthGridCard';
import type { DateSummary } from './DateSummaryCard';
import { getMonthsInYear } from '@/lib/calendar-utils';

interface YearlyCalendarViewProps {
  dateSummaries: DateSummary[];
  year: number;
  onMonthClick: (month: number) => void;
}

interface MonthStats {
  summaries: DateSummary[];
}

export function YearlyCalendarView({ dateSummaries, year, onMonthClick }: YearlyCalendarViewProps) {
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
      if (summaryYear === year && summaryMonth >= 1 && summaryMonth <= 12) {
        const monthData = stats.get(summaryMonth);
        if (monthData) {
          monthData.summaries.push(summary);
        }
      }
    });

    return stats;
  }, [dateSummaries, year]);

  const months = getMonthsInYear(year);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl md:text-3xl font-bold">{year}</h2>
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
              onClick={() => onMonthClick(monthInfo.month)}
            />
          );
        })}
      </div>
    </div>
  );
}
