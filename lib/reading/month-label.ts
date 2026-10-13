import { monthStartOf, prevMonth } from './month-key'

// THE TWO CLOCKS, LABELLED (decision 3; Heinrich, 13 Oct: "agree 3–8").
//
// The product reads two months on one day, on purpose:
//   · a WEEK's figures (Market's week view, Content, the weekly email) sit
//     beside the week's own month: "31 of 318 in October so far";
//   · a WHOLE-MONTH reading (Voices, Your products, Your moves' months and
//     their comparison, Settings › Your products) reads the reading month
//     (`readingMonthFor`, lib/reading/reading-month.ts), which on days 1 to
//     15 is still the month that has just ended.
// So on 13 October one Dashboard shows October beside September. Both are
// right; unlabelled, the pair reads as a mistake. Wherever a whole-month
// reading names a month that is not the current calendar month, it says so
// in these words, and only here: no page writes its own.
//
// PURE, and a leaf (month-key.ts only), so a client component may import it.
// The clock is the caller's: a loader passes the `now` it read the month at,
// never a fresh `Date` at render.

/** The month that has just ended, as a page names it. */
export const LAST_FULL_MONTH = 'the last full month'

/** A month before that (a paused workspace reads the latest month it has
 *  rows for; a `?month=` can name any month with a row). "The last full
 *  month" would be false there, so it is said plainly instead. */
export const EARLIER_MONTH = 'an earlier month'

/**
 * The words that say a whole-month reading is not this month's, or null when
 * the month IS the current calendar month (nothing extra prints then).
 * `month` is any instant in the month or its `YYYY-MM-01`; `now` is the
 * instant the reading was made. Both are read in UTC, as the reading month's
 * own rule reads them.
 */
export function readingMonthLabel(month: string, now: string): string | null {
  const m = monthStartOf(month)
  const current = monthStartOf(now)
  if (m >= current) return null
  return m === prevMonth(current) ? LAST_FULL_MONTH : EARLIER_MONTH
}

/** A bar's or a meta line's month: "September · the last full month";
 *  the words alone where there is no label ("October so far"). */
export const barMonth = (words: string, label: string | null | undefined): string =>
  label ? `${words} · ${label}` : words

/** A month inside a sentence: "September, the last full month"; the words
 *  alone where there is no label. */
export const inlineMonth = (words: string, label: string | null | undefined): string =>
  label ? `${words}, ${label}` : words
