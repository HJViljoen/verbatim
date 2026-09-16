import { ARTEFACT_COPY, isBuildable, type Artefact } from '../settings/artefacts'
import { CADENCE_COPY, type ScheduleCadence } from '../schedules/types'
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
}

/** The three the page draws, in the design's order. */
export const BRIEF_CARDS: readonly { role: DocumentRole; artefact: Artefact }[] = [
  { role: 'sales_brief', artefact: 'brief:sales' },
  { role: 'market_brief', artefact: 'brief:marketing' },
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
 * is ['weekly'] because the send path resolves a due schedule by its starter
 * key: an armed `brief:sales` row would send the WEEKLY REPORT under the sales
 * brief's name. Unreachable today — `report_schedules.artefact` does not exist
 * in production, so every card degrades to "Not on a schedule" — which is why
 * it is cheap to state now rather than after the column lands.
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

/** What a card says where this workspace has never built one. */
export const NOT_BUILT_YET = 'Never built for this workspace. Building one takes a few minutes and costs a model call.'
