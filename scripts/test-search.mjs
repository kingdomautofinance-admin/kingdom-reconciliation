#!/usr/bin/env node
/**
 * Quick CLI utility to reproduce the Supabase search query that the app runs.
 * Helps debug why the UI search might be returning zero rows.
 *
 * Usage examples:
 *   node scripts/test-search.mjs --term "john"
 *   node scripts/test-search.mjs --term "john" --status reconciled
 *   node scripts/test-search.mjs --term "tesla" --from 2024-01-01 --to 2024-12-31 --limit 20
 *
 * Required env vars (same ones the front-end uses):
 *   - VITE_SUPABASE_URL
 *   - VITE_SUPABASE_ANON_KEY   (or SUPABASE_SERVICE_ROLE_KEY to bypass RLS)
 */

import { createClient } from '@supabase/supabase-js';

const escapeForIlike = (term) =>
  term
    .replace(/([*\\])/g, '\\$1')
    .replace(/,/g, '\\,')
    .replace(/_/g, '\\_')
    .replace(/%/g, '\\%');

const buildAmountCondition = (rawTerm) => {
  const digitsOnly = rawTerm.replace(/[^\d.-]/g, '');
  if (!digitsOnly) return null;
  const numericValue = Number(digitsOnly);
  if (Number.isNaN(numericValue)) return null;
  return `value.eq.${encodeURIComponent(numericValue.toString())}`;
};

function parseArgs(argv) {
  const args = {
    term: null,
    status: null,
    from: null,
    to: null,
    limit: 50,
    offset: 0,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    switch (key) {
      case 'term':
        args.term = next ?? null;
        i += 1;
        break;
      case 'status':
        args.status = next ?? null;
        i += 1;
        break;
      case 'from':
        args.from = next ?? null;
        i += 1;
        break;
      case 'to':
        args.to = next ?? null;
        i += 1;
        break;
      case 'limit':
        args.limit = next ? Number(next) : args.limit;
        i += 1;
        break;
      case 'offset':
        args.offset = next ? Number(next) : args.offset;
        i += 1;
        break;
      default:
        break;
    }
  }

  return args;
}

function applyStatusFilter(query, status) {
  if (status === 'deleted') {
    return query.eq('is_deleted', true);
  }
  if (status === 'kingdom') {
    return query.ilike('source', 'Kingdom System%').eq('is_deleted', false);
  }
  if (status && status !== 'all') {
    return query.eq('status', status).eq('is_deleted', false);
  }
  return query;
}

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  console.log('Search parameters:', args);

  const supabase = createClient(supabaseUrl, supabaseKey);

  let query = supabase
    .from('transactions')
    .select('*')
    .order('status', { ascending: true })
    .order('sheet_order', { ascending: false, nullsFirst: false })
    .order('date', { ascending: false });

  query = applyStatusFilter(query, args.status);

  if (args.from) {
    query = query.gte('date', args.from);
  }

  if (args.to) {
    query = query.lt('date', args.to);
  }

  if (args.term) {
    const sanitized = escapeForIlike(args.term.trim());
    const searchPattern = `*${sanitized}*`;
    const orConditions = [
      `name.ilike.${searchPattern}`,
      `depositor.ilike.${searchPattern}`,
      `car.ilike.${searchPattern}`,
      `historical_text.ilike.${searchPattern}`,
      `source.ilike.${searchPattern}`,
    ];

    const amountCondition = buildAmountCondition(args.term);
    if (amountCondition) {
      orConditions.push(amountCondition);
    }

    query = query.or(orConditions.join(','));
    console.log('OR conditions:', orConditions.join(','));
  }

  const { data, error } = await query.range(args.offset, args.offset + args.limit - 1);

  if (error) {
    console.error('Supabase error:', error);
    process.exit(1);
  }

  const rows = data ?? [];
  console.log(`Rows returned: ${rows.length}`);
  rows.forEach((row) => {
    console.log(
      `${row.id} | ${row.date} | ${row.name ?? ''} | ${row.depositor ?? ''} | ${row.car ?? ''} | ${
        row.value
      } | status=${row.status} | deleted=${row.is_deleted}`,
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
