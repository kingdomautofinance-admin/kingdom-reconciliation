import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Link2Off, Loader2, ArrowRight } from 'lucide-react';
import type { Transaction } from '@/lib/database.types';
import { getMatchedCounterpart } from '@/lib/matchWriter';
import { formatCurrency, formatDate } from '@/lib/utils';

interface UnmatchTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  transaction: Transaction | null;
  isPending?: boolean;
}

function Summary({ label, t }: { label: string; t: Pick<Transaction, 'date' | 'name' | 'depositor' | 'value' | 'source'> }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-1 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium" title={t.name || t.depositor || ''}>
          {t.name || t.depositor || '(no name)'}
        </span>
        <span className="font-mono font-semibold whitespace-nowrap">{formatCurrency(t.value)}</span>
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {formatDate(t.date)} · {t.source}
      </div>
    </div>
  );
}

/**
 * Reason-required modal for reversing a STATEMENT match (manual or auto).
 * Calls onConfirm(reason); the caller runs the scoped undoStatementMatch.
 */
export function UnmatchTransactionModal({
  isOpen,
  onClose,
  onConfirm,
  transaction,
  isPending = false,
}: UnmatchTransactionModalProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen, transaction?.id]);

  // Show the matched counterpart for confirmation (best-effort; may live in
  // another table for System matches, in which case we just omit it).
  const { data: matched } = useQuery<Transaction | null>({
    queryKey: ['transaction', 'unmatch-preview', transaction?.id, transaction?.matched_transaction_id],
    queryFn: async () => (transaction ? getMatchedCounterpart(transaction) : null),
    enabled: isOpen && !!transaction,
  });

  if (!isOpen || !transaction) return null;

  const canSubmit = reason.trim().length > 0 && !isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unmatch-transaction-title"
    >
      <Card className="w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 id="unmatch-transaction-title" className="text-xl font-semibold flex items-center gap-2">
            <Link2Off className="h-5 w-5 text-destructive" />
            Unmatch transaction
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={isPending}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          This reverses the reconciliation and returns both entries to the pending queue. A reason is required and will
          be recorded in the audit history.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Summary label="This entry" t={transaction} />
          <ArrowRight className="hidden sm:block h-4 w-4 text-muted-foreground mx-auto rotate-90 sm:rotate-0" />
          {matched ? (
            <Summary label="Matched entry" t={matched} />
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
              Matched entry
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="unmatch-reason" className="text-sm font-medium">
            Reason <span className="text-destructive">*</span>
          </label>
          <textarea
            id="unmatch-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why are you reversing this match?"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isPending}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => canSubmit && onConfirm(reason.trim())}
            disabled={!canSubmit}
            className="min-w-[120px]"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Unmatching...
              </>
            ) : (
              'Unmatch'
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
