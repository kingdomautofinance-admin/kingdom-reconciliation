import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useState, useMemo, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, CheckCircle2, Loader2, Search } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { queryClient } from '@/lib/queryClient';

const AUDIT_PER_PAGE = 50;

interface AuditRow {
  ledger_id: string;
  ledger_date: string;
  ledger_value: string;
  ledger_name: string;
  ledger_source: string;
  system_id: string | null;
  system_date: string | null;
  system_value: string | null;
  gap_amount: string | null;
  confidence_score: number | null;
  is_confirmed: boolean | null;
  link_id: string | null;
}

export default function KingdomTransactions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'mismatch' | 'perfect' | 'unmatched'>('all');
  const observerTarget = useRef<HTMLDivElement>(null);

  const { data: settings } = useQuery({
    queryKey: ['reconciliation-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reconciliation_settings')
        .select('*')
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data || { accuracy_threshold: 1.00 };
    },
  });

  const threshold = parseFloat(settings?.accuracy_threshold?.toString() || '1.00');

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<AuditRow[]>({
    queryKey: ['system-audit', statusFilter, searchTerm],
    queryFn: async ({ pageParam = 0 }) => {
      const start = pageParam as number;
      const end = start + AUDIT_PER_PAGE - 1;

      let query = supabase
        .from('system_audit_view')
        .select('*')
        .order('ledger_date', { ascending: false });

      if (searchTerm) {
        query = query.or(`ledger_name.ilike.%${searchTerm}%,ledger_source.ilike.%${searchTerm}%`);
      }

      if (statusFilter === 'mismatch') {
        query = query.not('gap_amount', 'eq', 0).not('gap_amount', 'is', null);
      } else if (statusFilter === 'perfect') {
        query = query.eq('gap_amount', 0);
      } else if (statusFilter === 'unmatched') {
        query = query.is('system_id', null);
      }

      const { data, error } = await query.range(start, end);
      if (error) throw error;
      return data as AuditRow[];
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === AUDIT_PER_PAGE ? allPages.length * AUDIT_PER_PAGE : undefined;
    },
    initialPageParam: 0,
  });

  const confirmMatchMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from('reconciliation_links')
        .update({ is_confirmed: true })
        .eq('id', linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-audit'] });
      toast({ title: 'Match confirmed' });
    },
  });

  const auditRows = useMemo(() => data?.pages.flat() || [], [data]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const target = observerTarget.current;
    if (target) observer.observe(target);
    return () => {
      if (target) observer.unobserve(target);
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const getGapColor = (gap: string | null) => {
    if (gap === null) return 'text-muted-foreground';
    const gapVal = Math.abs(parseFloat(gap));
    if (gapVal === 0) return 'text-green-600 dark:text-green-400';
    if (gapVal < threshold) return 'text-amber-500';
    return 'text-red-500';
  };

  const getConfidenceColor = (score: number | null) => {
    if (score === null) return 'bg-gray-100 text-gray-800';
    if (score >= 95) return 'bg-green-100 text-green-800';
    if (score >= 80) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Audit</h1>
          <p className="text-muted-foreground">
            Compare Google Sheets Ledger against Kingdom CRM System data.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search ledger entries..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={statusFilter === 'all' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('all')}
            size="sm"
          >
            All
          </Button>
          <Button
            variant={statusFilter === 'mismatch' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('mismatch')}
            size="sm"
          >
            Mismatches
          </Button>
          <Button
            variant={statusFilter === 'perfect' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('perfect')}
            size="sm"
          >
            Perfect Match
          </Button>
          <Button
            variant={statusFilter === 'unmatched' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('unmatched')}
            size="sm"
          >
            Unmatched
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-xs uppercase font-semibold">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Ledger Entry</th>
                <th className="px-4 py-3">System Entry</th>
                <th className="px-4 py-3 text-right">Ledger Val</th>
                <th className="px-4 py-3 text-right">System Val</th>
                <th className="px-4 py-3 text-right">Gap</th>
                <th className="px-4 py-3 text-center">Score</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Loading audit data...
                  </td>
                </tr>
              ) : auditRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    No records found matching filters.
                  </td>
                </tr>
              ) : (
                auditRows.map((row) => (
                  <tr 
                    key={row.ledger_id} 
                    className="hover:bg-muted/30 transition-colors cursor-default"
                    onDoubleClick={() => {
                      if (row.link_id && !row.is_confirmed && row.confidence_score && row.confidence_score < 100) {
                        confirmMatchMutation.mutate(row.link_id);
                      }
                    }}
                  >
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      {formatDate(row.ledger_date)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium truncate max-w-[200px]" title={row.ledger_name}>
                        {row.ledger_name || 'N/A'}
                      </div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={row.ledger_source}>
                        {row.ledger_source}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {row.system_id ? (
                        <>
                          <div className="font-medium text-xs">Matched in System</div>
                          <div className="text-xs text-muted-foreground">{formatDate(row.system_date!)}</div>
                        </>
                      ) : (
                        <div className="text-red-500 flex items-center gap-1 text-xs">
                          <AlertCircle className="h-3 w-3" />
                          Not in Kingdom CRM
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-right font-mono">
                      {formatCurrency(row.ledger_value)}
                    </td>
                    <td className="px-4 py-3 align-top text-right font-mono text-muted-foreground">
                      {row.system_value ? formatCurrency(row.system_value) : '-'}
                    </td>
                    <td className={`px-4 py-3 align-top text-right font-bold font-mono ${getGapColor(row.gap_amount)}`}>
                      {row.gap_amount ? formatCurrency(row.gap_amount) : '-'}
                    </td>
                    <td className="px-4 py-3 align-top text-center">
                      {row.confidence_score !== null && (
                        <Badge className={`${getConfidenceColor(row.confidence_score)} border-0`}>
                          {row.confidence_score}%
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-center">
                      {row.is_confirmed ? (
                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Confirmed
                        </Badge>
                      ) : row.link_id && row.confidence_score && row.confidence_score < 100 ? (
                        <div className="flex flex-col items-center gap-1">
                           <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                            Low Confidence
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">Double-click to confirm</span>
                        </div>
                      ) : row.link_id ? (
                        <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
                          Auto-Matched
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Pending
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div ref={observerTarget} className="p-4 border-t text-center text-xs text-muted-foreground">
          {isFetchingNextPage ? 'Loading more records...' : hasNextPage ? 'Scroll for more' : `Showing all ${auditRows.length} records`}
        </div>
      </Card>
    </div>
  );
}
