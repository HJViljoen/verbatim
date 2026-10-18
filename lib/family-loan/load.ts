import type { createAdminClient } from '@/lib/supabase-admin'
import { entryFromRow } from './rows'
import type { LoanEntry } from './types'

// Every row the loan page reads, through the service role (the table refuses
// every other session). The caller has already checked loanAdmin(). I/O glue
// only: every figure is decided by lib/family-loan/ledger.ts.
//
// Paged a thousand at a time, as selectAll pages (lib/supabase-admin.ts), so a
// long history is never cut at PostgREST's cap; written out here because a
// missing table must be told apart from a failed read, and selectAll keeps
// only the message.

type Admin = ReturnType<typeof createAdminClient>

/** The migration has not been applied: the page says so instead of failing. */
export class FamilyLoanTableMissing extends Error {}

const MISSING = new Set(['42P01', 'PGRST205'])
const PAGE = 1000

export async function loadFamilyLoan(admin: Admin): Promise<LoanEntry[]> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('family_loan_entries')
      .select('id, occurred_on, kind, amount, note, source_ref, created_at')
      .order('occurred_on')
      .order('created_at')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) {
      if (error.code && MISSING.has(error.code)) throw new FamilyLoanTableMissing('family_loan_entries')
      throw new Error(`family loan: ${error.message ?? error.code}`)
    }
    const page = (data ?? []) as Record<string, unknown>[]
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows.map(entryFromRow)
}
