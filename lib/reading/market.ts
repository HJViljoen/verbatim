import { INDUSTRY_AUDIENCE, isRivalAudience } from '../rivals'
import { monthStartOf } from './month-key'

// The market (market-first decision E, plan §4.2, WP1.6).
//
// THE MARKET IS EVERYTHING WE READ EXCEPT THE CLIENT'S OWN POSTS: the category
// plus the videos filed under a brand the client tracks. In September that is
// 655 videos (626 in the category and 29 filed under a tracked brand) and 377
// in August (prod). The market's size, subjects, kinds, mood and brands are
// read on it; themes stay grouped within the category, because themes are
// grouped per audience.
//
// WHY POOL. A video's audience is decided by precedence (the client's own post,
// then a tracked rival's, then the category; lib/rivals.ts), so each video is
// in exactly one audience and a month's audiences add up to distinct videos.
// Pooling the category with the rival audiences means a change to how videos
// are FILED (a re-tag, the attribution judge) moves a video between two
// audiences that are both inside the market, and the market's own figures do
// not move. The re-tag moves about 1–2% of a month; the filing judge can move
// up to about 15% of it (decision E).
//
// SUMS ACROSS AUDIENCES, NEVER ACROSS MONTHS. Pooling adds the audiences of
// ONE month, which are disjoint. Denominators do not add across months
// (AGENTS.md), and nothing here does that.
//
// PURE. The loader reads the per-audience rows (month_denominators, and the
// subject, kind and mood readings) and hands them in.

/** The audiences the market pools: the tracked rivals' and the category's.
 *  Anything that is not a rival key (the client's own posts above all) is left
 *  out, and a key named twice is counted once. */
export const marketAudiences = (rivalAudiences: readonly string[]): string[] => [
  ...new Set(rivalAudiences.filter((a) => isRivalAudience(a))),
  INDUSTRY_AUDIENCE,
]

/** One month of the market. `videos` and `comments` are the pooled market;
 *  `category` and `rivalFiled` are its two parts (videos). Null means not
 *  measured, never zero. */
export interface MarketCount {
  month: string
  videos: number | null
  comments: number | null
  category: number | null
  rivalFiled: number | null
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/**
 * The market's denominators by month, from per-audience denominator rows.
 *
 * A month is present when at least one market audience has a row for it (the
 * reading function emits no row for an audience with no video, so a missing
 * audience in a month that has rows is zero). The client's rows and any
 * audience not tracked are dropped. A row that is not a count (NaN, negative)
 * makes that month's pooled figure null rather than a wrong number. One row per
 * audience-month is the table's key; a repeat is ignored rather than added.
 * Months come back oldest first.
 */
export function pooledDenominators(
  rows: readonly { month: string; audience: string; videos: number; comments: number }[],
  rivalAudiences: readonly string[],
): Map<string, MarketCount> {
  const rivals = new Set(marketAudiences(rivalAudiences).filter((a) => a !== INDUSTRY_AUDIENCE))
  const byMonth = new Map<string, MarketCount>()
  const seen = new Set<string>()
  const add = (a: number | null, b: number): number | null => (a == null || !isCount(b) ? null : a + b)

  for (const r of rows) {
    const isCategory = r.audience === INDUSTRY_AUDIENCE
    if (!isCategory && !rivals.has(r.audience)) continue
    const month = monthStartOf(r.month)
    const key = `${month}\u0000${r.audience}`
    if (seen.has(key)) continue
    seen.add(key)
    const c = byMonth.get(month) ?? { month, videos: 0, comments: 0, category: 0, rivalFiled: 0 }
    c.videos = add(c.videos, r.videos)
    c.comments = add(c.comments, r.comments)
    if (isCategory) c.category = add(c.category, r.videos)
    else c.rivalFiled = add(c.rivalFiled, r.videos)
    byMonth.set(month, c)
  }
  return new Map([...byMonth.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/**
 * One object's pooled side in one month: k summed over the market's audiences,
 * n the market's videos that month (`pooledDenominators`).
 *
 * k IS NULL WHEN IT WAS NOT MEASURED: no market audience has a row for the
 * object that month (a subject named after the back-read has no history, and
 * absence there is "not read", not zero), or a row carries no k (a frozen row
 * read with no panel). A partial sum would print a smaller number as if it were
 * the whole. n is null when the month has no pooled denominator.
 */
export function pooledSide(
  rows: readonly { month: string; audience: string; k: number | null }[],
  counts: ReadonlyMap<string, MarketCount>,
  month: string,
  rivalAudiences: readonly string[],
): { k: number | null; n: number | null } {
  const m = monthStartOf(month)
  const audiences = new Set(marketAudiences(rivalAudiences))
  const seen = new Set<string>()
  let k: number | null = null
  let unknown = false
  for (const r of rows) {
    if (!audiences.has(r.audience) || seen.has(r.audience) || monthStartOf(r.month) !== m) continue
    seen.add(r.audience)
    if (!isCount(r.k)) unknown = true
    else k = (k ?? 0) + r.k
  }
  return { k: unknown ? null : k, n: counts.get(m)?.videos ?? null }
}
