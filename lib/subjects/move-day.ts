import { shortDate } from '../format'

// The day a move was made (MF5 `moves.dated_on`, 20261103091000): the window
// the database's CHECK holds, as a sentence a person can read. Pure, and here
// rather than beside the page so the write path (lib/subjects/moves.ts
// `declareMove`) and the form (lib/pages/date-move.ts) hold one rule.
//
// The window runs from the first of the month two months before the day the
// move is declared (the three months Your moves reads) to that day. `today` is
// always the database's day, UTC.

/** The first day a move declared on `today` may be dated: the first of the
 *  month two months before (MF5's moves_dated_on_window). */
export function earliestMoveDay(today: string): string {
  const [y, m] = today.slice(0, 7).split('-').map(Number)
  const at = new Date(Date.UTC(y, m - 1 - 2, 1))
  return at.toISOString().slice(0, 10)
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The day to store, checked against the window: null where the move is dated
 * today (or no day was given), which the database reads as its declaration
 * day; else the day; else why not. `today` is the database's day (UTC).
 */
export function moveDay(datedOn: string | null | undefined, today: string): { day: string | null } | string {
  const d = (datedOn ?? '').trim()
  if (d === '' || d === today) return { day: null }
  if (!DAY.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)) || new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d) {
    return 'Pick the day you made the change.'
  }
  const earliest = earliestMoveDay(today)
  if (d > today || d < earliest) return `Pick a day from ${shortDate(earliest)} to today.`
  return { day: d }
}

