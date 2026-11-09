import { shortDate } from '../../format'
import { titleFromBody, titleOrBody } from '../../prose/advice-title'

// Your moves' words for a piece of advice that a card, the Dashboard's tile
// and the weekly email's line (lib/reports/weekly-read-lines.ts) all print.
// Pure and import-light ON PURPOSE: the email's line builder takes them
// without loading the page's reader (lib/pages/v2/moves.ts re-exports them).

/** What a piece of advice is called where its stored title AND its body are
 *  blank: a card, a tag or a dated move cannot be nameless (a move's title is
 *  1 to 120 characters). */
export const UNTITLED_ADVICE = 'A piece of advice with no title'

/**
 * The name every surface gives a piece of advice (cards, the conclusions'
 * chips, the Dashboard's tile, the weekly email's line, the advice record, a
 * dated move's default title): its stored title; where that is blank (one
 * of Össur's current pieces, 12 Oct: the slot's scrub dropped it whole), its
 * body's first clause, cut on a word boundary at about 70 characters with an
 * ellipsis (`titleFromBody`, lib/prose/advice-title.ts, the rule the pipeline
 * now stores by too); `UNTITLED_ADVICE` only where both are blank. Pure.
 */
export const adviceTitle = (title: string | null | undefined, body?: string | null): string => titleOrBody(title, body) ?? UNTITLED_ADVICE

/** Where Your moves splits an argument into sentences (`whyLead`,
 *  `argumentParts`). */
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[A-Z“"‘'])/

/**
 * A piece of advice's HEADING and the body under it, said once (9 Nov, the
 * live-data bugs: the third piece on Your moves read "People judge a device
 * by whether they can wear it through work…" over "People judge a device by
 * whether they can wear it through work, clothing, …", the same words twice,
 * the first time cut). Where the title is the body's own first clause (stored
 * blank, or stored as the pipeline derives it, `titleFromBody`), the heading
 * is the body's first sentence, whole and without its full stop, and the body
 * starts after it (null where nothing is left); a title of its own stands
 * over the whole body. A HEADING ONLY: the advice's NAME stays `adviceTitle`
 * wherever it is listed or carried (the record, the crumbs, the Dashboard's
 * tile, the weekly email, a dated move's default title of 1 to 120
 * characters). Pure.
 */
export function adviceHeading(title: string, body: string | null | undefined): { title: string; body: string | null; fromBody: boolean } {
  const text = (body ?? '').replace(/\s+/g, ' ').trim()
  if (!text || title !== titleFromBody(text)) return { title, body: body ?? null, fromBody: false }
  const [first, ...rest] = text.split(SENTENCE_BREAK)
  return { title: first.replace(/\.$/u, ''), body: rest.join(' ') || null, fromBody: true }
}

/** How long the product has been raising one piece of advice, in updates. */
export interface AdviceHistory {
  /** Each update that raised it, oldest first, `YYYY-MM-DD` (the update's own
   *  date: when its advice was written). */
  dates: string[]
  /** Updates in a row, ending with the latest update that carried advice,
   *  that raised it. 0 where the latest update did not. */
  streak: number
  /** The first update of the streak, `YYYY-MM-DD`; null with no streak. */
  since: string | null
  /** The latest updates that carried advice (at most `HISTORY_DOTS`), oldest
   *  first: whether each raised this one. */
  recent: boolean[]
}

/** The streak cell's label: "updates in a row, since 20 Jul". */
export function streakLabel(h: AdviceHistory): string {
  if (h.streak === 0 || !h.since) return h.dates.length === 1 ? 'update raised it' : 'updates raised it'
  return h.streak === 1 ? `update, first raised ${shortDate(h.since)}` : `updates in a row, since ${shortDate(h.since)}`
}
