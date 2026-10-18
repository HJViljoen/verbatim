import type { LoanEntry } from './types'

// Every figure on the loan page, from its rows alone (lib/family-loan/ledger.test.ts).
// The balance is never stored, so an edit or a delete cannot leave a stale
// total behind: it is borrowed less paid back, summed here in whole cents.
// Pure.

/** Where the balance stands. `overpaid` is more paid back than was borrowed:
 *  the page says so in words and never prints a negative debt. */
export type LoanStanding = 'empty' | 'owing' | 'settled' | 'overpaid'

export interface LedgerLine {
  entry: LoanEntry
  /** What was still owed once this entry landed; below zero is overpaid. */
  balanceAfterCents: number
}

export interface LoanSummary {
  borrowedCents: number
  repaidCents: number
  /** Borrowed less paid back. Below zero when overpaid. */
  outstandingCents: number
  standing: LoanStanding
  /** The latest repayment by date (the later written on a tie), or null. */
  lastRepayment: { on: string; amountCents: number } | null
  /** Every entry with the balance after it, NEWEST FIRST, as the page lists
   *  them. */
  lines: LedgerLine[]
}

const at = (iso: string): number => {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

/** Oldest first: by the day the money moved, then by when the row was
 *  written (two movements on one day keep the order they were entered in),
 *  then by id, so the order never depends on how the rows arrived. */
export function chronological(entries: readonly LoanEntry[]): LoanEntry[] {
  return [...entries].sort((a, b) =>
    a.occurredOn.localeCompare(b.occurredOn)
    || at(a.createdAt) - at(b.createdAt)
    || a.id.localeCompare(b.id))
}

export function standingOf(outstandingCents: number, count: number): LoanStanding {
  if (count === 0) return 'empty'
  if (outstandingCents > 0) return 'owing'
  return outstandingCents < 0 ? 'overpaid' : 'settled'
}

export function summariseLoan(entries: readonly LoanEntry[]): LoanSummary {
  let borrowed = 0
  let repaid = 0
  let last: LoanSummary['lastRepayment'] = null
  const lines: LedgerLine[] = []
  for (const entry of chronological(entries)) {
    if (entry.kind === 'borrowed') borrowed += entry.amountCents
    else {
      repaid += entry.amountCents
      last = { on: entry.occurredOn, amountCents: entry.amountCents }
    }
    lines.push({ entry, balanceAfterCents: borrowed - repaid })
  }
  const outstanding = borrowed - repaid
  return {
    borrowedCents: borrowed,
    repaidCents: repaid,
    outstandingCents: outstanding,
    standing: standingOf(outstanding, entries.length),
    lastRepayment: last,
    lines: lines.reverse(),
  }
}
