# 🏗️ Import Module Architecture

## Overview

The import functionality has been refactored into **separate, independent modules** for bank and card transactions. This separation ensures that:

1. Bank imports work independently from card imports
2. Changes to one module don't affect the other
3. Each module can be debugged and maintained separately
4. Code is more maintainable and testable

---

## 📁 Directory Structure

```
src/
├── lib/
│   └── parsers/
│       ├── index.ts              # Main exports
│       ├── shared-utils.ts       # Shared utilities
│       ├── bank-parser.ts        # Wells Fargo parser (BANK)
│       └── card-parser.ts        # Stripe parser (CARD)
│
├── components/
│   ├── BankUpload.tsx            # Bank upload component
│   ├── CardUpload.tsx            # Card upload component
│   └── GoogleSheetsConnectionServiceAccount.tsx
│
└── pages/
    └── Upload.tsx                # Main upload page
```

---

## 🔧 Module Breakdown

### 1. **shared-utils.ts** (Common Utilities)

**Purpose:** Contains pure functions used by both bank and card parsers

**Exports:**
- `normalizeNumericValue()` - Converts currency strings to decimal
- `parseDate()` - Parses date strings to ISO 8601
- `isValidTransaction()` - Validates transaction objects
- `createDuplicateKey()` - Creates unique keys for duplicate detection
- `detectDuplicates()` - Generic duplicate detection algorithm

**Dependencies:** None (pure functions)

**Used by:** Both bank-parser.ts and card-parser.ts

---

### 2. **bank-parser.ts** (Wells Fargo Parser)

**Purpose:** Handles Wells Fargo bank statement CSV parsing

**Key Functions:**

```typescript
// Main entry point for bank imports
parseWellsFargoCSV(file: File): Promise<InsertTransaction[]>

// Format detection
isWellsFargoFormat(row: any): boolean

// Row parsing
parseWellsFargoRow(row: any, fileName: string): InsertTransaction | null

// Description parsing (Zelle transactions)
parseWellsFargoDescription(description: string): { name: string; method: string } | null
```

**Features:**
- Extracts Zelle information from descriptions
- Handles depositor names
- Validates Wells Fargo CSV format
- Detailed logging with `[BANK PARSER]` prefix

**Expected CSV Columns:**
- Date / date
- Amount / amount
- Depositor Name / depositor_name
- Description / description

**Transaction Properties:**
- `source`: "Wells Fargo CSV: [filename]"
- `payment_method`:
  - "Zelle" (when depositor name is present)
  - "deposit" (when no depositor name)
- `depositor`:
  - Depositor name (for Zelle)
  - "deposito" (for generic deposits)
- `status`: "pending-statement"

---

### 3. **card-parser.ts** (Stripe Parser)

**Purpose:** Handles Stripe payment export CSV parsing

**Key Functions:**

```typescript
// Main entry point for card imports
parseStripeCSV(file: File): Promise<InsertTransaction[]>

// Format detection
isStripeFormat(row: any): boolean

// Row parsing
parseStripeRow(row: any, fileName: string): InsertTransaction | null

// Validation before import
validateStripeCSV(file: File): Promise<ValidationResult>
```

**Features:**
- Handles multiple Stripe export formats
- Validation before parsing
- Detailed debugging logs with `[CARD PARSER]` prefix
- Skip reason tracking
- Flexible column name detection

**Expected CSV Columns (flexible):**
- Created (UTC) / created / Date / date
- Amount / amount / Amount (USD)
- Card Type / card_type / Card Brand / card_brand
- Customer Description / customer_description / Customer Name

**Transaction Properties:**
- `source`: "Stripe CSV: [filename]"
- `payment_method`: "Credit Card"
- `status`: "pending-statement"

**Debugging Features:**
- Row-by-row processing logs
- Skip reason categorization
- Format validation with user-friendly errors
- Warning detection

---

### 4. **BankUpload.tsx** (Bank Upload Component)

**Purpose:** UI component for Wells Fargo bank statement uploads

**Features:**
- File selection
- Auto-reconciliation checkbox (default: ON)
- Progress tracking
- Cancel support
- Success/error messages
- Import statistics

**Logging Prefix:** `[BANK UPLOAD]`

**User Flow:**
1. Select CSV file
2. (Optional) Toggle auto-reconciliation
3. Click "Upload Bank Transactions"
4. View progress and results

---

### 5. **CardUpload.tsx** (Card Upload Component)

**Purpose:** UI component for Stripe card transaction uploads

**Features:**
- File selection
- CSV validation before upload
- Validation errors/warnings display
- Auto-reconciliation checkbox (default: OFF)
- Progress tracking
- Cancel support
- Format hints

**Logging Prefix:** `[CARD UPLOAD]`

**User Flow:**
1. Select CSV file
2. View validation results
3. (Optional) Toggle auto-reconciliation
4. Click "Upload Card Transactions"
5. View progress and results

---

## 🔄 Data Flow

### Bank Import Flow

```
User selects Wells Fargo CSV
         ↓
BankUpload.tsx
         ↓
parseWellsFargoCSV() [bank-parser.ts]
         ↓
Parse rows → isWellsFargoFormat() → parseWellsFargoRow()
         ↓
detectDuplicates() [shared-utils.ts]
         ↓
Database insert (batch)
         ↓
(Optional) autoReconcileAll()
         ↓
Show results
```

### Card Import Flow

