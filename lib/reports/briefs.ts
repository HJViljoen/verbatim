import { shortDate } from '../format'
import { ARTEFACT_COPY, isBuildable, type Artefact } from '../settings/artefacts'
import { CADENCE_COPY, type ScheduleCadence } from '../schedules/types'
import type { ReadingStamp, SentFigure } from './archive'
import { AUDIENCES, type Audience } from './types'
import type { DocumentRole } from './documents/types'

/**
 * RP1 — the cards on the Reports page (Phase 1 WP19, decision R).
 *
 * THREE, NOT FOUR. Decision R: "Recommend three (Sales · Marketing · Content)
 * per your revision 7; the Leadership template stays available in the Studio
 * and is the quarterly review's ancestor." So the page offers three and SAYS
 * where the fourth is — a template that exists, is buildable and is simply not
 * on this screen is worth one line, because a reader who has heard of it and
 * cannot find it will assume it was withdrawn.
 *
 * A CARD IS A BRIEF, A CADENCE AND A LIST OF PEOPLE. The cadence and the
 * recipients are `report_schedules`' — one source, two surfaces (Settings ›
 * Reports and recipients is the editor; this is the reader). Nothing here
 * writes: "who receives which artefact" has one editor and it is not this
 * page.
 */

export interface BriefCard {
  /** The document role that writes it — also its template key. */
  role: DocumentRole
  /** The artefact key its schedule and recipients are stored under. */
  artefact: Artefact
  label: string
  what: string
  /** The report row this workspace builds it from, when it has one. */
  reportId: string | null
  /** The newest snapshot of this brief, when there is one. */
  latest: { snapshotId: string; title: string; readingLine: string } | null
  /** In the reader's words — "Every update", "Monthly", or nothing. */
  cadence: string | null
  recipients: string[]
  /** True where a schedule would actually send it today. */
  sending: boolean
  /** False where the schedules could not be read at all. "Not on a schedule"
   *  is an assertion, and a failed read does not support it. */
  scheduleKnown: boolean
  /** Has this workspace EVER built this brief? Off the `reports` row's own
   *  `latest_snapshot_id`, which is uncapped — true, false where the row exists
   *  and names nothing, null where there is no row at all. */
  everBuilt: boolean | null
  /** How many rows the builds list actually searched, where the workspace holds
   *  more (`listCap`); null where it searched everything. */
  poolCappedAt: number | null
  /** The artboard's tinted role pill, in the product's OWN words (Block D wave
   *  2). The mock writes "For the sales lead"; `AUDIENCES[].reader` is what the
   *  cover prompt is actually handed and what the Studio stores, so the pill
   *  reads "For the people who talk to customers". Null where the brief's
   *  artefact names no audience. */
  reader: string | null
  /** The artboard's mono month chip, top-right — the month the LAST BUILD read,
   *  with "(still filling)" kept. A bare "September" on a month that is still
   *  filling lets a reader take a part-month for a month (mock-gap §3.8), and
   *  the month is the build's, never the calendar's: a brief built on 2 October
   *  for September says September. */
  monthChip: string | null
  /** The artboard's four-row inner block: the figures the last build actually
   *  froze, keyed by cover slot (`sentFigures`). Empty where there is no build
   *  or the build stored none. */
  figures: SentFigure[]
  /** The PDF the last build produced, for the footer's left-hand action. Null
   *  where no file was stored — a dead control is not drawn. */
  pdf: { id: string; bytes: number; stale: boolean } | null
  /** The artboard's mono footer note, right — when the last one read, short.
   *  Null where there is no build to stamp. */
  stamp: string | null
}

/**
 * The Marketing brief, named once.
 *
 * A BRIEF IS ITS TEMPLATE KEY, NOT ITS AUDIENCE. `reports.audience =
 * 'marketing'` is not unique to it: the starter template
 * `monthly_marketing_review` is an arranged SLIDE report carrying the same
 * audience, and both are set `status: 'built'`. Whichever had the newer
 * `updated_at` won, so the monthly report could introduce a slide deck as "the
 * brief" — with a live share link behind it — while the Reports page, which
 * identifies the same artefact by `template_key` on a `kind = 'document'` row,
 * meant something else. One constant, so the two surfaces cannot disagree.
 */
export const MARKETING_BRIEF = { role: 'market_brief' as DocumentRole, artefact: 'brief:marketing' as Artefact }

/** The three the page draws, in the design's order. */
export const BRIEF_CARDS: readonly { role: DocumentRole; artefact: Artefact }[] = [
  { role: 'sales_brief', artefact: 'brief:sales' },
  MARKETING_BRIEF,
  { role: 'content_brief', artefact: 'brief:content' },
]

