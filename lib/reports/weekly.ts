import { fmtInt, longMonth, shortDate } from '../format'
import type { FigureTable } from '../reading/verdicts'

/**
 * The weekly report: "your market this week" (market-first WP3.7, plan §2.9;
 * the approved preview's WeeklyReport) — the arrangement, the masthead and
 * the subject line.
 *
 * AN ARRANGED REPORT OVER BLOCK KEYS, as the monthly is: seven sections, each
 * a `Block<WeeklyData>` rendered in `'app' | 'print' | 'email'`. This module
 * holds the part that is pure. The loader is `lib/pages/weekly.ts`; the blocks
 * are `components/blocks/weekly/*`; the documents are
 * `components/email/weekly.tsx`, `components/print/weekly-deck.tsx` and
 * `components/share/weekly-share-shell.tsx`.
 *
 * IT LEADS WITH THE MARKET, NEVER A GATE. Phase 1's weekly opened on the
 * unusual-week check and "this month so far, against the three months before
 * it"; the preview's opens on the market's size and what the update brought
 * in, then the market's subjects and themes, what to take to sales and to
 * reply to, and what changed and what is ours, with the dated list of our
 * changes. Every section header is its title alone and every footer a link
 * alone; no "How sound is this reading?" section (25 Sep rulings).
 */

/**
 * The seven sections, by key, in the preview's order (WR1 to WR6; WR1 is two
 * cards in the preview, the masthead's level and the came-in table, so two
 * keys).
 *
 * A KEY IS A STORED CONTRACT: it names a section inside a built report and a
 * tile a runner could render. `weekly.week`, `weekly.subjects`, `weekly.sales`
 * and `weekly.content` keep their keys and are reworked (the snapshot's
 * version says which shape a stored row holds); `weekly.came-in`,
 * `weekly.themes` and `weekly.change` are new. No schedule stores a weekly
 * arrangement (the send builds with every key), so no key migration is due.
 */
export const WEEKLY_BLOCK_KEYS = [
  /** WR1 · the market's level and what the update brought into it. */
  'weekly.week',
  /** WR1 · With this update: the update's counts by part of the market. */
  'weekly.came-in',
  /** WR2 · The market by subject, with what this update put in. */
  'weekly.subjects',
  /** WR3 · What your market talked about: the top five themes, and the
   *  themes new with this update, with where their videos came from. */
  'weekly.themes',
  /** WR4 · For sales. */
  'weekly.sales',
  /** WR5 · Worth a reply. */
  'weekly.content',
  /** WR6 · What changed, and what is ours, with the dated list. */
  'weekly.change',
] as const

export type WeeklyBlockKey = (typeof WEEKLY_BLOCK_KEYS)[number]

/**
 * The keys version 2 arranged and version 3 does not: "What came in" (its
 * counts are WR1's and its new themes WR3's now) and "How sound is this
 * reading?" (the 25 Sep rulings). Never reused for a new section: a stored
 * arrangement naming one is a version 2 row, which prints
 * `STALE_ARTEFACT_LINE`.
 */
export const WEEKLY_RETIRED_KEYS = ['weekly.incoming', 'weekly.coverage'] as const

/** The artefact's frame: the canvas the cards sit on (640 for emails). */
export const WEEKLY_EMAIL_WIDTH = 640

/** The column of cards inside that frame, the only width that binds: 600 on
 *  a 640 canvas, as the monthly's. */
export const WEEKLY_CARD_WIDTH = 600

/** The canvas padding, each side: 600 + 20 + 20 = 640. */
export const WEEKLY_CANVAS_GUTTER = 20

/** The preview's heading. */
export const WEEKLY_TITLE = 'Your market this week'

/** How many themes WR3 lists before the makers line (plan §2.9: "the top
 *  five themes by size"). */
export const WEEKLY_THEMES = 5

/** "20 Sep – 20 Sep"-style window, or the month where the update records no
 *  window: the snapshot's `period`, printed in the deck's chrome. */
export function weeklyPeriod(window: { from: string; to: string } | null, month: string): string {
  if (!window) return `${longMonth(month)} ${month.slice(0, 4)}`
  return `${shortDate(window.from)} – ${shortDate(window.to)}`
}

/**
 * "September 2026 · as at the 20 Sep update · next update Sun 27 Sep": the
 * masthead's month and its one line (25 Sep rulings), the deck's chrome and
 * the share page's stamp. No "so far", no "still filling".
 */
export function weeklyStamp(month: string, barLine: string | null | undefined): string {
  const head = `${longMonth(month)} ${month.slice(0, 4)}`
  return barLine ? `${head} · ${barLine}` : head
}

/**
 * The subject line leads with the market (plan §2.9): "Sealand · your market
 * this week: 436 videos and 9,471 comments came in", the update's own counts
 * into the market (This week's). With nothing counted, the artefact's name
 * alone. Never a gate, never a change.
 */
export function weeklySubject(company: string, cameIn: { market: { videos: number; comments: number } } | null | undefined): string {
  const head = `${company} · your market this week`
  if (!cameIn) return head
  const v = cameIn.market.videos
  const c = cameIn.market.comments
  return `${head}: ${fmtInt(v)} ${v === 1 ? 'video' : 'videos'} and ${fmtInt(c)} ${c === 1 ? 'comment' : 'comments'} came in`
}

/**
 * Which of the weekly's tokens are a reading of its MONTH, for the record the
 * send writes (`sent_figures.month` is NOT NULL: a figure filed under the
 * wrong period is worse than one with none).
 *
 * THE UPDATE'S OWN COUNTS ARE NOT. What the update brought in (WR1), the
 * themes it first heard (WR3's new rows), the objections and complaints in
 * its window (WR4), the replies picked from it (WR5) and what it put into each
 * subject (WR2's column) are counts of the update's days, and the month they
 * fall in may not be the reading month (1 to 15 of a month). Everything else
 * is the front page's reading of the month. A PREDICATE, NOT A LIST AT THE
 * CALL SITE: a new token is recorded by default and a new update-scoped one
 * has to be named here, which is the way round that fails loudly.
 */
const UPDATE_SCOPED = [/^came_in_/, /^heard_/, /^objection_\d+_videos$/, /^rival_complaint_\d+_videos$/, /^reply_/, /^weekly_subject_.+_added$/]

export function isMonthScopedFigure(token: string): boolean {
  return !UPDATE_SCOPED.some((re) => re.test(token))
}

/** The same table with what is not a reading of the month removed. FOR THE
 *  RECORD ONLY: the artefact still prints every one of them. */
export function monthScopedFigures(figures: FigureTable): FigureTable {
  const out: FigureTable = {}
  for (const [token, figure] of Object.entries(figures)) {
    if (isMonthScopedFigure(token)) out[token] = figure
  }
  return out
}
