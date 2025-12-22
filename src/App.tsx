import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { Route, Switch, Link, useLocation } from 'wouter';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import KingdomTransactions from './pages/KingdomTransactions';
import Upload from './pages/Upload';
import Reports from './pages/Reports';
import { LayoutDashboard, List, Upload as UploadIcon, Moon, Sun, Crown, BarChart3, Menu, X } from 'lucide-react';
import { useTheme } from './lib/useTheme';
import { Button } from './components/ui/button';
import { useState } from 'react';

function App() {
  const { theme, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <nav className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 sticky top-0 z-10 shadow-sm safe-top">
          <div className="mx-auto px-6 sm:px-8 lg:px-12">
            <div className="flex justify-between h-16 md:h-20">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <img
                    src="/src/assets/kingdom-logo.png"
                    alt="Kingdom Auto Finance"
                    className="h-8 w-auto"
                  />
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <NavLink href="/" icon={<LayoutDashboard className="h-4 w-4" />}>
                    Dashboard
                  </NavLink>
                  <NavLink href="/reports" icon={<BarChart3 className="h-4 w-4" />}>
                    Reports
                  </NavLink>
                  <NavLink href="/transactions" icon={<List className="h-4 w-4" />}>
                    Transactions Sheets
                  </NavLink>
                  <NavLink href="/kingdom" icon={<Crown className="h-4 w-4" />}>
                    Transaction Kingdom System
                  </NavLink>
                  <NavLink href="/upload" icon={<UploadIcon className="h-4 w-4" />}>
                    Upload
                  </NavLink>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTheme}
                  className="rounded-full min-h-11 min-w-11"
                  aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                >
                  {theme === 'light' ? (
                    <Moon className="h-5 w-5" />
                  ) : (
                    <Sun className="h-5 w-5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="sm:hidden rounded-full min-h-11 min-w-11"
                  aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                  aria-expanded={isMobileMenuOpen}
                >
                  {isMobileMenuOpen ? (
                    <X className="h-5 w-5" />
                  ) : (
                    <Menu className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </div>

            {/* Mobile menu */}
            {isMobileMenuOpen && (
              <div className="sm:hidden border-t border-gray-200 dark:border-slate-800">
                <div className="py-3 space-y-1">
                  <MobileNavLink
                    href="/"
                    icon={<LayoutDashboard className="h-5 w-5" />}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Dashboard
                  </MobileNavLink>
                  <MobileNavLink
                    href="/reports"
                    icon={<BarChart3 className="h-5 w-5" />}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Reports
                  </MobileNavLink>
                  <MobileNavLink
                    href="/transactions"
                    icon={<List className="h-5 w-5" />}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Transactions Sheets
                  </MobileNavLink>
                  <MobileNavLink
                    href="/kingdom"
                    icon={<Crown className="h-5 w-5" />}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Transaction Kingdom System
                  </MobileNavLink>
                  <MobileNavLink
                    href="/upload"
                    icon={<UploadIcon className="h-5 w-5" />}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Upload
                  </MobileNavLink>
                </div>
              </div>
            )}
          </div>
        </nav>

        <main className="mx-auto px-6 sm:px-8 lg:px-12 py-8">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/reports" component={Reports} />
            <Route path="/transactions" component={Transactions} />
            <Route path="/kingdom" component={KingdomTransactions} />
            <Route path="/upload" component={Upload} />
            <Route>
              <div className="text-center py-12">
                <h2 className="text-2xl font-bold text-gray-900">Page not found</h2>
              </div>
            </Route>
          </Switch>
        </main>
      </div>
    </QueryClientProvider>
  );
}

function NavLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  const [location] = useLocation();
  const isActive = location === href;

  return (
    <Link href={href}>
      <a
        className={`inline-flex items-center gap-2 px-3 py-5 border-b-2 text-sm font-medium transition-colors ${
          isActive
            ? 'border-slate-900 dark:border-slate-100 text-gray-900 dark:text-gray-100'
            : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-200'
        }`}
      >
        {icon}
        {children}
      </a>
    </Link>
  );
}

function MobileNavLink({
  href,
  icon,
  children,
  onClick
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  const [location] = useLocation();
  const isActive = location === href;

  return (
    <Link href={href}>
      <a
        onClick={onClick}
        className={`flex items-center gap-3 px-6 py-3 text-base font-medium transition-colors min-h-11 ${
          isActive
            ? 'bg-slate-100 dark:bg-slate-800 text-gray-900 dark:text-gray-100'
            : 'text-gray-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-gray-900 dark:hover:text-gray-100'
        }`}
      >
        {icon}
        {children}
      </a>
    </Link>
  );
}

export default App;