/** The fourth, and where it lives. */
export const LEADERSHIP_CARD = { role: 'leadership_brief' as DocumentRole, artefact: 'brief:leadership' as Artefact }

export const LEADERSHIP_LINE =
  'The leadership brief is built in the Studio rather than from here — it is the short management readout: the month in one page, with the method behind it.'

export const briefLabel = (artefact: Artefact): string => ARTEFACT_COPY[artefact].label
export const briefWhat = (artefact: Artefact): string => ARTEFACT_COPY[artefact].what

/**
 * Would a schedule actually send this brief today?
 *
 * THE SAME GATE SETTINGS APPLIES, and it has to be, or one page claims a send
 * another page denies — the rule AGENTS.md states as "a page once claimed 'no
 * email is sent' while Resend sent". `recipientRows` computes
 * `buildable && !paused && active && recipients > 0`, and BUILDABLE_ARTEFACTS
 * is `['weekly', 'monthly', 'quarterly']` — WP18 added `monthly` and WP20
 * `quarterly`, each with its reason beside it in `lib/settings/artefacts.ts`.
 * NO `brief:*` KEY IS IN IT, and that is what this function turns on: nothing
 * in `lib/schedules/run.ts` sends a brief, so an armed `brief:sales` row is a
 * list of people nothing delivers to. Unreachable today in a second way —
 * `report_schedules.artefact` does not exist in production until M8, so every
 * card degrades to "Not on a schedule" — which is why it is cheap to state now
 * rather than after the column lands.
 *
 * The premise used to read "BUILDABLE_ARTEFACTS is ['weekly']", which was true
 * when it was written and false two packages later. The conclusion never moved;
 * the evidence for it did.
 */
export function cardSending(a: {
  artefact: Artefact
  active: boolean
  recipients: readonly string[]
  /** `tracking_configs.report_period`; 'paused' stops every schedule. */
  period: string
}): boolean {
  return isBuildable(a.artefact) && a.active && a.recipients.length > 0 && a.period !== 'paused'
}

/** The cadence in the reader's words, or null where nothing is scheduled. */
export function cadenceWord(cadence: string | null | undefined): string | null {
  if (!cadence) return null
  return CADENCE_COPY.find((c) => c.key === (cadence as ScheduleCadence))?.label ?? cadence
}

/**
 * The line under a card's cadence, in client wording.
 *
 * "NOBODY RECEIVES THIS" IS THE ANSWER THE PAGE EXISTS TO GIVE, and it is the
 * true one on both live workspaces today: every schedule there has zero
 * recipients, so nothing has ever been emailed under any of these names. A
 * card that printed a cadence and left the recipients implied would read as if
 * it were going out.
 */
export function deliveryLine(card: Pick<BriefCard, 'cadence' | 'recipients' | 'sending'> & { scheduleKnown?: boolean }): string {
  // A FAILED READ IS NOT "NOT ON A SCHEDULE". The page degrades rather than
  // throws, so without this the cards assert a fact about delivery that
  // nothing supports — the same class of thing as an empty archive standing in
  // for a broken query (lib/pages/read.ts).
  if (card.scheduleKnown === false) return 'We could not read this workspace’s schedule just now. Try again, or look in Settings › Reports and recipients.'
  if (card.recipients.length === 0) {
    return card.cadence
      ? `${card.cadence} · nobody receives this yet — add people in Settings › Reports and recipients.`
      : 'Not on a schedule. Build it here when you want it, or set a cadence in Settings › Reports and recipients.'
  }
  const who = `${card.recipients.length} ${card.recipients.length === 1 ? 'person' : 'people'}`
  if (!card.sending) return `${card.cadence ?? 'Scheduled'} · ${who} listed, but nothing is being sent yet.`
  return `${card.cadence} · ${who}.`
}

/**
 * What a card says where this workspace has never built one.
 *
 * NO PRICE IN OUR UNIT. It used to end "and costs a model call" — our unit of
 * spend, not the reader's. The reader is not billed in model calls and nothing
 * else on this page prices anything; it is the same sentence class WP18 removed
 * from the monthly artefact (lib/reports/monthly.ts:105-125). The honest
 * warning is about time, and the time is still here.
 */
export const NOT_BUILT_YET = 'Never built for this workspace. Building one takes a few minutes.'

