import type { EntryFields } from './forms'
import { centsOf, randOf } from './money'
import { LOAN_KINDS, type LoanEntry, type LoanKind } from './types'

// Rows of public.family_loan_entries to and from the page's shapes. Pure.

type Row = Record<string, unknown>

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))

export function entryFromRow(r: Row): LoanEntry {
  const kind = String(r.kind)
  if (!(LOAN_KINDS as readonly string[]).includes(kind)) throw new Error(`family loan: unknown kind ${kind}`)
  return {
    id: String(r.id),
    occurredOn: String(r.occurred_on).slice(0, 10),
    kind: kind as LoanKind,
    amountCents: centsOf(r.amount),
    note: str(r.note),
    sourceRef: str(r.source_ref),
    createdAt: String(r.created_at ?? ''),
  }
}

/** The columns an add or an edit writes. `source_ref` and `created_at` are
 *  never posted: an imported row keeps its bank reference through an edit. */
export function entryToRow(e: EntryFields) {
  return { kind: e.kind, occurred_on: e.occurredOn, amount: randOf(e.amountCents), note: e.note }
}
