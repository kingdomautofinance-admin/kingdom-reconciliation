import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Info, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { queryClient } from '@/lib/queryClient';

interface Transaction {
  id: string;
  date: string;
  value: number;
  name: string | null;
  depositor: string | null;
  source: string;
  payment_method: string | null;
  historical_text: string | null;
}

export default function StripeReconciliation() {
  const [selectedPayout, setSelectedPayout] = useState<Transaction | null>(null);
  const [selectedCharges, setSelectedCharges] = useState<Set<string>>(new Set());

  const { data: settings } = useQuery({
    queryKey: ['reconciliation-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reconciliation_settings')
        .select('*')
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data || { stripe_fee_percent: 2.9, stripe_fixed_fee: 0.30 };
    },
  });

  const { data: payouts, isLoading: loadingPayouts } = useQuery({
    queryKey: ['stripe-payouts'],
    queryFn: async () => {
      // Fetch unreconciled Stripe payouts from bank statement
      // Usually historical_text contains "Stripe" and source is "Wells Fargo" or "Delta"
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('status', 'pending-statement')
        .ilike('historical_text', '%STRIPE%')
        .order('date', { ascending: false });
      if (error) throw error;
      return data.map(d => ({ ...d, value: parseFloat(d.value) })) as Transaction[];
    },
  });

  const { data: charges, isLoading: loadingCharges } = useQuery({
    queryKey: ['stripe-charges'],
    queryFn: async () => {
      // Fetch unreconciled Credit Card charges from Ledger
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('status', 'pending-ledger')
        .eq('payment_method', 'Credit Card')
        .order('date', { ascending: false });
      if (error) throw error;
      return data.map(d => ({ ...d, value: parseFloat(d.value) })) as Transaction[];
    },
  });

  const selectedChargesList = useMemo(() => {
    return charges?.filter(c => selectedCharges.has(c.id)) || [];
  }, [charges, selectedCharges]);

  const stats = useMemo(() => {
    const gross = selectedChargesList.reduce((sum, c) => sum + c.value, 0);
    const feePercent = parseFloat(settings?.stripe_fee_percent?.toString() || '2.9') / 100;
    const fixedFee = parseFloat(settings?.stripe_fixed_fee?.toString() || '0.30');
    const count = selectedChargesList.length;
    
    const expectedFees = gross * feePercent + fixedFee * count;
    const expectedNet = gross - expectedFees;
    const difference = selectedPayout ? selectedPayout.value - expectedNet : 0;

    // Smart suggestions for common fee variations
    const suggestions = [];
    if (selectedPayout) {
      if (Math.abs(difference + 15.00) < 0.05) suggestions.push('Matches $15.00 chargeback fee');
      const intlFee = gross * 0.01;
      if (Math.abs(difference + intlFee) < 0.05) suggestions.push('Matches 1% international card fee');
      if (Math.abs(difference - 15.00) < 0.05) suggestions.push('Matches $15.00 refund/correction');
    }

    return {
      gross,
      expectedFees,
      expectedNet,
      difference,
      count,
      suggestions
    };
  }, [selectedChargesList, settings, selectedPayout]);

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPayout) return;
      
      // 1. Create reconciliation_links for each charge
      const links = selectedChargesList.map(charge => ({
        ledger_id: charge.id,
        target_id: selectedPayout.id,
        type: 'STRIPE_PAYOUT',
        gap_amount: stats.difference / stats.count, // Distribute difference or keep it as aggregate
        confidence_score: 100,
        is_confirmed: true
      }));

      const { error: linksError } = await supabase
        .from('reconciliation_links')
        .insert(links);
      if (linksError) throw linksError;

      // 2. Update status of charges and payout
      const { error: chargesError } = await supabase
        .from('transactions')
        .update({ status: 'reconciled', matched_transaction_id: selectedPayout.id })
        .in('id', Array.from(selectedCharges));
      if (chargesError) throw chargesError;

      const { error: payoutError } = await supabase
        .from('transactions')
        .update({ status: 'reconciled' })
        .eq('id', selectedPayout.id);
      if (payoutError) throw payoutError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stripe-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['stripe-charges'] });
      setSelectedPayout(null);
      setSelectedCharges(new Set());
      toast({ title: 'Reconciliation successful' });
    },
    onError: (error: any) => {
      toast({ title: 'Error reconciling', description: error.message, variant: 'destructive' });
    }
  });

  const toggleCharge = (id: string) => {
    const newSet = new Set(selectedCharges);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedCharges(newSet);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur z-20 py-4 border-b">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stripe Payout Reconciliation</h1>
          <p className="text-muted-foreground">Match credit card charges to bank deposits.</p>
        </div>
        
        {selectedPayout && (
          <div className="flex items-center gap-6 bg-muted/50 p-4 rounded-lg border">
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase font-semibold">Selected Payout</div>
              <div className="font-mono font-bold text-lg">{formatCurrency(selectedPayout.value)}</div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase font-semibold">Expected Net ({stats.count} charges)</div>
              <div className="font-mono font-bold text-lg">{formatCurrency(stats.expectedNet)}</div>
            </div>
            <div className="text-right border-l pl-6">
              <div className="text-xs text-muted-foreground uppercase font-semibold">Difference</div>
              <div className={`font-mono font-bold text-lg ${Math.abs(stats.difference) < 0.05 ? 'text-green-600' : 'text-red-500'}`}>
                {formatCurrency(stats.difference)}
              </div>
              {stats.suggestions.length > 0 && (
                <div className="text-[10px] text-amber-600 font-bold animate-pulse">
                  {stats.suggestions[0]}
                </div>
              )}
            </div>
            <Button 
              onClick={() => reconcileMutation.mutate()} 
              disabled={reconcileMutation.isPending || stats.count === 0}
            >
              Confirm Match
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payouts Section */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-500" />
            1. Select Bank Payout
          </h2>
          <Card className="h-[600px] overflow-y-auto">
            <CardContent className="p-0">
              {loadingPayouts ? (
                <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
              ) : payouts?.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">No unreconciled Stripe payouts found.</div>
              ) : (
                <div className="divide-y">
                  {payouts?.map((p) => (
                    <div 
                      key={p.id}
                      className={`p-4 cursor-pointer transition-colors hover:bg-muted/50 ${selectedPayout?.id === p.id ? 'bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-500' : ''}`}
                      onClick={() => setSelectedPayout(p)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{formatDate(p.date)}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[300px]">{p.historical_text}</div>
                        </div>
                        <div className="font-mono font-bold">{formatCurrency(p.value)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Charges Section */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            2. Select Charges to Batch
          </h2>
          <Card className="h-[600px] overflow-y-auto">
            <CardContent className="p-0">
              {loadingCharges ? (
                <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
              ) : charges?.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">No pending credit card charges found.</div>
              ) : (
                <div className="divide-y">
                  {charges?.map((c) => (
                    <div 
                      key={c.id}
                      className={`p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/50 ${selectedCharges.has(c.id) ? 'bg-green-50 dark:bg-green-950' : ''}`}
                      onClick={() => toggleCharge(c.id)}
                    >
                      <Checkbox checked={selectedCharges.has(c.id)} onCheckedChange={() => toggleCharge(c.id)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between">
                          <div className="font-medium truncate">{c.name || 'Unknown Client'}</div>
                          <div className="font-mono font-bold">{formatCurrency(c.value)}</div>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <div>{formatDate(c.date)}</div>
                          <div>{c.car || 'No vehicle'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
