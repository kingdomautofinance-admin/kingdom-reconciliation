import { useState } from 'react';
import { ChevronDown, ChevronUp, Info, HelpCircle, AlertTriangle } from 'lucide-react';

interface InstructionsCollapsibleProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  variant?: 'info' | 'help' | 'warning';
}

export function InstructionsCollapsible({
  title,
  defaultExpanded = false,
  children,
  variant = 'info'
}: InstructionsCollapsibleProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const icons = {
    info: Info,
    help: HelpCircle,
    warning: AlertTriangle
  };

  const Icon = icons[variant];
  const ChevronIcon = isExpanded ? ChevronUp : ChevronDown;

  return (
    <div className="border rounded-lg overflow-hidden bg-muted/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <ChevronIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t">
          {children}
        </div>
      )}
    </div>
  );
}
