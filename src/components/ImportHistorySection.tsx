import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ImportHistory } from '@/lib/database.types';

interface ImportHistorySectionProps {
  sourceId?: string | null;
  title?: string;
  emptyMessage?: string;
  awaitingSourceMessage?: string;
  queryKey?: (string | null)[];
  fetchLimit?: number;
  showSeeMore?: boolean;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatStatus(status: string): string {
  return status
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function getBadgeVariant(status: string) {
  if (status === 'success' || status === 'completed') return 'default' as const;
  if (status === 'failed' || status === 'error' || status === 'cancelled') return 'destructive' as const;
  return 'secondary' as const;
}

export function ImportHistorySection({
  sourceId,
  title = 'Import History',
  emptyMessage = 'No imports recorded yet.',
  awaitingSourceMessage = 'Connect to start tracking import history.',
  queryKey,
  fetchLimit = 100,
  showSeeMore = true,
}: ImportHistorySectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: history = [], isLoading } = useQuery<ImportHistory[]>({
    queryKey: queryKey ?? ['import-history', sourceId],
    queryFn: async () => {
      if (!sourceId) return [];

      const { data, error } = await supabase
        .from('import_history')
        .select('*')
        .eq('spreadsheet_id', sourceId)
        .order('import_started_at', { ascending: false })
        .limit(fetchLimit);

      if (error) {
        console.error('Failed to fetch import history:', error);
        throw error;
      }

      return data ?? [];
    },
    enabled: Boolean(sourceId),
    staleTime: 30_000,
  });

  const hasHistory = history.length > 0;
  const recentHistory = history.slice(0, 5);

  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">
          {title}
        </span>
        {showSeeMore && hasHistory && history.length > 5 && (
          <Button
            variant="link"
            size="sm"
            className="text-xs p-0 h-auto"
            onClick={() => setIsModalOpen(true)}
          >
            See more
          </Button>
        )}
      </div>

      {!sourceId && (
        <p className="text-xs text-muted-foreground">{awaitingSourceMessage}</p>
      )}

      {sourceId && isLoading && (
        <p className="text-xs text-muted-foreground">Loading history…</p>
      )}

      {sourceId && !isLoading && !hasHistory && (
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      )}

      {sourceId && hasHistory && (
        <div className="space-y-2">
          {recentHistory.map((record) => (
            <div
              key={record.id}
              className="rounded-md border p-2 text-xs space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="font-medium text-foreground">
                    {formatDateTime(record.import_started_at)}
                  </p>
                  {record.import_completed_at && (
                    <p className="text-[11px] text-muted-foreground">
                      Completed {formatDateTime(record.import_completed_at)}
                    </p>
                  )}
                </div>
                <Badge
                  variant={getBadgeVariant(record.status)}
                  className="h-5 text-[11px]"
                >
                  {formatStatus(record.status)}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground">
                    {record.records_imported ?? 0}
                  </span>{' '}
                  imported
                </span>
                <span>
                  <span className="font-semibold text-foreground">
                    {record.duplicates_skipped ?? 0}
                  </span>{' '}
                  duplicates
                </span>
                <span>
                  <span className="font-semibold text-foreground">
                    {record.total_records_processed ?? 0}
                  </span>{' '}
                  total
                </span>
              </div>
              {record.error_message && (
                <p className="text-[11px] text-destructive">
                  Error: {record.error_message}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {isModalOpen && sourceId && hasHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl space-y-3 rounded-lg border bg-background p-4 shadow-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{title}</h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsModalOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3">
              {history.map((record) => (
                <div
                  key={record.id}
                  className="rounded-md border p-3 text-sm space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-foreground">
                        {formatDateTime(record.import_started_at)}
                      </p>
                      {record.import_completed_at && (
                        <p className="text-xs text-muted-foreground">
                          Completed {formatDateTime(record.import_completed_at)}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={getBadgeVariant(record.status)}
                      className="h-6 text-xs"
                    >
                      {formatStatus(record.status)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      <span className="font-semibold text-foreground">
                        {record.records_imported ?? 0}
                      </span>{' '}
                      imported
                    </span>
                    <span>
                      <span className="font-semibold text-foreground">
                        {record.duplicates_skipped ?? 0}
                      </span>{' '}
                      duplicates
                    </span>
                    <span>
                      <span className="font-semibold text-foreground">
                        {record.total_records_processed ?? 0}
                      </span>{' '}
                      total
                    </span>
                  </div>
                  {record.error_message && (
                    <p className="text-xs text-destructive">
                      Error: {record.error_message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

