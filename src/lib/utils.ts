import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

export function formatDate(date: string | Date): string {
  if (date instanceof Date) {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  if (typeof date === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split('-');
      return `${month}/${day}/${year}`;
    }

    if (/^\d{4}-\d{2}-\d{2}T/.test(date)) {
      return formatDate(date.slice(0, 10));
    }

    const parsed = new Date(date);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    }

    return date;
  }

  return '';
}

export function parseUSDateToISO(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === '') return null;

  const trimmed = dateStr.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parts = trimmed.split('/');
  if (parts.length !== 3) return null;

  const month = parts[0].padStart(2, '0');
  const day = parts[1].padStart(2, '0');
  const year = parts[2];

  if (year.length !== 4) return null;

  const monthNum = parseInt(month);
  const dayNum = parseInt(day);

  if (monthNum < 1 || monthNum > 12) return null;
  if (dayNum < 1 || dayNum > 31) return null;

  return `${year}-${month}-${day}`;
}

export function formatUSDateInput(value: string): string {
  const digits = value.replace(/\D/g, '');

  if (digits.length <= 2) {
    return digits;
  } else if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  } else {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
  }
}

export function formatISODateToUS(dateStr: string): string {
  if (!dateStr) return '';

  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return '';

  return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
}

function createLocalDateFromISO(isoDate: string): Date | null {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
}

export function getStartOfDayFromISO(isoDate: string): Date | null {
  const date = createLocalDateFromISO(isoDate);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function getEndOfDayFromISO(isoDate: string): Date | null {
  const date = createLocalDateFromISO(isoDate);
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}
