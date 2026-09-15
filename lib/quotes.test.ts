import { describe, it, expect, vi } from 'vitest'
import {
  createCitedQuotePicker,
  bucketByAudienceId,
  fetchLiveBucketsByAudience,
  fetchQuoteTextsByRefs,
  scopeToClientVoices,
  scopeToCompetitor,
  readsAsHeroQuote,
  englishHits,
  createQuotePicker,
  quoteAvailability,
  readableQuote,
  type QuoteRow,
} from './quotes'
import { audienceOf } from './rivals'

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

describe('audienceOf — live entity, not a cached one', () => {
  it('reads the client, a named competitor and the rest', () => {
    expect(audienceOf({ is_client: true, is_competitor: false, competitor_name: null })).toBe('client')
    expect(audienceOf({ is_client: false, is_competitor: true, competitor_name: 'Patagonia' })).toBe('competitor:Patagonia')
    expect(audienceOf({ is_client: false, is_competitor: false, competitor_name: null })).toBe('industry-other')
  })

  it('matches Step A2 for a competitor with no name', () => {
    expect(audienceOf({ is_client: false, is_competitor: true, competitor_name: null })).toBe('competitor:unknown')
  })
})

// Minimal stand-in for the supabase admin client: one `videos` select, paged.
// Every chunked read in lib/quotes.ts is now paged past the 1000-row cap, so a
// fake that answers `.in()` with a promise no longer matches the contract —
// the builder is closed by `.order(...).range(from, to)`.
const clientReturning = (rows: unknown[]) => ({
  from: () => ({
    select: () => ({
      in: () => ({
        order: () => ({ range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }) }),
      }),
    }),
  }),
})

