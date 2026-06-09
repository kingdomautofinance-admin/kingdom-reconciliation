/*
  # Exclude soft-deleted transactions from the daily discrepancy report

  `get_daily_discrepancies` summed the ledger and bank sides without filtering
  out soft-deleted rows, so deleted transactions still skewed the Reports
  discrepancy view. This re-creates the function adding `is_deleted = false` to
  both the ledger and bank CTEs. (`kingdom_transactions` has no is_deleted column,
  so the kingdom side is unchanged. `get_daily_summary` already filters deleted.)
*/

CREATE OR REPLACE FUNCTION get_daily_discrepancies(start_date date, end_date date)
RETURNS TABLE (
  date date,
  kingdom_sum decimal(12, 2),
  ledger_sum decimal(12, 2),
  bank_sum decimal(12, 2)
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH dates AS (
    SELECT generate_series(start_date::timestamp, end_date::timestamp, '1 day')::date as d
  ),
  kingdom AS (
    SELECT kt.date, SUM(kt.value) as total
    FROM kingdom_transactions kt
    WHERE kt.date >= start_date AND kt.date <= end_date
    GROUP BY kt.date
  ),
  ledger AS (
    SELECT t.date, SUM(t.value) as total
    FROM transactions t
    WHERE t.date >= start_date AND t.date <= end_date
    AND t.source LIKE 'Google Sheets%'
    AND t.is_deleted = false
    GROUP BY t.date
  ),
  bank AS (
    SELECT t.date, SUM(t.value) as total
    FROM transactions t
    WHERE t.date >= start_date AND t.date <= end_date
    AND t.source NOT LIKE 'Google Sheets%'
    AND t.is_deleted = false
    GROUP BY t.date
  )
  SELECT
    d.d as date,
    COALESCE(k.total, 0) as kingdom_sum,
    COALESCE(l.total, 0) as ledger_sum,
    COALESCE(b.total, 0) as bank_sum
  FROM dates d
  LEFT JOIN kingdom k ON d.d = k.date
  LEFT JOIN ledger l ON d.d = l.date
  LEFT JOIN bank b ON d.d = b.date
  WHERE k.total IS NOT NULL OR l.total IS NOT NULL OR b.total IS NOT NULL
  ORDER BY d.d DESC;
END;
$$;
