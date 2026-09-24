import { fullDate, longMonth, shortDate } from '../format'
import { DEFAULT_HORIZON, HORIZONS, HORIZON_LABEL, HORIZON_PARAM, type Horizon } from '../reading/horizon'
import type { MonthStatus } from '../reading/types'

/**
 * What every page bar says, composed once (Phase 1 WP9, item 42).
 *
 * The page bar is the only place a reading surface states WHEN it is reading
 * and HOW FINISHED that reading is, so the sentence is written here rather
 * than at six construction sites. Two facts a reader needs and the product has
 * never printed: the month the reading is OF, and the instant the reading was
 * TAKEN. They are different — a month that is still filling reads differently
 * on Monday and on Friday, and without the second date "Sep 2026" looks final
 * on the first of the month.
 *
 * Calibrated (lib/calibration.ts): no run, no window, no basis. "Still
 * filling" is the month's own word (lib/reading/monthly.ts) said in the
 * reader's — the month is not finished, and a figure in it will move.
 */

export interface ContextLineInput {
  /** The tenant's own name for itself. */
  brand: string
  /** The month the reading is of, `YYYY-MM-01`. */
  month: string
  /** Whether that month can still change. */
  status: MonthStatus
  /** The instant the reading was taken. */
  readingAt: string
  /**
   * What the last artefact about this month read, where it has moved since
   * (Phase 1 WP18, item 13) — "the report of 1 Oct read 1,388 videos".
   *
   * COMPOSED BY THE PAGE, NOT HERE. It is a quotation from a dated document,
   * and the rule for when it may be printed at all (a still-filling month, a
   * figure that actually moved, an artefact that went out before the month
   * closed) lives with the record in lib/reports/monthly.ts. The bar's job is
   * to put it where a reader meets the reading date.
   */
  sent?: string | null
}

/**
 * "Sealand · September 2026 · still filling · as at 28 Sep"
 *
 * THE ARTBOARD'S TWO WORDS (Block D wave 2, `main.bar.context`). The line used
 * to read "Össur · Sep 2026 · still filling · reading as at 15 Sep 2026", and
 * the mock writes the month LONG and the stamp SHORT. Both changes are the
 * same judgement about where the weight goes: the month is what the reading is
 * OF and carries the sentence, the instant it was taken is a stamp the eye
 * should be able to skip. "reading as at" was also saying "reading" twice — the
 * band under it opens "How sound is this" and the bar's own question is "What
 * is this month's reading?".
 *
 * THE YEAR STAYS OFF THE STAMP AND ON THE MONTH, which is the mock's shape and
 * not an omission: "September 2026" dates the reading, and a stamp inside a
 * month that has already been named does not need the year again.
 */
export function contextLine(input: ContextLineInput): string {
  // `longMonth` is the month's own name with no year ("September"), because the
  // sentence it was written for already has one. Here the year IS the claim —
  // "September" alone on a page opened in January dates nothing — so it is
  // appended from the month key itself rather than through a second formatter.
  const year = input.month.slice(0, 4)
  const parts = [input.brand, `${longMonth(input.month)} ${year}`]
  // A frozen month says nothing about filling: it is finished, and a clause
  // saying so on every past month would be noise on every page.
  if (input.status === 'filling') parts.push('still filling')
  // THE STAMP TAKES THE YEAR WHEN IT IS NOT THE MONTH'S (code review m13). The
  // short form is right — and is what the artboard prints — while the two are
  // in the same year, because the month beside it carries one. A frozen month
  // read in a later year says "August 2026 · as at 2 Oct" with no year on the
  // instant, which dates the reading to nothing.
  const stamp = input.readingAt.slice(0, 4) === year ? shortDate(input.readingAt) : fullDate(input.readingAt)
  parts.push(`as at ${stamp}`)
  if (input.sent) parts.push(input.sent)
  return parts.join(' · ')
}

/** This week is dated by the update, not by the month, so its bar carries the
 *  two updates it compares instead of a month and a horizon. */
export function updateLine(input: { update: string; previous?: string | null }): string {
  const parts = [`update of ${shortDate(input.update)}`]
  parts.push(input.previous ? `previous ${shortDate(input.previous)}` : 'no previous update')
  return parts.join(' · ')
}

/**
 * Where a horizon pill points.
 *
 * The page's OWN params are carried through, because the horizon is a view of
 * the same selection: changing the horizon on `?item=mi-1` must not drop the
 * item. The default horizon writes no parameter at all, so the plain address
 * of a page is always its default reading and a shared link is short.
 */
export function horizonHref(basePath: string, params: Record<string, string | undefined>, horizon: Horizon): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (k === HORIZON_PARAM) continue
    if (typeof v === 'string' && v !== '') q.set(k, v)
  }
  if (horizon !== DEFAULT_HORIZON) q.set(HORIZON_PARAM, horizon)
  const s = q.toString()
  return s ? `${basePath}?${s}` : basePath
}

/** The four pills, in order, each with its label and where it points. */
export function horizonOptions(basePath: string, params: Record<string, string | undefined>, current: Horizon) {
  return HORIZONS.map((h) => ({
    horizon: h,
    label: HORIZON_LABEL[h],
    href: horizonHref(basePath, params, h),
    active: h === current,
  }))
}

/** The parameter that opens a drawer over a page (`?detail=record`, and
 *  HowToRead's `?detail=legend`). */
export const DETAIL_PARAM = 'detail'

/**
 * Where the "how sound is this" band points, and where closing the record
 * returns to.
 *
 * The page's OWN params again, for the same reason the horizon carries them:
 * `DrawerLink` pushes these with `history.pushState` and nothing re-renders, so
 * an href that drops the selection leaves the address bar describing a reading
 * the screen is not showing. Opening the record on
 * `/dashboard/voice?horizon=last_3&themes=x` and closing it must not silently
 * turn the page into the default reading of everything the next time that link
 * is opened, refreshed or reached with the back button.
 */
export function detailHref(basePath: string, params: Record<string, string | undefined>, detail: string | null): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (k === DETAIL_PARAM) continue
    if (typeof v === 'string' && v !== '') q.set(k, v)
  }
  if (detail) q.set(DETAIL_PARAM, detail)
  const s = q.toString()
  return s ? `${basePath}?${s}` : basePath
}
