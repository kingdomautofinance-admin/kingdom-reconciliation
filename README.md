# Conciliação Pro

A financial reconciliation application for car financing companies. Automatically matches payment transactions between ledger entries and bank statements.

## Features

- **Dashboard**: Overview of reconciliation statistics and progress
- **Transactions**: View all transactions with infinite scroll pagination
- **Upload**: Import transactions from CSV files or Google Sheets
- **Dark Mode**: Toggle between light and dark themes with persistence
- **Auto-Reconciliation**: Automatically match ledger entries with bank statements based on:
  - Date (±2 days tolerance)
  - Exact value match
  - Name similarity (50% minimum for Zelle/Deposit payments)
  - Payment method matching
- **Duplicate Prevention**: Prevents re-importing the same transactions
- **Stripe Integration**: Special handling for Stripe wire transfers and payouts

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Database**: Supabase (PostgreSQL)
- **UI**: Tailwind CSS + Custom Components
- **State Management**: TanStack Query (React Query)
- **Routing**: wouter
- **CSV Parsing**: PapaParse
- **String Matching**: string-similarity

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env`:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Start the development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

## Database Schema

### Transactions Table

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| date | timestamptz | Transaction date |
| value | decimal(10,2) | Transaction amount |
| name | text | Customer name (from ledger) |
| depositor | text | Payment sender (from statement) |
| car | text | Vehicle identifier |
| payment_method | text | Zelle, Credit Card, Deposit, Wire Transfer, etc. |
| historical_text | text | Original statement description |
| source | text | Data source identifier |
| status | text | reconciled, pending-ledger, pending-statement |
| confidence | integer | Match confidence score (0-100) |
| matched_transaction_id | uuid | Links to matching transaction |
| sheet_order | integer | Original row order from import |
| created_at | timestamptz | Record creation time |

### Import History Table
Tracks all CSV imports to prevent duplicates based on file hash.

### Sheet Connections Table
Stores Google Sheets connections for automated imports.

## Usage

### Viewing Transactions

Navigate to the Transactions page to view all imported transactions. Use the filters to show:
- All transactions
- Reconciled transactions
- Pending ledger entries (awaiting payment)
- Pending statement entries (unmatched payments)

### Uploading Data

#### Option 1: CSV Files (Bank Statements)
1. Go to the Upload page - "Bank Statement Upload" section
2. Select a CSV file containing bank statements
3. Click "Upload File" to import and auto-reconcile

**Supported formats:**
- Wells Fargo: Date, Amount, Depositor Name
- Stripe: Date, Amount, Card Type (with wire transfer detection)
- Generic: Date, Amount, Name (optional)

#### Option 2: CSV Files (Credit Card Statements)
1. Go to the Upload page - "Credit Card Statement Upload" section
2. Select a CSV file containing credit card transactions
3. Click "Upload File" to import and auto-reconcile

#### Option 3: Google Sheets
1. Make your Google Sheets spreadsheet publicly accessible
2. Copy the sheet URL or ID
3. Paste it in the "Google Sheets Import" section
4. Click "Import from Sheets"

**Service Account Setup** (for private sheets):
1. Create a Google Cloud service account
2. Download the JSON credentials file
3. Share your sheet with the service account email
4. Use "Connect with Service Account" option

### Auto-Reconciliation

Click "Auto Reconcile" on the Transactions page to match pending transactions automatically. The algorithm:

1. Compares pending-ledger entries with pending-statement entries
2. Matches based on exact value
3. Checks date within ±2 days
4. For Zelle/Deposit: verifies name similarity ≥50%
5. For Credit Card: matches only with other credit card transactions
6. Assigns confidence score (0-100)

**Special Cases:**
- **Stripe Wire Transfers**: Automatically detected from "transfer to bank account" descriptions
- **Bank Deposits**: Falls back to description field if depositor name is empty
- **Credit Cards**: Payment method stored in historical_text, reconciles with ledger credit card entries

### Reconciliation Status

- **pending-ledger**: Ledger entry awaiting payment
- **pending-statement**: Payment awaiting match to ledger
- **reconciled**: Successfully matched pair

## Project Structure

```
src/
├── components/
│   ├── ui/                    # Reusable UI components
│   ├── BankUpload.tsx         # Bank statement upload
│   ├── CardUpload.tsx         # Credit card upload
│   └── GoogleSheetsConnection.tsx  # Sheets integration
├── lib/
│   ├── supabase.ts            # Supabase client
│   ├── database.types.ts      # TypeScript types
│   ├── queryClient.ts         # React Query config
│   ├── reconciliation.ts      # Matching algorithm
│   ├── googleSheets.ts        # Sheets API integration
│   ├── parsers/               # CSV parsing utilities
│   │   ├── bank-parser.ts     # Bank statement parser
│   │   ├── card-parser.ts     # Credit card parser
│   │   ├── shared-utils.ts    # Common utilities
│   │   └── index.ts           # Parser exports
│   ├── useTheme.ts            # Dark mode hook
│   └── utils.ts               # Helper functions
├── pages/
│   ├── Dashboard.tsx          # Statistics overview
│   ├── Transactions.tsx       # Transaction list
│   └── Upload.tsx             # File upload
├── App.tsx                    # Main app with routing
└── main.tsx                   # Entry point
```

## Development Notes

- Infinite scroll loads 50 transactions per page
- Duplicate detection prevents re-importing the same data using file hashing
- All queries use Supabase RLS for security
- Reconciliation runs client-side for flexibility
- Dark mode preference persists in localStorage
- Build time: ~4 seconds

## Architecture Decisions

### Parser Refactoring
CSV parsers have been modularized:
- `bank-parser.ts`: Handles bank statements (Wells Fargo, generic formats)
- `card-parser.ts`: Handles credit card statements
- `shared-utils.ts`: Common utilities for date parsing, format detection, etc.

### Stripe Format Detection
Automatic detection of:
- Wire transfers: "transfer to bank account" in description
- Payouts: Stripe payout patterns
- Regular card payments: Default Stripe format

### Google Sheets Integration
Two authentication methods:
1. Public sheets: Read-only access via public URL
2. Service account: Full access to private sheets

## Security

- Row Level Security (RLS) enabled on all tables
- Anonymous access allowed for demo purposes (configure auth as needed)
- Environment variables for sensitive credentials
- Service account credentials stored securely in database

## Future Enhancements

- Manual reconciliation UI for edge cases
- OFX file support
- Export reconciliation reports
- Advanced filtering and search
- Bulk operations
- Audit trail
- Multi-user support with authentication
