import { CalendarDayCell } from './CalendarDayCell';
import type { CalendarDay } from '@/lib/calendar-utils';
import type { DateSummary } from './DateSummaryCard';

interface CalendarGridProps {
  days: CalendarDay[];
  summaryMap: Map<string, DateSummary>;
  onDayClick: (isoDate: string) => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarGrid({ days, summaryMap, onDayClick }: CalendarGridProps) {
  return (
    <div className="space-y-2">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 md:gap-2">
        {DAY_NAMES.map((day) => (
          <div
            key={day}
            className="text-center text-xs md:text-sm font-medium text-muted-foreground py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1 md:gap-2">
        {days.map((day) => (
          <CalendarDayCell
            key={day.isoDate}
            date={day.date}
            isoDate={day.isoDate}
            dayOfMonth={day.dayOfMonth}
            isCurrentMonth={day.isCurrentMonth}
            isToday={day.isToday}
            summary={summaryMap.get(day.isoDate) || null}
            onClick={() => onDayClick(day.isoDate)}
          />
        ))}
      </div>
    </div>
  );
}
