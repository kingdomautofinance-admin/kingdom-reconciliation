import { Badge } from '@/components/ui/badge';
import { getBackgroundColor } from './DateSummaryCard';
import type { DateSummary } from './DateSummaryCard';

interface CalendarDayCellProps {
  date: Date;
  isoDate: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  summary: DateSummary | null;
  onClick: () => void;
}

export function CalendarDayCell({
  date,
  isoDate,
  dayOfMonth,
  isCurrentMonth,
  isToday,
  summary,
  onClick,
}: CalendarDayCellProps) {
  const percentage = summary?.reconciliation_percentage ?? null;
  const backgroundColor = getBackgroundColor(percentage);

  const getPercentageBadgeColor = (pct: number) => {
    if (pct === 100) return 'bg-green-600 text-white dark:bg-green-500';
    if (pct >= 80) return 'bg-yellow-600 text-white dark:bg-yellow-500';
    return 'bg-red-600 text-white dark:bg-red-500';
  };

  // Build aria-label for accessibility
  const ariaLabel = summary
    ? `${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} - ${percentage}% reconciled, ${summary.reconciled_count} of ${summary.total_count} transactions`
    : `${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} - No data`;

  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={`
        relative min-h-[60px] md:min-h-[80px] p-2 rounded-lg border transition-all
        ${backgroundColor}
        ${isCurrentMonth ? 'opacity-100' : 'opacity-40'}
        ${isToday ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        hover:shadow-md hover:scale-105 cursor-pointer
        focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 focus-visible:outline-none
      `}
    >
      {/* Day number */}
      <div className="text-sm md:text-base font-semibold text-foreground mb-1">
        {dayOfMonth}
      </div>

      {/* Percentage badge if has data */}
      {summary && percentage !== null && (
        <div className="flex justify-center">
          <Badge
            variant="secondary"
            className={`text-xs font-bold px-1.5 py-0.5 ${getPercentageBadgeColor(percentage)}`}
          >
            {percentage}%
          </Badge>
        </div>
      )}

      {/* Transaction count (optional, shown on hover or larger screens) */}
      {summary && (
        <div className="hidden lg:block text-xs text-muted-foreground mt-1">
          {summary.reconciled_count}/{summary.total_count}
        </div>
      )}
    </button>
  );
}
