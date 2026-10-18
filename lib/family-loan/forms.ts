import { day, text, type FormLike, type Parsed } from '@/lib/costs/forms'
import { MAX_ENTRY_CENTS, parseRandCents } from './money'
import { LOAN_KINDS, type LoanKind } from './types'

// What the loan page's add and edit forms post, read and checked before
// anything is written (lib/family-loan/forms.test.ts). The kind is the
// migration's CHECK and the amount its `amount > 0`, so a value that passes
// here is one the database takes. Pure.

export interface EntryFields {
  kind: LoanKind
  occurredOn: string
  amountCents: number
  note: string | null
}

/** The earliest day an entry may carry: a typo's year (0026) is refused. */
export const EARLIEST_DAY = '2000-01-01'

/** Notes are a line, not an essay. */
export const NOTE_MAX = 500

/** An entry from the add form or an edit (the id, where there is one, is the
 *  action's to read). `today` is today in Johannesburg: money that has not
 *  moved yet is not an entry. */
export function parseEntryForm(f: FormLike, today: string): Parsed<EntryFields> {
  const kind = String(f.get('kind') ?? '')
  if (!(LOAN_KINDS as readonly string[]).includes(kind)) return { ok: false, message: 'Pick Borrowed or Paid back.' }
  const occurredOn = day(f, 'occurredOn')
  if (occurredOn === null) return { ok: false, message: 'Give the date it happened.' }
  if (occurredOn === undefined || occurredOn < EARLIEST_DAY) return { ok: false, message: 'The date is not a date.' }
  if (occurredOn > today) return { ok: false, message: 'The date is in the future. Add it on the day.' }
  const amountCents = parseRandCents(f.get('amount'))
  if (amountCents === null) return { ok: false, message: 'Give the amount in rand.' }
  if (amountCents === undefined) return { ok: false, message: 'The amount must be rand and cents, like 2500 or 1250.50.' }
  if (amountCents <= 0) return { ok: false, message: 'The amount must be more than R0.' }
  if (amountCents > MAX_ENTRY_CENTS) return { ok: false, message: 'That is more than R10,000,000. Check the amount.' }
  return {
    ok: true,
    value: { kind: kind as LoanKind, occurredOn, amountCents, note: text(f, 'note', NOTE_MAX) },
  }
}
