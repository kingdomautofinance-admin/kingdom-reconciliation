import { FileSpreadsheet, Moon, Sun, Upload, Link as LinkIcon, Settings as SettingsIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { GoogleSheetsConnectionServiceAccount } from '@/components/GoogleSheetsConnectionServiceAccount';
import { BankUpload } from '@/components/BankUpload';
import { CardUpload } from '@/components/CardUpload';
import { KingdomUpload } from '@/components/KingdomUpload';
import { DealerReceivablesUpload } from '@/components/DealerReceivablesUpload';
import { ReconciliationRules } from '@/components/ReconciliationRules';
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

      <Accordion type="multiple" defaultValue={[]} className="space-y-4">
        {/* Reconciliation Rules Section */}
        <AccordionItem value="reconciliation-rules" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <SettingsIcon className="h-5 w-5" />
              <div className="text-left">
                <h2 className="text-base font-semibold">Reconciliation Rules</h2>
                <p className="text-sm text-muted-foreground font-normal">
                  Define thresholds and fee structures for smart matching
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6">
            <ReconciliationRules />
          </AccordionContent>
        </AccordionItem>

        {/* Appearance Section */}
        <AccordionItem value="appearance" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              {theme === 'light' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              <div className="text-left">
                <h2 className="text-base font-semibold">Appearance</h2>
                <p className="text-sm text-muted-foreground font-normal">
                  Customize the visual theme of your application
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6">
            <Card className="border-0 shadow-none">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="text-sm">Theme</CardTitle>
                <CardDescription>
                  Toggle between light and dark mode for the entire system.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <Button variant="outline" onClick={toggleTheme}>
                  {theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                </Button>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        {/* Dealer Receivables Upload */}
        <AccordionItem value="dealer-receivables" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5" />
              <div className="text-left">
                <h2 className="text-base font-semibold">Dealer Receivables</h2>
                <p className="text-sm text-muted-foreground font-normal">
                  Import dealership-collected payment records
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6">
            <DealerReceivablesUpload />
          </AccordionContent>
        </AccordionItem>

        {/* Bank Upload */}
        <AccordionItem value="bank-upload" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5" />
              <div className="text-left">
                <h2 className="text-base font-semibold">Bank Statement Upload</h2>
                <p className="text-sm text-muted-foreground font-normal">
                  Upload Wells Fargo and Delta Credit Union statements
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6">
            <BankUpload />
          </AccordionContent>
        </AccordionItem>

        {/* Card Upload */}
        <AccordionItem value="card-upload" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5" />
              <div className="text-left">
                <h2 className="text-base font-semibold">Card Transactions Upload</h2>
                <p className="text-sm text-muted-foreground font-normal">
                  Upload Stripe credit card transaction data
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6">
            <CardUpload />
          </AccordionContent>
        </AccordionItem>

        {/* Kingdom Upload */}
        <AccordionItem value="kingdom-upload" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5" />
              <div className="text-left">
                <h2 className="text-base font-semibold">Sistema Kingdom</h2>
                <p className="text-sm text-muted-foreground font-normal">
                  Import transactions from Kingdom system
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6">
            <KingdomUpload />
          </AccordionContent>
        </AccordionItem>

        {/* Integrations Section */}
        <AccordionItem value="integrations" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <LinkIcon className="h-5 w-5" />
              <div className="text-left">
                <h2 className="text-base font-semibold">Google Sheets Integration</h2>
                <p className="text-sm text-muted-foreground font-normal">
                  Connect your ledger spreadsheet for automatic synchronization
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6">
            <Card className="border-0 shadow-none">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="h-4 w-4" />
                  Service Account Connection
                </CardTitle>
                <CardDescription>
                  Configure Google Sheets API access for ledger synchronization.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <GoogleSheetsConnectionServiceAccount />
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