/**
 * The line under a card: when the last one read, or which silence this is.
 *
 * "NEVER BUILT FOR THIS WORKSPACE" IS A CLAIM ABOUT THE WORKSPACE, and the card
 * drew it from `everyBuild.find(b => b.template === role)` over the newest 100
 * `kind='report'` snapshots. That is precisely the defect the archive one
 * section down already fixed — `listCap`, `dateFilterLine` and `emptyGroupLine`
 * exist so it says "none of the ones we looked at" rather than "there are
 * none". The same card could also say "Never built" while offering "Build it in
 * the Studio" for a `reports` row that had been built, because `reportId` comes
 * off the UNCAPPED read.
 *
 * So the uncapped read answers the question the capped one cannot: a `reports`
 * row naming a `latest_snapshot_id` IS a brief this workspace has built,
 * whether or not the snapshot is in the hundred we loaded.
 */
export function latestBriefLine(
  card: Pick<BriefCard, 'latest' | 'everBuilt' | 'poolCappedAt'>,
): string {
  if (card.latest) return card.latest.readingLine
  if (card.everBuilt) return 'Built before — the last one is not among the recent builds we looked at.'
  if (card.poolCappedAt != null) return `Not among the ${card.poolCappedAt} most recent builds we looked at.`
  return NOT_BUILT_YET
}

/**
 * Which audience a brief is written for — the artboard's role pill.
 *
 * THE MAP IS THE ARTEFACT KEY'S, NOT A GUESS FROM THE ROLE. `brief:marketing`
 * and the starter template `monthly_marketing_review` both carry the audience
 * `marketing` (the MARKETING_BRIEF note above), so the join goes one way only:
 * from the artefact this card IS to the audience its cover is written for.
 */
export const BRIEF_AUDIENCE: Readonly<Partial<Record<Artefact, Audience>>> = {
  'brief:sales': 'sales',
  'brief:marketing': 'marketing',
  'brief:content': 'content',
  'brief:leadership': 'leadership',
}

/** "the people who talk to customers" — the reader the cover prompt is handed,
 *  and the words the card's role pill prints. Null where the artefact is not
 *  one of the four briefs. */
export function briefReader(artefact: Artefact): string | null {
  const key = BRIEF_AUDIENCE[artefact]
  if (!key) return null
  return AUDIENCES.find((a) => a.key === key)?.reader ?? null
}

/**
 * The month chip, from the last build's own stamp.
 *
 * Null where the artefact named no month — which is every brief built before
 * WP19 and every arranged report. A chip that fell back to the calendar month
 * would say "September" over figures read in August.
 */
export function briefMonthChip(stamp: ReadingStamp | null): string | null {
  if (!stamp?.month) return null
  return stamp.monthStatus === 'filling' ? `${stamp.month} (still filling)` : stamp.month
}

/**
 * "read as at 16 Sep" — the artboard's mono stamp in the card's footer, right.
 *
 * SHORT, BECAUSE IT SHARES A LINE WITH THE ACTIONS. `readingLine` is the full
 * sentence and the archive prints it; a card footer that carried it would
 * overflow a 389px tile at 1440. The month is already the chip at the top of
 * the same card, so what is left to say is the DAY and which clock it is on —
 * and "built" versus "read as at" is that clock. The mock prints a bare
 * "28 Sep", which says neither.
 */
export function briefStamp(stamp: ReadingStamp | null): string | null {
  if (!stamp) return null
  return stamp.inferred ? `built ${shortDate(stamp.at)}` : `read as at ${shortDate(stamp.at)}`
}

/**
 * The section meta beside "The role briefs" — D14, and it is a correction.
 *
 * The artboard writes "rebuilt with every monthly reading · September built 28
 * Sep". Nothing rebuilds or sends a brief on any cadence:
 * `BUILDABLE_ARTEFACTS` is `['weekly', 'monthly', 'quarterly']` and there is
 * no `sendsBrief` branch in `lib/schedules/run.ts`. A copy claim about
 * behaviour must match the code (AGENTS.md — a page once claimed "no email is
 * sent" while Resend sent), and the date is on each card's own footer, where
 * it belongs, because three cards can be three months old.
 */
export const BRIEFS_META = 'Built when you ask — no cadence rebuilds these yet'

/**
 * What a cleared PDF will do when you ask for it (Block D wave 2 fix pass).
 *
 * `artifacts.stale` means the file is no longer in storage and
 * `/api/artifacts/[id]` re-renders it on the way out — a DIFFERENT file from
 * the one whose bytes were stored, and a render that counts against
 * `EXPORT_DAILY_LIMIT` and can answer 429. The detail pane says this as a
 * clause on the download link ("· rebuilt on download"); a card footer is one
 * row wide and the clause would be truncated there, which is how a warning
 * gets lost. So the card's action drops the size it cannot stand behind and
 * the card's body says the sentence.
 */
export const STALE_PDF_LINE = 'The stored PDF was cleared; downloading it builds the same file again.'
