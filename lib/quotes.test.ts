import { describe, it, expect } from 'vitest'
import {
  createCitedQuotePicker,
  bucketByAudienceId,
  videoBucketOf,
  fetchLiveBucketsByAudience,
  scopeToClientVoices,
  scopeToCompetitor,
  readsAsHeroQuote,
  englishHits,
  createQuotePicker,
  type QuoteRow,
} from './quotes'

// Entity-bucket scoping (teardown 2026-07-09 §Run 1, defect 1): a competitor's
// customers must never speak under a claim about the client. These tests lock
// the rules the pages and Pass D rely on.

const themes = [
  { bucket: 'client', supporting_insight_ids: ['c1', 'c2'] },
  { bucket: 'industry-other', supporting_insight_ids: ['i1'] },
  { bucket: 'competitor:Cotopaxi', supporting_insight_ids: ['k1', 'k2'] },
  { bucket: 'competitor:Patagonia', supporting_insight_ids: ['p1'] },
]
const bucketById = bucketByAudienceId(themes)

describe('scopeToClientVoices', () => {
  it('drops competitor-bucket ids, keeps client + industry', () => {
    expect(scopeToClientVoices(['c1', 'i1', 'k1', 'p1'], bucketById)).toEqual(['c1', 'i1'])
  })

  it('keeps unmapped ids (legacy data is not a competitor voice)', () => {
    expect(scopeToClientVoices(['c1', 'unknown'], bucketById)).toEqual(['c1', 'unknown'])
  })

  it('passes everything through when no bucket map exists (old runs)', () => {
    expect(scopeToClientVoices(['k1'], new Map())).toEqual(['k1'])
  })
})

describe('videoBucketOf — live entity, not a cached one', () => {
  it('reads the client, a named competitor and the rest', () => {
    expect(videoBucketOf({ is_client: true, is_competitor: false, competitor_name: null })).toBe('client')
    expect(videoBucketOf({ is_client: false, is_competitor: true, competitor_name: 'Patagonia' })).toBe('competitor:Patagonia')
    expect(videoBucketOf({ is_client: false, is_competitor: false, competitor_name: null })).toBe('industry-other')
  })

  it('matches Step A2 for a competitor with no name', () => {
    expect(videoBucketOf({ is_client: false, is_competitor: true, competitor_name: null })).toBe('competitor:unknown')
  })
})

describe('fetchLiveBucketsByAudience', () => {
  // Minimal stand-in for the supabase admin client: one `videos` select.
  const clientReturning = (rows: unknown[]) => ({
    from: () => ({ select: () => ({ in: () => Promise.resolve({ data: rows, error: null }) }) }),
  })

  it('maps each insight to its source video\'s CURRENT tags', async () => {
    const admin = clientReturning([
      { id: 'v-client', is_client: true, is_competitor: false, competitor_name: null },
      { id: 'v-patagonia', is_client: false, is_competitor: true, competitor_name: 'Patagonia' },
    ])
    const out = await fetchLiveBucketsByAudience(admin, [
      { id: 'a1', source_video_id: 'v-client' },
      { id: 'a2', source_video_id: 'v-patagonia' },
    ])
    expect(out.get('a1')).toBe('client')
    expect(out.get('a2')).toBe('competitor:Patagonia')
  })

  it('leaves an insight with no source video unmapped', async () => {
    const out = await fetchLiveBucketsByAudience(clientReturning([]), [{ id: 'a1', source_video_id: null }])
    expect(out.has('a1')).toBe(false)
  })
})

describe('the live entity gate (the 2026-09-10 Patagonia answer)', () => {
  it('drops a competitor-sourced insight the stored themes never bucketed', async () => {
    // The bug: 'p2' came off a Patagonia video but the run's themes did not
    // mention it, so scopeToClientVoices kept it and the agent quoted it under
    // "What your customers said".
    const stored = bucketByAudienceId(themes)
    expect(scopeToClientVoices(['c1', 'p2'], stored)).toEqual(['c1', 'p2']) // the old behaviour

    const admin = {
      from: () => ({
        select: () => ({
          in: () => Promise.resolve({
            data: [{ id: 'v9', is_client: false, is_competitor: true, competitor_name: 'Patagonia' }],
            error: null,
          }),
        }),
      }),
    }
    const live = await fetchLiveBucketsByAudience(admin, [{ id: 'p2', source_video_id: 'v9' }])
    const merged = new Map(stored)
    for (const [id, bucket] of live) merged.set(id, bucket)
    expect(scopeToClientVoices(['c1', 'p2'], merged)).toEqual(['c1'])
  })

  it('rescues a client insight whose stored bucket is stale after a re-tag', async () => {
    // The mirror error: the stored bucket says competitor, the video is now
    // tagged as the client's own. Live tags win in both directions.
    const stored = bucketByAudienceId([{ bucket: 'competitor:Cotopaxi', supporting_insight_ids: ['x1'] }])
    expect(scopeToClientVoices(['x1'], stored)).toEqual([])

    const admin = {
      from: () => ({
        select: () => ({
          in: () => Promise.resolve({
            data: [{ id: 'v1', is_client: true, is_competitor: false, competitor_name: null }],
            error: null,
          }),
        }),
      }),
    }
    const live = await fetchLiveBucketsByAudience(admin, [{ id: 'x1', source_video_id: 'v1' }])
    const merged = new Map(stored)
    for (const [id, bucket] of live) merged.set(id, bucket)
    expect(scopeToClientVoices(['x1'], merged)).toEqual(['x1'])
  })
})

