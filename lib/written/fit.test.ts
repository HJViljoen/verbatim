import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { findingText, fitQuotes, FIT_MAX_INSIGHTS, optionsFor, parseVector, scoreFit, WEEK_READ_FIT_PASS } from './fit'
import { candidate, option, pool, ref } from './test-fixtures'

// Which quote fits which written finding (T3b), on stand-ins: the database
// holds a few stored insight vectors, the embedder returns fixed ones, and
// what is pinned is the choice, the reads, the log and the fail-soft path.

const unit = (i: number, n = 4): number[] => Array.from({ length: n }, (_, j) => (j === i ? 1 : 0))

/** A stand-in admin: `audience_insights` answers from `vectors` (as PostgREST
 *  sends a pgvector, text), `ai_call_log` inserts are recorded. */
function fakeAdmin(vectors: Record<string, number[]>, opts: { fail?: boolean } = {}) {
  const reads: string[][] = []
  const logged: Record<string, unknown>[] = []
  const admin = {
    from: (table: string) => {
      if (table === 'ai_call_log') return { insert: async (row: Record<string, unknown>) => { logged.push(row); return { error: null } } }
      const q = {
        select: () => q,
        eq: () => q,
        in: async (_col: string, ids: string[]) => {
          reads.push(ids)
          if (opts.fail) return { data: null, error: { message: 'boom' } }
          return { data: ids.filter((id) => vectors[id]).map((id) => ({ id, embedding: JSON.stringify(vectors[id]) })), error: null }
        },
      }
      return q
    },
  }
  return { admin: admin as unknown as SupabaseClient, reads, logged }
}

const C1 = candidate({ id: 'C1', quoteRefs: [ref('a1', 't1'), ref('a2', 't2')], quoteOptions: [option(ref('a1', 't1'), 'ins-a1'), option(ref('a2', 't2'), 'ins-a2')] })
const C2 = candidate({ id: 'C2', quoteRefs: [ref('b1', 't3')], quoteOptions: [option(ref('b1', 't3'), 'ins-b1')] })
const P = pool([C1, C2, candidate({ id: 'C3' })])

describe('the pure parts', () => {
  it('measures a finding on its headline and what it saw', () => {
    expect(findingText({ headline: 'Straps decide comfort', saw: 'Owners describe straps.\n\nThey ask about padding.' }))
      .toBe('Straps decide comfort. Owners describe straps. They ask about padding.')
  })

  it('reads a stored vector as PostgREST sends it, and nothing else', () => {
    expect(parseVector('[0.5,-1,2]')).toEqual([0.5, -1, 2])
    expect(parseVector([1, 2])).toEqual([1, 2])
    for (const bad of [null, '', 'not json', '[]', '["a"]', 3]) expect(parseVector(bad)).toBeNull()
  })

  it("offers each finding its cited candidates' options, once each", () => {
    expect(optionsFor(P, { based_on: ['c2', 'C1', 'C9', 'C1'] }).map((o) => o.quote.ref)).toEqual(['e:b1', 'e:a1', 'e:a2'])
  })

  it('scores every option whose insight has a vector, by cosine', () => {
    const scores = scoreFit(P, [{ index: 0, headline: 'h', saw: 's', based_on: ['C1', 'C2'], vector: unit(0) }], new Map([
      ['ins-a1', unit(1)],
      ['ins-a2', [1, 1, 0, 0]],
      // ins-b1 has none: unscored
    ]))
    const s = scores.get(0)!
    expect(s.get('e:a1')).toBeCloseTo(0)
    expect(s.get('e:a2')).toBeCloseTo(Math.SQRT1_2)
    expect(s.has('e:b1')).toBe(false)
  })
})

