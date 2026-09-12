import { describe, it, expect } from 'vitest'
import { excludedByTerms, matchEntities, tagAfterExclusions, tagVideo } from './tagging'
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
