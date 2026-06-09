import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, X, ArrowRight, Loader2 } from 'lucide-react';
import type { MatchProposal, MatchDetail } from '@/lib/reconciliation-optimized';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ReconciliationDiagnostics } from '@/components/ReconciliationDiagnostics';

interface AutoReconcileReviewModalProps {
  proposals: MatchProposal[];
  details: MatchDetail[];
  isApplying: boolean;
  onApply: (accepted: MatchProposal[]) => void;
  onClose: () => void;
}

const keyOf = (p: MatchProposal) => `${p.ledger.id}:${p.statement.id}`;

function Side({ label, t }: { label: string; t: MatchProposal['ledger'] }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium" title={t.name || t.depositor || ''}>
          {t.name || t.depositor || '(no name)'}
        </span>
        <span className="font-mono text-xs font-semibold whitespace-nowrap">{formatCurrency(t.value)}</span>
      </div>
      <div className="text-[11px] text-muted-foreground truncate">
        {formatDate(t.date)}
        {t.car ? ` · ${t.car}` : ''}
        {t.payment_method ? ` · ${t.payment_method}` : ''}
      </div>
    </div>
  );
}

export function AutoReconcileReviewModal({
  proposals,
  details,
  isApplying,
  onApply,
  onClose,
}: AutoReconcileReviewModalProps) {
  // Track skipped proposals; everything is kept by default.
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const keptCount = proposals.length - skipped.size;
  const unmatchedCount = useMemo(
    () => (details ?? []).filter((d) => d.overallStatus === 'INCORRECT').length,
    [details],
  );

  const toggle = (k: string) => {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const acceptAll = () => setSkipped(new Set());
  const skipAll = () => setSkipped(new Set(proposals.map(keyOf)));

  const handleApply = () => {
    const accepted = proposals.filter((p) => !skipped.has(keyOf(p)));
    onApply(accepted);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auto-reconcile-review-title"
    >
      <Card className="w-full max-w-3xl p-6 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="auto-reconcile-review-title" className="text-xl font-semibold">
              Review Auto-Reconcile Matches
            </h2>
            <p className="text-sm text-muted-foreground">
              {proposals.length} proposed {proposals.length === 1 ? 'match' : 'matches'}
              {unmatchedCount > 0 ? ` · ${unmatchedCount} unmatched` : ''}. Nothing is saved until you apply.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" disabled={isApplying}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {proposals.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-semibold">{keptCount}</span> of {proposals.length} will be applied
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={acceptAll} disabled={isApplying || skipped.size === 0}>
                Keep all
              </Button>
              <Button variant="outline" size="sm" onClick={skipAll} disabled={isApplying || skipped.size === proposals.length}>
                Skip all
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-4">
          {proposals.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed p-8 text-center text-sm text-muted-foreground">
              No new matches were found in this range.
            </div>
          ) : (
            <div className="divide-y rounded-lg border">
              {proposals.map((p) => {
                const k = keyOf(p);
                const isSkipped = skipped.has(k);
                return (
                  <label
                    key={k}
                    className={`grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3 p-3 cursor-pointer transition-colors ${
                      isSkipped ? 'opacity-50 bg-muted/30' : 'hover:bg-muted/40'
                    }`}
                  >
                    <Side label="Google Sheets" t={p.ledger} />
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Side label="Zelle / Credit Card" t={p.statement} />
                    <Checkbox
                      checked={!isSkipped}
                      onCheckedChange={() => toggle(k)}
                      aria-label={isSkipped ? 'Keep this match' : 'Skip this match'}
                    />
                  </label>
                );
              })}
            </div>
          )}

          <ReconciliationDiagnostics details={details} />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose} disabled={isApplying}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={isApplying || keptCount === 0} className="min-w-[160px]">
            {isApplying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Apply {keptCount} {keptCount === 1 ? 'match' : 'matches'}
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
