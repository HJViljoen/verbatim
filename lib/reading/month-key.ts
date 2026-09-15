// The month key and the arithmetic over it (Phase 1 WP10 fix pass).
//
// WHY THIS IS ITS OWN FILE. `lib/charts/calendar.ts` needs exactly one thing
// from the reading layer — the month key's normal form — and it is imported by
// `Sparkline`, which is on nearly every page. `lib/reading/monthly.ts` imports
// `lib/supabase-admin` (and so `createClient`), so taking `monthStartOf` from
// there dragged the Supabase client into every page's module graph. Nothing
// leaked — the env read is inside a function and Sparkline is a server
// component — but from-series.ts's own header says the split between it and
// calendar.ts exists so that "a sparkline costs a sparkline", and this is the
// other half of that promise.
//
// Dates are UTC throughout, for the reason monthly.ts states: the SQL functions
// bucket with an explicit `at time zone 'UTC'`.

const pad = (n: number): string => String(n).padStart(2, '0')

/** The first day of the month an instant falls in, `YYYY-MM-DD`, UTC. */
export function monthStartOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new Error(`monthStartOf: not a date: ${iso}`)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`
}

/** The month after this one. */
export function nextMonth(month: string): string {
  const d = new Date(`${monthStartOf(month)}T00:00:00.000Z`)
  return monthStartOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString())
}

/** The month before this one. */
export function prevMonth(month: string): string {
  const d = new Date(`${monthStartOf(month)}T00:00:00.000Z`)
  return monthStartOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString())
}

/** "September" — the month's name, UTC, for a sentence. */
export function longMonth(month: string): string {
  return new Date(`${monthStartOf(month)}T00:00:00.000Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
}
