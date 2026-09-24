import { describe, it, expect } from 'vitest'
import { excludedByTerms, matchEntities, tagAfterExclusions, tagVideo, tagWithoutJudge } from './tagging'
import type { GatherConfig, VideoInsert } from './types'

// The two real homonym cases this exists for:
//   Cotopaxi — a bag brand AND a volcano in Ecuador.
//   Sealand  — a bag brand AND a global container-shipping line (which is how
//              Tunl, a Cape Town shipping company, ended up tagged as Sealand).
//
// The rule that keeps it from over-firing: an exclusion bites only when the
// text carries no configured term other than the BARE name that earned the tag
// — where "bare" is the single shortest matching brand keyword (or the matched
// competitor name), so a longer configured form containing it ("sealand bags",
// "cotopaxi jacket") still counts as evidence and protects the tag.

/** A plausible real Sealand config, not a fixture tuned to pass. */
const config = (o: Partial<GatherConfig> = {}): GatherConfig => ({
  brand_keywords: ['sealand', 'sealand bags'],
  competitor_keywords: ['cotopaxi jacket', 'freitag bag'],
  competitor_names: ['Cotopaxi', 'Freitag'],
  industry_keywords: ['waterproof backpacks', 'recycled material bags'],
  exclude_terms: [],
  platforms: ['instagram'],
  max_videos: 10,
  comment_depth: 50,
  report_period: 'weekly',
  own_handles: {},
  subreddits: [],
  ...o,
})

const video = (caption: string, account = 'someone'): Pick<VideoInsert, 'account_name' | 'caption' | 'hashtags'> => ({
  account_name: account,
  caption,
  hashtags: [],
})

const EXCLUSIONS = ['volcano', 'Ecuador', 'container shipping', 'Maersk', 'Tunl']
const cfg = config({ exclude_terms: EXCLUSIONS })
const UNTAGGED = { is_client: false, is_competitor: false, competitor_name: null }

describe('excludedByTerms', () => {
  it('excludes a match whose only evidence is the bare name — Cotopaxi the volcano', () => {
    expect(excludedByTerms('Sunrise hike up Cotopaxi volcano, Ecuador', [], ['volcano', 'Ecuador'])).toBe(true)
  })

  it('excludes the shipping sense of Sealand — the Tunl case', () => {
    expect(excludedByTerms('Tunl container shipping rates from Cape Town, Sealand routes', [], ['container shipping', 'Tunl'])).toBe(true)
  })

  it('keeps a match with any other configured term in the text', () => {
    expect(excludedByTerms('Cotopaxi — not the volcano, the jacket', ['cotopaxi jacket'], ['volcano'])).toBe(false)
  })

  it('keeps everything when no exclusion term appears', () => {
    expect(excludedByTerms('Cotopaxi Allpa 35L review', [], ['volcano', 'Ecuador'])).toBe(false)
  })

  it('keeps everything when nothing is configured', () => {
    expect(excludedByTerms('Cotopaxi volcano', [], [])).toBe(false)
  })

  it('matches accent- and case-insensitively, like every other tag match', () => {
    expect(excludedByTerms('ÉCUADOR travel diary', [], ['ecuador'])).toBe(true)
  })
})

describe('tagVideo with exclusions', () => {
  it('leaves a volcano video untagged, though the competitor name is right there', () => {
    const v = video('Climbing Cotopaxi volcano at sunrise')
    expect(matchEntities(v, cfg).competitors).toEqual(['Cotopaxi'])
    expect(tagVideo(v, cfg)).toEqual(UNTAGGED)
  })

  it('leaves a container-shipping video untagged, though the brand name is right there', () => {
    expect(tagVideo(video('Tunl vs Sealand container shipping to Cape Town'), cfg)).toEqual(UNTAGGED)
  })

  // The two false drops the fresh-eyes review probed. Both are genuine posts
  // about the companies that happen to name an excluded sense.
  it('keeps a genuine brand post that mentions an excluded sense — "Sealand bags … Maersk crates"', () => {
    expect(tagVideo(video('Sealand bags review — tougher than the Maersk crates'), cfg).is_client).toBe(true)
  })

  it('keeps a genuine competitor post that mentions an excluded sense — "Cotopaxi jacket … Ecuador"', () => {
    expect(tagVideo(video('Cotopaxi jacket review — made in Ecuador, worn all winter'), cfg)).toEqual({
      is_client: false, is_competitor: true, competitor_name: 'Cotopaxi',
    })
  })

  it('keeps a competitor post whose evidence is a category term', () => {
    expect(tagVideo(video('Cotopaxi waterproof backpacks review, hiked Ecuador with it'), cfg).is_competitor).toBe(true)
  })

  it('still drops the tag when the only other word is one the client never configured', () => {
    // The honest residual: "jacket" alone is not evidence unless the client
    // tracks it. Fail-soft — the video stays in the corpus as category
    // content, it only loses its entity tag. The card's copy says as much.
    expect(tagVideo(video('Cotopaxi anorak — bought it in Ecuador'), cfg)).toEqual(UNTAGGED)
  })

  it('still tags the brand when no exclusion term is in the text', () => {
    expect(tagVideo(video('Sealand backpack review'), cfg).is_client).toBe(true)
  })

  it('changes nothing for a client that declared no exclusions', () => {
    expect(tagVideo(video('Climbing Cotopaxi volcano'), config())).toEqual({
      is_client: false, is_competitor: true, competitor_name: 'Cotopaxi',
    })
  })
})

