import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DUE_RULES, FIN_CURRENCIES, INVOICE_KINDS, INVOICE_STATUSES, NOTICE_KINDS, SEND_MODES } from './types'

// The finance migration, read as text: what a later edit could quietly break
// without a database. The runtime proof is a throwaway PostgreSQL 17 cluster:
// scripts/pg-shim/finance-checks.sh (the migration twice, finance-checks.sql,
// and three races between two sessions for the numbers and the month guard).

const FILE = new URL('../../supabase/migrations/20261115090000_finance.sql', import.meta.url)
/** The SQL without its comments: a comment grants, revokes and inserts nothing. */
const sql = readFileSync(FILE, 'utf8').replace(/--[^\n]*/g, '')
const flat = sql.replace(/\s+/g, ' ').trim()

const TABLES = ['fin_issuer', 'fin_counters', 'fin_billing_profiles', 'fin_invoices', 'fin_payments', 'fin_notices', 'fin_vendor_usage']

/** The quoted values of the first `check (<column> in (...))` for a column. */
function checkValues(column: string): string[] {
  const m = new RegExp(`check \\(${column} in \\(([^)]*)\\)\\)`).exec(flat)
  return [...(m?.[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1])
}

describe('the finance migration', () => {
  it('creates the seven fin_ tables and touches nothing else but two cost_settings columns', () => {
    expect([...flat.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])).toEqual(TABLES)
    expect(flat).not.toMatch(/\b(drop|truncate|delete from|update public)\b/i)
    const altered = [...flat.matchAll(/alter table public\.(\w+) (?!enable row level security)/g)].map((m) => m[1])
    expect(altered).toEqual(['cost_settings', 'cost_settings'])
    expect(flat).toContain('alter table public.cost_settings add column if not exists fx_auto boolean not null default true;')
    expect(flat).toContain('alter table public.cost_settings add column if not exists fx_on date;')
  })

  it('carries no data: the one insert is the private bucket the PDFs live in', () => {
    const inserts = [...flat.matchAll(/\binsert into ([\w.]+)/gi)].map((m) => m[1])
    // fin_counters inside fin_take_number, fin_invoices inside fin_issue_invoice: run by the code, not the migration
    expect(inserts).toEqual(['public.fin_counters', 'public.fin_invoices', 'storage.buckets'])
    expect(flat).toContain("insert into storage.buckets (id, name, public) values ('invoices', 'invoices', false) on conflict (id) do nothing;")
    expect(flat).not.toMatch(/\bcopy\b/i)
    // no address, bank, amount or person in the file: the repository is public
    expect(readFileSync(FILE, 'utf8')).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}|\bR\d|\$\d|account number|branch code/i)
  })

  it('is the cost tables\' posture: RLS on, no policy, nothing granted to a tenant', () => {
    for (const t of TABLES) expect(flat).toContain(`alter table public.${t} enable row level security;`)
    expect(flat).not.toMatch(/create policy/i)
    expect(flat).toContain(`revoke all on table ${TABLES.map((t) => `public.${t}`).join(', ')} from anon, authenticated;`)
    expect(flat).toContain(`grant all on table ${TABLES.map((t) => `public.${t}`).join(', ')} to service_role;`)
    expect(flat).not.toMatch(/grant [^;]* to [^;]*\b(anon|authenticated|public)\b/i)
  })

  it('pins search_path on both functions and lets only the service role run them', () => {
    const fns = [...flat.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1])
    expect(fns).toEqual(['fin_take_number', 'fin_issue_invoice'])
    expect(flat.match(/set search_path = public, pg_temp/g)).toHaveLength(2)
    expect(flat).not.toMatch(/security definer/i)
    expect(flat).toContain('revoke all on function public.fin_take_number(text) from public, anon, authenticated;')
    expect(flat).toContain('revoke all on function public.fin_issue_invoice(uuid, date, text, date, date, jsonb, numeric, text, text) from public, anon, authenticated;')
    expect(flat).toContain('grant execute on function public.fin_take_number(text) to service_role;')
  })

  it('holds the enums the code writes', () => {
    expect([...(/kind text not null default 'invoice' check \(kind in \(([^)]*)\)\)/.exec(flat)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...INVOICE_KINDS])
    expect(checkValues('status')).toEqual([...INVOICE_STATUSES])
    expect(checkValues('currency')).toEqual([...FIN_CURRENCIES])
    expect(checkValues('due_rule')).toEqual([...DUE_RULES])
    expect(checkValues('send_mode')).toEqual([...SEND_MODES])
    expect([...(/kind text not null check \(kind in \(([^)]*)\)\)/.exec(flat)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...NOTICE_KINDS])
  })

  it('invoices a month once, and a credited or void invoice gives the month back', () => {
    expect(flat).toContain(
      "create unique index if not exists fin_invoices_one_per_month on public.fin_invoices (client_id, period_start) where kind = 'invoice' and period_start is not null and status not in ('credited', 'void');",
    )
    // the issuing function's refusal path knows the index by name
    expect(flat).toContain("if hit is distinct from 'fin_invoices_one_per_month' then raise; end if;")
    // invoices are tax records: a client with any cannot be deleted
    expect(flat.match(/client_id uuid not null references public\.clients\(id\) on delete restrict/g)).toHaveLength(2)
  })

  it('holds no BEGIN, COMMIT or CONCURRENTLY (an applier wraps one transaction per file)', () => {
    expect(flat).not.toMatch(/(^|;) ?(begin|commit) ?;/i)
    expect(flat).not.toMatch(/concurrently/i)
  })
})