describe('fitQuotes', () => {
  const findings = [
    { index: 0, headline: 'Straps decide comfort', saw: 'Owners describe the straps.', based_on: ['C1'] },
    { index: 2, headline: 'Buyers doubt the price', saw: 'Buyers compare prices.', based_on: ['C2', 'C1'] },
  ]

  it("reuses the stored vectors, embeds the findings and any insight without one in one request, and logs it", async () => {
    const { admin, reads, logged } = fakeAdmin({ 'ins-a1': unit(1), 'ins-a2': unit(2) })
    const calls: string[][] = []
    const embed = async (texts: string[]) => { calls.push(texts); return texts.map((_, i) => (i === 0 ? unit(2) : i === 1 ? unit(3) : unit(3))) }
    const fit = await fitQuotes(admin, { clientId: 'client-1', runId: 'run-27', pool: P, findings, log: true }, { embed })
    expect(reads).toEqual([['ins-a1', 'ins-a2', 'ins-b1']])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual([
      'Straps decide comfort. Owners describe the straps.',
      'Buyers doubt the price. Buyers compare prices.',
      'slug. The insight behind e:b1.', // the one insight with no stored vector
    ])
    expect(fit).toMatchObject({ ran: true, stored: 2, embedded: 1, findings: 2 })
    expect(fit.costUsd).toBeGreaterThan(0)
    // Finding 0 is about what ins-a2's vector says; finding 2's best is b1.
    expect(fit.scores.get(0)?.get('e:a2')).toBeCloseTo(1)
    expect(fit.scores.get(0)?.get('e:a1')).toBeCloseTo(0)
    expect(fit.scores.get(2)?.get('e:b1')).toBeCloseTo(1)
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatchObject({ pass: WEEK_READ_FIT_PASS, model: 'text-embedding-3-small', run_id: 'run-27', completion_tokens: 0, validation_status: 'ok' })
    // A summary goes to the ledger, never the texts.
    expect(JSON.stringify(logged[0].request)).not.toContain('Straps decide comfort')
  })

  it('measures a story paragraph against the options of the candidate it points to, in the same request (v3)', async () => {
    const { admin } = fakeAdmin({ 'ins-a1': unit(1), 'ins-a2': unit(2), 'ins-b1': unit(3) })
    const calls: string[][] = []
    const embed = async (texts: string[]) => { calls.push(texts); return texts.map((_, i) => (i === 1 ? unit(1) : unit(0))) }
    const fit = await fitQuotes(admin, {
      clientId: 'client-1', runId: 'run-27', pool: P,
      findings: [findings[0]],
      story: [{ index: 1, text: 'The week turned on\nthe straps.', based_on: ['C1'] }, { index: 2, text: 'No options.', based_on: ['C9'] }],
      log: false,
    }, { embed })
    expect(calls).toEqual([['Straps decide comfort. Owners describe the straps.', 'The week turned on the straps.']])
    expect(fit).toMatchObject({ ran: true, findings: 1, paragraphs: 1 })
    expect(fit.story?.get(1)?.get('e:a1')).toBeCloseTo(1)
    expect(fit.story?.get(1)?.get('e:a2')).toBeCloseTo(0)
    expect(fit.story?.has(2)).toBe(false)
  })

  it('writes nothing to any database on a dry run', async () => {
    const { admin, logged } = fakeAdmin({ 'ins-a1': unit(1), 'ins-a2': unit(2), 'ins-b1': unit(3) })
    const fit = await fitQuotes(admin, { clientId: 'client-1', runId: 'run-27', pool: P, findings, log: false }, { embed: async (t) => t.map(() => unit(0)) })
    expect(fit.ran).toBe(true)
    expect(fit.embedded).toBe(0)
    expect(logged).toEqual([])
  })

  it('never throws: a failed read or embed leaves no scores and says why', async () => {
    const failedRead = await fitQuotes(fakeAdmin({}, { fail: true }).admin, { clientId: 'c', runId: 'r', pool: P, findings, log: true }, { embed: async (t) => t.map(() => unit(0)) })
    expect(failedRead).toMatchObject({ ran: false, costUsd: 0 })
    expect(failedRead.scores.size).toBe(0)
    expect(failedRead.error).toContain('boom')
    const failedEmbed = await fitQuotes(fakeAdmin({}).admin, { clientId: 'c', runId: 'r', pool: P, findings, log: true }, { embed: async () => { throw new Error('429') } })
    expect(failedEmbed).toMatchObject({ ran: false, error: '429' })
  })

  it('spends nothing where no finding has an option', async () => {
    const { admin, reads } = fakeAdmin({})
    let embedded = 0
    const fit = await fitQuotes(admin, { clientId: 'c', runId: 'r', pool: P, findings: [{ index: 0, headline: 'h', saw: 's', based_on: ['C9'] }], log: true }, { embed: async (t) => { embedded++; return t.map(() => unit(0)) } })
    expect(fit).toMatchObject({ ran: true, costUsd: 0, findings: 0 })
    expect(reads).toEqual([])
    expect(embedded).toBe(0)
  })

  it(`looks up at most ${FIT_MAX_INSIGHTS} insights`, async () => {
    const many = Array.from({ length: FIT_MAX_INSIGHTS + 30 }, (_, i) => option(ref(`z${i}`, `tz${i}`), `ins-z${i}`))
    const big = pool([candidate({ id: 'C1', quoteOptions: many }), candidate({ id: 'C2' }), candidate({ id: 'C3' })])
    const { admin, reads } = fakeAdmin({})
    const fit = await fitQuotes(admin, { clientId: 'c', runId: 'r', pool: big, findings: [{ index: 0, headline: 'h', saw: 's', based_on: ['C1'] }], log: false }, { embed: async (t) => t.map(() => unit(0)) })
    expect(reads.flat()).toHaveLength(FIT_MAX_INSIGHTS)
    expect(fit.scores.get(0)?.size).toBe(FIT_MAX_INSIGHTS)
  })
})
