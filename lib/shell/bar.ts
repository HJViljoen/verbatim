import { longMonth, shortDate, weekdayDate } from '../format'
import { DEFAULT_HORIZON, HORIZONS, HORIZON_LABEL, HORIZON_PARAM, type Horizon } from '../reading/horizon'
import { barLine, MONTH_PARAM, monthWords, type ReadingMonth } from '../reading/reading-month'
import type { OtherMonth } from '../reading/reading-view'

/**
 * What every page bar says, composed once (Phase 1 WP9, item 42; rewritten for
 * the 25 Sep rulings, market-first WP1.2).
 *
 * THE BAR IS THE TITLE, THE MONTH SELECTOR AND ONE QUIET LINE. "Sealand ·
 * September 2026 ▾  as at the 24 Sep update · next update Sun 27 Sep". The
 * selector names the month the page reads (decision A: the month that has just
 * ended until the new one is half over with two updates) and carries the
 * month's state in its tooltip (`monthWords`: "September · ended · read to the
 * 11 Oct update · still filling until the 1 Nov update"); the other month is
 * one click away as `?month=`. The line says only how current the page is:
 * "as at" is the last update's date, never the clock, and "next update" is the
 * tenant's own schedule. No "still filling" and no "so far, N days" in the
 * line: those are the selector's.
 *
 * Calibrated (lib/calibration.ts): no run, no window, no basis.
 */

export interface ContextLineInput {
  /** The tenant's own name for itself. */
  brand: string
  /** The reading month (lib/reading/reading-month.ts). */
  reading: ReadingMonth
  /** The one other month the selector offers (lib/reading/reading-view.ts). */
  other?: OtherMonth | null
}

/** The bar's input from a page's data, or null where the data carries no
 *  reading month (a snapshot stored before market-first WP1.2): the bar then
 *  says nothing about when rather than something invented. */
export function barContext(data: { brand: string; reading?: ReadingMonth | null; otherMonth?: OtherMonth | null }): ContextLineInput | null {
  return data.reading ? { brand: data.brand, reading: data.reading, other: data.otherMonth ?? null } : null
}

/** The bar's one line: "as at the 24 Sep update · next update Sun 27 Sep", or
 *  "as at the 13 Sep update · updates paused" (`barLine`). */
export function contextLine(input: ContextLineInput): string {
  return barLine(input.reading)
}

/** The selector's label: the month and its year, "September 2026". The year
 *  is the claim here: "September" alone on a page opened in January dates
 *  nothing. */
export function monthLabel(month: string): string {
  return `${longMonth(month)} ${month.slice(0, 4)}`
}

/** The selector's tooltip: the month's state (`monthWords`). */
export function monthTitle(reading: ReadingMonth): string {
  return monthWords(reading)
}

/**
 * Where the selector's other month points. The page's OWN params are carried
 * through, as the horizon's are, so switching month keeps the reader's
 * selection; the month the page reads by default writes no parameter at all,
 * so a page's plain address is always its default reading.
 */
export function monthHref(basePath: string, params: Record<string, string | undefined>, other: OtherMonth): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (k === MONTH_PARAM) continue
    if (typeof v === 'string' && v !== '') q.set(k, v)
  }
  if (!other.isDefault) q.set(MONTH_PARAM, other.month.slice(0, 7))
  const s = q.toString()
  return s ? `${basePath}?${s}` : basePath
}

/** This week's bar input: dated by the update, not by the month. */
export interface UpdateLineInput {
  /** When the update was delivered. */
  update: string
  /** The run's own frozen window, half-open `[from, to)`, or null where the
   *  run carries none. */
  window?: { from: string; to: string } | null
  /** The next scheduled update, or null where none is promised. */
  nextUpdate?: string | null
  /** No update for more than fourteen days (`PAUSED_AFTER_DAYS`). */
  paused?: boolean
}

/** This week's selector slot: "The 20 Sep update". */
export function updateLabel(update: string): string {
  return `The ${shortDate(update)} update`
}

/** "10 to 20 Sep", or "28 Aug to 3 Sep" across a month. The window is
 *  half-open, so its last day is the instant before `to`. */
function windowDays(from: string, to: string): string | null {
  const a = Date.parse(from)
  const b = Date.parse(to) - 1
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null
  const first = shortDate(new Date(a).toISOString())
  const last = shortDate(new Date(b).toISOString())
  const [d1, m1] = first.split(' ')
  const [, m2] = last.split(' ')
  return m1 === m2 ? `${d1} to ${last}` : `${first} to ${last}`
}

/**
 * This week's one line (25 Sep rulings, §1 B item 2): the comment window in
 * place of "as at", because the selector slot already names the update.
 * "comments written 10 to 20 Sep · next update Sun 27 Sep".
 */
export function updateLine(input: UpdateLineInput): string {
  const days = input.window ? windowDays(input.window.from, input.window.to) : null
  const head = days ? `comments written ${days}` : `as at the ${shortDate(input.update)} update`
  if (input.paused) return `${head} · updates paused`
  return input.nextUpdate ? `${head} · next update ${weekdayDate(input.nextUpdate)}` : head
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
