import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SortConfig } from '@/lib/sorting';

interface SortableHeaderProps<T extends string = string> {
  label: string;
  column: T;
  currentSort: SortConfig<T> | null;
  onSort: (column: T) => void;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

export function SortableHeader<T extends string = string>({
  label,
  column,
  currentSort,
  onSort,
  className,
  align = 'left',
}: SortableHeaderProps<T>) {
  const isActive = currentSort?.column === column;
  const direction = isActive ? currentSort.direction : null;

  const alignmentClass = {
    left: 'justify-start',
    right: 'justify-end',
    center: 'justify-center',
  }[align];

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        'flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer select-none',
        alignmentClass,
        isActive ? 'text-foreground' : 'text-muted-foreground',
        className
      )}
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span>{label}</span>
      <span className="flex-shrink-0">
        {isActive ? (
          direction === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        )}
      </span>
    </button>
  );
}
