import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useLocation } from 'wouter';
import { Search, Upload, FileDown, List, Landmark } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { navItems } from '@/lib/navigationItems';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';

type CommandItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  path?: string;
  keywords?: string[];
  description?: string;
  type?: 'page' | 'action';
};

type DataResult = {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  description: string;
  type: 'data';
};

type CommandBarProps = {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (value: string) => void;
};

const escapeForIlike = (term: string) =>
  term.replace(/([*\\])/g, '\\$1').replace(/,/g, '\\,').replace(/_/g, '\\_').replace(/%/g, '\\%');

const buildAmountCondition = (rawTerm: string, column: string) => {
  const digitsOnly = rawTerm.replace(/[^\d.-]/g, '');
  if (!digitsOnly) return null;
  const numericValue = Number(digitsOnly);
  if (Number.isNaN(numericValue)) return null;
  return `${column}.eq.${encodeURIComponent(numericValue.toString())}`;
};

export default function CommandBar({
  isOpen,
  onClose,
  query,
  onQueryChange,
}: CommandBarProps) {
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dataResults, setDataResults] = useState<DataResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const items = useMemo<CommandItem[]>(
    () => {
      const navCommands = navItems.map((item) => {
        const keywords = [item.label.toLowerCase()];
        if (item.path === '/transactions') {
          keywords.push('payments', 'sheet', 'spreadsheet');
        }
        if (item.path === '/kingdom') {
          keywords.push('kingdom', 'bank', 'credit card', 'reconciliation', 'payments');
        }
        if (item.path === '/reports') {
          keywords.push('analytics', 'export');
        }
        if (item.path === '/accounts-receivable') {
          keywords.push('receivables', 'dealers');
        }
        return {
          id: item.path === '/' ? 'dashboard' : item.path.replace('/', ''),
          label: item.label,
          icon: item.icon,
          path: item.path,
          keywords,
          type: 'page',
        };
      });

      return [
        ...navCommands,
        { id: 'upload', label: 'Upload', icon: Upload, path: '/upload', keywords: ['import'], type: 'action' },
        {
          id: 'upload-csv',
          label: 'Upload CSV',
          icon: Upload,
          path: '/upload',
          keywords: ['import', 'csv', 'bank', 'credit card'],
          type: 'action',
        },
        {
          id: 'export-report',
          label: 'Export report',
          icon: FileDown,
          path: '/reports',
          keywords: ['download', 'csv', 'pdf'],
          type: 'action',
        }
      ];
    },
    []
  );

  const pageResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => {
      const inLabel = item.label.toLowerCase().includes(normalized);
      const inPath = item.path?.toLowerCase().includes(normalized);
      const inKeywords = item.keywords?.some((keyword) =>
        keyword.toLowerCase().includes(normalized)
      );
      return inLabel || inPath || inKeywords;
    });
  }, [items, query]);

  const combinedResults = useMemo(() => {
    return [...pageResults, ...dataResults];
  }, [pageResults, dataResults]);

  const indexedResults = useMemo(
    () => combinedResults.map((item, index) => ({ ...item, index })),
    [combinedResults]
  );

  const indexedPages = useMemo(
    () => indexedResults.filter((item) => item.type !== 'data'),
    [indexedResults]
  );

  const indexedData = useMemo(
    () => indexedResults.filter((item) => item.type === 'data'),
    [indexedResults]
  );

  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  useEffect(() => {
    if (activeIndex >= combinedResults.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, combinedResults.length]);

  useEffect(() => {
    if (!isOpen) return;

    const normalized = query.trim();
    if (!normalized || normalized.length < 2) {
      setDataResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    let isActive = true;
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const sanitized = escapeForIlike(normalized);
        const searchPattern = `*${sanitized}*`;

        const transactionConditions = [
          `name.ilike.${searchPattern}`,
          `depositor.ilike.${searchPattern}`,
          `car.ilike.${searchPattern}`,
          `historical_text.ilike.${searchPattern}`,
          `source.ilike.${searchPattern}`,
        ];

        const transactionAmountCondition = buildAmountCondition(normalized, 'value');
        if (transactionAmountCondition) {
          transactionConditions.push(transactionAmountCondition);
        }

        const receivableConditions = [
          `loan_id.ilike.${searchPattern}`,
          `client.ilike.${searchPattern}`,
          `depositor.ilike.${searchPattern}`,
          `car.ilike.${searchPattern}`,
          `dealership.ilike.${searchPattern}`,
          `method.ilike.${searchPattern}`,
          `amount.ilike.${searchPattern}`,
        ];

        const receivableAmountCondition = buildAmountCondition(normalized, 'amount');
        if (receivableAmountCondition) {
          receivableConditions.push(receivableAmountCondition);
        }

        const [transactionResponse, receivableResponse] = await Promise.all([
          supabase
            .from('transactions')
            .select('id,date,name,depositor,car,value,source,status,is_deleted')
            .eq('is_deleted', false)
            .or(transactionConditions.join(','))
            .order('date', { ascending: false })
            .limit(6),
          supabase
            .from('dealer_receivables')
            .select('id,loan_id,date,amount,car,client,depositor,dealership,status')
            .or(receivableConditions.join(','))
            .order('date', { ascending: false })
            .limit(6),
        ]);

        if (!isActive) return;

        if (transactionResponse.error || receivableResponse.error) {
          setSearchError('Unable to fetch results right now.');
          setDataResults([]);
          return;
        }

        const transactionResults: DataResult[] = (transactionResponse.data ?? []).map((row) => {
          const name = row.name ?? row.depositor ?? row.car ?? 'Transaction';
          const label = `${formatCurrency(row.value)} • ${name}`;
          const description = `${formatDate(row.date)} • ${row.source} • ${row.status}`;
          const isKingdom = row.source?.toLowerCase().startsWith('kingdom system');
          const path = `${isKingdom ? '/kingdom' : '/transactions'}?q=${encodeURIComponent(normalized)}`;
          return {
            id: `transaction-${row.id}`,
            label,
            description,
            icon: List,
            path,
            type: 'data',
          };
        });

        const receivableResults: DataResult[] = (receivableResponse.data ?? []).map((row) => {
          const name = row.client ?? row.depositor ?? row.loan_id ?? 'Receivable';
          const label = `${formatCurrency(row.amount)} • ${name}`;
          const dealership = row.dealership ? row.dealership : 'Accounts receivable';
          const description = `${formatDate(row.date)} • ${dealership} • ${row.status}`;
          return {
            id: `receivable-${row.id}`,
            label,
            description,
            icon: Landmark,
            path: `/accounts-receivable?q=${encodeURIComponent(normalized)}`,
            type: 'data',
          };
        });

        setDataResults([...transactionResults, ...receivableResults]);
      } catch (_error) {
        if (!isActive) return;
        setSearchError('Unable to fetch results right now.');
        setDataResults([]);
      } finally {
        if (isActive) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [isOpen, query]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelect = (item: CommandItem | DataResult) => {
    if (item.path) {
      setLocation(item.path);
    }
    onClose();
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = combinedResults[activeIndex];
      if (item) handleSelect(item);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 backdrop-blur-sm px-4 pt-24" onClick={onClose}>
      <Card
        className="w-full max-w-xl overflow-hidden shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search anything..."
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-72 overflow-y-auto">
          {searchError && (
            <div className="px-4 py-3 text-sm text-destructive">{searchError}</div>
          )}
          {combinedResults.length === 0 && !isSearching && !searchError && (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              No results. Try another keyword.
            </div>
          )}
          {isSearching && (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              Searching...
            </div>
          )}
          {indexedPages.length > 0 && (
            <div className="px-4 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pages & Actions
            </div>
          )}
          {indexedPages.map((item) => {
            const Icon = item.icon;
            const isActive = item.index === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-accent/60'
                }`}
                onMouseEnter={() => setActiveIndex(item.index)}
                onClick={() => handleSelect(item)}
              >
                <Icon className="h-4 w-4" />
                <div className="flex flex-col">
                  <span className="font-medium">{item.label}</span>
                  {item.path && (
                    <span className="text-xs text-muted-foreground">{item.path}</span>
                  )}
                </div>
              </button>
            );
          })}
          {indexedData.length > 0 && (
            <div className="px-4 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Data Results
            </div>
          )}
          {indexedData.map((item) => {
            const Icon = item.icon;
            const isActive = item.index === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-accent/60'
                }`}
                onMouseEnter={() => setActiveIndex(item.index)}
                onClick={() => handleSelect(item)}
              >
                <Icon className="h-4 w-4" />
                <div className="flex flex-col">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
