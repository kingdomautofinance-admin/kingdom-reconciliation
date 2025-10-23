# 📂 Project Structure - After Refactoring

## Complete Directory Tree

```
conciliacao-pro/
├── src/
│   ├── components/
│   │   ├── ui/                                    # Shadcn UI components
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   └── input.tsx
│   │   │
│   │   ├── BankUpload.tsx                         # 🆕 Bank CSV upload (Wells Fargo)
│   │   ├── CardUpload.tsx                         # 🆕 Card CSV upload (Stripe)
│   │   ├── GoogleSheetsConnection.tsx             # OAuth Google Sheets
│   │   └── GoogleSheetsConnectionServiceAccount.tsx # Service Account Google Sheets
│   │
│   ├── lib/
│   │   ├── parsers/                               # 🆕 Modular parser directory
│   │   │   ├── index.ts                           # Module exports
│   │   │   ├── shared-utils.ts                    # 🆕 Shared utilities
│   │   │   ├── bank-parser.ts                     # 🆕 Wells Fargo parser
│   │   │   └── card-parser.ts                     # 🆕 Stripe parser
│   │   │
│   │   ├── parsers.legacy.ts                      # 📦 Old parser (archived)
│   │   ├── database.types.ts                      # Supabase types
│   │   ├── googleSheets.ts                        # Google Sheets OAuth
│   │   ├── googleSheetsService.ts                 # Google Sheets Service Account
│   │   ├── queryClient.ts                         # React Query client
│   │   ├── reconciliation.ts                      # Auto-reconciliation logic
│   │   ├── supabase.ts                            # Supabase client
│   │   ├── useTheme.ts                            # Dark mode hook
│   │   └── utils.ts                               # General utilities
│   │
│   ├── pages/
│   │   ├── Dashboard.tsx                          # Dashboard page
│   │   ├── Transactions.tsx                       # Transactions list
│   │   └── Upload.tsx                             # ✏️ Upload page (refactored)
│   │
│   ├── types/
│   │   └── google.d.ts                            # Google API types
│   │
│   ├── App.tsx                                    # Main app component
│   ├── index.css                                  # Global styles
│   ├── main.tsx                                   # App entry point
│   └── vite-env.d.ts                              # Vite types
│
├── supabase/
│   ├── functions/
│   │   └── fetch-google-sheets/
│   │       └── index.ts                           # Edge function
│   │
│   └── migrations/
│       ├── 20251016221614_create_transactions_table.sql
│       ├── 20251017115925_create_sheet_connections_table.sql
│       ├── 20251017140826_add_google_credentials_columns.sql
│       ├── 20251017143636_add_service_account_columns.sql
│       ├── 20251017145110_fix_rls_policies_for_anonymous_access.sql
│       ├── 20251017163535_create_import_history_table.sql
│       ├── 20251020124547_add_unique_constraint_transactions.sql
│       └── add_unique_constraint_transactions.sql  # Latest migration
│
├── public/                                        # Static assets
├── dist/                                          # Build output
│
├── .env                                           # Environment variables
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── eslint.config.js
├── index.html
│
├── ARCHITECTURE.md                                 # 🆕 Architecture documentation
├── TESTING_GUIDE.md                                # 🆕 Testing instructions
├── REFACTORING_SUMMARY.md                          # 🆕 Refactoring summary
├── PROJECT_STRUCTURE.md                            # 🆕 This file
├── DUPLICATE_PREVENTION_SOLUTION.md               # Duplicate prevention docs
├── DARK_MODE.md                                   # Dark mode docs
├── GOOGLE_SHEETS_GUIDE.md                         # Google Sheets guide
├── GOOGLE_SHEETS_SETUP.md                         # Google Sheets setup
└── README.md                                      # Project README
```

## 📊 File Statistics

### New Files Created (Refactoring)

| Category | Files | Total Lines |
|----------|-------|-------------|
| Parsers | 4 | ~700 |
| Components | 2 | ~450 |
| Documentation | 4 | ~2,500 |
| **Total** | **10** | **~3,650** |

### Modified Files

| File | Changes |
|------|---------|
| `src/pages/Upload.tsx` | Refactored to use new components |
| `src/lib/parsers.ts` | Archived as `parsers.legacy.ts` |

### File Size Distribution

```
Largest files:
  1. REFACTORING_SUMMARY.md       (~500 KB)
  2. ARCHITECTURE.md              (~350 KB)
  3. TESTING_GUIDE.md             (~250 KB)
  4. card-parser.ts               (~9 KB)
  5. bank-parser.ts               (~5 KB)
  6. shared-utils.ts              (~6 KB)
```

## 🎯 Key Directories

### `src/lib/parsers/`

**Purpose:** Contains all CSV parsing logic

**Organization:**
- `index.ts` - Main exports and legacy compatibility
- `shared-utils.ts` - Pure utility functions
- `bank-parser.ts` - Wells Fargo specific logic
- `card-parser.ts` - Stripe specific logic