describe('scopeToCompetitor', () => {
  it('keeps only the named competitor, case-insensitively', () => {
    expect(scopeToCompetitor(['c1', 'i1', 'k1', 'k2', 'p1'], bucketById, 'cotopaxi')).toEqual(['k1', 'k2'])
  })

  it('falls back to all non-client buckets when the name matches nothing', () => {
    expect(scopeToCompetitor(['c1', 'i1', 'k1'], bucketById, 'Nonexistent Brand')).toEqual(['i1', 'k1'])
  })

  it('never returns the client bucket, and drops unmapped ids', () => {
    expect(scopeToCompetitor(['c1', 'unknown'], bucketById, null)).toEqual([])
  })
})

describe('readsAsHeroQuote', () => {
  it('rejects the run-1 thin-quote class', () => {
    expect(readsAsHeroQuote('Yo quiero 🙌🙌')).toBe(false) // led a run-1 card
    expect(readsAsHeroQuote('❤️🙌😍')).toBe(false)
    expect(readsAsHeroQuote('x'.repeat(200))).toBe(false) // too long for a card
  })

  it('accepts a clear English customer voice', () => {
    expect(readsAsHeroQuote('It gets really heavy to carry on your back')).toBe(true)
    expect(readsAsHeroQuote('Hiii does ur shoulders hurt mine hurt after awhile carrying it')).toBe(true)
  })

  // An accented word must not be scored as English by breaking at its own
  // diacritic: this comment led finding 1 of Össur's leadership brief, on
  // `do` + `a` (from "doía") and the Portuguese article "a" — three "English
  // hits", no English word. The method page promises other languages are read
  // for the counts but not quoted; before this it was quoting them.
  it('rejects accented non-English, which the tokeniser used to score as English', () => {
    expect(readsAsHeroQuote('porem meu pé doía mto ficando nessa posição, tipo não aguentava fica mais de 2h com a prótese, tinha q ficar tirando para movimentar o pé!')).toBe(false)
    expect(readsAsHeroQuote('Hola, quiero saber cuánto cuesta la prótesis y dónde puedo conseguirla en mi país')).toBe(false)
    expect(englishHits('doía')).toBe(0)
  })
})

describe('createQuotePicker', () => {
  const pool = new Map<string, QuoteRow[]>([
    ['c1', [{ quote: 'I love this bag so much, it is my daily carry now', rank: 1, evidenceId: 'ev1' }]],
    ['c2', [{ quote: 'The straps hurt my shoulders after an hour of use', rank: 2, evidenceId: 'ev2' }]],
  ])
  const slugs = new Map([
    ['c1', 'brand_love'],
    ['c2', 'strap_comfort'],
  ])

  it('leads with the pipeline hero and never repeats a voice across cards', () => {
    const pick = createQuotePicker(pool, slugs)
    const first = pick(['c1', 'c2'], 2, 'strap comfort complaints', 'The straps hurt my shoulders after an hour of use')
    expect(first[0]).toBe('The straps hurt my shoulders after an hour of use')
    // Second card: the used hero must not repeat, even as a pool candidate.
    const second = pick(['c1', 'c2'], 2, 'brand loyalty')
    expect(second).not.toContain('The straps hurt my shoulders after an hour of use')
  })
})

describe('createCitedQuotePicker', () => {
  const pool = new Map<string, QuoteRow[]>([
    ['c1', [{ quote: 'I love this bag so much, it is my daily carry now', rank: 1, evidenceId: 'ev1' }]],
    ['c2', [{ quote: 'The straps hurt my shoulders after an hour of use', rank: 2, evidenceId: 'ev2' }]],
  ])
  const slugs = new Map([['c1', 'brand_love'], ['c2', 'strap_comfort']])

  it('returns refs the snapshot can freeze, preferring the on-topic voice', () => {
    const pick = createCitedQuotePicker(pool, slugs)
    const got = pick(['c1', 'c2'], 1, 'strap comfort complaints')
    expect(got).toEqual([{ ref: 'e:ev2', text: 'The straps hurt my shoulders after an hour of use' }])
  })

  it('cites a hero quote through the evidence row that carries the same words, and skips one nothing vouches for', () => {
    const pick = createCitedQuotePicker(pool, slugs)
    const hero = pick(['c1'], 2, 'anything', 'I love this bag so much, it is my daily carry now')
    expect(hero[0]).toEqual({ ref: 'e:ev1', text: 'I love this bag so much, it is my daily carry now' })
    const pick2 = createCitedQuotePicker(pool, slugs)
    const orphan = pick2(['c2'], 1, 'straps', 'A hero quote no evidence row carries')
    expect(orphan).toEqual([{ ref: 'e:ev2', text: 'The straps hurt my shoulders after an hour of use' }])
  })

  it('never repeats a voice across cards', () => {
    const pick = createCitedQuotePicker(pool, slugs)
    const first = pick(['c1', 'c2'], 2, 'bag')
    const second = pick(['c1', 'c2'], 2, 'bag')
    expect(first.length).toBe(2)
    expect(second).toEqual([])
  })
})
