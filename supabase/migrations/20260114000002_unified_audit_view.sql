-- Create a unified view for System Audit that combines Ledger and CRM transactions
CREATE OR REPLACE VIEW unified_audit_list AS
SELECT 
  'ledger' as origin,
  id,
  date,
  value,
  name,
  depositor,
  car,
  payment_method,
  source,
  status::text,
  matched_transaction_id,
  is_deleted
FROM transactions
WHERE is_deleted = false AND source LIKE 'Google Sheets%'
UNION ALL
SELECT 
  'system' as origin,
  id,
  date,
  value,
  name,
  depositor,
  car,
  payment_method,
  source,
  status::text,
  matched_transaction_id,
  false as is_deleted
FROM kingdom_transactions;

-- Grant access
GRANT SELECT ON unified_audit_list TO authenticated;
GRANT SELECT ON unified_audit_list TO anon;
GRANT SELECT ON unified_audit_list TO service_role;
