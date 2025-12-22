import { Menu, Search, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/useTheme';
import QuickActions from '@/components/navigation/QuickActions';
import NotificationCenter from '@/components/navigation/NotificationCenter';

type TopBarProps = {
  onOpenCommandBar: () => void;
  onOpenMobileMenu: () => void;
};

export default function TopBar({ onOpenCommandBar, onOpenMobileMenu }: TopBarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur safe-top">
      <div className="flex h-16 items-center justify-between gap-4 px-6 sm:px-8 lg:px-12">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenMobileMenu}
            className="sm:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenCommandBar}
            className="hidden md:flex"
            aria-label="Open command bar"
          >
            <Search className="h-4 w-4" />
            Search
            <span className="ml-2 rounded border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
              Cmd/Ctrl+K
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenCommandBar}
            className="md:hidden"
            aria-label="Open command bar"
          >
            <Search className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <QuickActions />
          <NotificationCenter />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="rounded-full"
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
