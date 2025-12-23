import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useLocation } from 'wouter';
import { Search, Upload, FileDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { navItems } from '@/lib/navigationItems';

type CommandItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  path?: string;
  keywords?: string[];
};

type CommandBarProps = {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (value: string) => void;
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
        };
      });

      return [
        ...navCommands,
        { id: 'upload', label: 'Upload', icon: Upload, path: '/upload', keywords: ['import'] },
        {
          id: 'upload-csv',
          label: 'Upload CSV',
          icon: Upload,
          path: '/upload',
          keywords: ['import', 'csv', 'bank', 'credit card']
        },
        {
          id: 'export-report',
          label: 'Export report',
          icon: FileDown,
          path: '/reports',
          keywords: ['download', 'csv', 'pdf']
        }
      ];
    },
    []
  );

  const results = useMemo(() => {
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

  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  useEffect(() => {
    if (activeIndex >= results.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, results.length]);

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

  const handleSelect = (item: CommandItem) => {
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
      const item = results[activeIndex];
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
          {results.length === 0 && (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              No results. Try another keyword.
            </div>
          )}
          {results.map((item, index) => {
            const Icon = item.icon;
            const isActive = index === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-accent/60'
                }`}
                onMouseEnter={() => setActiveIndex(index)}
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
        </div>
      </Card>
    </div>
  );
}