describe('fetchLiveBucketsByAudience', () => {
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

    const admin = clientReturning([{ id: 'v9', is_client: false, is_competitor: true, competitor_name: 'Patagonia' }])
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

    const admin = clientReturning([{ id: 'v1', is_client: true, is_competitor: false, competitor_name: null }])
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

describe('the on-camera quote bonus (WP7a)', () => {
  // Two quotes the scorer cannot separate: same length band, same English
  // hits, neither touches the claim's words, same relevance rank.
  const tie = (over: Partial<QuoteRow> = {}): QuoteRow =>
    ({ quote: 'x', rank: 1, evidenceId: 'e', ...over })
  const A = 'I have been using it every single day and it just works'
  const B = 'I have been using it every single week and it just works'

  it('breaks a tie in favour of the voice that said it on camera', () => {
    const pool = new Map<string, QuoteRow[]>([
      ['c1', [tie({ quote: A, evidenceId: 'ev1' })]],
      ['c2', [tie({ quote: B, evidenceId: 'ev2', source: 'video' })]],
    ])
    const pick = createQuotePicker(pool, new Map())
    expect(pick(['c1', 'c2'], 1, 'unrelated claim wording')).toEqual([B])
    // …and the comment wins the same tie when nothing was said on camera.
    const flat = new Map<string, QuoteRow[]>([
      ['c1', [tie({ quote: A, evidenceId: 'ev1' })]],
      ['c2', [tie({ quote: B, evidenceId: 'ev2' })]],
    ])
    expect(createQuotePicker(flat, new Map())(['c1', 'c2'], 1, 'unrelated claim wording')).toEqual([A])
  })

  it('never beats a clearly better-reading comment', () => {
    // The comment speaks to the claim (+3 per on-topic word); the on-camera
    // line does not. A tie-break must not overturn that.
    const pool = new Map<string, QuoteRow[]>([
      ['c1', [tie({ quote: 'The straps hurt my shoulders after an hour of use', evidenceId: 'ev1' })]],
      ['c2', [tie({ quote: 'I have been using it every single day and it works', evidenceId: 'ev2', source: 'video' })]],
    ])
    const pick = createQuotePicker(pool, new Map())
    expect(pick(['c1', 'c2'], 1, 'straps hurt shoulders')).toEqual(['The straps hurt my shoulders after an hour of use'])
  })

  it('applies the same bonus in the cited picker, with the same refs', () => {
    const pool = new Map<string, QuoteRow[]>([
      ['c1', [tie({ quote: A, evidenceId: 'ev1' })]],
      ['c2', [tie({ quote: B, evidenceId: 'ev2', source: 'video' })]],
    ])
    const pick = createCitedQuotePicker(pool, new Map())
    expect(pick(['c1', 'c2'], 1, 'unrelated claim wording')).toEqual([{ ref: 'e:ev2', text: B }])
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

// What a failed quote read costs depends on who is asking. A render of an
// already-frozen artefact (the digest send, the share link, the PDF) is a one
// shot nobody retries, so it goes out thinner. The build-document freeze step
// is composing the artefact inside a retriable step, so it must not.
describe('fetchQuoteTextsByRefs — the read-failure contract', () => {
  // The builder ends at `.order(...)`; `selectAll` closes it with `.range()`.
  // A PostgREST error on the page is what selectAll turns into a throw.
  const failingOn = (...tables: string[]) => {
    const builder = (fail: boolean): Record<string, unknown> => {
      const b: Record<string, unknown> = {
        range: () =>
          Promise.resolve(
            fail
              ? { data: null, error: { message: 'canceling statement due to statement timeout' } }
              : { data: [{ id: 'ev1', quote: 'I love this bag', comment_id: 'cm1' }], error: null },
          ),
      }
      b.order = () => b
      b.eq = () => b
      b.in = () => b
      return b
    }
    return {
      from: (table: string) => ({ select: () => builder(tables.includes(table)) }),
    }
  }

  it('degrades by default: the refs that failed are simply absent', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = await fetchQuoteTextsByRefs(failingOn('insight_evidence'), ['e:ev1'])
    expect(out.size).toBe(0)
    expect(err.mock.calls[0]?.[0]).toContain('e: (evidence)')
    err.mockRestore()
  })

  it('throws instead when the caller asks it to, naming every read that failed', async () => {
    // Two kinds, two tables, one error: the failures are collected and raised
    // after every read has settled, so no rejection is left unawaited.
    const thrown = await fetchQuoteTextsByRefs(
      failingOn('insight_evidence', 'language_samples'),
      ['e:ev1', 'p:ph1'],
      { onReadError: 'throw' },
    ).then(() => null, (e: unknown) => e as Error)
    expect(thrown).toBeInstanceOf(Error)
    expect(thrown?.message).toContain('2 ref read(s) failed')
    expect(thrown?.message).toContain('e: (evidence)')
    expect(thrown?.message).toContain('p: (customer phrase)')
  })

  it('resolves the same words either way when nothing fails', async () => {
    const admin = failingOn()
    expect(await fetchQuoteTextsByRefs(admin, ['e:ev1'])).toEqual(new Map([['e:ev1', 'I love this bag']]))
    expect(await fetchQuoteTextsByRefs(admin, ['e:ev1'], { onReadError: 'throw' })).toEqual(
      new Map([['e:ev1', 'I love this bag']]),
    )
  })
})

// ---- The one English gate (item 8, decision A, 2026-09-18) ------------------

describe('quoteAvailability — the one English gate', () => {
  const es = 'Me encanta esta pierna, cambió mi vida por completo'
  const en = 'the socket rubs after about an hour of walking'

  it('falls back to the old heuristic where nothing has read the text', () => {
    expect(quoteAvailability({ text: en })).toBe('english')
    expect(quoteAvailability({ text: es })).toBe('untranslated')
  })

  it('takes the cache\'s word over the heuristic in both directions', () => {
    // "Love it 🔥" scores zero English function words and is English.
    expect(quoteAvailability({ text: 'Love it 🔥', lang: 'en', english: null })).toBe('english')
    // A Portuguese comment the heuristic scored as English ("doía" → do + a).
    expect(quoteAvailability({ text: 'me doía mucho a mi', lang: 'pt', english: 'it hurt me a lot' })).toBe('translated')
  })

  it('is untranslated for another language with no rendering yet', () => {
    expect(quoteAvailability({ text: es, lang: 'es', english: null })).toBe('untranslated')
    expect(quoteAvailability({ text: es, lang: 'es', english: '   ' })).toBe('untranslated')
  })

  it('reads a regional tag as English', () => {
    expect(quoteAvailability({ text: 'blah', lang: 'en-GB' })).toBe('english')
  })

  it('readableQuote is everything but untranslated — the "English available" filter', () => {
    expect(readableQuote({ text: es, lang: 'es', english: 'I love this leg, it changed my life' })).toBe(true)
    expect(readableQuote({ text: es, lang: 'es', english: null })).toBe(false)
    expect(readableQuote({ text: en })).toBe(true)
  })
})

describe('readsAsHeroQuote with a reading', () => {
  const es = 'Me encanta esta pierna, cambió mi vida por completo'

  it('still refuses anything outside card length, translated or not', () => {
    expect(readsAsHeroQuote('too short', { lang: 'en' })).toBe(false)
    expect(readsAsHeroQuote('x'.repeat(200), { lang: 'es', english: 'y'.repeat(200) })).toBe(false)
  })

  it('lets a translated quote lead a card, and an untranslated one not', () => {
    expect(readsAsHeroQuote(es)).toBe(false)
    expect(readsAsHeroQuote(es, { lang: 'es', english: 'I love this leg, it changed my life completely' })).toBe(true)
    expect(readsAsHeroQuote(es, { lang: 'es', english: null })).toBe(false)
  })
})

describe('the picker, once a quote can be read', () => {
  const slugs = new Map<string, string>()
  const untranslated: QuoteRow[] = [
    { quote: 'Me encanta esta pierna, cambió mi vida por completo', rank: 1, evidenceId: 'ev-es' },
  ]
  const translated: QuoteRow[] = [
    { ...untranslated[0], lang: 'es', english: 'I love this leg, it changed my life completely' },
  ]

  it('rejects a non-English quote nothing has read — today\'s behaviour, unchanged', () => {
    const pick = createCitedQuotePicker(new Map([['a1', untranslated]]), slugs)
    expect(pick(['a1'], 2, 'fit and comfort')).toEqual([])
  })

  it('takes it once the cache has an English rendering, and carries the rendering', () => {
    const pick = createCitedQuotePicker(new Map([['a1', translated]]), slugs)
    const out = pick(['a1'], 2, 'fit and comfort')
    expect(out).toEqual([{
      ref: 'e:ev-es',
      text: 'Me encanta esta pierna, cambió mi vida por completo',
      lang: 'es',
      english: 'I love this leg, it changed my life completely',
    }])
  })

  it('carries nothing extra for a quote nothing has read', () => {
    const rows: QuoteRow[] = [{ quote: 'the socket rubs after about an hour of walking', rank: 1, evidenceId: 'ev-en' }]
    const pick = createCitedQuotePicker(new Map([['a1', rows]]), slugs)
    expect(pick(['a1'], 1, 'socket')).toEqual([{ ref: 'e:ev-en', text: 'the socket rubs after about an hour of walking' }])
  })
})
