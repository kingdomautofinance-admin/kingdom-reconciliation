import { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { X } from 'lucide-react';
import kingdomLogo from '@/assets/kingdom-logo.png';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { primaryNavItems, secondaryNavItems } from '@/lib/navigationItems';

type SidebarMobileDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export default function SidebarMobileDrawer({ open, onClose }: SidebarMobileDrawerProps) {
  const [location] = useLocation();

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 sm:hidden" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-0 top-0 h-full w-72 bg-card shadow-xl">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src={kingdomLogo} alt="Kingdom Auto Finance" className="h-8 w-auto" />
            <span className="text-sm font-semibold tracking-tight">Kingdom</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="px-3 pb-6 pt-4" aria-label="Mobile">
          <ul className="space-y-1">
            {primaryNavItems.map((item) => {
              const isActive = location === item.path;
              const Icon = item.icon;
              return (
                <li key={item.path}>
                  <Link href={item.path}>
                    <a
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </a>
                  </Link>
                </li>
              );
            })}
          </ul>

          {secondaryNavItems.length > 0 && (
            <div className="mt-6 border-t border-border pt-4">
              <ul className="space-y-1">
                {secondaryNavItems.map((item) => {
                  const isActive = location === item.path;
                  const Icon = item.icon;
                  return (
                    <li key={item.path}>
                      <Link href={item.path}>
                        <a
                          onClick={onClose}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-accent text-accent-foreground'
                              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </a>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}
