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

/**
 * True when this text is about an excluded sense of the name, not the client.
 *
 * The rule is deliberately as simple as it can be stated: an exclusion term
 * appears AND nothing else the client configured does. `brandHits` is every
 * OTHER configured term found in the same text — the product and category words
 * that say the match is really about this brand. One of those present, and the
 * exclusion never fires: "not the volcano, the jacket" keeps its jacket.
 *
 * So this only ever drops a match whose sole evidence is the bare name — the
 * Cotopaxi-the-volcano and Sealand-the-shipping-line class (see the migration
 * 20260911140000_exclude_terms.sql). Everything subtler stays with the LLM
 * relevance gate, which reads the same terms as hints; a blanket text denylist
 * would throw away real comments that merely mention the other sense.
 */
export function excludedByTerms(text: string, brandHits: string[], excludeTerms: string[]): boolean {
  if (brandHits.length > 0) return false
  const hay = fold(text)
  if (hay === '') return false
  return excludeTerms.some((t) => {
    const term = fold(t)
    return term !== '' && hay.includes(term)
  })
}

/** The one text every tag decision reads: account + caption + hashtags. */
export const tagText = (v: TagCandidate): string => [v.account_name, v.caption, ...(v.hashtags ?? [])].join(' ')

/**
 * The bare entity name a tag rests on — the SHORTEST configured brand keyword
 * present (for a client tag), or the matched competitor name.
 *
 * Shortest, not every match: a longer configured form that contains the name
 * ("sealand bags", "cotopaxi jacket") is the strongest possible evidence that
 * this really is the company, so it must stay in the evidence set rather than
 * be struck out of it along with the bare name.
 */
function bareName(hay: string, tag: VideoTags, config: GatherConfig): string | null {
  if (tag.is_competitor && tag.competitor_name) return fold(tag.competitor_name)
  if (!tag.is_client) return null
  let shortest: string | null = null
  for (const k of config.brand_keywords ?? []) {
    const term = fold(k)
    if (term === '' || !hay.includes(term)) continue
    if (shortest === null || term.length < shortest.length) shortest = term
  }
  return shortest
}

/**
 * Configured terms present in the text, other than the bare name.
 *
 * `competitor_keywords` counts here even though the v4.1 rule forbids TAGGING
 * from it: this set never creates a tag, it only decides whether an exclusion
 * may take one away, and "cotopaxi jacket" is exactly the evidence that says
 * the post is about the bag company.
 */
function otherEvidence(hay: string, config: GatherConfig, bare: string | null): string[] {
  const terms = [
    ...(config.brand_keywords ?? []),
    ...(config.competitor_names ?? []),
    ...(config.competitor_keywords ?? []),
    ...(config.industry_keywords ?? []),
  ]
  const out = new Set<string>()
  for (const t of terms) {
    const term = fold(t)
    if (term === '' || term === bare) continue
    if (hay.includes(term)) out.add(term)
  }
  return [...out]
}

/**
 * True when a tag should be taken away because the client says this sense of
 * the name is not them. The one gate both tagging paths run through:
 * `tagVideo` (substring) and the GPT attribution judge's answer
 * (lib/gather/attribution.ts) — the path a real run actually takes.
 */
export function excludedTag(v: TagCandidate, tag: VideoTags, config: GatherConfig): boolean {
  const exclude = config.exclude_terms ?? []
  if (exclude.length === 0) return false
  if (!tag.is_client && !tag.is_competitor) return false
  const text = tagText(v)
  const hay = fold(text)
  const bare = bareName(hay, tag, config)
  if (bare === null) return false
  return excludedByTerms(text, otherEvidence(hay, config, bare), exclude)
}

/**
 * The tag a video keeps once the client's exclusions have had their say — the
 * post-filter both paths run: substring tagging below, and the GPT attribution
 * judge's answer in lib/gather/attribution.ts. A prompt is a request; this is
 * the part that holds whichever way the model answered.
 */
export function tagAfterExclusions(v: TagCandidate, tag: VideoTags, config: GatherConfig): VideoTags {
  return excludedTag(v, tag, config) ? { is_client: false, is_competitor: false, competitor_name: null } : tag
}

/** Single-bucket substring tags (priority client > competitor). */
export function tagVideo(v: TagCandidate, config: GatherConfig): VideoTags {
  const { brand, competitors } = matchEntities(v, config)
  const untagged: VideoTags = { is_client: false, is_competitor: false, competitor_name: null }
  if (!brand && competitors.length === 0) return untagged

  const tags: VideoTags = {
    is_client: brand,
    is_competitor: !brand && competitors.length > 0,
    competitor_name: !brand && competitors.length > 0 ? competitors[0] : null,
  }
  return tagAfterExclusions(v, tags, config)
}
