import { INSIGHT_CATEGORIES } from '../pipeline/schemas'
import { SHARE_BAND, type BandOptions } from '../report-bands'
import { monthChange, type SeriesPoint } from './bands'
import type { PlatformMix } from './types'
import type { Verdict, VerdictFlag } from './verdicts'

// The kind mix: what the conversation in an audience was ABOUT, month by month
// (design item 10, decision T).
//
// A SET OF INDEPENDENT SHARES OF ONE DENOMINATOR, NOT A COMPOSITION. This is
// the whole rule and every surface has to obey it. A video carries several
// kinds at once — a comment thread holds a question and a complaint and a bit
// of praise — so the per-kind DISTINCT video counts over one month's
// denominator sum to 175% on Össur's category in September 2026 (680 kind-
// videos over 388 videos) and 228% on Sealand's. There is no pie, no stacked
// bar and no "other" slice that makes the rest add up: each kind is "N of the
// month's M videos carried one", read on its own, and the design's unit rule
// forbids the video x kind denominator that would make them sum to 100.
//
// THE MOCK CANNOT BE REPRODUCED AND SHOULD NOT BE. It prints six labels summing
// to exactly 100% ("questions 34% · praise 28% · complaints 19% · wanting to
// buy 9% · objections 6% · switching 4%"). Three of the ten kinds it has no
// label for at all, one of them — demographic_signal — is Össur's fourth
// largest, and "complaints" is not a value the pipeline writes. The labels
// below are the ten, in the client's words.
//
// A KIND IS COMPARABLE ACROSS A CLUSTERING BOUNDARY AND A THEME IS NOT.
// `audience_insights.category` is an enum the Pass A writer emits; re-grouping
// insights into themes cannot move one from `question` to `praise`. So the kind
// series needs no run equality to be read across, which is why
// `monthly_kind_readings` takes no `p_run` and why `monthChange` is called here
// without a clustering key rather than with an unknown one — an unknown key
// would earn the `clustering_unknown` caveat on every comparison, and on this
// series that caveat would be false.

/** The ten kinds, from the pipeline's own enum so the vocabulary cannot drift
 *  from what Pass A writes. `KIND_SET` in lib/reading/anomaly.ts is the same
 *  list for the same reason. */
export const KINDS: readonly string[] = INSIGHT_CATEGORIES

/**
 * The ten kinds in the client's words.
 *
 * Calibrated copy (lib/calibration.ts): no pipeline vocabulary, no enum value
 * shown to a reader, and each label says what the PERSON was doing rather than
 * what the classifier called it. Nine of the ten already had a label at
 * lib/voice-tiles.ts:301-312 and four of those are pipeline-flavoured nouns
 * ("Demographic", "Switching", "Purchase intent", "Misinformation"); those are
 * re-said here. `misinformation` folds under "Getting it wrong" and, per
 * decision T, is presented as flagged rather than as a kind of its own on a
 * surface that ranks kinds — it is 1 insight on Össur and 0 on Sealand, so a
 * row for it is a row about our classifier, not about the category.
 */
export const KIND_LABELS: Record<string, string> = {
  question: 'Asking how it works',
  pain_point: 'Hitting a problem',
  praise: 'Saying it worked',
  purchase_intent: 'Ready to buy',
  objection: 'Pushing back',
  feature_request: 'Asking for something',
  demographic_signal: 'Saying who they are',
  switching_signal: 'Leaving for something else',
  buying_trigger: 'What made them look',
  misinformation: 'Getting it wrong',
}

/** The kind the design folds under "flagged" rather than ranking beside the
 *  rest (decision T). One insight of it exists on either tenant. */
export const FLAGGED_KIND = 'misinformation'

/** Reading order when a surface shows all of them: the biggest questions a
 *  buyer has first, the record-keeping kinds last. A surface that sorts by
 *  share ignores this; a surface that shows a fixed ladder uses it. */
export const KIND_ORDER: readonly string[] = [
  'question',
  'pain_point',
  'praise',
  'purchase_intent',
  'objection',
  'feature_request',
  'buying_trigger',
  'switching_signal',
  'demographic_signal',
  'misinformation',
]

/** What a reader is shown for a kind. Never a key. An unknown kind — the enum
 *  grows, and it has once — degrades to its own value in sentence case rather
 *  than being dropped. */
export const kindLabel = (kind: string): string =>
  KIND_LABELS[kind] ?? kind.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

/** The numbers a kind row needs to be read. `KindReading` satisfies it; the
 *  structural type keeps this module free of the I/O one. */
