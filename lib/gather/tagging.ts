import type { GatherConfig, VideoInsert } from './types'
import { str, fold } from './util'

/** The fields tagging reads — a VideoInsert subset, so DB rows work too. */
export type TagCandidate = Pick<VideoInsert, 'account_name' | 'caption' | 'hashtags'>

export interface VideoTags {
  is_client: boolean
  is_competitor: boolean
  competitor_name: string | null
}

/**
 * Resolve entity tags for a video from its CONTENT, not just its account.
 *
 * Folds account + caption + hashtags into one haystack and matches the brand /
 * competitor NAMES against it. The richest brand & competitor signal lives in
 * other people's content ABOUT the brand/competitor (creator reviews,
 * comparisons), not the brand's own comment-desert account — so account-only
 * tagging left that signal in the industry bucket and starved Pass C. Account
 * stays in the haystack, so this extends account tagging, never regresses it.
 *
 * v4.1 rule (do not regress): `is_client` from `brand_keywords`, `is_competitor`
 * / `competitor_name` from `competitor_names` ONLY. `competitor_keywords` and
 * `industry_keywords` are search-only — using them to tag produced garbage like
 * competitor_name="prosthetic" on industry videos.
 *
 * Single bucket per video (A2 priority: client > competitor): a video that
 * mentions BOTH brand and a competitor tags as both here, but A2 files it under
 * client. Multi-bucket attribution (comparison videos feeding both buckets) is a
 * known future step.
 */
export interface EntityMatches {
  /** A brand keyword appears in the content. */
  brand: boolean
  /** Competitor names (config order) whose text appears in the content. */
  competitors: string[]
}

/**
 * The raw substring matches in a video's content — high recall, no judgment. A
 * name appearing here is only a *candidate*: it may be coincidental ("Freitag" =
 * German "Friday"; "Patagonia"/"Cotopaxi" = regions). The GPT attribution layer
 * (lib/gather/attribution.ts) disambiguates these; tagVideo below is the naive
 * substring tagging that takes the first match at face value.
 */
export function matchEntities(v: TagCandidate, config: GatherConfig): EntityMatches {
  const hay = fold([v.account_name, v.caption, ...(v.hashtags ?? [])].join(' '))
  const brand = (config.brand_keywords ?? []).some((k) => {
    const kw = fold(k)
    return kw !== '' && hay.includes(kw)
  })
  const competitors = (config.competitor_names ?? [])
    .map((c) => str(c))
    .filter((name) => name !== '' && hay.includes(fold(name)))
  return { brand, competitors }
}

/** Single-bucket substring tags (priority client > competitor). */
export function tagVideo(v: TagCandidate, config: GatherConfig): VideoTags {
  const { brand, competitors } = matchEntities(v, config)
  return {
    is_client: brand,
    is_competitor: !brand && competitors.length > 0,
    competitor_name: !brand && competitors.length > 0 ? competitors[0] : null,
  }
}
