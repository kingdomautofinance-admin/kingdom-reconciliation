import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/toast';

export function ReconciliationRules() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    id: '',
    accuracy_threshold: '1.00',
    stripe_fee_percent: '2.9',
    stripe_fixed_fee: '0.30',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reconciliation_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setSettings({
          id: data.id,
          accuracy_threshold: data.accuracy_threshold.toString(),
          stripe_fee_percent: data.stripe_fee_percent.toString(),
          stripe_fixed_fee: data.stripe_fixed_fee.toString(),
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error fetching settings',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        accuracy_threshold: parseFloat(settings.accuracy_threshold),
        stripe_fee_percent: parseFloat(settings.stripe_fee_percent),
        stripe_fixed_fee: parseFloat(settings.stripe_fixed_fee),
        updated_at: new Error().toISOString(), // This is just to trigger an update if needed, but normally DB handles it
      };

      let error;
      if (settings.id) {
        const { error: updateError } = await supabase
          .from('reconciliation_settings')
          .update(payload)
          .eq('id', settings.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('reconciliation_settings')
          .insert(payload);
        error = insertError;
      }

      if (error) throw error;

      toast({
        title: 'Settings saved',
        description: 'Reconciliation rules have been updated successfully.',
      });
      fetchSettings();
    } catch (error: any) {
      toast({
        title: 'Error saving settings',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-sm">Matching & Fees</CardTitle>
        <CardDescription>
          Configure the rules for automated matching and Stripe fee calculations.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Accuracy Threshold ($)</label>
            <Input
              type="number"
              step="0.01"
              value={settings.accuracy_threshold}
              onChange={(e) => setSettings({ ...settings, accuracy_threshold: e.target.value })}
              placeholder="1.00"
            />
            <p className="text-xs text-muted-foreground">
              Maximum difference allowed for auto-matching.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Stripe Fee (%)</label>
            <Input
              type="number"
              step="0.01"
              value={settings.stripe_fee_percent}
              onChange={(e) => setSettings({ ...settings, stripe_fee_percent: e.target.value })}
              placeholder="2.9"
            />
            <p className="text-xs text-muted-foreground">
              Standard processing fee percentage.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Stripe Fixed Fee ($)</label>
            <Input
              type="number"
              step="0.01"
              value={settings.stripe_fixed_fee}
              onChange={(e) => setSettings({ ...settings, stripe_fixed_fee: e.target.value })}
              placeholder="0.30"
            />
            <p className="text-xs text-muted-foreground">
              Fixed fee per transaction.
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Rules
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
