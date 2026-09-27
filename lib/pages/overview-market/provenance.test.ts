import { describe, it, expect } from 'vitest'

import type { KeywordRow } from '../../provenance/searches'
import { foundSplit, fromNewSearches, searchesAddedIn, type ThemeEvidence } from './provenance'

// Sealand's gathers as keyword_performance holds them on staging (the WP0.1
// export and the 26 Sep ruling's first runs): era A from July; r/backpacks
// first run 17 Aug; the 9 Sep 18:17 gather's new terms and r/onebag; the 13
// Sep terms; one platform each keeps it small. The change log, which flips
// r/backpacks from candidate to active on 9 Sep and never logs r/onebag as
// active, is not read at all.
const kp = (run: string, at: string, terms: string[], platform = 'tiktok'): KeywordRow[] =>
  terms.map((keyword) => ({ run_id: run, platform, keyword, created_at: at }))
const KP: KeywordRow[] = [
  ...kp('2039968a', '2026-07-09T13:20:55Z', ['upcycled bag', 'poler', 'eco backpack']),
  ...kp('c704eab3', '2026-08-17T07:04:00Z', ['upcycled bag', 'poler', 'eco backpack']),
  ...kp('c704eab3', '2026-08-17T07:05:00Z', ['r/Backpacks'], 'reddit'),
  ...kp('cb0d97b2', '2026-09-09T18:17:56Z', ['upcycled bag', 'eco backpack', 'sailcloth bag']),
  ...kp('cb0d97b2', '2026-09-09T18:34:00Z', ['r/backpacks', 'r/onebag'], 'reddit'),
  ...kp('5a2ebc43', '2026-09-13T10:12:30Z', ['upcycled bag', 'eco backpack', 'sailcloth bag', 'handmade bag', 'travel gear', 'frtg']),
]

describe('the searches added in a month: first run in it, per keyword_performance', () => {
  it('September: the 9 and 13 Sep terms and r/onebag; never r/backpacks, which has run since 17 Aug', () => {
    expect([...searchesAddedIn('2026-09-01', KP)].sort()).toEqual(['frtg', 'handmade bag', 'r/onebag', 'sailcloth bag', 'travel gear'])
    expect([...searchesAddedIn('2026-08-01', KP)]).toEqual(['r/backpacks'])
  })
})

describe('a theme’s videos found only by searches added in the month', () => {
  const added = searchesAddedIn('2026-09-01', KP)
  const video = (id: string, source_keywords: string[] | null, platform = 'tiktok') => ({ id, platform, video_id: `p-${id}`, source_keywords })

  it('counts a video only when all it was found by is new that month: first terms, source_keywords and gate verdicts', () => {
    const got = fromNewSearches(['v1', 'v2', 'v3', 'v4', 'v5', 'v6'], {
      provenance: [
        { video_id: 'v1', first_terms: ['handmade bag'], first_subreddits: [], method: 'exact' },
        { video_id: 'v2', first_terms: ['travel gear'], first_subreddits: [], method: 'exact' },
        { video_id: 'v3', first_terms: [], first_subreddits: ['r/onebag'], method: 'exact' },
        { video_id: 'v4', first_terms: [], first_subreddits: ['r/backpacks'], method: 'exact' },
        { video_id: 'v5', first_terms: ['frtg'], first_subreddits: [], method: 'ambiguous' },
        { video_id: 'v6', first_terms: ['sailcloth bag'], first_subreddits: [], method: 'reconstructed' },
      ],
      videos: [video('v1', ['handmade bag']), video('v2', ['travel gear', 'upcycled bag']), video('v3', null, 'reddit'), video('v4', null, 'reddit'), video('v5', ['frtg']), video('v6', ['sailcloth bag'])],
      // v6 was also surfaced by a term removed on 9 Sep, as its gate verdict records.
      verdicts: [{ platform: 'tiktok', video_id: 'p-v6', keyword: 'poler' }, { platform: 'tiktok', video_id: 'p-v1', keyword: 'Handmade Bag' }],
    }, added)
    // v1 and v3 count; v2 (an unchanged search too), v4 (r/backpacks), v5 (ambiguous) and v6 (a removed search too) do not.
    expect(got).toEqual({ fromNewSearches: 2, of: 6 })
  })

  it('a video with no evidence stays in the base and is not counted', () => {
    expect(fromNewSearches(['v1', 'v2'], {
      provenance: [{ video_id: 'v1', first_terms: ['handmade bag'], first_subreddits: [] }],
      videos: [],
      verdicts: [],
    }, added)).toEqual({ fromNewSearches: 1, of: 2 })
  })

  it('is not measured (null) with no provenance at all, never zero', () => {
    expect(fromNewSearches(['v1'], { provenance: [], videos: [video('v1', ['handmade bag'])], verdicts: [] }, added)).toBeNull()
    expect(fromNewSearches([], { provenance: [{ video_id: 'v1', first_terms: ['frtg'], first_subreddits: [] }], videos: [], verdicts: [] }, added)).toBeNull()
  })
})