export interface KindRow {
  kind: string
  videos: number
  comments?: number
  platform_mix?: PlatformMix
}

/** One kind, read against a month's denominator. */
export interface KindShare {
  kind: string
  label: string
  /** The kind's distinct videos in this audience-month. */
  videos: number
  /** The audience's videos that month — `month_denominators.videos`. The same
   *  n for every kind in the set, which is what makes the shares comparable
   *  with each other and incomparable with a composition. */
  denominator: number
  /** `videos / denominator` as a percentage, one decimal. Null when there is no
   *  denominator: a share of nothing is not 0%, it is no reading. */
  pct: number | null
  /** Of this kind's videos, the ones that are Reddit threads. Null when the row
   *  carried no platform mix. */
  reddit: number | null
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * The month's kind mix: every kind the month produced, against one denominator.
 *
 * A kind with no row does not appear. That is deliberate and it is not the same
 * as a zero: "nobody asked a question this month" and "we have no reading of
 * questions this month" are different sentences, and only the caller knows
 * which of the two a surface wants to print. Pass `includeZero` with the set to
 * show to get the other one.
 */
export function kindShares(
  rows: readonly KindRow[],
  denominator: number | null | undefined,
  opts: { includeZero?: readonly string[] } = {},
): KindShare[] {
  const n = denominator ?? 0
  const byKind = new Map(rows.map((r) => [r.kind, r]))
  const kinds = opts.includeZero ? [...new Set([...opts.includeZero, ...byKind.keys()])] : [...byKind.keys()]
  const order = (k: string) => {
    const i = KIND_ORDER.indexOf(k)
    return i < 0 ? KIND_ORDER.length : i
  }
  return kinds
    .map((kind) => {
      const row = byKind.get(kind)
      const videos = row?.videos ?? 0
      return {
        kind,
        label: kindLabel(kind),
        videos,
        denominator: n,
        pct: n > 0 ? round1((videos / n) * 100) : null,
        reddit: row?.platform_mix ? (row.platform_mix.reddit ?? 0) : null,
      }
    })
    .sort((a, b) => order(a.kind) - order(b.kind) || b.videos - a.videos || a.label.localeCompare(b.label))
}

/** The shares as a reader would sum them, for the one line that has to say so:
 *  "these add to more than the month because a video carries several". Never a
 *  denominator, never printed as a total. */
export const kindMixTotalPct = (shares: readonly KindShare[]): number =>
  round1(shares.reduce((s, k) => s + (k.pct ?? 0), 0))

export interface KindChangeInput {
  kind: string
  /** The audience key this month is filed under — and, with no
   *  `prevAudience`, the key both months are filed under. */
  audience: string
  /** The key the PREVIOUS month was filed under, when it differs. A rival
   *  renamed between the two months gives one line two keys, and the shared
   *  rule refuses a comparison across that break (`monthChange`, decision L):
   *  the record cannot say whether the kind's share moved or the string did.
   *  Without this the two sides always carried one key, the rename arm could
   *  never fire, and a kind comparison printed a band where the theme series
   *  refuses one. Omitted, the months are two readings of one name. */
  prevAudience?: string
  /** This month: the kind's videos and the audience's. */
  curr: { month: string; videos: number | null; k: number | null }
  /** The month before it. */
  prev: { month: string; videos: number | null; k: number | null }
  floor?: BandOptions
  flags?: VerdictFlag[]
}

/**
 * Did this kind's share of the month move?
 *
 * `monthChange` with the object kind fixed, and with NO clustering key on
 * either side — see the head of this file. Everything else is the shared rule:
 * `proportionDelta`, `SHARE_BAND`'s two floors, the month's video count as n.
 * On today's corpus that answers `too_little_data` on every audience but the
 * category, which is the honest reading and what the Phase 0 coverage
 * measurement predicted.
 */
export function kindChange(input: KindChangeInput): Verdict {
  const point = (p: KindChangeInput['curr'], audience: string): SeriesPoint => ({
    month: p.month,
    videos: p.videos,
    k: p.k,
    audience,
  })
  const verdict = monthChange({
    object: { kind: 'kind', id: input.kind, label: kindLabel(input.kind) },
    audience: input.audience,
    curr: point(input.curr, input.audience),
    prev: point(input.prev, input.prevAudience ?? input.audience),
    floor: input.floor ?? SHARE_BAND,
    flags: input.flags,
  })
  // THE ONE THING STRIPPED, AND WHY IT IS STRIPPED HERE RATHER THAN FAKED
  // UPSTREAM. `monthChange` reads the two months' clustering keys and, finding
  // neither (this series carries none), flags `clustering_unknown` — "nobody
  // recorded the grouping these two readings were taken under". On a theme that
  // is the honest caveat and on today's corpus it is on nearly every
  // comparison. On a KIND it is simply false: there is no grouping, so there is
  // nothing for a reader to be warned about. The alternative — handing both
  // points one invented key so the shared rule sees one regime — would write a
  // fiction into the comparison to get a true answer out of it.
  const regime = new Set<VerdictFlag>(['clustering_changed', 'clustering_unknown'])
  return { ...verdict, flags: verdict.flags.filter((f) => !regime.has(f)) }
}

// ---- The seam with the anomaly check ----------------------------------------

/**
 * One pre-registered kind, in the shape the weekly check already takes.
 *
 * The check pre-registers all ten kinds every week (`KIND_SET`,
 * lib/reading/anomaly.ts) and today nothing produces their per-month counts:
 * the only per-kind comment-dated read in the repo is
 * scripts/coverage-report.ts's, which is script-only and pools every audience
 * together. This is the adapter that closes that, so WP8 builds its week from
 * the same rows the chart draws and a flag and a chart can never disagree.
 *
 * `months` are the trailing baseline months' counts for this kind, keyed the
 * same way the denominator series is keyed; a month the kind is absent from may
 * be omitted, which the check reads as zero of that month's videos.
 */
export function preRegisteredKind(input: {
  kind: string
  audience: string
  weekVideos: number
  months: readonly { month: string; videos: number }[]
}): {
  kind: 'kind'
  id: string
  label: string
  denominator: string
  weekVideos: number
  months: readonly { month: string; videos: number }[]
} {
  return {
    kind: 'kind',
    id: input.kind,
    label: kindLabel(input.kind),
    denominator: input.audience,
    weekVideos: input.weekVideos,
    months: input.months,
  }
}

// ---- The Reddit clause -------------------------------------------------------

/** The kinds VO1's Reddit sentence is about: the two where a threaded,
 *  text-first platform would change what the answer looks like. */
export const REDDIT_READ_KINDS: readonly string[] = ['question', 'objection']

/** Of one kind's videos, the share that are Reddit threads. Exact: the platform
 *  mix counts each video once. Null when the row carried no mix or no videos. */
export function redditShare(row: KindRow): number | null {
  if (!row.platform_mix || row.videos <= 0) return null
  return round1(((row.platform_mix.reddit ?? 0) / row.videos) * 100)
}

export interface RedditRead {
  kinds: readonly string[]
  /** KIND-videos, not distinct videos — see `exact`. */
  videos: number
  reddit: number
  pct: number | null
  /** False whenever more than one kind is pooled. A video carrying both a
   *  question and an objection is counted once in each kind's row, so the
   *  pooled figure is a share of kind-videos and the copy has to say "question
   *  and objection videos" rather than "videos". That is the same unit the
   *  whole block is already in (independent shares of one denominator), and an
   *  exact distinct-video union would need its own grouping in the SQL — which
   *  would be a second denominator on a surface whose entire point is that
   *  there is one. */
  exact: boolean
}

/**
 * "Materially a Reddit read": how much of the questions-and-objections talk
 * arrives as a Reddit thread.
 *
 * WHY THE SENTENCE MATTERS AND WHY IT IS NOT A THROWAWAY. Reddit went from 6.4%
 * to 17.0% of Össur's category denominator in two months, its threads cap at 40
 * stored comments where every other platform caps at 100, and its median stored
 * comment count is nevertheless the HIGHEST of any platform on Sealand (27, vs
 * YouTube's 4). So a block that reads as "your audience asks a lot of
 * questions" may really be reading "we started gathering Reddit", and the only
 * defence is to print the share and let the reader judge.
 */
export function redditRead(rows: readonly KindRow[], kinds: readonly string[] = REDDIT_READ_KINDS): RedditRead {
  const wanted = rows.filter((r) => kinds.includes(r.kind) && r.platform_mix)
  const videos = wanted.reduce((s, r) => s + r.videos, 0)
  const reddit = wanted.reduce((s, r) => s + (r.platform_mix?.reddit ?? 0), 0)
  return {
    kinds,
    videos,
    reddit,
    pct: videos > 0 ? round1((reddit / videos) * 100) : null,
    exact: wanted.length <= 1,
  }
}
