# 🧪 Testing Guide - Bank & Card Import Modules

## Overview

This guide provides step-by-step instructions for testing the refactored bank and card import functionality to ensure both modules work independently and correctly.

---

## ✅ Pre-Test Checklist

Before testing, verify:
- [ ] Application builds successfully (`npm run build`)
- [ ] Development server is running (`npm run dev`)
- [ ] Database connection is active
- [ ] You have sample CSV files ready

---

## 📄 Test Files Required

### Wells Fargo (Bank) Sample CSV

Create a file named `wells-fargo-test.csv`:

```csv
Date,Amount,Depositor Name,Description
2024-01-15,250.00,John Doe,ZELLE FROM John Doe ON 01/15/2024
2024-01-16,150.50,Jane Smith,ZELLE FROM JANE SMITH ON 01/16/2024
2024-01-17,75.25,Bob Wilson,Deposit
```

### Stripe (Card) Sample CSV

Create a file named `stripe-test.csv`:

```csv
id,Created (UTC),Amount,Card Type,Customer Description,Description
ch_123,2024-01-15T10:30:00Z,100.00,Visa,Test Customer 1,Payment from Test Customer 1
ch_124,2024-01-16T14:20:00Z,250.50,Mastercard,Test Customer 2,Payment from Test Customer 2
ch_125,2024-01-17T09:15:00Z,50.00,Amex,Test Customer 3,Payment from Test Customer 3
```

---

## 🧪 Test Suite

### TEST 1: Bank Import - First Import

**Objective:** Verify Wells Fargo CSV import works correctly

**Steps:**
1. Navigate to Upload page
2. Locate "Upload Bank Statement (Wells Fargo)" card
3. Select `wells-fargo-test.csv`
4. Keep "Run auto-reconciliation" checked
5. Click "Upload Bank Transactions"

**Expected Results:**
- ✅ Status shows "Parsing Wells Fargo CSV..."
- ✅ Status shows "Importing X bank transactions..."
- ✅ Success message: "Imported 3 bank transactions"
- ✅ Console shows `[BANK PARSER]` logs
- ✅ Console shows `[BANK UPLOAD]` logs

**Console Verification:**
```
[BANK PARSER] Starting Wells Fargo CSV parse
[BANK PARSER] Processed: 3 rows
[BANK PARSER] Valid transactions: 3
[BANK UPLOAD] Successfully imported: 3
```

**Database Verification:**
```sql
SELECT * FROM transactions
WHERE source LIKE 'Wells Fargo CSV%'
ORDER BY created_at DESC
LIMIT 10;
```

Should show 3 new transactions with:
- `payment_method = 'Zelle'`
- `status = 'pending-statement'`
- `depositor` populated

---

### TEST 2: Bank Import - Duplicate Detection

**Objective:** Verify duplicate detection prevents re-importing same data

**Steps:**
1. Import the SAME `wells-fargo-test.csv` again
2. Observe the results

**Expected Results:**
- ✅ Status shows "Imported 0 bank transactions (3 duplicates skipped)"
- ✅ Console shows `[DUPLICATE CHECK]` logs
- ✅ Console warns about duplicates detected

**Console Verification:**
```
[DUPLICATE CHECK START]
Total new transactions to check: 3
Total existing transactions in DB: 3
[DUPLICATE CHECK END]
Result: 0 unique transactions to import
```

---

### TEST 3: Card Import - First Import

**Objective:** Verify Stripe CSV import works correctly

**Steps:**
1. Navigate to Upload page
2. Locate "Upload Card Transactions (Stripe)" card
3. Select `stripe-test.csv`
4. Leave "Run auto-reconciliation" unchecked
5. Click "Upload Card Transactions"

**Expected Results:**
- ✅ File validation shows "File validated ✓"
- ✅ Status shows "Parsing Stripe CSV..."
- ✅ Status shows "Importing X card transactions..."
- ✅ Success message: "Imported 3 card transactions"
- ✅ Console shows `[CARD PARSER]` logs
- ✅ Console shows `[CARD UPLOAD]` logs

**Console Verification:**
```
[CARD PARSER] Starting Stripe CSV parse
[CARD PARSER] Headers detected: ["id", "Created (UTC)", "Amount", ...]
[CARD PARSER] Processed: 3 rows
[CARD PARSER] Valid transactions: 3
[CARD UPLOAD] Successfully imported: 3
```

**Database Verification:**
```sql
SELECT * FROM transactions
WHERE source LIKE 'Stripe CSV%'
ORDER BY created_at DESC
LIMIT 10;
```

Should show 3 new transactions with:
- `payment_method = 'Credit Card'`
- `status = 'pending-statement'`
- `depositor` populated with customer names

---

### TEST 4: Card Import - Duplicate Detection

**Objective:** Verify card duplicate detection works independently

**Steps:**
1. Import the SAME `stripe-test.csv` again
2. Observe the results

**Expected Results:**
- ✅ Status shows "Imported 0 card transactions (3 duplicates skipped)"
- ✅ No new records in database
- ✅ Console shows duplicate detection working

---

### TEST 5: Independence Test - Mixed Imports

**Objective:** Verify bank and card imports don't interfere with each other

