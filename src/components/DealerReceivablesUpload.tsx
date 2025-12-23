import { useState, useMemo } from 'react';
import { FileSpreadsheet, RefreshCw, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { supabase } from '@/lib/supabase';
import { fetchSpreadsheetWithServiceAccount, getStoredServiceAccountCredentials } from '@/lib/googleSheetsService';

const SHEET_NAME = 'Received by Dealer';

const normalizeText = (value?: string | null) =>
  (value ?? '').toString().trim();

const normalizeKey = (value?: string | null) =>
  normalizeText(value).toLowerCase();

const normalizeDealership = (value?: string | null) =>
  normalizeText(value).toUpperCase();

const buildDuplicateKey = (loanId: string, date: string, amount: string) =>
  `${normalizeKey(loanId)}|${date}|${amount}`;

const buildFingerprint = (row: {
  loan_id: string;
  date: string;
  amount: string;
  car?: string | null;
  client?: string | null;
  depositor?: string | null;
  method?: string | null;
  dealership?: string | null;
}) =>
  [
    normalizeKey(row.loan_id),
    row.date,
    row.amount,
    normalizeKey(row.car ?? ''),
    normalizeKey(row.client ?? ''),
    normalizeKey(row.depositor ?? ''),
    normalizeKey(row.method ?? ''),
    normalizeKey(row.dealership ?? ''),
  ].join('|');

export function DealerReceivablesUpload() {
  const { showToast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');

  const parseSpreadsheetDate = (value: unknown): Date | null => {
    if (value === null || value === undefined) return null;
    if (value instanceof Date && !isNaN(value.getTime())) {
      return new Date(value.getTime());
    }

    if (typeof value === 'number' && !Number.isNaN(value)) {
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

  const headerAliases = useMemo(
    () => ({
      date: ['date', 'data'],
      amount: ['amount', 'valor', 'value'],
      loanId: ['loanid', 'loan id', 'loan_id'],
      car: ['car', 'vehicle', 'veiculo'],
      client: ['client', 'cliente', 'name', 'nome'],
      depositor: ['depositor', 'depositante'],
      method: ['method', 'payment method', 'forma de pagamento'],
      dealership: ['from', 'dealership', 'dealer'],
    }),
    []
  );

  const findColumn = (headers: unknown[], names: string[]) => {
    const headerMap: Record<string, number> = {};
    headers.forEach((header, index) => {
      const normalized = header.toString().toLowerCase().trim();
      headerMap[normalized] = index;
    });
    for (const name of names) {
      const normalized = name.toLowerCase().trim();
      if (headerMap[normalized] !== undefined) {
        return headerMap[normalized];
      }
    }
    return undefined;
  };

  const syncDealerReceivables = async () => {
    setIsSyncing(true);
    setSyncStatus('Fetching sheet connection...');

    try {
      const { data: connection, error: connectionError } = await supabase
        .from('sheet_connections')
        .select('spreadsheet_id, spreadsheet_name')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (connectionError) throw connectionError;
      if (!connection?.spreadsheet_id) {
        throw new Error('No active Google Sheet connection found.');
      }

      const credentials = await getStoredServiceAccountCredentials();
      setSyncStatus('Loading "Received by Dealer" tab...');

      const rows = await fetchSpreadsheetWithServiceAccount({
        spreadsheetId: connection.spreadsheet_id,
        serviceAccountEmail: credentials?.email || undefined,
        serviceAccountKey: credentials?.key || undefined,
        sheetName: SHEET_NAME,
      });

      if (!rows || rows.length < 2) {
        throw new Error('Sheet appears to be empty or invalid.');
      }

      const headers = rows[0];
      const dataRows = rows.slice(1);

      const dateCol = findColumn(headers, headerAliases.date);
      const amountCol = findColumn(headers, headerAliases.amount);
      const loanIdCol = findColumn(headers, headerAliases.loanId);
      const carCol = findColumn(headers, headerAliases.car);
      const clientCol = findColumn(headers, headerAliases.client);
      const depositorCol = findColumn(headers, headerAliases.depositor);
      const methodCol = findColumn(headers, headerAliases.method);
      const dealershipCol = findColumn(headers, headerAliases.dealership);

      if (dateCol === undefined || amountCol === undefined || loanIdCol === undefined) {
        const missing = [];
        if (dateCol === undefined) missing.push('Date');
        if (amountCol === undefined) missing.push('Amount');
        if (loanIdCol === undefined) missing.push('LoanId');
        throw new Error(`Missing required columns: ${missing.join(', ')}.`);
      }

      setSyncStatus('Preparing import...');

      const preparedRows = [];
      for (let index = 0; index < dataRows.length; index++) {
        const row = dataRows[index];
        if (!row || row.length === 0 || !row.some(cell => cell && cell.toString().trim())) {
          continue;
        }

        const parsedDate = parseSpreadsheetDate(row[dateCol]);
        if (!parsedDate) continue;

        const loanId = normalizeText(row[loanIdCol]);
        if (!loanId) continue;

        const valueRaw = normalizeText(row[amountCol]);
        const cleanValue = valueRaw.replace(/[^\d.,-]/g, '').replace(/,/g, '');
        if (!cleanValue) continue;

        const isoDateOnly = parsedDate.toISOString().slice(0, 10);

        preparedRows.push({
          loan_id: loanId,
          date: isoDateOnly,
          amount: cleanValue,
          car: carCol !== undefined ? normalizeText(row[carCol]) || null : null,
          client: clientCol !== undefined ? normalizeText(row[clientCol]) || null : null,
          depositor: depositorCol !== undefined ? normalizeText(row[depositorCol]) || null : null,
          method: methodCol !== undefined ? normalizeText(row[methodCol]) || null : null,
          dealership: dealershipCol !== undefined ? normalizeDealership(row[dealershipCol]) || null : null,
          status: 'pending' as const,
          sheet_order: index + 2,
          source_sheet_tab: SHEET_NAME,
        });
      }

      setSyncStatus('Checking duplicates and changes...');

      const { data: existingReceivables, error: existingError } = await supabase
        .from('dealer_receivables')
        .select('id, loan_id, date, amount, car, client, depositor, method, dealership, row_fingerprint')
        .order('date', { ascending: false });

      if (existingError) throw existingError;

      const existingMap = new Map(
        (existingReceivables || []).map(receivable => [
          buildDuplicateKey(receivable.loan_id, receivable.date.slice(0, 10), receivable.amount),
          receivable,
        ])
      );

      const toInsert = [];
      const changeAlerts = [];

      for (const row of preparedRows) {
        const key = buildDuplicateKey(row.loan_id, row.date, row.amount);
        const existing = existingMap.get(key);

        if (!existing) {
          toInsert.push(row);
          continue;
        }

        const fingerprint = buildFingerprint(row);
        if (existing.row_fingerprint && existing.row_fingerprint === fingerprint) {
          continue;
        }

        const diffs: Record<string, { from: string | null; to: string | null }> = {};
        const fields: Array<keyof typeof row> = ['car', 'client', 'depositor', 'method', 'dealership'];
        for (const field of fields) {
          const previousValue = (existing as any)[field] ?? null;
          const nextValue = (row as any)[field] ?? null;
          if (normalizeText(previousValue) !== normalizeText(nextValue)) {
            diffs[field] = {
              from: previousValue ? previousValue.toString() : null,
              to: nextValue ? nextValue.toString() : null,
            };
          }
        }

        if (Object.keys(diffs).length > 0) {
          changeAlerts.push({
            receivable_id: existing.id,
            field_diffs: diffs,
            changed_at: new Date().toISOString(),
          });
        }
      }

      const importStartTime = new Date().toISOString();
      const { data: importRecord } = await supabase
        .from('import_history')
        .insert({
          spreadsheet_id: connection.spreadsheet_id,
          spreadsheet_name: `${connection.spreadsheet_name || 'Sheet'} - ${SHEET_NAME}`,
          total_records_processed: preparedRows.length,
          status: 'in_progress',
          import_started_at: importStartTime,
        })
        .select()
        .single();

      let importedCount = 0;
      let duplicatesSkipped = preparedRows.length - toInsert.length;

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('dealer_receivables')
          .insert(toInsert);

        if (insertError) throw insertError;
        importedCount = toInsert.length;
      }

      let changeCount = 0;
      if (changeAlerts.length > 0) {
        const alertsWithImport = changeAlerts.map(alert => ({
          ...alert,
          import_id: importRecord?.id || null,
        }));
        const { error: changeError } = await supabase
          .from('dealer_receivable_changes')
          .insert(alertsWithImport);

        if (changeError) throw changeError;
        changeCount = changeAlerts.length;
      }

      if (importRecord) {
        await supabase
          .from('import_history')
          .update({
            records_imported: importedCount,
            duplicates_skipped: duplicatesSkipped,
            import_completed_at: new Date().toISOString(),
            status: 'success',
          })
          .eq('id', importRecord.id);
      }

      const alertMessage = changeCount > 0 ? `, ${changeCount} change alert(s)` : '';
      showToast(
        `Imported ${importedCount} receivable(s)${alertMessage}.`,
        'success'
      );

      setSyncStatus(`Import complete: ${importedCount} added, ${duplicatesSkipped} duplicates skipped.`);
    } catch (error: any) {
      console.error('Dealer receivables import error:', error);
      showToast(`Dealer receivables import failed: ${error.message}`, 'error');
      setSyncStatus('Import failed.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatus(''), 4000);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Dealer Receivables Import
        </CardTitle>
        <CardDescription>
          Import dealership-collected payments from the "{SHEET_NAME}" tab.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={syncDealerReceivables} disabled={isSyncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Dealer Receivables'}
          </Button>
          {syncStatus && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span>{syncStatus}</span>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Duplicate check uses LoanId + Date + Amount. Changes to other fields are logged as alerts only.
        </p>
      </CardContent>
    </Card>
  );
}
