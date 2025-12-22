import { InstructionsCollapsible } from './InstructionsCollapsible';
import { Share2 } from 'lucide-react';

interface GoogleSheetsInstructionsProps {
  serviceAccountEmail?: string;
  isConnected: boolean;
}

export function GoogleSheetsInstructions({
  serviceAccountEmail,
  isConnected
}: GoogleSheetsInstructionsProps) {
  return (
    <InstructionsCollapsible
      title="How to Update Google Sheets Connection"
      defaultExpanded={false}
      variant="help"
    >
      <div className="space-y-3 text-sm">
        {/* Main Instructions */}
        <div className="space-y-2">
          <p className="text-muted-foreground">
            To connect a new Google Sheets spreadsheet:
          </p>
          <ol className="space-y-2 text-muted-foreground ml-6 list-decimal">
            <li>
              <span className="font-medium text-foreground">Copy your spreadsheet URL</span> from the browser address bar
            </li>
            <li>
              <span className="font-medium text-foreground">Paste it</span> in the field {isConnected ? 'above' : 'below'}
            </li>
            <li className="space-y-1">
              <div className="flex items-center gap-2">
                <Share2 className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">Share the spreadsheet</span> with this email:
              </div>
              {serviceAccountEmail ? (
                <div className="bg-muted p-2 rounded border mt-1">
                  <code className="text-xs break-all font-mono text-blue-600 dark:text-blue-400">
                    {serviceAccountEmail}
                  </code>
                </div>
              ) : (
                <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 p-2 rounded mt-1">
                  <p className="text-xs text-yellow-800 dark:text-yellow-200">
                    Click the key icon (🔑) first to set up credentials
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1 ml-5">
                → Open spreadsheet → Click "Share" → Add email → Choose "Viewer" or "Editor"
              </p>
            </li>
            <li>
              Click "{isConnected ? 'Sync Now' : 'Connect'}" to test the connection
            </li>
          </ol>
        </div>

        {/* Troubleshooting */}
        <div className="pt-2 border-t space-y-1.5">
          <p className="font-medium text-xs">Common Issues:</p>
          <div className="space-y-1 text-xs">
            <div className="text-red-600 dark:text-red-400">
              <span className="font-medium">Permission denied?</span> → Spreadsheet not shared with the email above
            </div>
            <div className="text-amber-600 dark:text-amber-400">
              <span className="font-medium">Invalid URL?</span> → Use the complete URL from browser (https://docs.google.com/spreadsheets/d/...)
            </div>
            <div className="text-blue-600 dark:text-blue-400">
              <span className="font-medium">Missing columns?</span> → Spreadsheet must have "Data/Date" and "Valor/Amount" columns
            </div>
          </div>
        </div>
      </div>
    </InstructionsCollapsible>
  );
}
