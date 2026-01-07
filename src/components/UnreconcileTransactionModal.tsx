import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { X, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Transaction } from '@/lib/database.types';

interface UnreconcileTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  transaction: Transaction | null;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(value: string | number): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numValue);
}

export function UnreconcileTransactionModal({
  isOpen,
  onClose,
  onConfirm,
  transaction,
}: UnreconcileTransactionModalProps) {
  const [reason, setReason] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Fetch matched transaction details for preview
  const { data: matchedTransaction, isLoading } = useQuery<Transaction | null>({
    queryKey: ['matched-transaction', transaction?.matched_transaction_id],
    queryFn: async () => {
      if (!transaction?.matched_transaction_id) return null;

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transaction.matched_transaction_id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!transaction?.matched_transaction_id,
  });

  if (!isOpen || !transaction) return null;

  const handleNext = () => {
    if (!showConfirmation && reason.trim()) {
      setShowConfirmation(true);
    }
  };

  const handleConfirm = () => {
    if (reason.trim()) {
      onConfirm(reason.trim());
      setReason('');
      setShowConfirmation(false);
      onClose();
    }
  };

  const handleClose = () => {
    setReason('');
    setShowConfirmation(false);
    onClose();
  };

  const getOriginalStatus = (source: string) => {
    return source.startsWith('Google Sheets') ? 'pending-ledger' : 'pending-statement';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unreconcile-transaction-title"
    >
      <Card className="w-full max-w-[95vw] sm:max-w-2xl p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 id="unreconcile-transaction-title" className="text-xl font-semibold">
            Unreconcile Transaction
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {!showConfirmation && (
          <>
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 rounded-md flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900 dark:text-amber-100">
                <div className="font-medium mb-1">This action will:</div>
                <ul className="list-disc list-inside space-y-1 text-amber-800 dark:text-amber-200">
                  <li>Reverse the reconciliation between these two transactions</li>
                  <li>Set both transactions back to their original pending status</li>
                  <li>Automatically revert any linked Dealer Receivables to 'pending' if needed</li>
                  <li>Create an audit record of this action</li>
                </ul>
              </div>
            </div>

            {/* Transaction Preview */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Selected Transaction</h3>
              <div className="bg-muted p-3 rounded-md">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Date</div>
                    <div className="font-medium">{formatDate(transaction.date)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Name</div>
                    <div className="font-medium truncate">
                      {transaction.name || transaction.depositor || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Amount</div>
                    <div className="font-medium">{formatCurrency(transaction.value)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Source</div>
                    <div className="font-medium text-xs truncate">{transaction.source}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Will revert to:</span>
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    {getOriginalStatus(transaction.source)}
                  </Badge>
                </div>
              </div>

              {isLoading && (
                <div className="text-sm text-muted-foreground text-center py-3">
                  Loading matched transaction...
                </div>
              )}

              {matchedTransaction && (
                <>
                  <h3 className="text-sm font-semibold text-muted-foreground">Matched Transaction</h3>
                  <div className="bg-muted p-3 rounded-md">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">Date</div>
                        <div className="font-medium">{formatDate(matchedTransaction.date)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Name</div>
                        <div className="font-medium truncate">
                          {matchedTransaction.name || matchedTransaction.depositor || '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Amount</div>
                        <div className="font-medium">{formatCurrency(matchedTransaction.value)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Source</div>
                        <div className="font-medium text-xs truncate">{matchedTransaction.source}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Will revert to:</span>
                      <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                        {getOriginalStatus(matchedTransaction.source)}
                      </Badge>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="unreconcile-reason" className="text-sm font-medium">
                Reason for Unreconciling *
              </label>
              <Input
                id="unreconcile-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Incorrect match - dates don't align properly"
                className="w-full"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                This reason will be stored in the audit log and used for tracking purposes.
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleNext}
                disabled={!reason.trim()}
              >
                Next
              </Button>
            </div>
          </>
        )}

        {showConfirmation && (
          <>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to unreconcile these transactions?
            </p>
            <div className="bg-muted p-3 rounded-md">
              <p className="text-sm font-medium mb-1">Reason:</p>
              <p className="text-sm">{reason}</p>
            </div>
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3 rounded-md">
              <p className="text-sm text-red-900 dark:text-red-100">
                <strong>Warning:</strong> This will break the reconciliation link and both transactions
                will need to be reconciled again if this was done in error.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowConfirmation(false)}
              >
                Back
              </Button>
              <Button variant="destructive" onClick={handleConfirm}>
                Confirm Unreconcile
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
