import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { X, Loader2 } from 'lucide-react';
import type { DealerReceivable, DealerReceivableMatch, DealerReceivableChange } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatISODateToUS } from '@/lib/utils';

interface ViewReceivableDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  receivable: DealerReceivable | null;
}

export function ViewReceivableDetailsModal({
  isOpen,
  onClose,
  receivable,
}: ViewReceivableDetailsModalProps) {
  // Fetch match allocations
  const { data: allocations, isLoading: allocationsLoading } = useQuery<DealerReceivableMatch[]>({
    queryKey: ['receivable-allocations', receivable?.id],
    queryFn: async () => {
      if (!receivable?.id) return [];

      const { data, error } = await supabase
        .from('dealer_receivable_matches')
        .select('*')
        .eq('receivable_id', receivable.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!receivable?.id,
  });

  // Fetch change history
  const { data: changes, isLoading: changesLoading } = useQuery<DealerReceivableChange[]>({
    queryKey: ['receivable-changes', receivable?.id],
    queryFn: async () => {
      if (!receivable?.id) return [];

      const { data, error } = await supabase
        .from('dealer_receivable_changes')
        .select('*')
        .eq('receivable_id', receivable.id)
        .order('changed_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!receivable?.id,
  });

  if (!isOpen || !receivable) return null;

  const totalMatched = allocations?.reduce((sum, alloc) => {
    const amount = typeof alloc.amount === 'string' ? parseFloat(alloc.amount) : alloc.amount;
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0) || 0;

  const receivableAmount = typeof receivable.amount === 'string'
    ? parseFloat(receivable.amount)
    : receivable.amount || 0;

  const outstanding = Math.max(0, receivableAmount - totalMatched);

  const renderStatusBadge = (status: string) => {
    if (status === 'received') {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Received</Badge>;
    }
    return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Pending</Badge>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="view-receivable-title">
      <Card className="w-full max-w-[95vw] sm:max-w-3xl p-4 sm:p-6 space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 id="view-receivable-title" className="text-xl font-semibold">Receivable Details</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Receivable Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Date</div>
              <div className="font-medium">{formatISODateToUS(receivable.date.slice(0, 10))}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Loan ID</div>
              <div className="font-medium">{receivable.loan_id || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Client</div>
              <div className="font-medium">{receivable.client || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Depositor</div>
              <div className="font-medium">{receivable.depositor || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Car</div>
              <div className="font-medium">{receivable.car || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Payment Method</div>
              <div className="font-medium">{receivable.method || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Dealership</div>
              <div className="font-medium">{receivable.dealership || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <div>{renderStatusBadge(receivable.status)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Amount</div>
              <div className="font-semibold text-lg">{formatCurrency(receivableAmount)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Matched</div>
              <div className="font-semibold text-lg">{formatCurrency(totalMatched)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Outstanding</div>
              <div className="font-semibold text-lg">{formatCurrency(outstanding)}</div>
            </div>
          </div>

          {receivable.manual_override_note && (
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 rounded-md">
              <div className="text-xs font-medium text-amber-900 dark:text-amber-100 mb-1">Manual Override Note</div>
              <div className="text-sm text-amber-800 dark:text-amber-200">{receivable.manual_override_note}</div>
            </div>
          )}
        </div>

        {/* Allocations Section */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Match Allocations</h3>
          {allocationsLoading && (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading allocations...
            </div>
          )}
          {!allocationsLoading && (!allocations || allocations.length === 0) && (
            <div className="text-sm text-muted-foreground bg-muted p-4 rounded-md text-center">
              No match allocations yet.
            </div>
          )}
          {!allocationsLoading && allocations && allocations.length > 0 && (
            <div className="space-y-2">
              {allocations.map((alloc) => {
                const amount = typeof alloc.amount === 'string' ? parseFloat(alloc.amount) : alloc.amount;
                return (
                  <div key={alloc.id} className="bg-muted p-3 rounded-md flex justify-between items-center">
                    <div className="text-sm">
                      <div className="font-medium">Transaction ID: {alloc.transaction_id}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(alloc.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="font-semibold">{formatCurrency(amount)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Change History Section */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Change History</h3>
          {changesLoading && (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading change history...
            </div>
          )}
          {!changesLoading && (!changes || changes.length === 0) && (
            <div className="text-sm text-muted-foreground bg-muted p-4 rounded-md text-center">
              No change history available.
            </div>
          )}
          {!changesLoading && changes && changes.length > 0 && (
            <div className="space-y-2">
              {changes.map((change) => {
                const diffs = change.field_diffs as Record<string, { from: string | null; to: string | null }>;
                return (
                  <div key={change.id} className="bg-muted p-3 rounded-md">
                    <div className="text-xs text-muted-foreground mb-2">
                      {new Date(change.changed_at).toLocaleString()}
                    </div>
                    {change.note && (
                      <div className="text-sm font-medium mb-2">
                        Note: {change.note}
                      </div>
                    )}
                    {diffs && Object.keys(diffs).length > 0 && (
                      <div className="space-y-1">
                        {Object.entries(diffs).map(([field, diff]) => {
                          if (field === 'note') return null;
                          return (
                            <div key={field} className="text-sm">
                              <span className="font-medium capitalize">{field}:</span>{' '}
                              <span className="text-muted-foreground">{diff.from || 'empty'}</span> →{' '}
                              <span className="text-foreground">{diff.to || 'empty'}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}
