import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { DollarSign, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const MIN_DATE = '2024-05-01';

      // Get counts using exact count (only transactions >= 2024-05-01)
      const [totalResult, reconciledResult, pendingLedgerResult, pendingStatementResult] = await Promise.all([
        supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .gte('date', MIN_DATE),
        supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'reconciled')
          .gte('date', MIN_DATE),
        supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending-ledger')
          .gte('date', MIN_DATE),
        supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending-statement')
          .gte('date', MIN_DATE)
      ]);

      if (totalResult.error) throw totalResult.error;
      if (reconciledResult.error) throw reconciledResult.error;
      if (pendingLedgerResult.error) throw pendingLedgerResult.error;
      if (pendingStatementResult.error) throw pendingStatementResult.error;

      // Fetch all values with pagination to handle unlimited records (only >= 2024-05-01)
      const fetchAllValues = async (status?: string) => {
        const PAGE_SIZE = 1000;
        let allValues: { value: string }[] = [];
        let hasMore = true;
        let offset = 0;

        while (hasMore) {
          let query = supabase
            .from('transactions')
            .select('value')
            .gte('date', MIN_DATE)
            .range(offset, offset + PAGE_SIZE - 1);

          if (status) {
            query = query.eq('status', status);
          }

          const { data, error } = await query;

          if (error) throw error;

          if (!data || data.length === 0) {
            hasMore = false;
          } else {
            allValues.push(...data);
            if (data.length < PAGE_SIZE) {
              hasMore = false;
            } else {
              offset += PAGE_SIZE;
            }
          }
        }

        return allValues.reduce((sum, t) => sum + parseFloat(t.value), 0);
      };

      // Get sum of values with pagination
      const [totalValue, reconciledValue] = await Promise.all([
        fetchAllValues(),
        fetchAllValues('reconciled')
      ]);

      return {
        total: totalResult.count || 0,
        reconciled: reconciledResult.count || 0,
        pendingLedger: pendingLedgerResult.count || 0,
        pendingStatement: pendingStatementResult.count || 0,
        totalValue,
        reconciledValue
      };
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">No data available</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Financial reconciliation overview for car financing payments
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(stats.totalValue)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reconciled</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.reconciled.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(stats.reconciledValue)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Ledger</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats.pendingLedger.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting payment</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Statement</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {stats.pendingStatement.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Unmatched payments</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reconciliation Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Completion Rate</span>
              <span className="font-medium">
                {stats.total > 0 ? Math.round((stats.reconciled / stats.total) * 100) : 0}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
              <div
                className="bg-green-600 dark:bg-green-500 h-2.5 rounded-full transition-all"
                style={{
                  width: `${stats.total > 0 ? (stats.reconciled / stats.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
