export type SortDirection = 'asc' | 'desc';

export interface SortConfig<T extends string = string> {
  column: T;
  direction: SortDirection;
}

export function toggleSortDirection(current: SortDirection): SortDirection {
  return current === 'asc' ? 'desc' : 'asc';
}

export function getNextSortState<T extends string>(
  currentSort: SortConfig<T> | null,
  column: T,
  defaultDirection: SortDirection = 'desc'
): SortConfig<T> {
  if (currentSort?.column === column) {
    return { column, direction: toggleSortDirection(currentSort.direction) };
  }
  return { column, direction: defaultDirection };
}
