import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch } from 'wouter';
import { queryClient } from './lib/queryClient';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import KingdomTransactions from './pages/KingdomTransactions';
import Reports from './pages/Reports';
import AccountsReceivable from './pages/AccountsReceivable';
import Upload from './pages/Upload';
import Settings from './pages/Settings';
import PasswordGate, { getAccessExpiry, hasValidAccess } from './components/auth/PasswordGate';

const ACCESS_TOKEN_KEY = 'kr-access-until';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => hasValidAccess());

  useEffect(() => {
    if (!isAuthenticated) return;

    const expiry = getAccessExpiry();
    if (!expiry) {
      setIsAuthenticated(false);
      return;
    }

    const remainingMs = expiry - Date.now();
    if (remainingMs <= 0) {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      setIsAuthenticated(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      setIsAuthenticated(false);
    }, remainingMs);

    return () => window.clearTimeout(timeoutId);
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <PasswordGate onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppLayout>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/reports" component={Reports} />
          <Route path="/transactions" component={Transactions} />
          <Route path="/accounts-receivable" component={AccountsReceivable} />
          <Route path="/kingdom" component={KingdomTransactions} />
          <Route path="/upload" component={Upload} />
          <Route path="/settings" component={Settings} />
          <Route>
            <div className="text-center py-12">
              <h2 className="text-2xl font-bold text-gray-900">Page not found</h2>
            </div>
          </Route>
        </Switch>
      </AppLayout>
    </QueryClientProvider>
  );
}

export default App;
