import { FileSpreadsheet, Moon, Sun } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GoogleSheetsConnectionServiceAccount } from '@/components/GoogleSheetsConnectionServiceAccount';
import { BankUpload } from '@/components/BankUpload';
import { CardUpload } from '@/components/CardUpload';
import { KingdomUpload } from '@/components/KingdomUpload';
import { DealerReceivablesUpload } from '@/components/DealerReceivablesUpload';
import { useTheme } from '@/lib/useTheme';

export default function Settings() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage uploads, connections, and appearance preferences.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {theme === 'light' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              Theme
            </CardTitle>
            <CardDescription>
              Toggle between light and dark mode for the entire system.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={toggleTheme}>
              {theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            </Button>
          </CardContent>
        </Card>

        <DealerReceivablesUpload />

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
              Connect your ledger spreadsheet for automatic synchronization.
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
