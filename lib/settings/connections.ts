import { REDDIT_COMMENT_DEPTH_CAP } from '../config'
import { longMonth, platformLabel } from '../format'
import type { MonthStatus, PlatformMix } from '../reading/types'
import type { PendingEdit } from './save-state'

/**
 * The platforms block on Settings › Tracking (Block D wave 2, `settings.platforms`).
 *
 * WHAT WE READ, PER PLATFORM, IN THE CLIENT'S WORDS. The built page carried
 * three of these sentences and Reddit's said something else entirely ("Read by
 * community, not by account."), which is true and is not what the column is
 * for: the column answers "what of this platform reaches you", and for Reddit
 * the answer has two conditions on it that appear on no other platform — a
 * comment cap per thread, and exclusion from every engagement figure. Both are
 * printed, and both are read off the constant that enforces them.
 *
 * NO TOGGLE. The artboard draws a switch per platform; there is no write path
 * for `tracking_configs.platforms` anywhere in the app — it is an operator lever
 * that moves cost directly — so the row keeps the built page's status pill and
 * the artboard's layout. A switch that cannot switch is the one thing this
 * product's settings pages have never had.
 *
 * THE SHARE IS A READING, NOT A COUNT OF ROWS. `month_denominators.platform_mix`
 * for the comment-dated month is the only honest source: counting `videos` over
 * a date span is the re-derivation `lib/reading` exists to stop (AGENTS.md),
 * and a run window would answer a question about our gather cadence. So the
 * share comes off the month, it names the population it is a share OF, and it
 * carries the month's own status — September is `filling`, and a share of a
 * filling month is not a final figure.
 *
 * Pure. The caller reads the month.
 */

/** The four platforms the product reads, in the artboard's order. */
export const TRACKED_PLATFORMS = ['tiktok', 'youtube', 'instagram', 'reddit'] as const

/** What we read on each. Reddit's is composed, because two of its clauses are
 *  constants that can change without anyone editing a sentence. */
export function platformReads(platform: string, communities: number): string {
  switch (platform) {
    case 'tiktok': return 'comments and video captions'
    case 'youtube': return 'comments, titles and spoken word'
    case 'instagram': return 'comments and captions on reels'
    case 'reddit': return `threads in the ${communities} watched communit${communities === 1 ? 'y' : 'ies'} · capped at ${REDDIT_COMMENT_DEPTH_CAP} comments per thread · in no engagement row`
    default: return 'comments'
  }
}

export interface PlatformRow {
  platform: string
  label: string
  reads: string
  connected: boolean
  /** Share of the stated population, 0–100 with one decimal. Null where the
   *  month has not been read — never a zero, which would say the platform
   *  brought nothing. */
  share: number | null
  /** The platform's own videos in that month, where the month was read. */
  videos: number | null
}

export interface PlatformRowsInput {
  /** `tracking_configs.platforms` — what is switched on. */
  platforms: readonly string[]
  /** How many communities the Reddit sentence names. */
  communities: number
  /** `month_denominators.platform_mix` for the month below, or null where the
   *  monthly reading is not applied or the month has no row yet. */
  mix: PlatformMix | null
  /** The population every share is a share OF: that month's videos in the
   *  audience the caller named. */
  videos: number | null
}

export function platformRows(input: PlatformRowsInput): PlatformRow[] {
  const mix = input.mix
  const videos = input.videos ?? 0
  return TRACKED_PLATFORMS.map((platform) => {
    const own = mix ? (mix[platform] ?? 0) : null
    return {
      platform,
      label: platformLabel(platform),
      reads: platformReads(platform, input.communities),
      connected: input.platforms.includes(platform),
      share: own === null || videos <= 0 ? null : Math.round((own / videos) * 1000) / 10,
      videos: own,
    }
  })
}

/**
 * The sentence the share column cannot be printed without: whose videos, in
 * which month, read at what stage of the freeze.
 *
 * D8 — name the population each figure is a share of. "38%" beside TikTok is
 * meaningless until a reader knows it is 38% of your own brand's September
 * videos and that September is still filling.
 */
export function platformShareBasis(args: {
  month: string
  status: MonthStatus
  videos: number | null
  audience: string
  /** True where the READ failed. A different answer from "not read yet", and
   *  the only one of the two that is about us rather than about the month. */
  unread?: boolean
}): string {
  if (args.unread) return PLATFORM_SHARE_UNREAD
  if (args.videos === null) return PLATFORM_SHARE_ABSENT
  const when = longMonth(args.month)
  const state = args.status === 'frozen' ? 'closed' : 'still filling'
  return `share of ${args.audience}’s ${args.videos.toLocaleString('en-GB')} videos in ${when} — dated by the comment, and ${when} is ${state}`
}

/** What stands in its place where the month has not been read. Not a zero, and
 *  not a share computed some other way. */
export const PLATFORM_SHARE_ABSENT =
  'We cannot say how this month splits across the platforms yet — the month has not been read.'

/** And what stands there when the read itself failed. "The month has not been
 *  read" is a claim about the record; this is a claim about the last ten
 *  seconds, and printing the first for the second tells a client something
 *  about their data that nobody checked. */
export const PLATFORM_SHARE_UNREAD =
  'We could not read how this month splits across the platforms just now. Refresh the page, and tell us if it keeps happening.'

// ---- What the form has changed and not yet saved -----------------------------

/**
 * The pending half of the save-state strip, from the form's own state.
 *
 * `saveState` takes the edits as an argument precisely because they are the
 * form's and not a read (lib/settings/save-state.ts); this is the one place
 * that works out what they are, so the rail, the save row and the log cannot
 * describe the same edit three ways.
 *
 * A LIST SAYS HOW MANY, NOT WHICH. "Category: 12 terms → 13 terms" is what a
 * strip 224px wide can carry and is what a reader needs from it; the terms
 * themselves are on the page directly above, already changed.
 *
 * Pure.
 */
export function trackingPending(
  before: TrackingFormState,
  after: TrackingFormState,
): PendingEdit[] {
  const out: PendingEdit[] = []
  const listed = (label: string, a: readonly string[], b: readonly string[]) => {
    if (a.length === b.length && a.every((x, i) => x === b[i])) return
    out.push({ field: label, from: countWords(a), to: countWords(b) })
  }
  listed('Brand terms', before.brand, after.brand)
  listed('Competitor terms', before.competitor, after.competitor)
  listed('Category terms', before.category, after.category)
  listed('Not this', before.exclusions, after.exclusions)
  listed('Rivals', before.rivals, after.rivals)
  if (before.period !== after.period) out.push({ field: 'Cadence', from: before.period, to: after.period })
  if (before.day !== after.day) out.push({ field: 'The day it lands', from: before.day, to: after.day })
  return out
}

export interface TrackingFormState {
  brand: readonly string[]
  competitor: readonly string[]
  category: readonly string[]
  exclusions: readonly string[]
  rivals: readonly string[]
  period: string
  day: string
}

const countWords = (xs: readonly string[]): string =>
  xs.length === 0 ? 'nothing' : `${xs.length} ${xs.length === 1 ? 'entry' : 'entries'}`
