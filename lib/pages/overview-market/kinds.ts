import { MARKET_KIND_LABELS } from '../../calibration'
import { fmtInt } from '../../format'
import { FLAGGED_KIND, KINDS, kindLabel } from '../../reading/kinds'
import { marketAudiences, pooledSide, type MarketCount } from '../../reading/market'
import { monthStartOf } from '../../reading/month-key'
import { MOOD_LABELS, MOODS, type Mood } from '../../reading/mood'
import { SHARE_BAND } from '../../report-bands'

// "What people did in the comments" (market-first WP1.6, plan §2.2 block 4):
// every kind and the four moods, as levels, on the market's base.
//
// POOLED, NOT THE CATEGORY'S (decision E). A kind is read per audience
// (`month_kind_readings`); the market's count is the category's plus the
// tracked brands', over the market's videos that month (`pooledSide`). The
// client's own posts are never in it. The mood is the same: the four judged
// counts summed over the market's audiences, over the market's judged videos.
//
// LEVELS ONLY. August sits beside September as a level of its own. Nothing is
// compared (WP1.3 refuses August against September); the block prints the
// pair's one chip at its foot (R3), and no row carries the refusal.
//
// A KIND UNDER 10 VIDEOS IS A COUNT, NEVER A SHARE (§2.12: "What made them
// look 5, under 10, a count only"), and a month under 100 videos prints counts
// throughout (`levelText`'s floor).
//
// PURE.

/** A kind's label on a market page: "Praising it" for praise (decision K),
 *  every other kind as it reads everywhere. */
export const marketKindLabel = (kind: string): string => MARKET_KIND_LABELS[kind] ?? kindLabel(kind)

export interface MarketKindRow {
  kind: string
  label: string
  /** The kind's videos in the market this month; null where not read. */
  k: number | null
  /** The same in the previous month. */
  prevK: number | null
}

export interface MarketMoodRow {
  mood: Mood
  label: string
  k: number | null
  prevK: number | null
}

export interface MarketKinds {
  month: string
  /** The market's videos this month (the kinds' n). */
  n: number | null
  prev: { month: string; n: number | null; judged: number | null } | null
  /** Every kind the pipeline writes except the flagged one (decision T), by k
   *  desc; a kind with no video in either month is left off. */
  kinds: MarketKindRow[]
  /** The market's judged videos this month (the mood's n). */
  judged: number | null
  mood: MarketMoodRow[]
  /** The market pair's refusal, or null. Data only: never printed (T0a). A
   *  block that carries one carries no month before (`kindsPrev`). */
  chip: string | null
}

/** The month before as the block prints it: none where the market pair is
 *  refused, on a block built today or stored before the rule (T0a). */
export function kindsPrev(m: Pick<MarketKinds, 'prev' | 'chip'>): MarketKinds['prev'] {
  return m.chip ? null : m.prev
}

type KindRowIn = { month: string; audience: string; kind: string; videos: number }
type StatsRowIn = { month: string; audience: string; judged: number; positive: number; negative: number; neutral: number; mixed: number }

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** A level's text on the market's base: a share at 100 videos and 10 of the
 *  kind's own, else the count alone (the column head carries the "of N"). */
export function marketLevel(k: number | null, n: number | null): { text: string; kind: 'count' | 'share' } | null {
  if (k == null || n == null || n <= 0) return null
  const minN = SHARE_BAND.minN ?? 100
  const minK = SHARE_BAND.minK ?? 10
  if (n < minN || k < minK) return { text: fmtInt(k), kind: 'count' }
  return { text: `${Math.round((k / n) * 100)}%`, kind: 'share' }
}

function pooledMood(rows: readonly StatsRowIn[], month: string, audiences: ReadonlySet<string>): { judged: number | null; counts: Record<Mood, number> | null } {
  const m = monthStartOf(month)
  const seen = new Set<string>()
  const counts: Record<Mood, number> = { positive: 0, mixed: 0, neutral: 0, negative: 0 }
  let judged: number | null = null
  for (const r of rows) {
    if (!audiences.has(r.audience) || seen.has(r.audience) || monthStartOf(r.month) !== m) continue
    seen.add(r.audience)
    if (![r.judged, r.positive, r.mixed, r.neutral, r.negative].every(isCount)) return { judged: null, counts: null }
    judged = (judged ?? 0) + r.judged
    for (const mood of MOODS) counts[mood] += r[mood]
  }
  return judged == null ? { judged: null, counts: null } : { judged, counts }
}

/**
 * The block's data from the rows the page already read (no read of its own).
 * `rivalAudiences` are the tracked rivals' audience keys, the market's other
 * half; `counts` are the pooled denominators by month.
 */
export function buildMarketKinds(input: {
  kindRows: readonly KindRowIn[] | null
  statsRows: readonly StatsRowIn[] | null
  counts: ReadonlyMap<string, MarketCount>
  month: string
  prevMonth: string | null
  rivalAudiences: readonly string[]
  chip: string | null
}): MarketKinds {
  const month = monthStartOf(input.month)
  // A REFUSED PAIR CARRIES NO MONTH BEFORE (T0a, OV-38; the one condition):
  // where the market pair is refused (`chip`), no kind or mood row holds an
  // earlier count, no column names it, and a kind with no video this month
  // is not listed on last month's strength.
  const prevMonth = input.prevMonth && !input.chip ? monthStartOf(input.prevMonth) : null
  const audiences = new Set(marketAudiences(input.rivalAudiences))
  const kindRows = input.kindRows ?? []
  const readIn = (m: string): boolean => kindRows.some((r) => monthStartOf(r.month) === m && audiences.has(r.audience))
  const side = (kind: string, m: string): number | null =>
    pooledSide(
      kindRows.filter((r) => r.kind === kind).map((r) => ({ month: r.month, audience: r.audience, k: r.videos })),
      input.counts,
      m,
      input.rivalAudiences,
      { read: readIn(m) },
    ).k
  const kinds = input.kindRows == null
    ? []
    : KINDS.filter((kind) => kind !== FLAGGED_KIND)
        .map((kind) => ({ kind, label: marketKindLabel(kind), k: side(kind, month), prevK: prevMonth ? side(kind, prevMonth) : null }))
        .filter((r) => (r.k ?? 0) > 0 || (r.prevK ?? 0) > 0)
        .sort((a, b) => (b.k ?? -1) - (a.k ?? -1) || (b.prevK ?? -1) - (a.prevK ?? -1) || a.kind.localeCompare(b.kind))
  const stats = input.statsRows ?? []
  const now = pooledMood(stats, month, audiences)
  const before = prevMonth ? pooledMood(stats, prevMonth, audiences) : { judged: null, counts: null }
  const mood: MarketMoodRow[] = input.statsRows == null || now.counts == null
    ? []
    : MOODS.map((m) => ({ mood: m, label: MOOD_LABELS[m], k: now.counts?.[m] ?? null, prevK: before.counts?.[m] ?? null }))
  return {
    month,
    n: input.counts.get(month)?.videos ?? null,
    prev: prevMonth ? { month: prevMonth, n: input.counts.get(prevMonth)?.videos ?? null, judged: before.judged } : null,
    kinds,
    judged: now.judged,
    mood,
    chip: input.chip,
  }
}
