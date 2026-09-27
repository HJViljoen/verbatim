import { describe, expect, it } from 'vitest'

import { cleanQuote, fetchQuoteCitationsByAudience, fetchQuotesByAudience, readingOf, readTranslations } from '../quotes'
import { quoteTextHash } from '../quote-text'
import { citationsUntranslated, quotesUntranslated } from './evidence-untranslated'

// THE COPY IS HELD TO ITS ORIGINAL HERE, not by its header. The functions in
// evidence-untranslated.ts are lib/quotes.ts's evidence reads without the
// translation read, copied because lib/quotes.ts is frozen until the 4 Oct run.
// Their header says a change to the rule there must be made here too; this
// makes that a red build rather than a sentence. Both are run over one fake
// table and must ask it the same questions (columns, filter, chunking, order,
// paging) and build the same Map in the same order, and the reading a caller
// attaches afterwards must be the one the original attached itself.

interface Evidence {
  id: string
  audience_insight_id: string
  quote: string | null
  relevance_rank: number | null
  comment_id: string | null
  source_video_id: string | null
  source: string | null
  redacted: boolean
}

interface Translation { text_hash: string; language: string | null; english: string | null; comment_id: string }

/** A fake PostgREST client that answers `insight_evidence` and
 *  `comment_translations` from memory and logs every evidence read it serves. */
function fakeDb(evidence: Evidence[], translations: Translation[]) {
  const log: string[] = []
  const client = {
    from(table: string) {
      const q = { select: '', inCol: '', inIds: [] as string[], eq: [] as [string, unknown][], order: [] as string[] }
      const b = {
        select(cols: string) { q.select = cols; return b },
        in(col: string, ids: string[]) { q.inCol = col; q.inIds = [...ids]; return b },
        eq(col: string, v: unknown) { q.eq.push([col, v]); return b },
        order(col: string) { q.order.push(col); return b },
        // readTranslations' reachability probe
        limit: () => Promise.resolve({ error: null }),
        range(from: number, to: number) {
          const want = new Set(q.inIds)
          const cols = q.select.split(',').map((c) => c.trim())
          const pick = (r: object) => Object.fromEntries(cols.map((c) => [c, (r as Record<string, unknown>)[c]]))
          if (table === 'insight_evidence') {
            log.push(`select(${q.select}) in(${q.inCol}:${q.inIds.join(',')}) eq(${q.eq.map(([c, v]) => `${c}=${String(v)}`).join(',')}) order(${q.order.join(',')}) range(${from},${to})`)
            let hit = evidence.filter((r) => want.has(r.audience_insight_id))
            for (const [c, v] of q.eq) hit = hit.filter((r) => (r as unknown as Record<string, unknown>)[c] === v)
            hit.sort((a, b) => a.id.localeCompare(b.id))
            return Promise.resolve({ data: hit.slice(from, to + 1).map(pick), error: null })
          }
          const hit = translations.filter((r) => want.has(r.text_hash))
            .sort((a, b) => a.text_hash.localeCompare(b.text_hash) || a.comment_id.localeCompare(b.comment_id))
          return Promise.resolve({ data: hit.slice(from, to + 1).map(pick), error: null })
        },
      }
      return b
    },
  }
  return { client, log }
}

