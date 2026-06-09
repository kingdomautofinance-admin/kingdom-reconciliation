import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { MatchDetail } from '@/lib/reconciliation-optimized';
import { formatCurrency } from '@/lib/utils';

/**
 * Collapsible "Why didn't N rows match?" diagnostics. Shared by the auto-reconcile
 * review modal (pre-apply) and the result modal (post-apply). Filters the
 * INCORRECT details internally and renders up to 10, with same-date near-misses.
 */
export function ReconciliationDiagnostics({ details }: { details: MatchDetail[] }) {
  const [open, setOpen] = useState(false);
  const unmatched = (details ?? []).filter((d) => d.overallStatus === 'INCORRECT');
  if (unmatched.length === 0) return null;

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-3 text-left text-sm font-medium hover:bg-muted/40 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Why didn't {unmatched.length} {unmatched.length === 1 ? 'row' : 'rows'} match?
        </span>
        <span className="text-xs text-muted-foreground">Showing first {Math.min(unmatched.length, 10)}</span>
      </button>

      {open && (
        <div className="border-t divide-y">
          {unmatched.slice(0, 10).map((detail) => {
            const ledger = detail.ledgerTransaction;
            const sameDate = detail.sameDateCandidates ?? [];
            return (
              <div key={ledger.id} className="p-3 space-y-2 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-medium text-sm truncate">
                    {ledger.name || ledger.depositor || '(no name)'}
                  </div>
                  <div className="font-mono font-semibold whitespace-nowrap">
                    {formatCurrency(ledger.value)}
                  </div>
                </div>
                <div className="text-muted-foreground">
                  {detail.failures[0] ?? 'No matching statement transaction.'}
                </div>
                {sameDate.length > 0 && (
                  <div className="rounded border bg-muted/30 p-2 space-y-1">
                    <div className="text-[10px] uppercase text-muted-foreground font-semibold">
                      Same-date statement entries (different amounts)
                    </div>
                    {sameDate.map((c) => (
                      <div key={c.id} className="flex items-baseline justify-between gap-3">
                        <span className="truncate">
                          {c.name || c.depositor || c.source || '(unnamed)'}
                          {c.payment_method ? ` · ${c.payment_method}` : ''}
                        </span>
                        <span className="font-mono whitespace-nowrap">{formatCurrency(c.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