**Dependencies:**
- Papa Parse (CSV parsing)
- Database types
- No external parser dependencies

### `src/components/`

**Purpose:** React components for UI

**Upload Components:**
- `BankUpload.tsx` - Bank CSV upload interface
- `CardUpload.tsx` - Card CSV upload interface
- `GoogleSheetsConnectionServiceAccount.tsx` - Google Sheets import

**Shared Components:**
- `ui/` - Shadcn UI primitives

### Documentation Files

| File | Lines | Purpose |
|------|-------|---------|
| `ARCHITECTURE.md` | 580 | System architecture, debugging |
| `TESTING_GUIDE.md` | 420 | Test cases and procedures |
| `REFACTORING_SUMMARY.md` | 500 | Refactoring overview |
| `PROJECT_STRUCTURE.md` | This file | Directory structure |

## 🔗 Import Relationships

### Bank Upload Flow

```
BankUpload.tsx
    ↓
bank-parser.ts
    ↓
shared-utils.ts → detectDuplicates()
    ↓
Supabase
```

### Card Upload Flow

```
CardUpload.tsx
    ↓
card-parser.ts
    ↓
shared-utils.ts → detectDuplicates()
    ↓
Supabase
```

### No Cross-Dependencies

✅ `bank-parser.ts` does NOT import `card-parser.ts`
✅ `card-parser.ts` does NOT import `bank-parser.ts`
✅ Both only import from `shared-utils.ts`

## 📦 Dependencies by Module

### Shared Utilities (`shared-utils.ts`)

```typescript
// No external dependencies
// Pure functions only
```

### Bank Parser (`bank-parser.ts`)

```typescript
import Papa from 'papaparse';
import type { InsertTransaction } from '../database.types';
import { normalizeNumericValue, parseDate, isValidTransaction } from './shared-utils';
```

### Card Parser (`card-parser.ts`)

```typescript
import Papa from 'papaparse';
import type { InsertTransaction } from '../database.types';
import { normalizeNumericValue, parseDate, isValidTransaction } from './shared-utils';
```

### Bank Upload Component (`BankUpload.tsx`)

```typescript
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { parseWellsFargoCSV, detectDuplicates } from '@/lib/parsers';
import { autoReconcileAll } from '@/lib/reconciliation';
import { Card, Button, Input } from '@/components/ui';
```

### Card Upload Component (`CardUpload.tsx`)

```typescript
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { parseStripeCSV, validateStripeCSV, detectDuplicates } from '@/lib/parsers';
import { autoReconcileAll } from '@/lib/reconciliation';
import { Card, Button, Input } from '@/components/ui';
```

## 🗂️ Database Schema

### Tables

1. **transactions**
   - Main transaction storage
   - Has unique constraint on `duplicate_check_hash`
   - RLS enabled

2. **sheet_connections**
   - Google Sheets connection info
   - Service account credentials
   - RLS enabled

3. **import_history**
   - Import logs and statistics
   - Tracks successes and failures
   - RLS enabled

## 🔧 Configuration Files

| File | Purpose |
|------|---------|
| `vite.config.ts` | Vite bundler config |
| `tailwind.config.js` | Tailwind CSS config |
| `tsconfig.json` | TypeScript config |
| `eslint.config.js` | ESLint rules |
| `.env` | Environment variables |

## 📝 Environment Variables Required

```bash
# Supabase
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key

# Optional: Google Sheets OAuth
VITE_GOOGLE_CLIENT_ID=your_client_id
```

## 🎨 Styling System

- **Framework:** Tailwind CSS
- **Components:** Shadcn UI
- **Dark Mode:** System preference + manual toggle
- **Icons:** Lucide React

## 🚀 Build Output

```
dist/
├── index.html                  # Entry HTML
├── assets/
│   ├── index-[hash].css        # Bundled CSS (~23KB)
│   └── index-[hash].js         # Bundled JS (~422KB)
└── ...
```

### Bundle Analysis

| Asset | Size (min) | Size (gzip) |
|-------|------------|-------------|
| CSS | 23.09 KB | 4.90 KB |
| JavaScript | 422.52 KB | 125.56 KB |
| Total | 445.61 KB | 130.46 KB |

## 📖 Documentation Index

Quick access to all documentation:

1. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture and debugging
2. **[TESTING_GUIDE.md](./TESTING_GUIDE.md)** - Testing procedures
3. **[REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md)** - Refactoring overview
4. **[PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)** - This file
5. **[DUPLICATE_PREVENTION_SOLUTION.md](./DUPLICATE_PREVENTION_SOLUTION.md)** - Duplicate prevention
6. **[README.md](./README.md)** - Project overview

---

**Last Updated:** 2025-10-20
**Project Version:** 2.0 (Refactored)
**Build Status:** ✅ PASSING
