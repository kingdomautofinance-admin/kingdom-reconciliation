import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useCommandBar } from '@/hooks/useCommandBar';
import Sidebar from '@/components/navigation/Sidebar';
import SidebarMobileDrawer from '@/components/navigation/SidebarMobileDrawer';
import TopBar from '@/components/navigation/TopBar';
import Breadcrumbs from '@/components/navigation/Breadcrumbs';
import CommandBar from '@/components/navigation/CommandBar';

const SIDEBAR_STORAGE_KEY = 'sidebar-expanded';

type AppLayoutProps = {
  children: ReactNode;
};

export default function AppLayout({ children }: AppLayoutProps) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored ? stored === 'true' : true;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [location] = useLocation();
  const {
    isOpen: isCommandBarOpen,
    query: commandQuery,
    setQuery: setCommandQuery,
    open,
    openFresh,
    openWithQuery,
    close,
  } = useCommandBar();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isSidebarExpanded));
  }, [isSidebarExpanded]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setIsSidebarExpanded((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-6 focus:top-6 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to main content
      </a>
      <div className="flex min-h-screen">
        <Sidebar
          expanded={isSidebarExpanded}
          onToggle={() => setIsSidebarExpanded((prev) => !prev)}
        />
        <SidebarMobileDrawer
          open={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            onOpenCommandBar={openFresh}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
            searchValue={commandQuery}
            onSearchChange={(value) => openWithQuery(value)}
            onSearchFocus={open}
          />
          <Breadcrumbs />
          <main
            id="main-content"
            className="flex-1 px-6 pb-10 pt-6 sm:px-8 lg:px-12"
          >
            {children}
          </main>
        </div>
      </div>
      <CommandBar
        isOpen={isCommandBarOpen}
        onClose={close}
        query={commandQuery}
        onQueryChange={setCommandQuery}
      />
    </div>
  );
}
