import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, ArrowRight, Loader2 } from 'lucide-react';
import type { Transaction } from '@/lib/database.types';
import { getMatchedCounterpart } from '@/lib/matchWriter';
import { formatCurrency, formatDate } from '@/lib/utils';

interface ViewMatchedModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`truncate text-sm ${mono ? 'font-mono font-semibold' : ''}`} title={value}>{value}</div>
    </div>
  );
}

function EntityCard({ heading, t }: { heading: string; t: Transaction }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{heading}</span>
        <Badge variant="secondary" className="text-[10px] truncate max-w-[55%]" title={t.source}>{t.source}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Detail label="Date" value={formatDate(t.date)} />
        <Detail label="Amount" value={formatCurrency(t.value)} mono />
        <Detail label="Client / Depositor" value={t.name || t.depositor || '-'} />
        <Detail label="Car" value={t.car || '-'} />
        <Detail label="Method" value={t.payment_method || '-'} />
        <Detail label="Status" value={t.status} />
      </div>
    </div>
  );
}

/** Read-only popup showing the transaction a reconciled row is matched to. */
export function ViewMatchedModal({ isOpen, onClose, transaction }: ViewMatchedModalProps) {
  const { data: matched, isLoading } = useQuery<Transaction | null>({
    queryKey: ['transaction', 'view-match', transaction?.id, transaction?.matched_transaction_id],
    queryFn: async () => (transaction ? getMatchedCounterpart(transaction) : null),
    enabled: isOpen && !!transaction,
  });

  if (!isOpen || !transaction) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="view-matched-title"
    >
      <Card className="w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 id="view-matched-title" className="text-xl font-semibold">
            Matched transaction
            {transaction.confidence != null && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">({transaction.confidence}% confidence)</span>
            )}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <EntityCard heading="This entry" t={transaction} />

        <div className="flex justify-center">
          <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
        </div>

        {isLoading ? (
          <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : matched ? (
          <EntityCard heading="Matched to" t={matched} />
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
            The matched transaction could not be found.
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose} className="min-w-[100px]">Close</Button>
        </div>
      </Card>
    </div>
  );
}
