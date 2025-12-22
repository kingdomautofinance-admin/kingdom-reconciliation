import { useState } from 'react';
import { InstructionsCollapsible } from './InstructionsCollapsible';
import { ExternalLink, Share2, CheckCircle2, Link as LinkIcon, FileSpreadsheet, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface GoogleSheetsInstructionsProps {
  serviceAccountEmail?: string;
  isConnected: boolean;
}

export function GoogleSheetsInstructions({
  serviceAccountEmail,
  isConnected
}: GoogleSheetsInstructionsProps) {
  const [showFirstTimeSetup, setShowFirstTimeSetup] = useState(false);

  const buttonText = isConnected ? 'Sync Now' : 'Connect';
  const urlFieldLocation = isConnected ? 'above' : 'below';

  return (
    <InstructionsCollapsible
      title={isConnected ? "How to Update Your Connection" : "Setup Instructions"}
      defaultExpanded={!isConnected}
      variant="help"
    >
      <div className="space-y-4 text-sm">
        {/* Section 1: Update Spreadsheet URL */}
        <div className="space-y-2">
          <h4 className="font-semibold text-foreground flex items-center gap-2">
            <LinkIcon className="h-3.5 w-3.5" />
            1. Update Spreadsheet URL
          </h4>
          <ol className="space-y-1.5 text-muted-foreground ml-6 list-decimal">
            <li>Open your Google Sheets document in your browser</li>
            <li>Copy the full URL from the address bar</li>
            <li className="text-xs font-mono bg-muted/50 p-1 rounded">
              Example: https://docs.google.com/spreadsheets/d/ABC123...
            </li>
            <li>Paste it in the "Spreadsheet URL" field {urlFieldLocation}</li>
            <li>Click "{buttonText}" to test the connection</li>
          </ol>
        </div>

        {/* Section 2: Share with Service Account */}
        <div className="space-y-2">
          <h4 className="font-semibold text-foreground flex items-center gap-2">
            <Share2 className="h-3.5 w-3.5" />
            <span>2. Share with Service Account</span>
            <span className="text-xs font-normal text-orange-600 dark:text-orange-400">⚠️ CRITICAL</span>
          </h4>
          <div className="space-y-2">
            <p className="text-muted-foreground">
              The spreadsheet must be shared with your service account email:
            </p>
            {serviceAccountEmail ? (
              <div className="bg-muted p-2 rounded-md border">
                <code className="text-xs break-all font-mono text-blue-600 dark:text-blue-400">
                  {serviceAccountEmail}
                </code>
              </div>
            ) : (
              <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 p-2 rounded-md">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  ⚠️ Configure service account credentials first using the key icon (🔑)
                </p>
              </div>
            )}
            <ol className="space-y-1.5 text-muted-foreground ml-6 list-decimal">
              <li>Open your Google Sheets document</li>
              <li>Click the <span className="font-medium text-foreground">"Share"</span> button (top-right corner, green button)</li>
              <li>In the "Add people and groups" field, paste the service account email shown above</li>
              <li>Choose permission level: <span className="font-medium text-foreground">"Viewer"</span> (recommended) or "Editor"</li>
              <li className="font-medium text-orange-600 dark:text-orange-400">IMPORTANT: Uncheck "Notify people" (service accounts don't receive emails)</li>
              <li>Click "Share" or "Send"</li>
            </ol>
          </div>
        </div>

        {/* Section 3: Verify Spreadsheet Format */}
        <div className="space-y-2">
          <h4 className="font-semibold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>3. Verify Spreadsheet Format</span>
            <span className="text-xs font-normal text-blue-600 dark:text-blue-400">ℹ️ REQUIRED COLUMNS</span>
          </h4>
          <div className="space-y-2 text-muted-foreground">
            <div>
              <p className="font-medium text-foreground mb-1">Must have (in any order):</p>
              <ul className="ml-6 list-disc space-y-0.5">
                <li><code className="text-xs bg-muted px-1 rounded">Data</code> or <code className="text-xs bg-muted px-1 rounded">Date</code> - Transaction date</li>
                <li><code className="text-xs bg-muted px-1 rounded">Valor</code> or <code className="text-xs bg-muted px-1 rounded">Amount</code> - Transaction amount</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Optional (recommended):</p>
              <ul className="ml-6 list-disc space-y-0.5 text-xs">
                <li><code className="bg-muted px-1 rounded">Cliente</code>, <code className="bg-muted px-1 rounded">Client</code>, or <code className="bg-muted px-1 rounded">Name</code> - Customer name</li>
                <li><code className="bg-muted px-1 rounded">Depositante</code> or <code className="bg-muted px-1 rounded">Depositor</code> - Payment sender</li>
                <li><code className="bg-muted px-1 rounded">Forma de Pagamento</code>, <code className="bg-muted px-1 rounded">Method</code>, or <code className="bg-muted px-1 rounded">Payment Method</code></li>
                <li><code className="bg-muted px-1 rounded">Car</code>, <code className="bg-muted px-1 rounded">Carro</code>, or <code className="bg-muted px-1 rounded">Vehicle</code></li>
              </ul>
            </div>
            <p className="text-xs italic">Note: Column names support Portuguese, English, and Spanish</p>
          </div>
        </div>

        {/* Section 4: Test Connection */}
        <div className="space-y-2">
          <h4 className="font-semibold text-foreground flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5" />
            4. Test Your Connection
          </h4>
          <ol className="space-y-1.5 text-muted-foreground ml-6 list-decimal">
            <li>Click the "{buttonText}" button</li>
            <li>Wait for a success message or error details</li>
            <li>If you see permission errors, return to Step 2 (sharing)</li>
            <li>If connection fails, verify the URL is correct and the spreadsheet exists</li>
          </ol>
        </div>

        {/* First-Time Setup Guide (Collapsible) */}
        {!serviceAccountEmail && (
          <div className="border-t pt-3">
            <button
              onClick={() => setShowFirstTimeSetup(!showFirstTimeSetup)}
              className="w-full flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="font-semibold text-foreground">First-Time Setup Guide</span>
              </div>
              {showFirstTimeSetup ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showFirstTimeSetup && (
              <div className="mt-3 space-y-3 pl-2">
                {/* What is a Service Account */}
                <div className="space-y-2">
                  <h5 className="font-semibold text-sm text-foreground">What is a Service Account?</h5>
                  <ul className="text-muted-foreground ml-6 list-disc space-y-1 text-xs">
                    <li>A special Google account that belongs to your application (not a person)</li>
                    <li>Allows automated access to Google Sheets without OAuth popups</li>
                    <li>More secure than making spreadsheets public</li>
                  </ul>
                </div>

                {/* How to Create */}
                <div className="space-y-2">
                  <h5 className="font-semibold text-sm text-foreground">How to Create a Service Account:</h5>
                  <ol className="text-muted-foreground ml-6 list-decimal space-y-1 text-xs">
                    <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Google Cloud Console</a></li>
                    <li>Create a new project or select existing</li>
                    <li>Enable "Google Sheets API" in APIs & Services</li>
                    <li>Go to "IAM & Admin" → "Service Accounts"</li>
                    <li>Click "Create Service Account"</li>
                    <li>Give it a name (e.g., "Reconciliation App")</li>
                    <li>Click "Create and Continue"</li>
                    <li>Skip role assignment (click "Continue")</li>
                    <li>Click "Done"</li>
                  </ol>
                </div>

                {/* How to Get Credentials */}
                <div className="space-y-2">
                  <h5 className="font-semibold text-sm text-foreground">How to Get Credentials:</h5>
                  <ol className="text-muted-foreground ml-6 list-decimal space-y-1 text-xs">
                    <li>Click on the service account you just created</li>
                    <li>Go to "Keys" tab</li>
                    <li>Click "Add Key" → "Create new key"</li>
                    <li>Choose "JSON" format</li>
                    <li>Click "Create" - a JSON file will download</li>
                  </ol>
                </div>

                {/* How to Add to App */}
                <div className="space-y-2">
                  <h5 className="font-semibold text-sm text-foreground">How to Add Credentials to This App:</h5>
                  <ol className="text-muted-foreground ml-6 list-decimal space-y-1 text-xs">
                    <li>Click the key icon (🔑) in this card</li>
                    <li>Either:
                      <ul className="ml-6 list-disc mt-1 space-y-0.5">
                        <li><span className="font-medium">Upload the JSON file</span> (Option 1), OR</li>
                        <li><span className="font-medium">Copy-paste manually</span> (Option 2):
                          <ul className="ml-6 list-circle mt-0.5">
                            <li>Open the JSON file in a text editor</li>
                            <li>Copy the <code className="bg-muted px-1 rounded">client_email</code> value</li>
                            <li>Copy the <code className="bg-muted px-1 rounded">private_key</code> value (including -----BEGIN/END-----)</li>
                            <li>Paste into the form fields</li>
                          </ul>
                        </li>
                      </ul>
                    </li>
                    <li>Click "Save & Connect"</li>
                  </ol>
                </div>

                <div className="pt-2">
                  <a
                    href="https://cloud.google.com/iam/docs/service-accounts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Full Guide: Google Cloud Service Account Documentation
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Troubleshooting Section */}
        <div className="space-y-2 pt-2 border-t">
          <h4 className="font-semibold text-foreground">Common Issues</h4>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-2 rounded">
              <span className="font-medium text-red-800 dark:text-red-200">Error: "Permission denied" or "Access denied"</span>
              <p className="ml-2 mt-1 text-red-700 dark:text-red-300">✅ Solution: The spreadsheet is not shared with your service account. Return to Step 2 and ensure you shared with the exact email shown above.</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-2 rounded">
              <span className="font-medium text-amber-800 dark:text-amber-200">Error: "Invalid URL" or "Spreadsheet not found"</span>
              <p className="ml-2 mt-1 text-amber-700 dark:text-amber-300">✅ Solution: Copy the complete URL from your browser address bar. Must include: https://docs.google.com/spreadsheets/d/...</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-2 rounded">
              <span className="font-medium text-blue-800 dark:text-blue-200">Error: "Missing required columns"</span>
              <p className="ml-2 mt-1 text-blue-700 dark:text-blue-300">✅ Solution: Check your spreadsheet has Data/Date and Valor/Amount columns (see Step 3). Column names are case-insensitive.</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 p-2 rounded">
              <span className="font-medium text-purple-800 dark:text-purple-200">Error: "Invalid credentials" or "Authentication failed"</span>
              <p className="ml-2 mt-1 text-purple-700 dark:text-purple-300">✅ Solution: Click the key icon (🔑) to re-enter credentials. Verify the private key includes BEGIN/END markers and is ~1700 characters.</p>
            </div>
          </div>
        </div>

        {/* Quick Reference */}
        {serviceAccountEmail && (
          <div className="pt-2 border-t bg-blue-50 dark:bg-blue-950/20 p-3 rounded-md">
            <h4 className="font-semibold text-sm text-foreground mb-2">Quick Reference Checklist</h4>
            <ul className="space-y-1 text-xs">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <span>
                  <span className="font-medium">Share spreadsheet with:</span>{' '}
                  <code className="bg-muted px-1 rounded text-blue-600 dark:text-blue-400 break-all">
                    {serviceAccountEmail}
                  </code>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <span><span className="font-medium">Required columns:</span> Data/Date, Valor/Amount</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <span><span className="font-medium">Permission needed:</span> Viewer or Editor</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <span><span className="font-medium">File format:</span> Google Sheets (not Excel/CSV)</span>
              </li>
            </ul>
          </div>
        )}
      </div>
    </InstructionsCollapsible>
  );
}