// 250 insights, so the reads cross two 120-id chunk boundaries; evidence ids
// that do NOT follow insight order, so a Map built in arrival order differs
// from one built in id order; one insight with more rows than a page, so a
// chunk is paged; and every row the originals drop or relabel.
const ids = Array.from({ length: 250 }, (_, i) => `ai-${String(i).padStart(3, '0')}`)
const evidence: Evidence[] = []
ids.forEach((aid, i) => {
  const at = (n: number) => `ev-${String((i * 7919 + n * 104729) % 1_000_003).padStart(7, '0')}-${i}-${n}`
  const base = { audience_insight_id: aid, relevance_rank: i % 5 === 0 ? null : (i % 3) + 1, redacted: false }
  evidence.push({ ...base, id: at(0), quote: `  Words   of insight ${i}. `, comment_id: `c-${i}`, source_video_id: null, source: ['video', 'video_text', null, 'comment', 'odd'][i % 5] })
  evidence.push({ ...base, id: at(1), quote: `On camera ${i}`, comment_id: null, source_video_id: `v-${i}`, source: 'video' })
  evidence.push({ ...base, id: at(2), quote: `Uncitable ${i}`, comment_id: null, source_video_id: null, source: null })
  evidence.push({ ...base, id: at(3), quote: i % 2 ? '' : null, comment_id: `c-x${i}`, source_video_id: null, source: null })
  evidence.push({ ...base, id: at(4), quote: `Redacted ${i}`, comment_id: `c-r${i}`, source_video_id: null, source: null, redacted: true })
})
for (let n = 0; n < 1_005; n++) {
  evidence.push({ id: `ev-z${String(n).padStart(5, '0')}`, audience_insight_id: 'ai-130', quote: `Dense ${n}`, relevance_rank: n % 4, comment_id: `c-d${n}`, source_video_id: null, source: null, redacted: false })
}
// Half the texts have a reading; one hash has two rows, and the later one is
// the one the original keeps.
const translations: Translation[] = []
evidence.forEach((r, n) => {
  if (!r.quote || n % 2) return
  const hash = quoteTextHash(cleanQuote(r.quote))
  translations.push({ text_hash: hash, language: 'af', english: `english of ${r.id}`, comment_id: `t-${r.id}` })
})
translations.push({ text_hash: quoteTextHash(cleanQuote(evidence[0].quote as string)), language: 'nl', english: 'a later reading', comment_id: 'zz' })

describe('evidence-untranslated — the copies ask what lib/quotes.ts asks', () => {
  it('citationsUntranslated makes fetchQuoteCitationsByAudience’s evidence reads', async () => {
    const original = fakeDb(evidence, translations)
    const copy = fakeDb(evidence, translations)
    await fetchQuoteCitationsByAudience(original.client, ids)
    await citationsUntranslated(copy.client as never, ids)
    expect(copy.log.length).toBeGreaterThan(3)
    expect(copy.log).toEqual(original.log)
  })

  it('quotesUntranslated makes fetchQuotesByAudience’s evidence reads', async () => {
    const original = fakeDb(evidence, translations)
    const copy = fakeDb(evidence, translations)
    await fetchQuotesByAudience(original.client, ids)
    await quotesUntranslated(copy.client as never, ids)
    expect(copy.log.length).toBeGreaterThan(3)
    expect(copy.log).toEqual(original.log)
  })
})

describe('evidence-untranslated — the same rows, in the same order, and the same reading once a caller reads it', () => {
  /** A Map as its entries, so the ORDER is compared too (toEqual on two Maps is not). */
  const entries = <T>(m: Map<string, T[]>) => [...m.entries()]

  it('citations', async () => {
    const want = await fetchQuoteCitationsByAudience(fakeDb(evidence, translations).client, ids)
    const { client } = fakeDb(evidence, translations)
    const got = await citationsUntranslated(client as never, ids)
    const english = await readTranslations(client, [...got.values()].flat().map((c) => c.quote))
    const read = new Map([...got].map(([k, list]) => [k, list.map((c) => ({ ...c, ...readingOf(english, c.quote) }))]))
    expect(entries(read)).toStrictEqual(entries(want))
    // and without it, the same rows with no reading on them
    const bare = new Map([...want].map(([k, list]) => [k, list.map(({ lang: _l, english: _e, ...c }) => c)]))
    expect(entries(got)).toStrictEqual(entries(bare))
    expect([...want.values()].flat().some((c) => c.english === 'a later reading')).toBe(true)
  })

  it('quotes', async () => {
    const want = await fetchQuotesByAudience(fakeDb(evidence, translations).client, ids)
    const { client } = fakeDb(evidence, translations)
    const got = await quotesUntranslated(client as never, ids)
    const english = await readTranslations(client, [...got.values()].flat().map((c) => c.quote))
    const read = new Map([...got].map(([k, list]) => [k, list.map((c) => ({ ...c, ...readingOf(english, c.quote) }))]))
    expect(entries(read)).toStrictEqual(entries(want))
    const bare = new Map([...want].map(([k, list]) => [k, list.map(({ lang: _l, english: _e, ...c }) => c)]))
    expect(entries(got)).toStrictEqual(entries(bare))
  })
})
