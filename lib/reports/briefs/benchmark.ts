import { median } from '../../content-tiles'
import { ENGAGEMENT_EXCLUDED, ENGAGEMENT_MIN_VIDEOS } from '../../reading/formats'
import { monthStartOf, nextMonth } from '../../reading/month-key'
import { INDUSTRY_AUDIENCE } from '../../rivals'
import { playbookAudience, type PlaybookVideo } from '../../pages/playbook'

// CONTENT'S MEASURE, PLATFORM BY PLATFORM (the blind-report check, 9 Nov; its
// ranked change 3). "1× is a typical video in your market" was one median
// over every platform but Reddit, and the platforms' rates are not alike:
// TikTok's run about four times YouTube's. So Össur's posts, mostly Instagram
// and TikTok, read 1.3× against a median pulled down by YouTube, where on
// each of its own platforms they read under 1× (0.77× on Instagram, 0.69× on
// TikTok); and a format made mostly on TikTok read high for being on TikTok.
// Here every video is set against a typical CATEGORY video ON ITS OWN
// PLATFORM, published in the month, and a kind's (or a set of posts') figure
// is the median of those multiples. A platform with fewer than
// `ENGAGEMENT_MIN_VIDEOS` rated category videos has no typical video, and its
// videos no multiple.
//
// "BEST THIS MONTH" NEEDS VIEWS. October's best post was 3.8× on 105 views:
// a rate on a hundred views moves with a handful of likes. A post is best
// only with `BEST_MIN_VIEWS` views or more.
//
// PURE.

/** A post is "best this month" only with this many views or more. */
export const BEST_MIN_VIEWS = 1_000

const rateOf = (v: { platform: string; engagement_rate: number | string | null }): number | null => {
  if (ENGAGEMENT_EXCLUDED.includes(v.platform)) return null
  const e = Number(v.engagement_rate)
  return Number.isFinite(e) && e > 0 ? e : null
}
const round1 = (x: number): number => Math.round(x * 10) / 10
const inMonth = (day: string | null, month: string): boolean => {
  const d = (day ?? '').slice(0, 10)
  return d >= monthStartOf(month) && d < nextMonth(monthStartOf(month))
}

/** The category's typical video on each platform: the median rate of its
 *  rated videos published in the month (the Content page's category side,
 *  `clientSide: 'owned'`). A platform under the floor is absent. */
export function platformTypicals(videos: readonly PlaybookVideo[], month: string): Map<string, number> {
  const by = new Map<string, number[]>()
  for (const v of videos) {
    if (playbookAudience(v, 'owned') !== INDUSTRY_AUDIENCE || !inMonth(v.upload_date, month)) continue
    const r = rateOf(v)
    if (r == null) continue
    by.set(v.platform, [...(by.get(v.platform) ?? []), r])
  }
  const out = new Map<string, number>()
  for (const [p, rates] of by) {
    const m = rates.length >= ENGAGEMENT_MIN_VIDEOS ? median(rates) : null
    if (m != null && m > 0) out.set(p, m)
  }
  return out
}

/** A video's rate against the typical video on its own platform, or null. */
export function matchedMultiple(v: { platform: string; engagement_rate: number | string | null }, typicals: ReadonlyMap<string, number>): number | null {
  const r = rateOf(v)
  const t = typicals.get(v.platform)
  return r != null && t != null ? r / t : null
}

/** Each format (or opening) of the category's videos published in the month:
 *  the median of its videos' platform-matched multiples, over at least
 *  `ENGAGEMENT_MIN_VIDEOS` of them; a kind under that has none. */
export function matchedKinds(videos: readonly PlaybookVideo[], month: string, key: 'classified_type' | 'hook_style', typicals: ReadonlyMap<string, number>): Map<string, { multiple: number; rated: number }> {
  const by = new Map<string, number[]>()
  for (const v of videos) {
    if (playbookAudience(v, 'owned') !== INDUSTRY_AUDIENCE || !inMonth(v.upload_date, month)) continue
    const value = v[key]
    if (!value) continue
    const m = matchedMultiple(v, typicals)
    if (m == null) continue
    by.set(value, [...(by.get(value) ?? []), m])
  }
  const out = new Map<string, { multiple: number; rated: number }>()
  for (const [value, ms] of by) {
    const m = ms.length >= ENGAGEMENT_MIN_VIDEOS ? median(ms) : null
    if (m != null) out.set(value, { multiple: round1(m), rated: ms.length })
  }
  return out
}

/** One of the company's posts, as its posts read is kept. */
export interface MatchedPostIn {
  id: string
  platform: string
  upload_date: string
  classified_type: string | null
  engagement_rate: number | string | null
  views: number
}

/** The company's posts against the category, each on its own platform: the
 *  median multiple (over at least `minRated` posts), the same platform by
 *  platform (most posts first), and the post with the highest multiple among
 *  those with `BEST_MIN_VIEWS` views or more. */
export function matchedPosts(posts: readonly MatchedPostIn[], typicals: ReadonlyMap<string, number>, minRated: number): {
  response: { multiple: number; rated: number } | null
  platforms: { platform: string; multiple: number; rated: number }[]
  best: { post: MatchedPostIn; multiple: number } | null
} {
  const rated = posts.map((p) => ({ post: p, multiple: matchedMultiple(p, typicals) })).filter((x): x is { post: MatchedPostIn; multiple: number } => x.multiple != null)
  const all = median(rated.map((x) => x.multiple))
  const byPlatform = new Map<string, number[]>()
  for (const x of rated) byPlatform.set(x.post.platform, [...(byPlatform.get(x.post.platform) ?? []), x.multiple])
  const platforms = [...byPlatform.entries()]
    .map(([platform, ms]) => ({ platform, multiple: round1(median(ms) ?? 0), rated: ms.length }))
    .sort((a, b) => b.rated - a.rated || a.platform.localeCompare(b.platform))
  const best = rated.filter((x) => Number(x.post.views) >= BEST_MIN_VIEWS)
    .sort((a, b) => b.multiple - a.multiple || b.post.upload_date.localeCompare(a.post.upload_date))[0] ?? null
  return {
    response: all != null && rated.length >= minRated ? { multiple: round1(all), rated: rated.length } : null,
    platforms,
    best: best ? { post: best.post, multiple: round1(best.multiple) } : null,
  }
}
