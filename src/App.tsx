import { QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch } from 'wouter';
import { queryClient } from './lib/queryClient';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import KingdomTransactions from './pages/KingdomTransactions';
import Upload from './pages/Upload';
import Reports from './pages/Reports';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppLayout>
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
      </AppLayout>
    </QueryClientProvider>
  );
}

export default App;