describe('where a subject’s videos were found: before the month, only on its added searches, or no record', () => {
  const video = (id: string, source_keywords: string[] | null, platform = 'tiktok') => ({ id, platform, video_id: `p-${id}`, source_keywords })
  // The six videos above, and three more: one with no evidence at all, one
  // found by a term keyword_performance never logged, one by r/backpacks and
  // the 13 Sep travel gear together.
  const EVIDENCE: ThemeEvidence = {
    provenance: [
      { video_id: 'v1', first_terms: ['handmade bag'], first_subreddits: [], method: 'exact' },
      { video_id: 'v2', first_terms: ['travel gear'], first_subreddits: [], method: 'exact' },
      { video_id: 'v3', first_terms: [], first_subreddits: ['r/onebag'], method: 'exact' },
      { video_id: 'v4', first_terms: [], first_subreddits: ['r/backpacks'], method: 'exact' },
      { video_id: 'v5', first_terms: ['frtg'], first_subreddits: [], method: 'ambiguous' },
      { video_id: 'v6', first_terms: ['sailcloth bag'], first_subreddits: [], method: 'reconstructed' },
      { video_id: 'v8', first_terms: ['sealand gear'], first_subreddits: [], method: 'reconstructed' },
      { video_id: 'v9', first_terms: ['travel gear'], first_subreddits: ['r/Backpacks'], method: 'exact' },
    ],
    videos: [
      video('v1', ['handmade bag']), video('v2', ['travel gear', 'upcycled bag']), video('v3', null, 'reddit'), video('v4', null, 'reddit'),
      video('v5', ['frtg']), video('v6', ['sailcloth bag']), video('v7', null), video('v8', ['sealand gear']), video('v9', null, 'reddit'),
    ],
    verdicts: [{ platform: 'tiktok', video_id: 'p-v6', keyword: 'poler' }, { platform: 'tiktok', video_id: 'p-v1', keyword: 'Handmade Bag' }],
  }
  const IDS = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9']

  it('splits September three ways, the parts adding up to the subject’s videos', () => {
    // added: v1 and v3. before: v2 (upcycled bag), v4 (r/backpacks, run since
    // 17 Aug), v6 (poler, removed on 9 Sep), v9 (r/backpacks beside travel
    // gear). no record: v5 (ambiguous), v7 (no evidence), v8 (a term
    // keyword_performance never logged).
    expect(foundSplit(IDS, EVIDENCE, KP, '2026-09-01')).toEqual({ of: 9, before: 4, added: 2, unrecorded: 3 })
  })

  it('counts as added exactly what the front page’s rule counts, over the same evidence', () => {
    const split = foundSplit(IDS, EVIDENCE, KP, '2026-09-01')!
    expect(split.added).toBe(fromNewSearches(IDS, EVIDENCE, searchesAddedIn('2026-09-01', KP))!.fromNewSearches)
    expect(split.before + split.added + split.unrecorded).toBe(split.of)
  })

  it('reads each month against its own added searches: August added only r/backpacks', () => {
    // In August r/backpacks is the added search, so v4 is added; v2 was also
    // found by upcycled bag, run since July.
    expect(foundSplit(['v2', 'v4'], EVIDENCE, KP, '2026-08-01')).toEqual({ of: 2, before: 1, added: 1, unrecorded: 0 })
  })

  it('does not split a month where a video was found only by a search first run after it', () => {
    // v1 (handmade bag, 13 Sep) read in August: there is a record of its
    // search, so "no record" would be false (staging's August: 13 of Comfort's
    // 28, found only by the 9 Sep searches). v5, ambiguous on the same day's
    // frtg, likewise.
    expect(foundSplit(['v2', 'v4', 'v1'], EVIDENCE, KP, '2026-08-01')).toBeNull()
    expect(foundSplit(['v2', 'v4', 'v5'], EVIDENCE, KP, '2026-08-01')).toBeNull()
    // In September the same videos split: 13 Sep is inside the month.
    expect(foundSplit(['v2', 'v4', 'v1', 'v5'], EVIDENCE, KP, '2026-09-01')).toEqual({ of: 4, before: 2, added: 1, unrecorded: 1 })
  })

  it('is null where there is nothing to split against: no search added in the month, no provenance, no video', () => {
    expect(foundSplit(IDS, EVIDENCE, KP, '2026-10-01')).toBeNull()
    expect(foundSplit(IDS, { ...EVIDENCE, provenance: [] }, KP, '2026-09-01')).toBeNull()
    expect(foundSplit([], EVIDENCE, KP, '2026-09-01')).toBeNull()
  })
})
