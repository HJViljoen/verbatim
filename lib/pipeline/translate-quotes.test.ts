import { describe, it, expect } from 'vitest'
import {
  translationTargets, uncachedTargets, targetKey, planQuoteCalls, planQuoteSteps,
  buildQuoteTranslatePrompt, quoteTranslationRows, isMissingQuoteTranslations,
  planQuoteTranslations, translateQuotesBatch,
  type TranslationTarget, type QuoteTranslationOutcome,
} from './translate-quotes'
import { normaliseQuoteText, quoteTextHash } from '../quote-text'

// ---- A fake Supabase, just wide enough for this module's five reads ---------
// select().in().eq().order().range() and upsert(). Everything else throws, so a
// widened read fails loudly here instead of silently returning [].

interface Table { rows: Record<string, unknown>[] }

function fakeAdmin(tables: Record<string, Table>, opts: { missing?: string[] } = {}) {
  const missing = new Set(opts.missing ?? [])
  const upserts: { table: string; rows: Record<string, unknown>[] }[] = []
  const client = {
    upserts,
    from(table: string) {
      if (missing.has(table)) {
        const err = { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` }
        const dead = {
          select: () => dead, in: () => dead, eq: () => dead, order: () => dead,
          range: async () => ({ data: null, error: err }),
          then: undefined,
        }
        return {
          select: () => dead,
          upsert: async () => ({ error: err }),
        }
      }
      let rows = [...(tables[table]?.rows ?? [])]
      let cols: string[] = []
      const q = {
        select(c: string) { cols = c.split(',').map((s) => s.trim()); return q },
        in(col: string, vals: unknown[]) { rows = rows.filter((r) => vals.includes(r[col])); return q },
        eq(col: string, val: unknown) { rows = rows.filter((r) => r[col] === val); return q },
        order(col: string) { rows = [...rows].sort((a, b) => String(a[col]).localeCompare(String(b[col]))); return q },
        async range(from: number, to: number) {
          const page = rows.slice(from, to + 1).map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])))
          return { data: page, error: null }
        },
      }
      return {
        select: (c: string) => q.select(c),
        async insert(row: Record<string, unknown>) {
          (tables[table] ??= { rows: [] }).rows.push(row)
          return { error: null }
        },
        async upsert(newRows: Record<string, unknown>[]) {
          upserts.push({ table, rows: newRows })
          const t = (tables[table] ??= { rows: [] })
          for (const r of newRows) {
            const i = t.rows.findIndex((x) => x.comment_id === r.comment_id && x.text_hash === r.text_hash)
            if (i >= 0) t.rows[i] = r; else t.rows.push(r)
          }
          return { error: null }
        },
      }
    },
  }
  return client as unknown as Parameters<typeof translateQuotesBatch>[0]['admin'] & { upserts: typeof upserts }
}

// ---- A 30-comment corpus: 10 English, 20 in five other languages ------------

const LANGS = [
  { lang: 'es', text: 'Me encanta esta pierna, cambió mi vida por completo' },
  { lang: 'pt', text: 'Alguém sabe quanto custa aqui no Brasil? Preciso muito' },
  { lang: 'de', text: 'Die Passform ist am Anfang wirklich schwierig gewesen' },
  { lang: 'id', text: 'Berapa harganya kak? Saya sangat butuh ini sekarang' },
  { lang: 'zh', text: '這個假肢真的太棒了，完全改變了我的生活' },
]
const ENGLISH = [
  'the socket rubs after about an hour of walking',
  'how long does the battery actually last in the cold',
  'my insurance refused to cover any of it',
  'waiting for my new leg and I cannot wait',
  'the fit was the thing that sold me on it',
]

interface Fixture { comments: Record<string, unknown>[]; evidence: Record<string, unknown>[] }

function corpus(): Fixture {
  const comments: Record<string, unknown>[] = []
  const evidence: Record<string, unknown>[] = []
  for (let i = 0; i < 30; i++) {
    const id = `c${String(i).padStart(2, '0')}`
    const src = i < 20 ? LANGS[i % LANGS.length] : { lang: 'en', text: ENGLISH[i % ENGLISH.length] }
    comments.push({ id, client_id: 'tenant', text: src.text })
    evidence.push({ id: `e${i}`, comment_id: id, quote: src.text, redacted: false, source: 'comment', audience_insight_id: `ai${i}` })
  }
  return { comments, evidence }
}

const tablesFor = (f: Fixture, translations: Record<string, unknown>[] = []) => ({
  audience_insights_current: { rows: f.evidence.map((e) => ({ id: e.audience_insight_id, client_id: 'tenant' })) },
  insight_evidence: { rows: f.evidence },
  comments: { rows: f.comments },
  comment_translations: { rows: translations },
  ai_call_log: { rows: [] },
})

/** The model, faked: it detects by looking the text up in the fixture, and
 *  returns null English for the ones the fixture calls English. */
function fakeModel(calls: { items: number }[] = []) {
  return async (items: readonly { text: string }[]): Promise<QuoteTranslationOutcome> => {
    calls.push({ items: items.length })
    return {
      results: items.map((it, i) => {
        // Detects by the opening words, so an EDITED comment in the same
        // language is still detected as that language.
        const hit = LANGS.find((l) => normaliseQuoteText(it.text).startsWith(normaliseQuoteText(l.text).slice(0, 15)))
        return hit
          ? { n: i + 1, language: hit.lang, english: `EN(${hit.lang}): ${it.text.slice(0, 12)}` }
          : { n: i + 1, language: 'en', english: null }
      }),
      usage: { prompt_tokens: 600, completion_tokens: 400 },
      durationMs: 12,
      prompt: buildQuoteTranslatePrompt(items),
    }
  }
}

describe('the cache key', () => {
  it('is the text, so a re-worded comment is a different row', () => {
    const a = quoteTextHash('Me encanta esta pierna')
    const b = quoteTextHash('Me encanta esta pierna!')
    expect(a).not.toBe(b)
  })

  it('collapses whitespace but keeps case and emoji, which carry the tone', () => {
    expect(quoteTextHash('  it   works \n fine ')).toBe(quoteTextHash('it works fine'))
    expect(quoteTextHash('IT WORKS')).not.toBe(quoteTextHash('it works'))
    expect(quoteTextHash('it works 🔥')).not.toBe(quoteTextHash('it works'))
  })
})

describe('translationTargets', () => {
  it('dedups an excerpt that is the whole comment down to one row', () => {
    const out = translationTargets([
      { commentId: 'c1', text: 'hola amigo' },
      { commentId: 'c1', text: 'hola amigo' },
    ])
    expect(out).toHaveLength(1)
  })

  it('keeps an excerpt that differs from the comment as its own target', () => {
    const out = translationTargets([
      { commentId: 'c1', text: 'hola amigo' },
      { commentId: 'c1', text: 'hola amigo, cuánto cuesta en México?' },
    ])
    expect(out).toHaveLength(2)
    expect(new Set(out.map((t) => t.commentId))).toEqual(new Set(['c1']))
  })

  it('drops the empty quote a counts-not-quotes citation carries', () => {
    expect(translationTargets([
      { commentId: 'c1', text: '' },
      { commentId: 'c1', text: '   ' },
      { commentId: 'c1', text: null },
    ])).toEqual([])
  })
})

describe('uncachedTargets', () => {
  const t = (commentId: string, text: string): TranslationTarget =>
    ({ commentId, text, hash: quoteTextHash(text) })

  it('answers a target only with a row for the same comment AND the same text', () => {
    const targets = [t('c1', 'hola'), t('c2', 'bonjour')]
    const cached = new Set([targetKey(targets[0])])
    expect(uncachedTargets(targets, cached).map((x) => x.commentId)).toEqual(['c2'])
  })

  it('treats an edited comment as uncached — the row under the old hash is not an answer', () => {
    const before = t('c1', 'hola')
    const after = t('c1', 'hola, alguien sabe?')
    expect(uncachedTargets([after], new Set([targetKey(before)]))).toHaveLength(1)
  })
})

describe('planQuoteCalls and planQuoteSteps', () => {
  const many = (n: number): TranslationTarget[] =>
    Array.from({ length: n }, (_, i) => ({ commentId: `c${i}`, text: `t${i}`, hash: `h${i}` }))

  it('caps before batching, so a capped run dispatches whole calls', () => {
    const { calls, deferred } = planQuoteCalls(many(60), { cap: 50, batch: 25 })
    expect(calls.map((c) => c.length)).toEqual([25, 25])
    expect(deferred).toBe(10)
  })

  it('defers nothing under the cap', () => {
    expect(planQuoteCalls(many(10), { cap: 50, batch: 25 }).deferred).toBe(0)
  })

  it('parcels comments one parcel per step, batch × calls-per-step', () => {
    const ids = Array.from({ length: 450 }, (_, i) => `c${i}`)
    expect(planQuoteSteps(ids, { batch: 25, callsPerStep: 8 }).map((b) => b.length)).toEqual([200, 200, 50])
  })
})

describe('buildQuoteTranslatePrompt', () => {
  it('numbers the items and asks for the language and a null for English', () => {
    const p = buildQuoteTranslatePrompt([{ text: 'hola' }, { text: 'bonjour' }])
    expect(p.user).toBe('1. hola\n2. bonjour')
    expect(p.system).toContain('ALREADY ENGLISH')
    expect(p.system).toContain('ISO 639-1')
  })

  it('tells the model to keep the register and never repair the source', () => {
    const p = buildQuoteTranslatePrompt([{ text: 'x' }])
    expect(p.system).toContain('Keep the REGISTER')
    expect(p.system).toContain('NEVER repair the source')
  })
})

describe('quoteTranslationRows', () => {
  const items: TranslationTarget[] = [
    { commentId: 'c1', text: 'hola', hash: 'h1' },
    { commentId: 'c2', text: 'it works', hash: 'h2' },
  ]

  it('writes a translation and caches "already English" as a result', () => {
    const { rows, unplaced } = quoteTranslationRows('tenant', items, [
      { n: 1, language: 'es', english: 'hello' },
      { n: 2, language: 'en', english: null },
    ])
    expect(unplaced).toBe(0)
    expect(rows[0]).toMatchObject({ comment_id: 'c1', text_hash: 'h1', language: 'es', english: 'hello' })
    expect(rows[1]).toMatchObject({ comment_id: 'c2', language: 'en', english: null })
  })

  it('refuses a non-English language with nothing to show — a failed reading, not a verdict', () => {
    const { rows, unplaced } = quoteTranslationRows('tenant', items, [
      { n: 1, language: 'es', english: '   ' },
      { n: 2, language: 'en', english: null },
    ])
    expect(rows.map((r) => r.comment_id)).toEqual(['c2'])
    expect(unplaced).toBe(1)
  })

  it('drops an item number outside the batch and a repeat, and counts them unplaced', () => {
    const { rows, unplaced } = quoteTranslationRows('tenant', items, [
      { n: 1, language: 'es', english: 'hello' },
      { n: 1, language: 'es', english: 'hello again' },
      { n: 9, language: 'fr', english: 'bonjour' },
    ])
    expect(rows).toHaveLength(1)
    expect(unplaced).toBe(1)
  })

  it('normalises the language label the model reports', () => {
    const { rows } = quoteTranslationRows('tenant', items.slice(0, 1), [{ n: 1, language: 'Spanish', english: 'hello' }])
    expect(rows[0].language).toBe('es')
  })

  it('takes an English verdict at its word even when the model echoed the text back', () => {
    const { rows } = quoteTranslationRows('tenant', items.slice(1), [{ n: 1, language: 'en', english: 'it works' }])
    expect(rows[0]).toMatchObject({ language: 'en', english: null })
  })
})

describe('isMissingQuoteTranslations', () => {
  it('is true only for this migration\'s own object', () => {
    expect(isMissingQuoteTranslations({ code: 'PGRST205', message: "Could not find the table 'public.comment_translations' in the schema cache" })).toBe(true)
    expect(isMissingQuoteTranslations({ code: 'PGRST205', message: "Could not find the table 'public.subjects' in the schema cache" })).toBe(false)
    expect(isMissingQuoteTranslations(new Error('connection reset'))).toBe(false)
    expect(isMissingQuoteTranslations(null)).toBe(false)
  })
})

describe('the round trip on a 30-comment corpus', () => {
  it('detects, translates, caches, and costs nothing the second time', async () => {
    const f = corpus()
    const tables = tablesFor(f)
    const admin = fakeAdmin(tables)
    const calls: { items: number }[] = []

    const plan = await planQuoteTranslations('tenant', { admin })
    expect(plan.comments).toBe(30)
    expect(plan.needing).toBe(30) // the excerpt IS the comment on every row here

    let translated = 0, english = 0
    for (const [i, ids] of plan.batches.entries()) {
      const r = await translateQuotesBatch({
        clientId: 'tenant', runId: 'run1', commentIds: ids, batchNo: i + 1, admin, translate: fakeModel(calls),
      })
      translated += r.translated
      english += r.english
      expect(r.errors).toEqual([])
    }
    expect(translated).toBe(20)
    expect(english).toBe(10)
    expect(tables.comment_translations.rows).toHaveLength(30)
    // 30 items at 25 to a call.
    expect(calls.map((c) => c.items)).toEqual([25, 5])

    // The second visit finds everything and calls nothing.
    const again = await planQuoteTranslations('tenant', { admin })
    expect(again.needing).toBe(0)
    expect(again.batches).toEqual([])

    const callsAgain: { items: number }[] = []
    const r = await translateQuotesBatch({
      clientId: 'tenant', runId: 'run2', commentIds: f.comments.map((c) => c.id as string), admin, translate: fakeModel(callsAgain),
    })
    expect(callsAgain).toEqual([])
    expect(r.cached).toBe(30)
    expect(r.translated + r.english).toBe(0)
  })

  it('re-reads a comment whose author edited it, and only that one', async () => {
    const f = corpus()
    const tables = tablesFor(f)
    const admin = fakeAdmin(tables)
    for (const [i, ids] of (await planQuoteTranslations('tenant', { admin })).batches.entries()) {
      await translateQuotesBatch({ clientId: 'tenant', runId: 'r', commentIds: ids, batchNo: i + 1, admin, translate: fakeModel() })
    }
    expect(tables.comment_translations.rows).toHaveLength(30)

    // The nightly refresh upserts an edit onto the same row id.
    const edited = 'Me encanta esta pierna, cambió mi vida — y el servicio fue excelente'
    tables.comments.rows[0].text = edited
    tables.insight_evidence.rows[0].quote = edited

    const plan = await planQuoteTranslations('tenant', { admin })
    expect(plan.needing).toBe(1)
    expect(plan.comments).toBe(1)
    expect(plan.batches).toEqual([['c00']])

    const calls: { items: number }[] = []
    const r = await translateQuotesBatch({ clientId: 'tenant', runId: 'r2', commentIds: ['c00'], admin, translate: fakeModel(calls) })
    expect(calls).toEqual([{ items: 1 }])
    expect(r.translated).toBe(1)
    // The stale row is kept, not corrected: it is a true record of a text that
    // was there, and nothing will ask for it again.
    expect(tables.comment_translations.rows.filter((x) => x.comment_id === 'c00')).toHaveLength(2)
  })

  it('is a logged no-op with nothing spent when the migration is not applied', async () => {
    const f = corpus()
    const admin = fakeAdmin(tablesFor(f), { missing: ['comment_translations'] })
    const calls: { items: number }[] = []
    const plan = await planQuoteTranslations('tenant', { admin })
    expect(plan).toEqual({ batches: [], needing: 0, deferred: 0, comments: 0 })
    const r = await translateQuotesBatch({ clientId: 'tenant', runId: 'r', commentIds: ['c00'], admin, translate: fakeModel(calls) })
    expect(calls).toEqual([])
    expect(r.costUsd).toBe(0)
    expect(r.errors).toEqual([])
  })

  it('a failed call costs its texts and nothing else — the step does not throw', async () => {
    const f = corpus()
    const tables = tablesFor(f)
    const admin = fakeAdmin(tables)
    const r = await translateQuotesBatch({
      clientId: 'tenant', runId: 'r', commentIds: f.comments.slice(0, 3).map((c) => c.id as string), admin,
      translate: async () => { throw new Error('429 rate limit') },
    })
    expect(r.failed).toBe(3)
    expect(r.rateLimited).toBe(true)
    expect(tables.comment_translations.rows).toEqual([])
  })

  it('the dry run counts what it would write and writes nothing', async () => {
    const f = corpus()
    const tables = tablesFor(f)
    const admin = fakeAdmin(tables)
    const r = await translateQuotesBatch({
      clientId: 'tenant', runId: 'r', commentIds: f.comments.map((c) => c.id as string), admin,
      translate: fakeModel(), dryRun: true,
    })
    expect(r.translated + r.english).toBe(30)
    expect(tables.comment_translations.rows).toEqual([])
  })
})
