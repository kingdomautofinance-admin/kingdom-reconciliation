import { Link, useLocation } from 'wouter';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import kingdomLogo from '@/assets/kingdom-logo.png';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { primaryNavItems, secondaryNavItems } from '@/lib/navigationItems';

type SidebarProps = {
  expanded: boolean;
  onToggle: () => void;
};

export default function Sidebar({ expanded, onToggle }: SidebarProps) {
  const [location] = useLocation();

  return (
    <aside
      className={cn(
        'hidden sm:flex sm:flex-col border-r border-border bg-card text-card-foreground transition-all duration-200 ease-out',
        expanded ? 'w-60' : 'w-16'
      )}
    >
      <div className="flex h-16 items-center justify-between px-3">
        <div className={cn('flex items-center gap-3 flex-1', expanded ? '' : 'justify-center')}>
          <img
            src={kingdomLogo}
            alt="Kingdom Auto Finance"
            className={cn('h-8 w-auto', expanded ? '' : 'h-7')}
          />
          {expanded && (
            <span className="text-sm font-semibold tracking-tight">Kingdom</span>
          )}
        </div>
        {expanded && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-9 w-9"
            aria-label="Collapse sidebar"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        )}
        {!expanded && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-9 w-9"
            aria-label="Expand sidebar"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      <nav className="flex-1 px-2 pb-6 pt-4" aria-label="Primary">
        <div className="space-y-1">
          {primaryNavItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <a
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    !expanded && 'justify-center px-2'
                  )}
                  title={!expanded ? item.label : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {expanded && <span>{item.label}</span>}
                </a>
              </Link>
            );
          })}
        </div>

        <div className="mt-6 border-t border-border pt-4">
          {secondaryNavItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <a
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    !expanded && 'justify-center px-2'
                  )}
                  title={!expanded ? item.label : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {expanded && <span>{item.label}</span>}
                </a>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
