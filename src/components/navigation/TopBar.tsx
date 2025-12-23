import { Menu, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import QuickActions from '@/components/navigation/QuickActions';
import NotificationCenter from '@/components/navigation/NotificationCenter';

type TopBarProps = {
  onOpenCommandBar: () => void;
  onOpenMobileMenu: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchFocus: () => void;
};

export default function TopBar({
  onOpenCommandBar,
  onOpenMobileMenu,
  searchValue,
  onSearchChange,
  onSearchFocus,
}: TopBarProps) {
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
          <div className="relative hidden md:block w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              onFocus={onSearchFocus}
              placeholder="Search the system..."
              className="pl-9"
              aria-label="Search"
            />
          </div>
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
        </div>
      </div>
    </header>
  );
}
