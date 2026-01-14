import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { X, AlertCircle, Unlink, Link as LinkIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Transaction } from '@/lib/database.types';
import { queryClient } from '@/lib/queryClient';
import { toast } from '@/components/ui/toast';

interface UnreconcileTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void; // Keep for legacy if needed, but we'll use a new flow
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
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Fetch active reconciliation links for this transaction
  const { data: links, isLoading: loadingLinks } = useQuery({
    queryKey: ['reconciliation-links', transaction?.id],
    queryFn: async () => {
      if (!transaction) return [];
      const { data, error } = await supabase
        .from('reconciliation_links')
        .select('*')
        .or(`ledger_id.eq.${transaction.id},target_id.eq.${transaction.id}`);
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!transaction,
  });

  const breakLink = async (linkId: string, type: string) => {
    setIsDeleting(linkId);
    try {
      // 1. Delete the link
      const { error: deleteError } = await supabase
        .from('reconciliation_links')
        .delete()
        .eq('id', linkId);
      if (deleteError) throw deleteError;

      // 2. If it was a Stripe Payout or Statement match, we might need to reset transaction statuses
      // For now, let's keep it simple and just invalidate queries
      // In a more complex system, we'd check if the transaction has ANY other links left

      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['system-audit'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-links'] });
      
      toast({
        title: 'Link broken',
        description: `The ${type} reconciliation link has been removed.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(null);
    }
  };

  if (!isOpen || !transaction) return null;

  const handleClose = () => {
    setReason('');
    onClose();
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
            Manage Reconciliation Links
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="bg-muted/30 p-4 rounded-lg border space-y-1">
          <div className="text-xs text-muted-foreground uppercase font-semibold">Selected Transaction</div>
          <div className="flex justify-between items-center">
            <span className="font-medium">{transaction.name || transaction.depositor || 'N/A'}</span>
            <span className="font-mono font-bold">{formatCurrency(transaction.value)}</span>
          </div>
          <div className="text-xs text-muted-foreground">{formatDate(transaction.date)} • {transaction.source}</div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-blue-500" />
            Active Audit Links
          </h3>

          {loadingLinks ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : links?.length === 0 ? (
            <div className="text-center p-8 border-2 border-dashed rounded-lg text-muted-foreground italic">
              No active reconciliation links found for this transaction.
            </div>
          ) : (
            <div className="grid gap-3">
              {links?.map((link) => (
                <div key={link.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/10 transition-colors">
                  <div className="space-y-1">
                    <Badge variant="secondary">
                      {link.type === 'SYSTEM' ? 'Kingdom CRM Audit' : link.type === 'STRIPE_PAYOUT' ? 'Stripe Payout Batch' : 'Bank Statement Match'}
                    </Badge>
                    <div className="text-xs text-muted-foreground">
                      Gap: {formatCurrency(link.gap_amount)} • Confidence: {link.confidence_score}%
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                    onClick={() => breakLink(link.id, link.type)}
                    disabled={!!isDeleting}
                  >
                    {isDeleting === link.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Unlink className="h-4 w-4 mr-2" />
                    )}
                    Break Link
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-4 flex justify-end">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}
