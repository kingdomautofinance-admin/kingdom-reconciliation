/**
 * Bank (Wells Fargo) Upload Component
 *
 * This component handles CSV uploads specifically for Wells Fargo bank statements.
 * It is completely independent from card upload functionality.
 *
 * Features:
 * - Zelle transaction parsing
 * - Deposit information extraction
 * - Duplicate detection
 * - Optional auto-reconciliation
 * - Progress tracking
 * - Cancel support
 *
 * IMPORTANT: This component uses bank-parser.ts and should NOT be affected
 * by changes to card import functionality.
 */

import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { parseWellsFargoCSV, detectDuplicates } from '@/lib/parsers';
import { autoReconcileAllOptimized } from '@/lib/reconciliation-optimized';
import { streamingInsert } from '@/lib/streaming-insert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload as UploadIcon, XCircle, CheckCircle, AlertCircle } from 'lucide-react';

export function BankUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [autoReconcile, setAutoReconcile] = useState<boolean>(false);
  const cancelRef = useRef<boolean>(false);

  const uploadMutation = useMutation({
    mutationFn: async ({ file, runAutoReconcile }: { file: File; runAutoReconcile: boolean }) => {
      cancelRef.current = false;

      console.log('[BANK UPLOAD] Starting bank import process');
      setUploadStatus('Parsing Wells Fargo CSV...');

      const newTransactions = await parseWellsFargoCSV(file);
      console.log('[BANK UPLOAD] Parse complete. Transactions found:', newTransactions.length);

      if (newTransactions.length === 0) {
        throw new Error('No valid transactions found in CSV file. Please verify the file format.');
      }

      if (cancelRef.current) {
        throw new Error('Upload cancelled by user');
      }

      setUploadStatus('Checking for duplicates...');
      console.log('[BANK UPLOAD] Fetching existing transactions');
      const { data: existingTransactions } = await supabase
        .from('transactions')
        .select('date, value, depositor, payment_method, source, name, car');

      console.log('[BANK UPLOAD] Running duplicate detection');
      const uniqueTransactions = detectDuplicates(
        newTransactions,
        existingTransactions || []
      );

      console.log('[BANK UPLOAD] Unique transactions to import:', uniqueTransactions.length);

      if (uniqueTransactions.length === 0) {
        return {
          imported: 0,
          duplicates: newTransactions.length,
          reconciled: 0,
        };
      }

      setUploadStatus(`Importing ${uniqueTransactions.length} bank transactions...`);

      const result = await streamingInsert(uniqueTransactions, {
        batchSize: 500,
        onProgress: (progress) => {
          if (cancelRef.current) {
            throw new Error('Upload cancelled by user');
          }
          setUploadStatus(`Importing... ${progress.percentage}% (${progress.inserted} of ${uniqueTransactions.length})`);
        }
      });

      const successfullyImported = result.inserted;
      const dbDuplicatesSkipped = result.duplicates;

      console.log('[BANK UPLOAD] Import complete');
      console.log('[BANK UPLOAD] Successfully imported:', successfullyImported);
      console.log('[BANK UPLOAD] DB duplicates skipped:', dbDuplicatesSkipped);
      console.log('[BANK UPLOAD] Errors:', result.errors);

      if (cancelRef.current) {
        throw new Error('Upload cancelled by user');
      }

      const totalDuplicates = newTransactions.length - uniqueTransactions.length + dbDuplicatesSkipped;
      let reconciled = 0;

      if (runAutoReconcile) {
        setUploadStatus('Running optimized auto-reconciliation...');
        console.log('[BANK UPLOAD] Starting optimized auto-reconciliation');
        const reconcileResult = await autoReconcileAllOptimized();
        reconciled = reconcileResult.matched;
        console.log('[BANK UPLOAD] Reconciled:', reconciled);
      }

      console.log('[BANK UPLOAD] Process complete');
      return {
        imported: successfullyImported,
        duplicates: totalDuplicates,
        reconciled,
      };
    },
    onSuccess: (data) => {
      const message = data.reconciled > 0
        ? `✓ Imported ${data.imported} bank transactions (${data.duplicates} duplicates skipped), ${data.reconciled} reconciled`
        : `✓ Imported ${data.imported} bank transactions (${data.duplicates} duplicates skipped)`;

      setUploadStatus(message);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setFile(null);

      setTimeout(() => {
        setUploadStatus('');
      }, 10000);
    },
    onError: (error: any) => {
      const isCancelled = error.message.includes('cancelled');
      console.error('[BANK UPLOAD] Error:', error);
      setUploadStatus(isCancelled ? 'Upload cancelled' : `Error: ${error.message}`);
      if (isCancelled) {
        setTimeout(() => setUploadStatus(''), 3000);
      }
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadStatus('');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UploadIcon className="h-5 w-5" />
          Upload Bank Statement (Wells Fargo)
        </CardTitle>
        <CardDescription>
          Import Zelle and deposit transactions from Wells Fargo CSV
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
        />

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="bankAutoReconcile"
            checked={autoReconcile}
            onChange={(e) => setAutoReconcile(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <label
            htmlFor="bankAutoReconcile"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Run auto-reconciliation after import
          </label>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => file && uploadMutation.mutate({ file, runAutoReconcile: autoReconcile })}
            disabled={!file || uploadMutation.isPending}
            className="flex-1"
          >
            {uploadMutation.isPending ? 'Processing...' : 'Upload Bank Transactions'}
          </Button>

          {uploadMutation.isPending && (
            <Button
              onClick={() => {
                cancelRef.current = true;
                setUploadStatus('Cancelling...');
              }}
              variant="destructive"
              size="default"
            >
              <XCircle className="h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>

        {uploadStatus && (
          <div className={`text-sm flex items-start gap-2 ${
            uploadStatus.startsWith('Error')
              ? 'text-red-600 dark:text-red-400'
              : uploadStatus.startsWith('✓')
              ? 'text-green-600 dark:text-green-400'
              : 'text-muted-foreground'
          }`}>
            {uploadStatus.startsWith('✓') && <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
            {uploadStatus.startsWith('Error') && <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
            <span>{uploadStatus}</span>
          </div>
        )}

        <div className="text-xs text-muted-foreground border-t pt-3 mt-3">
          <p className="font-semibold mb-1">Expected Wells Fargo CSV columns:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Date</li>
            <li>Amount</li>
            <li>Depositor Name or Description</li>
          </ul>
          <p className="text-xs mt-2 opacity-75">
            • Stripe Transfers: "STRIPE TRANSFER..." → Method: "Stripe receipt"<br/>
            • Wire Transfers: "WT FED..." → Method: "Wire Transfer" (payments)<br/>
            • Branch/Store: "DEPOSIT MADE IN A BRANCH/STORE" → Depositor: "Deposit"<br/>
            • Zelle: Identified by depositor name<br/>
            • Other deposits: Depositor = Full description from column D
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
