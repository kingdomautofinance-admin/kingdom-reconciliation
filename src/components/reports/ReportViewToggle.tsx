import { Button } from '@/components/ui/button';
import { List, Calendar, CalendarDays } from 'lucide-react';

export type ViewType = 'list' | 'monthly' | 'yearly';

interface ReportViewToggleProps {
  view: ViewType;
  onViewChange: (view: ViewType) => void;
}

export function ReportViewToggle({ view, onViewChange }: ReportViewToggleProps) {
  return (
    <div className="inline-flex rounded-lg border bg-muted p-1" role="tablist">
      <Button
        variant={view === 'list' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('list')}
        role="tab"
        aria-selected={view === 'list'}
        className="gap-2"
      >
        <List className="h-4 w-4" />
        <span className="hidden sm:inline">List</span>
      </Button>
      <Button
        variant={view === 'monthly' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('monthly')}
        role="tab"
        aria-selected={view === 'monthly'}
        className="gap-2"
      >
        <Calendar className="h-4 w-4" />
        <span className="hidden sm:inline">Monthly</span>
      </Button>
      <Button
        variant={view === 'yearly' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('yearly')}
        role="tab"
        aria-selected={view === 'yearly'}
        className="gap-2"
      >
        <CalendarDays className="h-4 w-4" />
        <span className="hidden sm:inline">Yearly</span>
      </Button>
    </div>
  );
}
