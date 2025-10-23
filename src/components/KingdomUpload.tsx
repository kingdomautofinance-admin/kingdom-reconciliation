import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Upload, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Papa from 'papaparse';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { autoReconcileAll } from '@/lib/reconciliation';

interface KingdomCSVRow {
  _id: string;
  amount?: string;
  status: string;
  paymentIndex?: string;
  dueDate?: string;
  note?: string;
  type?: string;
  dealId?: string;
  createdAt?: string;
  clearedDate: string;
  paymentAmount: string;
  paymentMethod: string;
}

const mapPaymentMethod = (code: string): string => {
  const codeNum = parseInt(code, 10);
  switch (codeNum) {
    case 0:
      return 'Cash';
    case 1:
      return 'Credit Card';
    case 2:
      return 'Deposit';
    case 3:
      return 'Zelle';
    case 4:
      return 'Others';
    default:
      return 'Unknown';
  }
};

export function KingdomUpload() {
  const [file, setFile] = useState<File | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return new Promise<{ imported: number; duplicates: number }>((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            try {
              const rows = results.data as KingdomCSVRow[];
              let imported = 0;
              let duplicates = 0;

              for (const row of rows) {
                // Only process cleared payments (status = 2)
                if (row.status !== '2') continue;

                if (!row.clearedDate || !row.paymentAmount) continue;

                try {
                  // Parse ISO 8601 date format from clearedDate
                  const transactionDate = new Date(row.clearedDate).toISOString().split('T')[0];
                  const paymentMethodText = mapPaymentMethod(row.paymentMethod);

                  const { error } = await supabase
                    .from('kingdom_transactions')
                    .insert({
                      date: transactionDate,
                      value: row.paymentAmount,
                      name: null,
                      car: null,
                      payment_method: paymentMethodText,
                      source: `Kingdom Payment - ${row._id} - ${file.name}`,
                      status: 'pending-statement',
                    });

                  if (error) {
                    if (error.code === '23505') {
                      duplicates++;
                    } else {
                      throw error;
                    }
                  } else {
                    imported++;
                  }
                } catch (err) {
                  console.error('Error inserting row:', err);
                }
              }

              resolve({ imported, duplicates });
            } catch (error) {
              reject(error);
            }
          },
          error: (error) => {
            reject(error);
          },
        });
      });
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['kingdom-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['kingdom-transaction-counts'] });

      alert(`✅ Kingdom CSV uploaded successfully!\n\nImported: ${result.imported} transactions\nDuplicates skipped: ${result.duplicates}`);
      setFile(null);

      if (result.imported > 0) {
        const reconcileResult = await autoReconcileAll('kingdom_transactions');

        const summary = [
          '============================================================',
          'AUTO RECONCILIATION COMPLETE',
          '============================================================',
          '',
          `Total Processed: ${reconcileResult.totalProcessed}`,
          `Reconciled: ${reconcileResult.matched}`,
          `Pending: ${reconcileResult.totalProcessed - reconcileResult.matched}`,
          '',
          '============================================================'
        ].join('\n');

        alert(summary);
        queryClient.invalidateQueries({ queryKey: ['kingdom-transactions'] });
        queryClient.invalidateQueries({ queryKey: ['kingdom-transaction-counts'] });
      }
    },
    onError: (error) => {
      alert(`❌ Upload failed\n\n${error.message}`);
      console.error('Upload error:', error);
    },
  });

  const downloadTemplateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('kingdom_transactions')
        .select('date, value, name, car, payment_method, source')
        .order('date', { ascending: false })
        .limit(1000);

      if (error) throw error;

      const csv = Papa.unparse(data || []);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kingdom-transactions-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      alert('✅ CSV file downloaded successfully!');
    },
    onError: (error) => {
      alert(`❌ Download failed\n\n${error.message}`);
      console.error('Download error:', error);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        alert('Please select a CSV file');
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleUpload = () => {
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Sistema Kingdom
        </CardTitle>
        <CardDescription>
          Upload Kingdom Payment CSV (only cleared payments with status=2 will be imported)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Upload Kingdom CSV</label>
          <div className="flex gap-2">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="flex-1 text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100 dark:file:bg-slate-800 dark:file:text-slate-300 dark:hover:file:bg-slate-700"
            />
            <Button
              onClick={handleUpload}
              disabled={!file || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload
                </>
              )}
            </Button>
          </div>
          {file && (
            <p className="text-sm text-muted-foreground">
              Selected: {file.name}
            </p>
          )}
        </div>

        <div className="border-t pt-4">
          <label className="text-sm font-medium">Download Transactions</label>
          <p className="text-xs text-muted-foreground mb-2">
            Download all Kingdom transactions as CSV for reconciliation
          </p>
          <Button
            variant="outline"
            onClick={() => downloadTemplateMutation.mutate()}
            disabled={downloadTemplateMutation.isPending}
            className="w-full"
          >
            {downloadTemplateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download Kingdom Transactions
              </>
            )}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground space-y-1 border-t pt-4">
          <p className="font-semibold">Expected CSV format (Kingdom Payments):</p>
          <p>_id, amount, status, paymentIndex, dueDate, note, type, dealId, createdAt, clearedDate, paymentAmount, paymentMethod</p>
          <p className="text-xs italic mt-2">Only cleared payments (status=2) are imported</p>
          <p className="text-xs italic">paymentAmount is used for reconciliation with Google Sheets</p>
          <div className="mt-2 space-y-0.5">
            <p className="font-semibold">Payment Method Codes:</p>
            <p>0 = Cash | 1 = Credit Card | 2 = Deposit | 3 = Zelle | 4 = Others</p>
          </div>
          <p className="text-xs italic mt-2">Reconciliation: Match by value + date + payment method</p>
        </div>
      </CardContent>
    </Card>
  );
}
