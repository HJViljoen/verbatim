import type { Quote } from '../renderables/types'

/**
 * "For sales this week" — the shape, written once and printed twice
 * (Phase 1 WP15, decision P; the mock's ThisWeek §7 and the weekly report's
 * section 4, WR4).
 *
 * WHY THIS LIVES UNDER `lib/blocks/` AND NOT INSIDE A PAGE. It is the one
 * section the This week PAGE and the weekly REPORT both carry in full, and the
 * design says so twice ("the two role-shaped sections (4, for sales …)",
 * §6 item 41). Two implementations of it is two chances to tell a salesperson
 * two different things about the same week, which is the failure the Block
 * contract exists to stop (lib/blocks/types.ts). So the DATA is declared here,
 * the MARKUP is `components/blocks/for-sales.tsx`, and WP17 hands the same
 * shape to the same block rather than writing a second one.
 *
 * FOUR THINGS A SALESPERSON ASKS, IN THE CUSTOMERS' OWN WORDS. What they push
 * back on, what they praise, who is switching and what they complain about in
 * the rival. Every one of them is a COUNT with QUOTES under it, never a score:
 * "96 objections" is a measurement, "objection pressure: high" is not, and this
 * product prints the first kind.
 *
 * EVERY COUNT IS OF VIDEOS, NOT OF COMMENTS OR INSIGHTS. The thirteen words
 * (lib/calibration.ts): a video and the comments written under it is the unit
 * every share on a reading surface is a share of. An objection heard nine times
 * under one video is one video's objection, and counting the comments would let
 * one loud thread outrank a week.
 */

/** One customer's words, with where and when they were said. */
export interface SalesQuote {
  quote: Quote
  /** Platform · date · whose post it sat under. Composed by the loader, so the
   *  block never has to know what a platform is called. */
  cite: string
  /** Where to go and read it, or null when the post carries no public URL —
   *  the cite is then printed without a link rather than with a dead one. */
  href: string | null
}

/** What a group of objections (or rival complaints) is grouped BY. Stated on
 *  the data rather than assumed by the block, because it changes what the
 *  heading means: a subject is something the client told us they care about, a
 *  theme is something we grouped out of what was read, and a reader has to be
 *  told which they are looking at (the thirteen words). */
export type SalesGrouping = 'subject' | 'theme'

export interface SalesGroup {
  /** Stable identity — a subject id or a theme registry id. Never a label. */
  id: string
  label: string
  /** Distinct videos in this update's window carrying it. */
  videos: number
  quotes: SalesQuote[]
}

export interface ForSalesData {
  /** This update's frozen window, half-open, or null when the run carries
   *  none. Every count below is of it and of nothing else. */
  window: { from: string; to: string } | null
  /** The n every count is against: videos this update's window carried, every
   *  audience together. Null when the windowed read is not available here. */
  videos: number | null
  grouping: SalesGrouping
  /** Largest first. */
  objections: SalesGroup[]
  /** The strongest thing said in the client's favour — one quote, or none.
   *  A display cap of `SALES_PRAISE_SHOWN`, and no count is printed off it. */
  praise: SalesQuote[]
  /**
   * Comments that say someone moved, or is moving, between brands — the few
   * SHOWN, capped at `SALES_SWITCHING_SHOWN`.
   *
   * NEVER COUNT THIS ARRAY AND PRINT THE ANSWER. The block rendered
   * `switching.length` as its stat value until 2026-09-16, which made a
   * display cap read as a measurement: both tenants printed "2 comments ·
   * someone said they were moving between brands" in a production render, and
   * always would have, whether the real number was 2 or 200.
   */
  switching: SalesQuote[]
  /** How many comments named a switch in all — taken BEFORE the slice above.
   *  Null where the section could not be read. */
  switchingTotal: number | null
  /** Objections heard under a named rival's videos, by rival. */
  rivalComplaints: SalesGroup[]
  /** Where the grounded answers live. */
  brief: { href: string; label: string }
  /** Set when the loader could not read this section at all — told apart from
   *  "the week was quiet", which is `objections.length === 0` with this null. */
  unread: string | null
}

/** How many objection groups a reader is shown. Three, because the mock draws
 *  three and because the sentence under them promises grounded answers to "the
 *  top three" — a list that grows past the promise is a list nobody reads. */
export const SALES_GROUPS_SHOWN = 3

/** How many quotes hang under one group. Two: enough to show the objection is
 *  not one person, few enough that the section stays a strip. */
export const SALES_QUOTES_PER_GROUP = 2

/** How many switching comments are printed. A DISPLAY CAP, shared by the
 *  loader and the block so neither can mistake it for a count. */
export const SALES_SWITCHING_SHOWN = 2

/** How many pieces of praise are printed. One, and no count is stated off it. */
export const SALES_PRAISE_SHOWN = 1

/** The one honest line when nothing cleared, or null when something did.
 *
 * A STRING, NOT MARKUP, and computed without rendering — the Block contract's
 * `emptyState` (lib/blocks/types.ts), so the page, the report and the email all
 * word one emptiness the same way. */
export function forSalesEmpty(data: ForSalesData): string | null {
  if (data.unread) return data.unread
  const anything =
    data.objections.length > 0 || data.praise.length > 0 ||
    data.switching.length > 0 || data.rivalComplaints.length > 0
  if (anything) return null
  const nothing = 'Nothing this update read was an objection, a switch or a piece of praise worth taking to a customer.'
  // THE TWO REASONS THERE IS NO n ARE DIFFERENT FACTS. A run with no window
  // covered no days; a run with a window whose month reading is not recorded
  // here covered days nobody has counted. Keying both off `videos == null` told
  // a reader with a thirty-day window that the update covered none.
  if (data.window == null) return `${nothing} This update covered no window, so there is nothing to count it against.`
  if (data.videos == null) return `${nothing} The number of videos it covered is not recorded for this workspace yet, so there is nothing to count it against.`
  return nothing
}

/** "grouped by subject" / "grouped by theme, because no subjects are recorded
 *  for this workspace yet" — the sentence that tells a reader what the headings
 *  above the counts actually are. */
export function groupingLine(grouping: SalesGrouping): string {
  return grouping === 'subject'
    ? 'Grouped by the subjects you named.'
    : 'Grouped by theme — the grouping is ours and it can change. Name your subjects in Settings and these become yours.'
}