```
User selects Stripe CSV
         ↓
CardUpload.tsx
         ↓
validateStripeCSV() [card-parser.ts]
         ↓
Show validation errors/warnings
         ↓
parseStripeCSV() [card-parser.ts]
         ↓
Parse rows → isStripeFormat() → parseStripeRow()
         ↓
detectDuplicates() [shared-utils.ts]
         ↓
Database insert (batch)
         ↓
(Optional) autoReconcileAll()
         ↓
Show results
```

---

## 🧪 Testing Strategy

### Unit Tests (Recommended)

**Shared Utils:**
```typescript
describe('normalizeNumericValue', () => {
  it('handles comma as thousand separator', () => {
    expect(normalizeNumericValue('1,000.00')).toBe('1000.00');
  });
});
```

**Bank Parser:**
```typescript
describe('parseWellsFargoDescription', () => {
  it('extracts Zelle depositor name', () => {
    const result = parseWellsFargoDescription('ZELLE FROM John Doe ON 12/25/2023');
    expect(result).toEqual({ name: 'John Doe', method: 'Zelle' });
  });
});
```

**Card Parser:**
```typescript
describe('isStripeFormat', () => {
  it('detects Stripe CSV by Card Type column', () => {
    const row = { 'Card Type': 'Visa', 'Amount': '100.00' };
    expect(isStripeFormat(row)).toBe(true);
  });
});
```

### Integration Tests

**Test Files:**
- `wells-fargo-sample.csv` - Valid Wells Fargo export
- `stripe-sample.csv` - Valid Stripe export
- `invalid-format.csv` - Should reject gracefully

**Test Scenarios:**
1. Import valid bank CSV → Verify transactions created
2. Import valid card CSV → Verify transactions created
3. Import with duplicates → Verify duplicates skipped
4. Import invalid format → Verify error message

---

## 🐛 Debugging Guide

### Bank Import Issues

**Check Console for:**
- `[BANK PARSER]` logs showing:
  - Rows processed
  - Rows skipped
  - Format detection

**Common Issues:**
| Problem | Solution |
|---------|----------|
| No transactions found | Check CSV has required columns: Date, Amount, Depositor Name |
| Wrong format detected | Verify CSV is from Wells Fargo |
| Parsing errors | Check for special characters in Description field |

### Card Import Issues

**Check Console for:**
- `[CARD PARSER]` logs showing:
  - Headers detected
  - Row-by-row processing
  - Skip reasons
  - Format validation

**Common Issues:**
| Problem | Solution |
|---------|----------|
| Validation failed | Check error messages in UI - shows specific issues |
| No transactions found | Verify CSV is Stripe export with required columns |
| Date parsing fails | Check date format (expects ISO 8601 or common formats) |
| Amount is zero | Check Amount column contains numeric values |

**Enable Detailed Debugging:**
```typescript
// In card-parser.ts, all logs are already enabled
// Check browser console for:
[CARD PARSER] Processing row: { ... }
[CARD PARSER] Transaction created: { ... }
```

---

## 🔒 Independence Guarantees

### What Changes DON'T Affect Each Other

✅ Modifying `bank-parser.ts` **DOES NOT** affect card imports
✅ Modifying `card-parser.ts` **DOES NOT** affect bank imports
✅ `BankUpload.tsx` and `CardUpload.tsx` are completely independent
✅ Each parser has its own test suite

### Shared Dependencies (Minimal)

⚠️ Changes to `shared-utils.ts` affect BOTH parsers
⚠️ Changes to database schema affect BOTH
⚠️ Changes to `InsertTransaction` type affect BOTH

---

## 📊 Success Metrics

### Bank Import Health
```sql
-- Check recent bank imports
SELECT COUNT(*), source
FROM transactions
WHERE source LIKE 'Wells Fargo CSV%'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY source;
```

### Card Import Health
```sql
-- Check recent card imports
SELECT COUNT(*), source
FROM transactions
WHERE source LIKE 'Stripe CSV%'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY source;
```

---

## 🚀 Adding New Import Types

To add a new import type (e.g., PayPal):

1. **Create parser:** `src/lib/parsers/paypal-parser.ts`
2. **Export from index:** `src/lib/parsers/index.ts`
3. **Create component:** `src/components/PayPalUpload.tsx`
4. **Add to Upload page:** `src/pages/Upload.tsx`
5. **Use shared utilities:** Import from `shared-utils.ts`

**Template:**
```typescript
// paypal-parser.ts
import { normalizeNumericValue, parseDate, detectDuplicates } from './shared-utils';

export async function parsePayPalCSV(file: File): Promise<InsertTransaction[]> {
  // Your parser logic
}
```

---

## 📝 Maintenance Checklist

### Weekly
- [ ] Review console logs for parsing errors
- [ ] Check import success rates
- [ ] Verify no duplicate transactions created

### Monthly
- [ ] Run test suite for both parsers
- [ ] Update CSV format examples
- [ ] Review and update documentation

### When Issues Arise
1. Check console logs (look for parser-specific prefix)
2. Verify CSV format matches expected columns
3. Test with sample CSV file
4. Check database for duplicate transactions
5. Review recent code changes to relevant parser only

---

## 🎯 Key Takeaways

1. **Separation:** Bank and card imports are completely independent
2. **Shared:** Only common utilities are shared (minimal coupling)
3. **Debugging:** Each module has detailed logging with unique prefixes
4. **Testing:** Each parser can be tested independently
5. **Maintenance:** Changes to one parser don't affect the other

---

**Last Updated:** 2025-10-20
**Version:** 2.0 (Refactored Architecture)
