import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, buildUserPrompt, indexThemes, thinBuckets, bucketCoverage, MAX_ABOUT_CLAIMS_IN_PROMPT } from './pass-c'
import type { AggregatedTheme } from './types'

// Pins for the v5 claims block: present exactly when competitor claims exist,
// and the claim-less prompt carries no trace of it (data-driven gating — no
// flag; tenants without claims keep an effectively-v4 prompt).

const theme = (over: Partial<AggregatedTheme> = {}): AggregatedTheme => ({
  bucket: 'competitor:cotopaxi',
  category: 'praise',
  theme: 'lifetime_warranty',
  memberThemes: [],
  supportingVideoIds: ['v1'],
  meanStrength: 7,
  rankScore: 1,
  supportingInsightIds: ['i1'],
  evidenceCount: 3,
  videoEvidenceCount: 0,
  strengthScore: 7,
  dominantEmotion: 'excited',
  dominantSentimentImpact: 'positive',
  singleSource: false,
  sampleDescriptions: [],
  ...over,
})

const tc = { brand_keywords: ['sealand'], competitor_names: ['Cotopaxi'], industry_keywords: [] }
const CLAIM = { competitor: 'Cotopaxi', claim: 'Lifetime warranty on bags', quote: 'They have a lifetime warranty' }
const ABOUT = { competitor: 'Cotopaxi', claim: 'The zips give out after a season', quote: 'the zips gave out after one season', voice: 'about' as const, account: 'berryd treasure' }

describe('pass C v5 claims block', () => {
  it('system prompt gains the claims rules only when claims exist', () => {
    expect(buildSystemPrompt(tc, 'Sealand', true)).toContain('WHAT COMPETITORS SAY')
    expect(buildSystemPrompt(tc, 'Sealand', false)).not.toContain('WHAT COMPETITORS SAY')
  })

  it('user prompt lists claims as [Name] claim — "quote" lines before THEMES', () => {
    const idx = indexThemes([theme()])
    const withClaims = buildUserPrompt(idx, undefined, [CLAIM])
    expect(withClaims).toContain('WHAT COMPETITORS SAY IN THEIR OWN VIDEOS')
    expect(withClaims).toContain('- [Cotopaxi] Lifetime warranty on bags — "They have a lifetime warranty"')
    expect(withClaims.indexOf('WHAT COMPETITORS SAY')).toBeLessThan(withClaims.indexOf('THEMES (1)'))
  })

  it('claim-less user prompt is byte-identical to the pre-claims shape', () => {
    const idx = indexThemes([theme()])
    expect(buildUserPrompt(idx, undefined, [])).toBe(buildUserPrompt(idx, undefined))
    expect(buildUserPrompt(idx, undefined)).not.toContain('WHAT COMPETITORS SAY')
  })
})

describe('thinBuckets + the coverage floor (Tier 1)', () => {
  const sov = {
    client: { videos: 27, views: 0, pct_videos: 5.8 },
    'competitor:Ottobock': { videos: 75, views: 0, pct_videos: 16 },
    'competitor:Freitag': { videos: 4, views: 0, pct_videos: 0.9 },
    'industry-other': { videos: 366, views: 0, pct_videos: 78.2 },
  }

  it('names only the buckets under the floor', () => {
    expect(thinBuckets(sov)).toEqual(['competitor:Freitag'])
  })

  it('is empty when every bucket clears it, and safe with no share data', () => {
    expect(thinBuckets({ client: { videos: 30, views: 0, pct_videos: 50 } })).toEqual([])
    expect(thinBuckets(undefined)).toEqual([])
  })

  it('marks the thin bucket in the prompt and rules it out', () => {
    const prompt = buildUserPrompt([], sov)
    expect(prompt).toContain('competitor:Freitag: 4 videos gathered, 4 analysed (0.9% of corpus)  [TOO THIN TO COMPARE]')
    expect(prompt).toContain('THIN BUCKETS')
    expect(prompt).toContain('is not evidence about that entity')
    // A bucket that clears the floor carries no warning.
    expect(prompt).toContain('competitor:Ottobock: 75 videos gathered, 75 analysed (16% of corpus)\n')
  })

  it('judges thinness on videos we READ, not videos we gathered', () => {
    // The live shape this fixes: Sealand's Freitag bucket is 22 gathered but
    // only 2 produced an insight. Judging on 22 left the floor inert for every
    // real tenant while handing the model a bucket of 2 with no warning.
    const gatheredLooksFine = {
      'competitor:Freitag': { videos: 22, views: 0, pct_videos: 1.3, analysed_videos: 2 },
      'industry-other': { videos: 1462, views: 0, pct_videos: 84.3, analysed_videos: 299 },
    }
    expect(thinBuckets(gatheredLooksFine)).toEqual(['competitor:Freitag'])
    expect(bucketCoverage(gatheredLooksFine['competitor:Freitag'])).toBe(2)
  })

  it('falls back to the gathered count on rows written before analysed_videos', () => {
    expect(bucketCoverage({ videos: 40, views: 0, pct_videos: 10 })).toBe(40)
    expect(bucketCoverage(undefined)).toBe(0)
  })

  it('gives the model evidence and share, never the strongest-member score', () => {
    const t = theme({ bucket: 'competitor:Ottobock', evidenceCount: 15, strengthScore: 9, label: 'Fit problems' })
    const prompt = buildUserPrompt([{ label: 'T1', theme: t }], sov)
    expect(prompt).toContain('heard in 15 videos (20% of its bucket)')
    expect(prompt).not.toContain('strength 9')
  })
})

