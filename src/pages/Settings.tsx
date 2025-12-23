import { FileSpreadsheet, Moon, Sun, Upload, Link as LinkIcon } from 'lucide-react';
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

      <Accordion type="multiple" defaultValue={['appearance', 'imports', 'integrations']} className="space-y-4">
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

        {/* Data Imports Section */}
        <AccordionItem value="imports" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5" />
              <div className="text-left">
                <h2 className="text-base font-semibold">Data Imports</h2>
                <p className="text-sm text-muted-foreground font-normal">
                  Upload transaction data from various sources
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6">
            <div className="space-y-6">
              <DealerReceivablesUpload />
              <BankUpload />
              <CardUpload />
              <KingdomUpload />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Integrations Section */}
        <AccordionItem value="integrations" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <LinkIcon className="h-5 w-5" />
              <div className="text-left">
                <h2 className="text-base font-semibold">Integrations</h2>
                <p className="text-sm text-muted-foreground font-normal">
                  Connect external services and data sources
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6">
            <Card className="border-0 shadow-none">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="h-4 w-4" />
                  Google Sheets Connection
                </CardTitle>
                <CardDescription>
                  Connect your ledger spreadsheet for automatic synchronization.
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