// The GPT attribution judge's answer runs through the same gate before it is
// stored — this is the path a real run takes (gather.ts: attribution ?? 'gpt').
describe('tagAfterExclusions — the post-filter over the attribution judge', () => {
  const CLIENT = { is_client: true, is_competitor: false, competitor_name: null }
  const COMPETITOR = { is_client: false, is_competitor: true, competitor_name: 'Cotopaxi' }

  it('drops a GPT-confirmed brand tag whose only evidence is the bare name', () => {
    expect(tagAfterExclusions(video('Sealand line, Maersk feeder service out of Durban'), CLIENT, cfg)).toEqual(UNTAGGED)
  })

  it('drops a GPT-confirmed competitor tag on the volcano', () => {
    expect(tagAfterExclusions(video('Climbing Cotopaxi volcano at sunrise'), COMPETITOR, cfg)).toEqual(UNTAGGED)
  })

  it('leaves a GPT-confirmed tag alone when the text carries other configured evidence', () => {
    expect(tagAfterExclusions(video('Sealand bags review — tougher than the Maersk crates'), CLIENT, cfg)).toEqual(CLIENT)
  })

  it('leaves an untagged verdict untagged and never invents a tag', () => {
    expect(tagAfterExclusions(video('Climbing Cotopaxi volcano'), UNTAGGED, cfg)).toEqual(UNTAGGED)
  })

  it('is a no-op for a client with no exclusions', () => {
    expect(tagAfterExclusions(video('Climbing Cotopaxi volcano'), COMPETITOR, config())).toEqual(COMPETITOR)
  })
})

// What a video is tagged when the attribution judge gave no verdict for it (a
// failed batch, a skipped index). The substring tag it used to get is how a
// 400 on one cut emoji turned every "Freitag 21.8.2026" into a rival post.
describe('tagWithoutJudge — the strict fallback', () => {
  /** Sealand's 2026-09-17 terms (scripts/sealand-config-2026-09-17.ts). */
  const sealand = config({
    brand_keywords: ['sealand gear', '#sealandgear', 'sealand bag'],
    competitor_names: ['Cotopaxi', 'Freitag', 'Rareform', 'The North Face', 'Patagonia', 'Freedom of Movement', 'Old School'],
    competitor_keywords: ['cotopaxi backpack', 'freitag bag', 'frtg', 'rareform bag', 'north face backpack', 'patagonia black hole', 'fombrand'],
    exclude_terms: ['ecuador', 'volcano'],
  })
  const rival = (name: string) => ({ is_client: false, is_competitor: true, competitor_name: name })
  const CLIENT = { is_client: true, is_competitor: false, competitor_name: null }

  it('tags the client on a brand keyword', () => {
    expect(tagWithoutJudge(video('first trip with my sealand bag'), sealand)).toEqual(CLIENT)
    expect(tagWithoutJudge(video('restock day #sealandgear'), sealand)).toEqual(CLIENT)
  })

  it('tags a competitor only through a configured keyword that contains its name', () => {
    expect(tagWithoutJudge(video('my freitag bag after five years'), sealand)).toEqual(rival('Freitag'))
    expect(tagWithoutJudge(video('Cotopaxi backpack review'), sealand)).toEqual(rival('Cotopaxi'))
    expect(tagWithoutJudge(video('the patagonia black hole duffel'), sealand)).toEqual(rival('Patagonia'))
  })

  it('leaves a bare name untagged — the homonyms the judge exists for', () => {
    expect(tagWithoutJudge(video('Freitag 21 .8.2026'), sealand)).toEqual(UNTAGGED)
    expect(tagWithoutJudge(video('Freitag ❤️🫶 #food #reels'), sealand)).toEqual(UNTAGGED)
    expect(tagWithoutJudge(video('Patagonia road trip, week two'), sealand)).toEqual(UNTAGGED)
    // …which tagVideo, the old fallback, would have called a rival post.
    expect(tagVideo(video('Freitag 21 .8.2026'), sealand)).toEqual(rival('Freitag'))
  })

  it('never tags from a keyword that does not contain a name — frtg, fombrand', () => {
    expect(tagWithoutJudge(video('frtg drop'), sealand)).toEqual(UNTAGGED)
    expect(tagWithoutJudge(video('fombrand new season'), sealand)).toEqual(UNTAGGED)
  })

  // THE TRUE BEHAVIOUR, NOT A LOOSENED RULE. "north face backpack" does not
  // contain "the north face", so it vouches for nobody: without a judge, The
  // North Face is never tagged. That is the cost of the rule, stated here.
  it('never tags The North Face without a judge — its keyword does not contain its name', () => {
    expect(tagWithoutJudge(video('The North Face north face backpack review'), sealand)).toEqual(UNTAGGED)
  })

  it('still lets the client’s exclusions have the last word', () => {
    // A brand keyword with an exclusion term and nothing else configured.
    expect(tagWithoutJudge(video('sealand bag at the volcano'), config({
      brand_keywords: ['sealand bag'], exclude_terms: ['volcano'],
    }))).toEqual(UNTAGGED)
    // The competitor keyword IS other evidence, so this one keeps its tag.
    expect(tagWithoutJudge(video('cotopaxi backpack on the volcano, Ecuador'), sealand)).toEqual(rival('Cotopaxi'))
  })
})