**Steps:**
1. Clear database (optional: for clean test)
2. Import `wells-fargo-test.csv` (3 bank transactions)
3. Import `stripe-test.csv` (3 card transactions)
4. Import `wells-fargo-test.csv` again
5. Import `stripe-test.csv` again

**Expected Results:**
- ✅ First bank import: 3 imported
- ✅ First card import: 3 imported
- ✅ Second bank import: 0 imported, 3 duplicates skipped
- ✅ Second card import: 0 imported, 3 duplicates skipped
- ✅ Total in database: 6 transactions (3 bank + 3 card)

**Database Verification:**
```sql
SELECT
  source,
  payment_method,
  COUNT(*) as count
FROM transactions
GROUP BY source, payment_method;
```

Expected output:
```
source                          | payment_method | count
--------------------------------|----------------|-------
Wells Fargo CSV: wells-fargo... | Zelle          | 3
Stripe CSV: stripe-test.csv     | Credit Card    | 3
```

---

### TEST 6: Validation Test - Invalid Card CSV

**Objective:** Verify card parser validation catches format errors

**Steps:**
1. Create invalid CSV named `invalid-stripe.csv`:
```csv
random,headers,here
value1,value2,value3
```
2. Try to import in Card Upload

**Expected Results:**
- ✅ Validation warnings/errors appear
- ✅ Upload button may be disabled OR
- ✅ Import fails gracefully with clear error message
- ✅ Console shows validation failure

---

### TEST 7: Cancel Test

**Objective:** Verify cancel functionality works for both imports

**Steps:**
1. Start a large import (or pause during import)
2. Click "Cancel" button immediately

**Expected Results:**
- ✅ Status shows "Cancelling..."
- ✅ Import stops
- ✅ Status shows "Upload cancelled"
- ✅ Partial data may be in database (as expected)

---

### TEST 8: Auto-Reconciliation Test

**Objective:** Verify reconciliation toggle works independently

**Steps:**
1. Create matching transactions in Google Sheets (ledger)
2. Import bank CSV with reconciliation ON
3. Import card CSV with reconciliation OFF

**Expected Results:**
- ✅ Bank import shows "X reconciled"
- ✅ Card import shows "0 reconciled"
- ✅ Both imports work correctly

---

## 🐛 Debugging Failed Tests

### If Bank Import Fails

**Check:**
1. Console for `[BANK PARSER]` errors
2. CSV has columns: Date, Amount, Depositor Name
3. Date format is valid
4. Amount is numeric

**Common Fixes:**
- Verify CSV is actually Wells Fargo format
- Check for special characters in data
- Ensure no empty rows

### If Card Import Fails

**Check:**
1. Console for `[CARD PARSER]` detailed logs
2. Validation errors shown in UI
3. CSV has required Stripe columns
4. Date and Amount fields exist

**Common Fixes:**
- Use actual Stripe export CSV
- Check column names match expected formats
- Verify amounts are numeric
- Check dates are in ISO format or common formats

---

## 📊 Success Criteria

All tests must pass with these criteria:

- [ ] Bank imports work without errors
- [ ] Card imports work without errors
- [ ] Duplicates are correctly detected for both
- [ ] Console logs show correct parser prefix
- [ ] Database has correct number of records
- [ ] No cross-contamination between bank and card
- [ ] Validation works for card imports
- [ ] Cancel functionality works
- [ ] Auto-reconciliation toggle works independently

---

## 🔍 Database Cleanup (Between Tests)

To reset database for clean testing:

```sql
-- Delete all transactions
DELETE FROM transactions;

-- Delete import history
DELETE FROM import_history;

-- Verify cleanup
SELECT COUNT(*) FROM transactions;
-- Should return: 0
```

---

## 📝 Test Report Template

```markdown
## Test Report - [Date]

### TEST 1: Bank Import - First Import
- Status: ✅ PASS / ❌ FAIL
- Notes:

### TEST 2: Bank Import - Duplicate Detection
- Status: ✅ PASS / ❌ FAIL
- Notes:

### TEST 3: Card Import - First Import
- Status: ✅ PASS / ❌ FAIL
- Notes:

### TEST 4: Card Import - Duplicate Detection
- Status: ✅ PASS / ❌ FAIL
- Notes:

### TEST 5: Independence Test
- Status: ✅ PASS / ❌ FAIL
- Notes:

### TEST 6: Validation Test
- Status: ✅ PASS / ❌ FAIL
- Notes:

### TEST 7: Cancel Test
- Status: ✅ PASS / ❌ FAIL
- Notes:

### TEST 8: Auto-Reconciliation Test
- Status: ✅ PASS / ❌ FAIL
- Notes:

### Overall Result
- Total Tests: 8
- Passed: X
- Failed: Y
- Status: ✅ ALL PASS / ⚠️ PARTIAL / ❌ FAILED
```

---

## 🎯 Next Steps After Testing

If all tests pass:
- ✅ Deploy to production
- ✅ Monitor logs in production
- ✅ Archive old `parsers.legacy.ts` file

If tests fail:
- ❌ Review console logs
- ❌ Check ARCHITECTURE.md for debugging tips
- ❌ Verify CSV format matches expected structure
- ❌ Test with actual CSV exports from Wells Fargo/Stripe

---

**Last Updated:** 2025-10-20
**Version:** 1.0
