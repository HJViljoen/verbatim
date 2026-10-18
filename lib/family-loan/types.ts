// The family loan's vocabulary (operator only, /dashboard/ops/loan).
//
// The kinds mirror the CHECK in supabase/migrations/20261111090000_family_loan.sql
// (lib/family-loan/migration.test.ts holds them equal), so a kind the form
// accepts is one the database accepts. Pure: no I/O.

export const LOAN_KINDS = ['borrowed', 'repaid'] as const
export type LoanKind = (typeof LOAN_KINDS)[number]

/** What the page calls each kind. */
export const LOAN_KIND_LABEL: Record<LoanKind, string> = {
  borrowed: 'Borrowed',
  repaid: 'Paid back',
}

/** One movement of money, as the page reads it. Amounts are whole cents, so
 *  no sum drifts by a fraction of a cent. */
export interface LoanEntry {
  id: string
  /** 'YYYY-MM-DD', a Johannesburg day. */
  occurredOn: string
  kind: LoanKind
  /** Always above zero; the kind says which way it went. */
  amountCents: number
  note: string | null
  /** A bank statement's reference, for an imported row; null for one added
   *  on the page. */
  sourceRef: string | null
  /** When the row was written (ISO), the tiebreak within a day. */
  createdAt: string
}
