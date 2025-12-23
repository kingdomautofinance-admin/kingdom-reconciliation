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
        'hidden sm:flex sm:flex-col border-r border-border bg-card text-card-foreground transition-all duration-200 ease-out sticky top-0 h-screen',
        expanded ? 'w-60' : 'w-16'
      )}
    >
      <div className="flex flex-col items-center px-3 py-4">
        <div className={cn('overflow-hidden', expanded ? 'h-10 w-44' : 'h-10 w-10')}>
          <img
            src={kingdomLogo}
            alt="Kingdom Auto Finance"
            className={cn(
              'h-10',
              expanded ? 'w-full object-contain' : 'w-24 object-left object-cover'
            )}
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-6 pt-4" aria-label="Primary">
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

      <div className={cn('mt-auto flex items-center justify-center px-3 pb-4', expanded ? '' : 'pt-2')}>
        {expanded ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-9 w-9"
            aria-label="Collapse sidebar"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        ) : (
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
    </aside>
  );
}
