import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  getDay,
  addDays,
  subDays,
  isSameDay,
  startOfToday,
} from 'date-fns';

export interface CalendarDay {
  date: Date;
  isoDate: string; // YYYY-MM-DD format
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

export interface MonthInfo {
  month: number; // 1-12
  year: number;
  name: string;
}

/**
 * Get all days in a specific month
 */
export function getDaysInMonth(year: number, month: number): Date[] {
  const start = new Date(year, month - 1, 1);
  const end = endOfMonth(start);
  return eachDayOfInterval({ start, end });
}

/**
 * Get the day of week (0=Sunday, 6=Saturday) for the first day of the month
 */
export function getMonthStartDay(year: number, month: number): number {
  const firstDay = new Date(year, month - 1, 1);
  return getDay(firstDay);
}

/**
 * Generate a complete calendar grid for a month (includes padding days from previous/next month)
 * Returns 42 days (6 weeks) to maintain consistent grid size
 */
export function getMonthCalendarGrid(year: number, month: number): CalendarDay[] {
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const lastDayOfMonth = endOfMonth(firstDayOfMonth);
  const startDayOfWeek = getDay(firstDayOfMonth);
  const today = startOfToday();

  const calendarDays: CalendarDay[] = [];

  // Add padding days from previous month
  const paddingStart = startDayOfWeek;
  for (let i = paddingStart - 1; i >= 0; i--) {
    const date = subDays(firstDayOfMonth, i + 1);
    calendarDays.push({
      date,
      isoDate: format(date, 'yyyy-MM-dd'),
      dayOfMonth: date.getDate(),
      isCurrentMonth: false,
      isToday: isSameDay(date, today),
    });
  }

  // Add days of current month
  const daysInMonth = getDaysInMonth(year, month);
  daysInMonth.forEach((date) => {
    calendarDays.push({
      date,
      isoDate: format(date, 'yyyy-MM-dd'),
      dayOfMonth: date.getDate(),
      isCurrentMonth: true,
      isToday: isSameDay(date, today),
    });
  });

  // Add padding days from next month to complete 6 weeks (42 days)
  const remainingDays = 42 - calendarDays.length;
  for (let i = 1; i <= remainingDays; i++) {
    const date = addDays(lastDayOfMonth, i);
    calendarDays.push({
      date,
      isoDate: format(date, 'yyyy-MM-dd'),
      dayOfMonth: date.getDate(),
      isCurrentMonth: false,
      isToday: isSameDay(date, today),
    });
  }

  return calendarDays;
}

/**
 * Generate array of 12 months for a given year
 */
export function getMonthsInYear(year: number): MonthInfo[] {
  const months: MonthInfo[] = [];
  for (let month = 1; month <= 12; month++) {
    const date = new Date(year, month - 1, 1);
    months.push({
      month,
      year,
      name: format(date, 'MMMM'),
    });
  }
  return months;
}

/**
 * Parse ISO date string (YYYY-MM-DD) into components
 */
export function parseISODate(isoDate: string): { year: number; month: number; day: number } | null {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => isNaN(part))) {
    return null;
  }
  const [year, month, day] = parts;
  return { year, month, day };
}

/**
 * Format month and year for display (e.g., "January 2026")
 */
export function formatMonthYear(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return format(date, 'MMMM yyyy');
}

/**
 * Get year and month from an ISO date string
 */
export function getYearMonthFromISO(isoDate: string): { year: number; month: number } | null {
  const parsed = parseISODate(isoDate);
  if (!parsed) return null;
  return { year: parsed.year, month: parsed.month };
}

/**
 * Navigate to next month (handles year boundary)
 */
export function getNextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) {
    return { year: year + 1, month: 1 };
  }
  return { year, month: month + 1 };
}

/**
 * Navigate to previous month (handles year boundary)
 */
export function getPreviousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}
