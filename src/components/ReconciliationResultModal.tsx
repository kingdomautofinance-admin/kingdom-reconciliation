import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import type { ReconciliationResult } from '@/lib/reconciliation-optimized';
import { ReconciliationDiagnostics } from '@/components/ReconciliationDiagnostics';

interface ReconciliationResultModalProps {
  result: ReconciliationResult | null;
  onClose: () => void;
}

function formatDate(iso: string): string {
  // ISO date 'YYYY-MM-DD' → e.g. 'May 1, 2026'
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function formatRange(range: ReconciliationResult['appliedRange']): string {
  if (!range) return 'all dates';
  const start = formatDate(range.startDate);
  if (!range.endDateExclusive) return `from ${start}`;
  // endDateExclusive is +1 day from the user's "to"; subtract one for display
  const [y, m, d] = range.endDateExclusive.split('-').map(Number);
  const inclusiveEnd = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  return `${start} → ${formatDate(inclusiveEnd)}`;
}

export function ReconciliationResultModal({ result, onClose }: ReconciliationResultModalProps) {
  if (!result) return null;

  const incorrect = result.totalProcessed - result.matched;
  const matchRate = result.totalProcessed > 0
    ? Math.round((result.matched / result.totalProcessed) * 100)
    : 0;
  const isFullySuccessful = result.matched > 0 && incorrect === 0;
  const hasMatches = result.matched > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reconciliation-result-title"
    >
      <Card className="w-full max-w-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {isFullySuccessful ? (
              <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400 shrink-0" />
            ) : hasMatches ? (
              <CheckCircle2 className="h-7 w-7 text-blue-600 dark:text-blue-400 shrink-0" />
            ) : (
              <AlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <h2 id="reconciliation-result-title" className="text-xl font-semibold">
              Reconciliation Complete
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          Date range: <span className="font-medium text-foreground">{formatRange(result.appliedRange)}</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="text-xs text-muted-foreground uppercase font-medium">Processed</div>
            <div className="text-2xl font-bold">{result.totalProcessed}</div>
          </div>
          <div className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950 p-3 text-center">
            <div className="text-xs text-green-700 dark:text-green-300 uppercase font-medium">Matched</div>
            <div className="text-2xl font-bold text-green-700 dark:text-green-300">{result.matched}</div>
          </div>
          <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-3 text-center">
            <div className="text-xs text-amber-700 dark:text-amber-300 uppercase font-medium">Unmatched</div>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">{incorrect}</div>
          </div>
        </div>

        {result.totalProcessed > 0 && (
          <div className="text-sm text-muted-foreground text-center">
            Match rate: <span className="font-semibold text-foreground">{matchRate}%</span>
          </div>
        )}

        <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
          <div className="font-medium text-foreground uppercase">Criteria</div>
          <div>• Date: exact match</div>
          <div>• Value: 100% exact match</div>
        </div>

        <ReconciliationDiagnostics details={result.details ?? []} />

        <div className="flex justify-end pt-2">
          <Button onClick={onClose} className="min-w-[100px]">
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}
