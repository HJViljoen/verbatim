import { describe, it, expect } from 'vitest'
import { excludedByTerms, matchEntities, tagVideo } from './tagging'
import type { GatherConfig, VideoInsert } from './types'

// The two real homonym cases this exists for:
//   Cotopaxi — a bag brand AND a volcano in Ecuador.
//   Sealand  — a bag brand AND a global container-shipping line (which is how
//              Tunl, a Cape Town shipping company, ended up tagged as Sealand).

const config = (o: Partial<GatherConfig> = {}): GatherConfig => ({
  brand_keywords: ['Sealand'],
  competitor_keywords: [],
  competitor_names: ['Cotopaxi', 'Freitag'],
  industry_keywords: ['backpack', 'jacket', 'bags'],
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

describe('excludedByTerms', () => {
  it('excludes a match whose only evidence is the bare name — Cotopaxi the volcano', () => {
    expect(excludedByTerms('Sunrise hike up Cotopaxi volcano, Ecuador', [], ['volcano', 'Ecuador', 'hostel', 'mineral water'])).toBe(true)
  })

  it('excludes the shipping sense of Sealand — the Tunl case', () => {
    expect(excludedByTerms('Tunl container shipping rates from Cape Town, Sealand routes', [], ['container shipping', 'Tunl', 'Maersk'])).toBe(true)
  })

  it('keeps "not the volcano, the jacket" — another configured term is in the text', () => {
    // The exclusion term IS present. It fires only when nothing else the client
    // configured is, and "jacket" is a category term, so the match stands.
    expect(excludedByTerms('Cotopaxi — not the volcano, the jacket', ['jacket'], ['volcano', 'Ecuador'])).toBe(false)
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
  const cfg = config({ exclude_terms: ['volcano', 'Ecuador', 'container shipping', 'Tunl'] })

  it('leaves a volcano video untagged, though the competitor name is right there', () => {
    const v = video('Climbing Cotopaxi volcano at 5,897m')
    expect(matchEntities(v, cfg).competitors).toEqual(['Cotopaxi'])
    expect(tagVideo(v, cfg)).toEqual({ is_client: false, is_competitor: false, competitor_name: null })
  })

  it('leaves a container-shipping video untagged, though the brand name is right there', () => {
    expect(tagVideo(video('Tunl vs Sealand container shipping to Cape Town'), cfg)).toEqual({
      is_client: false, is_competitor: false, competitor_name: null,
    })
  })

  it('still tags the jacket, volcano word and all', () => {
    expect(tagVideo(video('Cotopaxi — not the volcano, the jacket'), cfg)).toEqual({
      is_client: false, is_competitor: true, competitor_name: 'Cotopaxi',
    })
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
