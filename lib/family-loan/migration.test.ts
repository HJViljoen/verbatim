import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOAN_KINDS } from './types'

// The family loan migration, read as text: what a later edit could quietly
// break without a database. The runtime proof is a throwaway PostgreSQL 17
// cluster (scripts/pg-shim/throwaway.sh twice, then
// scripts/pg-shim/family-loan-checks.sql).

const FILE = new URL('../../supabase/migrations/20261111090000_family_loan.sql', import.meta.url)
/** The SQL without its comments: a comment grants, revokes and inserts nothing. */
const sql = readFileSync(FILE, 'utf8').replace(/--[^\n]*/g, '')
const flat = sql.replace(/\s+/g, ' ').trim()

describe('the family loan migration', () => {
  it('creates one table and one index, and touches nothing else', () => {
    expect([...flat.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])).toEqual(['family_loan_entries'])
    expect([...flat.matchAll(/create index if not exists (\w+)/g)].map((m) => m[1])).toEqual(['family_loan_entries_occurred_on_idx'])
    expect(flat).not.toMatch(/\b(drop|truncate|delete from|update public|alter table public\.(?!family_loan_entries\b))/i)
    expect(flat).not.toMatch(/create (or replace )?function/i)
  })

  it('carries no data: the repository is public and the figures are entered on the page', () => {
    expect(flat).not.toMatch(/\binsert\b/i)
    expect(flat).not.toMatch(/\bcopy\b/i)
  })

  it('is the cost tables\' posture: RLS on, no policy, nothing granted to a tenant', () => {
    expect(flat).toContain('alter table public.family_loan_entries enable row level security;')
    expect(flat).not.toMatch(/create policy/i)
    expect(flat).toContain('revoke all on table public.family_loan_entries from anon, authenticated;')
    expect(flat).toContain('grant all on table public.family_loan_entries to service_role;')
    expect(flat).not.toMatch(/grant [^;]* to [^;]*\b(anon|authenticated|public)\b/i)
  })

  it('holds the kinds the page writes, a positive rand amount and a unique bank reference', () => {
    const kinds = [...(flat.match(/check \(kind in \(([^)]*)\)\)/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(kinds).toEqual([...LOAN_KINDS])
    expect(flat).toContain('amount numeric(12,2) not null check (amount > 0)')
    expect(flat).toContain('source_ref text unique')
    expect(flat).toContain('occurred_on date not null')
  })

  it('holds no BEGIN, COMMIT or CONCURRENTLY (an applier wraps one transaction per file)', () => {
    expect(flat).not.toMatch(/(^|;) ?(begin|commit) ?;/i)
    expect(flat).not.toMatch(/concurrently/i)
  })
})
