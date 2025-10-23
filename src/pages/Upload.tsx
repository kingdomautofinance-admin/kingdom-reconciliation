import { FileSpreadsheet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { GoogleSheetsConnectionServiceAccount } from '@/components/GoogleSheetsConnectionServiceAccount';
import { BankUpload } from '@/components/BankUpload';
import { CardUpload } from '@/components/CardUpload';
import { KingdomUpload } from '@/components/KingdomUpload';

export default function Upload() {

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload</h1>
        <p className="text-muted-foreground">
          Import transactions from CSV files or Google Sheets
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <BankUpload />

        <CardUpload />

        <KingdomUpload />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Google Sheets Connection
            </CardTitle>
            <CardDescription>
              Connect your ledger spreadsheet for automatic synchronization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <GoogleSheetsConnectionServiceAccount />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
