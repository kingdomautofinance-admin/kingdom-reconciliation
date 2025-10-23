import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FileSpreadsheet, Link as LinkIcon, Unlink, RefreshCw } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { queryClient } from '@/lib/queryClient';
import type { SheetConnection } from '@/lib/database.types';
import { detectDuplicates } from '@/lib/parsers';
import { autoReconcileAll } from '@/lib/reconciliation';
import {
  initializeGoogleAPI,
  initializeTokenClient,
  requestAccessToken,
  fetchSpreadsheetData,
  hasValidToken,
  revokeAccess,
} from '@/lib/googleSheets';

export function GoogleSheetsConnection() {
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [googleInitialized, setGoogleInitialized] = useState(false);
  const [showCredentialsForm, setShowCredentialsForm] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let mounted = true;
    let attempts = 0;
    const maxAttempts = 50;

    const checkGoogleAPIs = async () => {
      if (!mounted) return;
      attempts++;

      if (attempts > maxAttempts) {
        console.error('Failed to load Google APIs after', maxAttempts, 'attempts');
        if (mounted) {
          setShowCredentialsForm(true);
          setGoogleInitialized(true);
        }
        return;
      }

      const hasEnvClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID &&
                          import.meta.env.VITE_GOOGLE_CLIENT_ID !== 'your-google-client-id.apps.googleusercontent.com';
      const hasEnvApiKey = import.meta.env.VITE_GOOGLE_API_KEY &&
                        import.meta.env.VITE_GOOGLE_API_KEY !== 'your-google-api-key';

      let finalClientId = hasEnvClientId ? import.meta.env.VITE_GOOGLE_CLIENT_ID : null;
      let finalApiKey = hasEnvApiKey ? import.meta.env.VITE_GOOGLE_API_KEY : null;

      if (!finalClientId || !finalApiKey) {
        const { data: storedCreds } = await supabase
          .from('sheet_connections')
          .select('google_client_id, google_api_key')
          .eq('is_active', false)
          .not('google_client_id', 'is', null)
          .not('google_api_key', 'is', null)
          .maybeSingle();

        if (storedCreds?.google_client_id && storedCreds?.google_api_key) {
          finalClientId = storedCreds.google_client_id;
          finalApiKey = storedCreds.google_api_key;
        }
      }

      if (!finalClientId || !finalApiKey) {
        if (mounted) {
          setShowCredentialsForm(true);
          setGoogleInitialized(true);
        }
        return;
      }

      if (window.gapi && window.google?.accounts?.oauth2) {
        try {
          await initializeGoogleAPI(finalApiKey);
          initializeTokenClient(finalClientId);
          if (mounted) setGoogleInitialized(true);
        } catch (error) {
          console.error('Failed to initialize Google APIs:', error);
          if (mounted) {
            setSyncStatus('Error: Failed to initialize Google APIs');
            setGoogleInitialized(true);
          }
        }
      } else {
        timeoutId = setTimeout(checkGoogleAPIs, 100);
      }
    };

    checkGoogleAPIs();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const { data: connection, isLoading: isLoadingConnection } = useQuery<SheetConnection | null>({
    queryKey: ['sheet-connection'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sheet_connections')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchInterval: false,
    staleTime: 5 * 60 * 1000,
  });

  const saveCredentialsMutation = useMutation({
    mutationFn: async ({ clientId, apiKey }: { clientId: string; apiKey: string }) => {
      setSyncStatus('Saving credentials...');

      const { data: existingCreds } = await supabase
        .from('sheet_connections')
        .select('id')
        .eq('is_active', false)
        .maybeSingle();

      if (existingCreds) {
        const { error } = await supabase
          .from('sheet_connections')
          .update({
            google_client_id: clientId,
            google_api_key: apiKey,
          })
          .eq('id', existingCreds.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('sheet_connections')
          .insert({
            google_client_id: clientId,
            google_api_key: apiKey,
            spreadsheet_id: '',
            spreadsheet_url: '',
            is_active: false,
          });

        if (error) throw error;
      }

      window.location.reload();
    },
    onError: (error) => {
      setSyncStatus(`Error: ${error.message}`);
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (url: string) => {
      setIsConnecting(true);
      setSyncStatus('Validating spreadsheet URL...');

      let spreadsheetId = '';

      if (url.includes('docs.google.com/spreadsheets')) {
        const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) {
          throw new Error('Invalid Google Sheets URL format. Please use the full URL from your browser.');
        }
        spreadsheetId = match[1];
      } else if (url.match(/^[a-zA-Z0-9-_]+$/)) {
        spreadsheetId = url.trim();
      } else {
        throw new Error('Please enter a valid Google Sheets URL or spreadsheet ID');
      }

      const fullUrl = url.includes('http')
        ? url.split(/[?#]/)[0]
        : `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

      if (!hasValidToken()) {
        setSyncStatus('Requesting Google authorization...');
        await requestAccessToken();
      }

      setSyncStatus('Testing connection...');
      await fetchSpreadsheetData(spreadsheetId);

      setSyncStatus('Creating connection...');

      const { data: existingConnection } = await supabase
        .from('sheet_connections')
        .select('id')
        .eq('is_active', true)
        .maybeSingle();

      if (existingConnection) {
        const { error } = await supabase
          .from('sheet_connections')
          .update({
            spreadsheet_id: spreadsheetId,
            spreadsheet_url: fullUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingConnection.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('sheet_connections')
          .insert({
            spreadsheet_id: spreadsheetId,
            spreadsheet_url: fullUrl,
            is_active: true,
          });

        if (error) throw error;
      }

      setSyncStatus('Running initial sync...');
      await syncData(spreadsheetId);

      return { spreadsheetId, fullUrl };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheet-connection'] });
      setSpreadsheetUrl('');
      setIsConnecting(false);
      setSyncStatus('Connection successful!');
      setTimeout(() => setSyncStatus(''), 3000);
    },
    onError: (error) => {
      setIsConnecting(false);
      setSyncStatus(`Error: ${error.message}`);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!connection) throw new Error('No connection to disconnect');

      const { error } = await supabase
        .from('sheet_connections')
        .update({ is_active: false })
        .eq('id', connection.id);

      if (error) throw error;
      revokeAccess();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheet-connection'] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!connection) throw new Error('No active connection');

      if (!hasValidToken()) {
        setSyncStatus('Requesting Google authorization...');
        await requestAccessToken();
      }

      setSyncStatus('Syncing...');
      await syncData(connection.spreadsheet_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheet-connection'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setSyncStatus('Sync completed!');
      setTimeout(() => setSyncStatus(''), 3000);
    },
    onError: (error) => {
      setSyncStatus(`Error: ${error.message}`);
    },
  });

  async function syncData(spreadsheetId: string) {
    setSyncStatus('Fetching spreadsheet data...');

    const rows = await fetchSpreadsheetData(spreadsheetId);

    if (!rows || rows.length < 2) {
      throw new Error('Spreadsheet appears to be empty or invalid');
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    const headerMap: Record<string, number> = {};
    headers.forEach((header, index) => {
      const normalized = header.toString().toLowerCase().trim();
      headerMap[normalized] = index;
    });

    function findColumn(possibleNames: string[]): number | undefined {
      for (const name of possibleNames) {
        const normalized = name.toLowerCase().trim();
        if (headerMap[normalized] !== undefined) {
          return headerMap[normalized];
        }
      }
      return undefined;
    }

    const dateCol = findColumn(['data', 'date', 'fecha']);
    const valueCol = findColumn(['valor', 'amount', 'value', 'precio']);
    const clientCol = findColumn(['cliente', 'client', 'name', 'nome', 'nombre']);
    const depositorCol = findColumn(['depositante', 'depositor']);
    const methodCol = findColumn(['forma de pagamento', 'method', 'payment method', 'tipo']);

    if (dateCol === undefined || valueCol === undefined) {
      const missing = [];
      if (dateCol === undefined) missing.push('Date/Data');
      if (valueCol === undefined) missing.push('Amount/Valor');
      throw new Error(`Missing required columns: ${missing.join(', ')}. Found: ${headers.join(', ')}`);
    }

    setSyncStatus('Parsing data...');

    const newTransactions = dataRows
      .filter(row => row && row.length > 0 && row.some(cell => cell && cell.toString().trim()))
      .map((row, index) => {
        const date = row[dateCol]?.toString().trim() || '';
        const value = row[valueCol]?.toString().trim() || '';
        const client = clientCol !== undefined ? row[clientCol]?.toString().trim() || '' : '';
        const depositor = depositorCol !== undefined ? row[depositorCol]?.toString().trim() || '' : '';
        const paymentMethod = methodCol !== undefined ? row[methodCol]?.toString().trim() || '' : '';

        return {
          date,
          value: parseFloat(value.replace(/[^\d.,-]/g, '').replace(/,/g, '')) || 0,
          depositor: depositor || null,
          payment_method: paymentMethod,
          name: client || null,
          source: 'Google Sheets (Synced)',
          status: 'pending-ledger' as const,
          sheet_order: index + 2,
        };
      })
      .filter(transaction => {
        if (!transaction.date || !transaction.value) {
          return false;
        }

        const parsedDate = new Date(transaction.date);
        if (isNaN(parsedDate.getTime())) {
          return false;
        }

        transaction.date = parsedDate.toISOString();
        return true;
      });

    setSyncStatus('Checking for duplicates...');
    const { data: existingTransactions } = await supabase
      .from('transactions')
      .select('date, value, depositor, payment_method, source, name');

    const uniqueTransactions = detectDuplicates(
      newTransactions,
      existingTransactions || []
    );

    if (uniqueTransactions.length === 0) {
      await supabase
        .from('sheet_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_records: newTransactions.length,
          updated_at: new Date().toISOString(),
        })
        .eq('spreadsheet_id', spreadsheetId);

      setSyncStatus('No new transactions to import');
      return;
    }

    setSyncStatus(`Importing ${uniqueTransactions.length} new transactions...`);

    const batchSize = 100;
    for (let i = 0; i < uniqueTransactions.length; i += batchSize) {
      const batch = uniqueTransactions.slice(i, i + batchSize);
      const { error } = await supabase.from('transactions').insert(batch as any);
      if (error) throw error;
    }

    setSyncStatus('Running auto-reconciliation...');
    await autoReconcileAll();

    await supabase
      .from('sheet_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_records: newTransactions.length,
        updated_at: new Date().toISOString(),
      })
      .eq('spreadsheet_id', spreadsheetId);
  }

  if (showCredentialsForm) {
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Google Client ID
            </label>
            <Input
              type="text"
              placeholder="xxxxx.apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Google API Key
            </label>
            <Input
              type="text"
              placeholder="AIzaSy..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Spreadsheet URL
            </label>
            <Input
              type="text"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={spreadsheetUrl}
              onChange={(e) => setSpreadsheetUrl(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Get your credentials from Google Cloud Console
          </p>
          <p className="text-xs text-muted-foreground">
            See <strong>GOOGLE_SHEETS_SETUP.md</strong> for setup instructions
          </p>
        </div>

        <Button
          onClick={() => {
            if (clientId && apiKey) {
              saveCredentialsMutation.mutate({ clientId, apiKey });
            }
          }}
          disabled={!clientId.trim() || !apiKey.trim() || saveCredentialsMutation.isPending}
          className="w-full"
          size="sm"
        >
          <LinkIcon className="h-4 w-4" />
          {saveCredentialsMutation.isPending ? 'Saving...' : 'Save & Connect'}
        </Button>

        {syncStatus && (
          <div className={`text-xs ${syncStatus.startsWith('Error') ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
            {syncStatus}
          </div>
        )}
      </div>
    );
  }

  if (isLoadingConnection) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!googleInitialized) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center space-y-2">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
          <p className="text-xs text-muted-foreground">Loading Google APIs...</p>
        </div>
      </div>
    );
  }

  if (connection) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="default" className="bg-green-600">
              <FileSpreadsheet className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
          >
            <Unlink className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Spreadsheet:
            </label>
            <a
              href={connection.spreadsheet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline mt-1 text-xs break-all"
            >
              <LinkIcon className="h-3 w-3 flex-shrink-0" />
              <span>{connection.spreadsheet_url}</span>
            </a>
          </div>

          {connection.last_sync_at && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Last Import:
                </label>
                <p className="text-xs mt-0.5">
                  {formatDate(connection.last_sync_at)}
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Records:
                </label>
                <p className="text-xs mt-0.5">
                  {connection.last_sync_records.toLocaleString()} transactions
                </p>
              </div>
            </>
          )}
        </div>

        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="w-full"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
        </Button>

        {syncStatus && (
          <div
            className={`text-xs ${
              syncStatus.startsWith('Error')
                ? 'text-red-600 dark:text-red-400'
                : syncStatus.includes('successful') || syncStatus.includes('completed')
                ? 'text-green-600 dark:text-green-400'
                : 'text-muted-foreground'
            }`}
          >
            {syncStatus}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Input
          type="text"
          placeholder="https://docs.google.com/spreadsheets/d/..."
          value={spreadsheetUrl}
          onChange={(e) => setSpreadsheetUrl(e.target.value)}
          disabled={isConnecting}
          className="text-sm"
        />
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Enter your Google Sheets URL
          </p>
          <p className="text-xs text-muted-foreground">
            You'll be asked to authorize access when connecting
          </p>
        </div>
      </div>

      <Button
        onClick={() => connectMutation.mutate(spreadsheetUrl)}
        disabled={!spreadsheetUrl.trim() || isConnecting}
        className="w-full"
        size="sm"
      >
        <LinkIcon className="h-4 w-4" />
        {isConnecting ? 'Connecting...' : 'Connect with Google'}
      </Button>

      {syncStatus && (
        <div
          className={`text-xs whitespace-pre-line ${
            syncStatus.startsWith('Error')
              ? 'text-red-600 dark:text-red-400'
              : syncStatus.includes('successful')
              ? 'text-green-600 dark:text-green-400'
              : 'text-muted-foreground'
          }`}
        >
          {syncStatus}
        </div>
      )}
    </div>
  );
}
