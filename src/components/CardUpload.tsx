/**
 * Card (Stripe) Upload Component
 *
 * This component handles CSV uploads specifically for Stripe card transactions.
 * It is completely independent from bank upload functionality.
 *
 * Features:
 * - File validation before upload
 * - Detailed progress tracking
 * - Duplicate detection
 * - Optional auto-reconciliation
 * - Comprehensive error handling
 * - Cancel support
 *
 * IMPORTANT: This component uses card-parser.ts and should NOT be affected
 * by changes to bank import functionality.
 */

import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { parseStripeCSV, validateStripeCSV, detectDuplicates } from '@/lib/parsers';
import { autoReconcileAll } from '@/lib/reconciliation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload as UploadIcon, XCircle, AlertCircle, CheckCircle } from 'lucide-react';

export function CardUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [autoReconcile, setAutoReconcile] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const cancelRef = useRef<boolean>(false);

  const uploadMutation = useMutation({
    mutationFn: async ({ file, runAutoReconcile }: { file: File; runAutoReconcile: boolean }) => {
      cancelRef.current = false;

      console.log('[CARD UPLOAD] Starting card import process');
      setUploadStatus('Validating file...');

      const validation = await validateStripeCSV(file);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        console.warn('[CARD UPLOAD] Validation warnings:', validation.warnings);
      }

      setUploadStatus('Parsing Stripe CSV...');
      console.log('[CARD UPLOAD] Starting parse');
      const newTransactions = await parseStripeCSV(file);
      console.log('[CARD UPLOAD] Parse complete. Transactions found:', newTransactions.length);

      if (newTransactions.length === 0) {
        throw new Error('No valid transactions found in CSV file. Please verify the file format.');
      }

      if (cancelRef.current) {
        throw new Error('Upload cancelled by user');
      }

      setUploadStatus('Checking for duplicates...');
      console.log('[CARD UPLOAD] Fetching existing transactions');
      const { data: existingTransactions } = await supabase
        .from('transactions')
        .select('date, value, depositor, payment_method, source, name, car');

      console.log('[CARD UPLOAD] Running duplicate detection');
      const uniqueTransactions = detectDuplicates(
        newTransactions,
        existingTransactions || []
      );

      console.log('[CARD UPLOAD] Unique transactions to import:', uniqueTransactions.length);

      if (uniqueTransactions.length === 0) {
        return {
          imported: 0,
          duplicates: newTransactions.length,
          reconciled: 0,
        };
      }

      setUploadStatus(`Importing ${uniqueTransactions.length} card transactions...`);

      const batchSize = 100;
      let successfullyImported = 0;
      let dbDuplicatesSkipped = 0;

      for (let i = 0; i < uniqueTransactions.length; i += batchSize) {
        if (cancelRef.current) {
          throw new Error('Upload cancelled by user');
        }

        const batch = uniqueTransactions.slice(i, i + batchSize);
        const { data, error } = await supabase.from('transactions').insert(batch as any).select();

        if (error) {
          if (error.code === '23505' && error.message.includes('transactions_unique_hash')) {
            console.warn('[CARD UPLOAD] Database detected duplicates. Attempting individual inserts...');

            for (const transaction of batch) {
              const { data: singleData, error: singleError } = await supabase
                .from('transactions')
                .insert(transaction as any)
                .select();

              if (singleError) {
                if (singleError.code === '23505') {
                  dbDuplicatesSkipped++;
                  console.log('[CARD UPLOAD] DB duplicate skipped:', transaction);
                } else {
                  console.error('[CARD UPLOAD] Insert error:', singleError);
                  throw singleError;
                }
              } else if (singleData) {
                successfullyImported++;
              }
            }
          } else {
            console.error('[CARD UPLOAD] Unexpected error:', error);
            throw error;
          }
        } else {
          successfullyImported += data?.length || batch.length;
        }

        const progress = Math.round((i / uniqueTransactions.length) * 100);
        setUploadStatus(`Importing... ${progress}% (${successfullyImported} of ${uniqueTransactions.length})`);
      }

      console.log('[CARD UPLOAD] Import complete');
      console.log('[CARD UPLOAD] Successfully imported:', successfullyImported);
      console.log('[CARD UPLOAD] DB duplicates skipped:', dbDuplicatesSkipped);

      if (cancelRef.current) {
        throw new Error('Upload cancelled by user');
      }

      const totalDuplicates = newTransactions.length - uniqueTransactions.length + dbDuplicatesSkipped;
      let reconciled = 0;

      if (runAutoReconcile) {
        setUploadStatus('Running auto-reconciliation...');
        console.log('[CARD UPLOAD] Starting auto-reconciliation');
        const reconcileResult = await autoReconcileAll();
        reconciled = reconcileResult.matched;
        console.log('[CARD UPLOAD] Reconciled:', reconciled);
      }

      console.log('[CARD UPLOAD] Process complete');
      return {
        imported: successfullyImported,
        duplicates: totalDuplicates,
        reconciled,
      };
    },
    onSuccess: (data) => {
      const message = data.reconciled > 0
        ? `✓ Imported ${data.imported} card transactions (${data.duplicates} duplicates skipped), ${data.reconciled} reconciled`
        : `✓ Imported ${data.imported} card transactions (${data.duplicates} duplicates skipped)`;

      setUploadStatus(message);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setFile(null);
      setValidationErrors([]);
      setValidationWarnings([]);

      setTimeout(() => {
        setUploadStatus('');
      }, 10000);
    },
    onError: (error: any) => {
      const isCancelled = error.message.includes('cancelled');
      console.error('[CARD UPLOAD] Error:', error);
      setUploadStatus(isCancelled ? 'Upload cancelled' : `Error: ${error.message}`);
      if (isCancelled) {
        setTimeout(() => setUploadStatus(''), 3000);
      }
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadStatus('Validating file...');
      setValidationErrors([]);
      setValidationWarnings([]);

      const validation = await validateStripeCSV(selectedFile);
      setValidationErrors(validation.errors);
      setValidationWarnings(validation.warnings);

      if (validation.valid) {
        setUploadStatus('File validated ✓');
        setTimeout(() => setUploadStatus(''), 2000);
      } else {
        setUploadStatus('');
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UploadIcon className="h-5 w-5" />
          Upload Card Transactions (Stripe)
        </CardTitle>
        <CardDescription>
          Import credit/debit card transactions from Stripe CSV export
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
        />

        {validationErrors.length > 0 && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-red-900 dark:text-red-100 mb-1">Validation Errors:</p>
                <ul className="list-disc list-inside text-red-700 dark:text-red-300 space-y-1">
                  {validationErrors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {validationWarnings.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">Warnings:</p>
                <ul className="list-disc list-inside text-amber-700 dark:text-amber-300 space-y-1">
                  {validationWarnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="cardAutoReconcile"
            checked={autoReconcile}
            onChange={(e) => setAutoReconcile(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <label
            htmlFor="cardAutoReconcile"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Run auto-reconciliation after import
          </label>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => file && uploadMutation.mutate({ file, runAutoReconcile: autoReconcile })}
            disabled={!file || uploadMutation.isPending || validationErrors.length > 0}
            className="flex-1"
          >
            {uploadMutation.isPending ? 'Processing...' : 'Upload Card Transactions'}
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
              : uploadStatus.startsWith('✓') || uploadStatus.includes('validated')
              ? 'text-green-600 dark:text-green-400'
              : 'text-muted-foreground'
          }`}>
            {uploadStatus.startsWith('✓') && <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
            {uploadStatus.startsWith('Error') && <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
            <span>{uploadStatus}</span>
          </div>
        )}

        <div className="text-xs text-muted-foreground border-t pt-3 mt-3">
          <p className="font-semibold mb-1">Supported Stripe CSV formats:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Stripe Payments Export</li>
            <li>Stripe Balance Transactions</li>
            <li>Stripe Charges Export</li>
            <li>Stripe Custom Reports</li>
          </ul>
          <p className="text-xs mt-2 opacity-75">
            Required fields: Amount/Net + Date/Created + Payment info
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
