import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FileSpreadsheet, Link as LinkIcon, Unlink, RefreshCw, Key, XCircle } from 'lucide-react';
import { formatDate, formatUSDateInput, formatISODateToUS, parseUSDateToISO } from '@/lib/utils';
import { queryClient } from '@/lib/queryClient';
import type { SheetConnection, ImportHistory } from '@/lib/database.types';
import { detectDuplicates, parseWellsFargoDescription } from '@/lib/parsers';
import {
  fetchSpreadsheetWithServiceAccount,
  saveServiceAccountCredentials,
  getStoredServiceAccountCredentials,
} from '@/lib/googleSheetsService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';
import { ImportHistorySection } from '@/components/ImportHistorySection';

function resolveSpreadsheetId(value?: string | null) {
  if (!value) return null;
  const match = value.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : value;
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function prettyStatus(status: string) {
  return status
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

export function GoogleSheetsConnectionServiceAccount() {
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('');
  const [serviceAccountEmail, setServiceAccountEmail] = useState('');
  const [serviceAccountKey, setServiceAccountKey] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [showCredentialsForm, setShowCredentialsForm] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const cancelRef = useRef<boolean>(false);
  const currentImportIdRef = useRef<string | null>(null);
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  
  // NEW: Date range filter states
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [useFullImport, setUseFullImport] = useState(true);
  const filterStartPickerRef = useRef<HTMLInputElement>(null);
  const filterEndPickerRef = useRef<HTMLInputElement>(null);

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
  });

  const resolvedSpreadsheetId = resolveSpreadsheetId(connection?.spreadsheet_id);

  const { data: importHistory = [] } = useQuery<ImportHistory[]>({
    queryKey: ['import-history', resolvedSpreadsheetId],
    queryFn: async () => {
      if (!resolvedSpreadsheetId) return [];

      const { data, error } = await supabase
        .from('import_history')
        .select('*')
        .eq('spreadsheet_id', resolvedSpreadsheetId)
        .order('import_started_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(resolvedSpreadsheetId),
    staleTime: 30_000,
  });

  const importOptionsSection = (
    <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Import Options</label>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="useFullImport"
            checked={useFullImport}
            onChange={(e) => setUseFullImport(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="useFullImport" className="text-sm cursor-pointer">
            Full Import (All Data)
          </label>
        </div>
      </div>

      {!useFullImport && (
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Start Date
            </label>
            <div className="relative">
              <Input
                type="text"
                placeholder="MM/DD/YYYY"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(formatUSDateInput(e.target.value))}
                onClick={() => filterStartPickerRef.current?.showPicker()}
                className="pr-3 cursor-pointer"
                maxLength={10}
              />
              <input
                ref={filterStartPickerRef}
                type="date"
                lang="en-US"
                tabIndex={-1}
                aria-hidden="true"
                value={parseUSDateToISO(filterStartDate) ?? ''}
                onChange={(e) =>
                  setFilterStartDate(e.target.value ? formatISODateToUS(e.target.value) : '')
                }
                className="absolute inset-0 h-0 w-0 opacity-0 pointer-events-none"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              End Date
            </label>
            <div className="relative">
              <Input
                type="text"
                placeholder="MM/DD/YYYY"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(formatUSDateInput(e.target.value))}
                onClick={() => filterEndPickerRef.current?.showPicker()}
                className="pr-3 cursor-pointer"
                maxLength={10}
              />
              <input
                ref={filterEndPickerRef}
                type="date"
                lang="en-US"
                tabIndex={-1}
                aria-hidden="true"
                value={parseUSDateToISO(filterEndDate) ?? ''}
                onChange={(e) =>
                  setFilterEndDate(e.target.value ? formatISODateToUS(e.target.value) : '')
                }
                className="absolute inset-0 h-0 w-0 opacity-0 pointer-events-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const saveCredentialsMutation = useMutation({
    mutationFn: async ({ email, key }: { email: string; key: string }) => {
      console.log('=== SAVING CREDENTIALS ===');
      console.log('Email:', email);
      console.log('Key length:', key.length);

      // Get the active connection (is_active = true) or the most recent one
      const { data: existing, error: selectError } = await supabase
        .from('sheet_connections')
        .select('id')
        .order('is_active', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log('Existing connection:', existing);
      console.log('Select error:', selectError);

      if (existing) {
        // Update existing connection
        console.log('Updating existing connection:', existing.id);
        const { data, error } = await supabase
          .from('sheet_connections')
          .update({
            service_account_email: email,
            service_account_key: key,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        console.log('Update result:', data);
        console.log('Update error:', error);

        if (error) {
          console.error('Failed to update credentials:', error);
          throw error;
        }
        
        return data;
      } else {
        // Insert new connection
        console.log('Creating new connection');
        const { data, error } = await supabase
          .from('sheet_connections')
          .insert({
            service_account_email: email,
            service_account_key: key,
            spreadsheet_id: '',
            spreadsheet_url: '',
            is_active: false,
          })
          .select()
          .single();

        console.log('Insert result:', data);
        console.log('Insert error:', error);

        if (error) {
          console.error('Failed to insert credentials:', error);
          throw error;
        }
        
        return data;
      }
    },
    onSuccess: () => {
      console.log('Credentials saved successfully');
      setSyncStatus('Credentials saved! Ready to connect.');
      queryClient.invalidateQueries({ queryKey: ['sheet-connection'] });
    },
    onError: (error) => {
      console.error('Save credentials error:', error);
      setSyncStatus(`Failed to save credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

      setSyncStatus('Testing connection...');

      const credentials = await getStoredServiceAccountCredentials();

      await fetchSpreadsheetWithServiceAccount({
        spreadsheetId,
        serviceAccountEmail: credentials?.email || undefined,
        serviceAccountKey: credentials?.key || undefined,
      });

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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheet-connection'] });
    },
  });

  // Update syncMutation to pass date range
  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!connection?.spreadsheet_id) {
        throw new Error('No spreadsheet connected');
      }

      console.log('Starting sync...');
      cancelRef.current = false;
      setSyncStatus('Starting sync...');
      setSyncProgress(0);
      setStartTime(Date.now());

      const spreadsheetId = connection.spreadsheet_id.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1] || connection.spreadsheet_id;

      const startDateIso = useFullImport ? undefined : parseUSDateToISO(filterStartDate) || undefined;
      const endDateIso = useFullImport ? undefined : parseUSDateToISO(filterEndDate) || undefined;

      await syncData(spreadsheetId, startDateIso, endDateIso);
    },
    onSuccess: () => {
      setSyncStatus('Sync completed successfully!');
      setSyncProgress(100);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      const historyKeyId = resolveSpreadsheetId(connection?.spreadsheet_id);
      if (historyKeyId) {
        queryClient.invalidateQueries({ queryKey: ['import-history', historyKeyId] });
      }
    },
    onError: (error) => {
      console.error('Mutation error:', error);
      setSyncStatus(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setSyncProgress(0);
      setStartTime(null);
    },
  });

  function updateEstimatedTime(currentProgress: number, recordCount: number) {
    if (!startTime || currentProgress === 0) return;

    const elapsedMs = Date.now() - startTime;
    const progressPercentage = currentProgress / 100;

    if (progressPercentage === 0) return;

    const estimatedTotalMs = elapsedMs / progressPercentage;
    const remainingMs = estimatedTotalMs - elapsedMs;

    if (remainingMs < 1000) {
      setEstimatedTime('Quase pronto...');
    } else if (remainingMs < 60000) {
      const seconds = Math.ceil(remainingMs / 1000);
      setEstimatedTime(`~${seconds}s restantes`);
    } else {
      const minutes = Math.ceil(remainingMs / 60000);
      setEstimatedTime(`~${minutes} min restantes`);
    }
  }

  async function syncData(spreadsheetId: string, startDate?: string, endDate?: string) {
    cancelRef.current = false;
    const syncStartedAt = Date.now();
    setStartTime(syncStartedAt);
    setSyncProgress(5);
    setSyncStatus('Preparing import...');
    setEstimatedTime('Calculating...');

    const startBoundary = startDate ? new Date(`${startDate}T00:00:00`) : null;
    if (startBoundary) startBoundary.setHours(0, 0, 0, 0);
    const endBoundary = endDate ? new Date(`${endDate}T23:59:59.999`) : null;
    if (endBoundary) endBoundary.setHours(23, 59, 59, 999);

    const dateRangeLabel = (() => {
      if (!startDate && !endDate) return '';
      const startLabel = startDate ? formatISODateToUS(startDate) : 'earliest';
      const endLabel = endDate ? formatISODateToUS(endDate) : 'latest';
      return ` (${startLabel} to ${endLabel})`;
    })();

    const parseSpreadsheetDate = (value: unknown): Date | null => {
      if (value === null || value === undefined) return null;
      if (value instanceof Date && !isNaN(value.getTime())) {
        return new Date(value.getTime());
      }

      if (typeof value === 'number' && !Number.isNaN(value)) {
        // Handle Excel serial numbers
        const excelEpoch = Date.UTC(1899, 11, 30);
        const millisecondsPerDay = 86400000;
        return new Date(excelEpoch + value * millisecondsPerDay);
      }

      const stringValue = value.toString().trim();
      if (!stringValue) return null;

      const parsed = new Date(stringValue);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }

      const numericCandidate = Number(stringValue);
      if (!Number.isNaN(numericCandidate)) {
        const excelEpoch = Date.UTC(1899, 11, 30);
        const millisecondsPerDay = 86400000;
        return new Date(excelEpoch + numericCandidate * millisecondsPerDay);
      }

      return null;
    };

    const credentials = await getStoredServiceAccountCredentials();

    setSyncStatus('Fetching spreadsheet data...');

    const rows = await fetchSpreadsheetWithServiceAccount({
      spreadsheetId,
      serviceAccountEmail: credentials?.email || undefined,
      serviceAccountKey: credentials?.key || undefined,
    });

    if (!rows || rows.length < 2) {
      throw new Error('Spreadsheet appears to be empty or invalid');
    }

    setSyncProgress(15);
    setSyncStatus('Processing header information...');

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
    const carCol = findColumn(['car', 'carro', 'veiculo', 'vehicle']);
    const depositAccountCol = findColumn(['depositaccount', 'deposit account', 'description', 'descrição']);

    if (dateCol === undefined || valueCol === undefined) {
      const missing = [];
      if (dateCol === undefined) missing.push('Date/Data');
      if (valueCol === undefined) missing.push('Amount/Valor');
      throw new Error(`Missing required columns: ${missing.join(', ')}. Found: ${headers.join(', ')}`);
    }

    setSyncProgress(25);
    updateEstimatedTime(25, dataRows.length);
    setSyncStatus('Parsing data...');

    let outsideRangeCount = 0;
    const newTransactions = [];

    for (let index = 0; index < dataRows.length; index++) {
      const row = dataRows[index];
      if (!row || row.length === 0 || !row.some(cell => cell && cell.toString().trim())) {
        continue;
      }

      const parsedDate = parseSpreadsheetDate(row[dateCol]);
      if (!parsedDate) {
        continue;
      }

      if (startBoundary && parsedDate < startBoundary) {
        outsideRangeCount++;
        continue;
      }
      if (endBoundary && parsedDate > endBoundary) {
        outsideRangeCount++;
        continue;
      }

      const valueRaw = row[valueCol]?.toString().trim() || '';
      const client = clientCol !== undefined ? row[clientCol]?.toString().trim() || '' : '';
      let depositor = depositorCol !== undefined ? row[depositorCol]?.toString().trim() || '' : '';
      let paymentMethod = methodCol !== undefined ? row[methodCol]?.toString().trim() || '' : '';
      const car = carCol !== undefined ? row[carCol]?.toString().trim() || '' : '';
      const depositAccount = depositAccountCol !== undefined ? row[depositAccountCol]?.toString().trim() || '' : '';

      if (depositAccount) {
        const parsed = parseWellsFargoDescription(depositAccount);
        if (parsed) {
          depositor = parsed.name;
          paymentMethod = parsed.method;
        }
      }

      const cleanValue = valueRaw.replace(/[^\d.,-]/g, '').replace(/,/g, '');
      if (!cleanValue) {
        continue;
      }

      const isoDateOnly = parsedDate.toISOString().slice(0, 10);

      newTransactions.push({
        date: isoDateOnly,
        value: cleanValue,
        depositor: depositor || null,
        payment_method: paymentMethod || null,
        name: client || null,
        car: car || null,
        source: 'Google Sheets (Service Account)',
        status: 'pending-ledger' as const,
        sheet_order: index + 2,
      });
    }

    setSyncProgress(45);
    updateEstimatedTime(45, newTransactions.length);
    if (startBoundary || endBoundary) {
      const filteredMessage = outsideRangeCount > 0
        ? `Filtered out ${outsideRangeCount} rows outside selected range.`
        : 'Date range applied.';
      setSyncStatus(`${filteredMessage} Preparing import...`);
    } else {
      setSyncStatus('Preparing import...');
    }

    const importStartTime = new Date().toISOString();
    const { data: importRecord } = await supabase
      .from('import_history')
      .insert({
        spreadsheet_id: spreadsheetId,
        spreadsheet_name: connection?.spreadsheet_name || null,
        total_records_processed: newTransactions.length,
        status: 'in_progress',
        import_started_at: importStartTime,
        filter_start_date: startDate || null,
        filter_end_date: endDate || null,
      })
      .select()
      .single();

    currentImportIdRef.current = importRecord?.id || null;

    if (cancelRef.current) {
      if (importRecord) {
        await supabase
          .from('import_history')
          .update({
            status: 'cancelled',
            import_completed_at: new Date().toISOString(),
          })
          .eq('id', importRecord.id);
      }
      throw new Error('Import cancelled by user');
    }

    setSyncProgress(55);
    updateEstimatedTime(55, newTransactions.length);
    setSyncStatus('Checking for duplicates...');
    const { data: existingTransactions } = await supabase
      .from('transactions')
      .select('date, value, depositor, payment_method, source, name, car')
      .order('date', { ascending: false });

    console.log('New transactions from sheet:', newTransactions.length);
    console.log('Existing transactions in DB:', existingTransactions?.length || 0);
    console.log('Sample new transaction:', newTransactions[0]);
    console.log('Sample existing transaction:', existingTransactions?.[0]);

    const uniqueTransactions = detectDuplicates(
      newTransactions,
      existingTransactions || []
    );

    const duplicatesSkipped = newTransactions.length - uniqueTransactions.length;
    console.log('Unique transactions to import:', uniqueTransactions.length);
    console.log('Duplicates skipped:', duplicatesSkipped);

    if (uniqueTransactions.length === 0) {
      await supabase
        .from('sheet_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_records: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('spreadsheet_id', spreadsheetId);

      if (importRecord) {
        await supabase
          .from('import_history')
          .update({
            records_imported: 0,
            duplicates_skipped: duplicatesSkipped,
            import_completed_at: new Date().toISOString(),
            status: 'success',
          })
          .eq('id', importRecord.id);
      }

      setSyncStatus(`Importado: 0 | Duplicados desconsiderados: ${duplicatesSkipped}${dateRangeLabel}`);
      setSyncProgress(100);
      queryClient.invalidateQueries({ queryKey: ['import-history', spreadsheetId] });
      setTimeout(() => {
        setSyncProgress(0);
        setSyncStatus('');
      }, 5000);
      return;
    }

    setSyncProgress(70);
    updateEstimatedTime(70, uniqueTransactions.length);
    setSyncStatus(`Importing ${uniqueTransactions.length} new transactions...`);

    const batchSize = 100;
    let dbDuplicatesSkipped = 0;
    let successfullyImported = 0;

    for (let i = 0; i < uniqueTransactions.length; i += batchSize) {
      if (cancelRef.current) {
        if (importRecord) {
          await supabase
            .from('import_history')
            .update({
              records_imported: successfullyImported,
              status: 'cancelled',
              import_completed_at: new Date().toISOString(),
            })
            .eq('id', importRecord.id);
        }
        throw new Error('Import cancelled by user');
      }

      const batch = uniqueTransactions.slice(i, i + batchSize);
      const { data, error } = await supabase.from('transactions').insert(batch as any).select();

      if (error) {
        if (error.code === '23505' && error.message.includes('transactions_unique_hash')) {
          console.warn('Database detected duplicates that passed application filter. Attempting individual inserts...');

          for (const transaction of batch) {
            const { data: singleData, error: singleError } = await supabase
              .from('transactions')
              .insert(transaction as any)
              .select();

            if (singleError) {
              if (singleError.code === '23505') {
                dbDuplicatesSkipped++;
                console.log('DB duplicate skipped:', transaction);
              } else {
                throw singleError;
              }
            } else if (singleData) {
              successfullyImported++;
            }
          }
        } else {
          throw error;
        }
      } else {
        successfullyImported += data?.length || batch.length;
      }

      const progress = 70 + Math.floor((i / uniqueTransactions.length) * 30);
      setSyncProgress(progress);
      updateEstimatedTime(progress, uniqueTransactions.length);
    }

    const totalDuplicatesSkipped = duplicatesSkipped + dbDuplicatesSkipped;

    if (dbDuplicatesSkipped > 0) {
      console.warn(`Database prevented ${dbDuplicatesSkipped} additional duplicates from being inserted`);
    }

    await supabase
      .from('sheet_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_records: successfullyImported,
        updated_at: new Date().toISOString(),
      })
      .eq('spreadsheet_id', spreadsheetId);

    if (importRecord) {
      await supabase
        .from('import_history')
        .update({
          records_imported: successfullyImported,
          duplicates_skipped: totalDuplicatesSkipped,
          import_completed_at: new Date().toISOString(),
          status: 'success',
        })
        .eq('id', importRecord.id);
    }

    setSyncStatus(`Importado: ${successfullyImported} | Duplicados desconsiderados: ${totalDuplicatesSkipped}${dateRangeLabel}`);
    setSyncProgress(100);
    setEstimatedTime(null);
    setStartTime(null);
    queryClient.invalidateQueries({ queryKey: ['import-history', spreadsheetId] });
    setTimeout(() => {
      setSyncProgress(0);
      setSyncStatus('');
    }, 5000);
  }

  if (showCredentialsForm) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sheet className="h-5 w-5" />
            Google Sheets Connection (Service Account)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingConnection ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : connection ? (
            <>
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="font-medium">Connected</span>
                  </div>
                  {connection.spreadsheet_name && (
                    <p className="text-sm text-muted-foreground">
                      {connection.spreadsheet_name}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {connection.spreadsheet_url}
                  </p>
                </div>
                <Button
                  onClick={() => disconnectMutation.mutate()}
                  variant="outline"
                  size="sm"
                  disabled={disconnectMutation.isPending}
                >
                  <X className="h-4 w-4" />
                  Disconnect
                </Button>
              </div>

              {importOptionsSection}

              {/* Last Import Info */}
              {importHistory.length > 0 && (
                <div className="text-sm space-y-1 p-3 bg-muted/30 rounded-md">
                  <div className="font-medium">Last Import:</div>
                  <div className="text-muted-foreground space-y-0.5">
                    <div>
                      Date: {formatDateTime(importHistory[0].import_started_at)}
                    </div>
                    <div>
                      Status:{' '}
                      <span
                        className={
                          importHistory[0].status === 'success'
                            ? 'text-green-600 dark:text-green-400'
                            : importHistory[0].status === 'failed' || importHistory[0].status === 'error'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-blue-600 dark:text-blue-400'
                        }
                      >
                        {prettyStatus(importHistory[0].status)}
                      </span>
                    </div>
                    <div>
                      Records: {importHistory[0].records_imported} imported • {importHistory[0].duplicates_skipped} duplicates • {importHistory[0].total_records_processed} total
                    </div>
                    {importHistory[0].error_message && (
                      <div className="text-destructive">
                        Error: {importHistory[0].error_message}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {syncStatus && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{syncStatus}</span>
                    {syncProgress > 0 && syncProgress < 100 && (
                      <span className="text-muted-foreground">{syncProgress}%</span>
                    )}
                  </div>
                  {syncProgress > 0 && (
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${syncProgress}%` }}
                      />
                    </div>
                  )}
                  {estimatedTime && syncProgress > 0 && syncProgress < 100 && (
                    <p className="text-xs text-muted-foreground">
                      Estimated time remaining: {estimatedTime}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                  className="flex-1"
                >
                  <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                  {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
                </Button>
                {syncMutation.isPending && (
                  <Button
                    onClick={() => {
                      cancelRef.current = true;
                      setSyncStatus('Cancelling import...');
                    }}
                    variant="destructive"
                    size="sm"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              {!showCredentialsForm ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Connect your Google Sheets using a service account to automatically sync transaction data.
                  </p>
                  <Button
                    onClick={() => setShowCredentialsForm(true)}
                    className="w-full"
                  >
                    <Key className="h-4 w-4" />
                    Setup Service Account
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Upload JSON file option */}
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        Option 1: Upload Service Account JSON File
                      </label>
                      <input
                        type="file"
                        accept=".json"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setJsonFile(file);
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              try {
                                const json = JSON.parse(event.target?.result as string);
                                setServiceAccountEmail(json.client_email || '');
                                setServiceAccountKey(json.private_key || '');
                                setSyncStatus('JSON file loaded successfully!');
                              } catch (error) {
                                setSyncStatus('Error: Invalid JSON file');
                              }
                            };
                            reader.readAsText(file);
                          }
                        }}
                        className="w-full text-sm"
                      />
                    </div>

                    <div className="text-center text-xs text-muted-foreground">
                      OR
                    </div>

                    {/* Manual input fields */}
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">
                          Option 2: Enter Credentials Manually
                        </label>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          Service Account Email
                        </label>
                        <input
                          type="email"
                          value={serviceAccountEmail}
                          onChange={(e) => setServiceAccountEmail(e.target.value)}
                          placeholder="your-service-account@project.iam.gserviceaccount.com"
                          className="w-full px-3 py-2 text-sm border rounded-md"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          Private Key
                        </label>
                        <textarea
                          value={serviceAccountKey}
                          onChange={(e) => setServiceAccountKey(e.target.value)}
                          placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                          rows={6}
                          className="w-full px-3 py-2 text-sm border rounded-md font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Google Sheets URL
                    </label>
                    <input
                      type="url"
                      value={spreadsheetUrl}
                      onChange={(e) => setSpreadsheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="w-full px-3 py-2 text-sm border rounded-md"
                    />
                  </div>

                  {syncStatus && (
                    <div className="text-sm p-3 bg-muted rounded-md">
                      {syncStatus}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={() => setShowCredentialsForm(false)}
                      variant="outline"
                      className="flex-1"
                      size="sm"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={async () => {
                        if (!serviceAccountEmail || !serviceAccountKey || !spreadsheetUrl) {
                          setSyncStatus('Please fill in all fields');
                          return;
                        }

                        let cleanedKey = serviceAccountKey.trim();

                        console.log('=== CLEANING KEY ON CLIENT ===');
                        console.log('Original key length:', cleanedKey.length);

                        if ((cleanedKey.startsWith('"') && cleanedKey.endsWith('"')) ||
                            (cleanedKey.startsWith("'") && cleanedKey.endsWith("'"))) {
                          cleanedKey = cleanedKey.slice(1, -1);
                        }

                        if (cleanedKey.includes('\\n')) {
                          cleanedKey = cleanedKey.replace(/\\n/g, '\n');
                        }

                        cleanedKey = cleanedKey.trim();

                        console.log('Cleaned key length:', cleanedKey.length);
                        console.log('Cleaned key preview:', cleanedKey.substring(0, 50));

                        if (!cleanedKey.includes('-----BEGIN PRIVATE KEY-----')) {
                          setSyncStatus('Error: Private key must contain "-----BEGIN PRIVATE KEY-----"');
                          return;
                        }

                        if (!cleanedKey.includes('-----END PRIVATE KEY-----')) {
                          setSyncStatus('Error: Private key must contain "-----END PRIVATE KEY-----"');
                          return;
                        }

                        if (cleanedKey.length < 1500) {
                          setSyncStatus(`Error: Private key too short (${cleanedKey.length} chars)`);
                          return;
                        }

                        try {
                          setIsConnecting(true);
                          setSyncStatus('Saving credentials...');
                          
                          await saveCredentialsMutation.mutateAsync({
                            email: serviceAccountEmail,
                            key: cleanedKey,
                          });

                          console.log('Credentials saved, now testing connection...');
                          setSyncStatus('Testing connection...');

                          await new Promise(resolve => setTimeout(resolve, 500));

                          const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-google-sheets`;
                          const spreadsheetId = spreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1] || spreadsheetUrl;

                          console.log('Testing with spreadsheet ID:', spreadsheetId);

                          const testResponse = await fetch(functionUrl, {
                            method: 'POST',
                            headers: {
                              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              spreadsheetId,
                              serviceAccountEmail: serviceAccountEmail,
                              serviceAccountKey: cleanedKey,
                            }),
                          });

                          const responseText = await testResponse.text();
                          console.log('Test response status:', testResponse.status);
                          console.log('Test response:', responseText);

                          if (!testResponse.ok) {
                            let errorMessage = 'Connection test failed';
                            try {
                              const errorData = JSON.parse(responseText);
                              errorMessage = errorData.error || errorData.details || errorMessage;
                            } catch (e) {
                              errorMessage = responseText || errorMessage;
                            }
                            throw new Error(errorMessage);
                          }

                          setSyncStatus('Connection successful! Connecting...');
                          
                          await connectMutation.mutateAsync(spreadsheetUrl);
                          
                          setShowCredentialsForm(false);
                          setSyncStatus('Connected successfully!');
                        } catch (error) {
                          console.error('Connection error:', error);
                          setSyncStatus(`Error: ${error instanceof Error ? error.message : 'Failed to connect'}`);
                        } finally {
                          setIsConnecting(false);
                        }
                      }}
                      disabled={!serviceAccountEmail || !serviceAccountKey || !spreadsheetUrl || isConnecting}
                      className="flex-1"
                      size="sm"
                    >
                      <Key className="h-4 w-4" />
                      {isConnecting ? 'Connecting...' : 'Save & Connect'}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  if (isLoadingConnection) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
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
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCredentialsForm(true)}
            >
              <Key className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              <Unlink className="h-4 w-4" />
            </Button>
          </div>
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

        {importOptionsSection}

        <div className="flex gap-2">
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="flex-1"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
          </Button>

          {syncMutation.isPending && (
            <Button
              onClick={() => {
                cancelRef.current = true;
                setSyncStatus('Cancelling...');
              }}
              variant="destructive"
              size="sm"
            >
              <XCircle className="h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>

        {syncProgress > 0 && syncProgress < 100 && (
          <div className="space-y-1.5">
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300 ease-out"
                style={{ width: `${syncProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{syncProgress}%</span>
              {estimatedTime && (
                <span className="font-medium text-blue-600 dark:text-blue-400">
                  {estimatedTime}
                </span>
              )}
            </div>
          </div>
        )}

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

        <ImportHistorySection
          sourceId={resolvedSpreadsheetId}
          title="Import History"
          awaitingSourceMessage="Connect Google Sheets to view import history."
        />
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
            Uses Service Account authentication (no OAuth popup required)
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => connectMutation.mutate(spreadsheetUrl)}
          disabled={!spreadsheetUrl.trim() || isConnecting}
          className="flex-1"
          size="sm"
        >
          <LinkIcon className="h-4 w-4" />
          {isConnecting ? 'Connecting...' : 'Connect'}
        </Button>

        <Button
          variant="outline"
          onClick={() => setShowCredentialsForm(true)}
          size="sm"
        >
          <Key className="h-4 w-4" />
        </Button>
      </div>

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