describe('pass C v6 — the two claim blocks are told apart', () => {
  it('the about block is labelled, rule-lined and carries who said it', () => {
    const idx = indexThemes([theme()])
    const p = buildUserPrompt(idx, undefined, [CLAIM], [ABOUT])
    expect(p).toContain('WHAT OTHERS SAY ABOUT THEM (from transcripts of videos the competitor did NOT post):')
    expect(p).toContain("audience voice, not the competitor's own marketing")
    expect(p).toContain('- [about Cotopaxi, said by berryd treasure] The zips give out after a season — "the zips gave out after one season"')
    // Their own words first, then what others say, then the themes.
    expect(p.indexOf('WHAT COMPETITORS SAY IN THEIR OWN VIDEOS')).toBeLessThan(p.indexOf('WHAT OTHERS SAY ABOUT THEM'))
    expect(p.indexOf('WHAT OTHERS SAY ABOUT THEM')).toBeLessThan(p.indexOf('THEMES (1)'))
  })

  it('an about claim never lands in the own-videos block, and vice versa', () => {
    const idx = indexThemes([theme()])
    const ownOnly = buildUserPrompt(idx, undefined, [CLAIM], [])
    expect(ownOnly).toContain('WHAT COMPETITORS SAY IN THEIR OWN VIDEOS')
    expect(ownOnly).not.toContain('WHAT OTHERS SAY ABOUT THEM')
    // Sealand's real shape: two own claims, 187 about. The own block must not
    // appear at all when nothing was captured from the rival's own videos.
    const aboutOnly = buildUserPrompt(idx, undefined, [], [ABOUT])
    expect(aboutOnly).not.toContain('WHAT COMPETITORS SAY IN THEIR OWN VIDEOS')
    expect(aboutOnly).toContain('WHAT OTHERS SAY ABOUT THEM')
  })

  it('the about block is capped, so a crowd of creators cannot fill the prompt', () => {
    const many = Array.from({ length: MAX_ABOUT_CLAIMS_IN_PROMPT + 9 }, (_, i) => ({ ...ABOUT, claim: `creator claim ${i}` }))
    const p = buildUserPrompt(indexThemes([theme()]), undefined, [], many)
    expect(p).toContain('creator claim 0')
    expect(p).toContain(`creator claim ${MAX_ABOUT_CLAIMS_IN_PROMPT - 1}`)
    expect(p).not.toContain(`creator claim ${MAX_ABOUT_CLAIMS_IN_PROMPT}`)
  })

  it('the system rules arrive per block, and say who is speaking in each', () => {
    const both = buildSystemPrompt(tc, 'Sealand', true, true)
    expect(both).toContain('WHAT COMPETITORS SAY')
    expect(both).toContain('WHAT OTHERS SAY ABOUT THEM')
    expect(both).toContain('Never attribute one of these to the competitor')
    const ownOnly = buildSystemPrompt(tc, 'Sealand', true, false)
    expect(ownOnly).not.toContain('WHAT OTHERS SAY ABOUT THEM')
    const aboutOnly = buildSystemPrompt(tc, 'Sealand', false, true)
    expect(aboutOnly).toContain('WHAT OTHERS SAY ABOUT THEM')
    expect(aboutOnly).not.toContain("A claim is the competitor's marketing voice")
  })

  it('with neither block, the prompt is byte-identical to the claim-less v5 shape', () => {
    const idx = indexThemes([theme()])
    expect(buildUserPrompt(idx, undefined, [], [])).toBe(buildUserPrompt(idx, undefined))
    expect(buildSystemPrompt(tc, 'Sealand', false, false)).toBe(buildSystemPrompt(tc, 'Sealand'))
  })
})
