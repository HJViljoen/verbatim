import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  EMBED_PASS,
  EMBED_SOURCE_VIEW,
  EMBED_WRITE_CHUNK,
  SET_EMBEDDINGS_RPC,
  embedCallLog,
  embedCostUsd,
  embedPayload,
  embedRequests,
  embedSummary,
  embedTokenEstimate,
  embeddable,
  emptyEmbedResult,
  isMissingEmbeddingWrite,
  isStatementTimeout,
  writeChunks,
  writeEmbeddings,
  type EmbedCandidate,
} from './embed-insights'
import { EMBED_BATCH, EMBED_INPUT_VERSION, embedInput } from './cluster'
import { EMBEDDING_MODEL, MODEL_PRICING } from '../config'

// The embed step's arithmetic: what gets sent, in what sized pieces, what the
// ledger row says it cost, and what happens when there is nothing to do. The
// OpenAI call and the RPC are I/O and are not mocked — what is asserted here is
// everything either of them is handed.

const row = (id: string, theme = 'fit_comfort', description = 'the liner slips in heat'): EmbedCandidate => ({
  id,
  theme,
  description,
})

const rows = (n: number, from = 0): EmbedCandidate[] =>
  Array.from({ length: n }, (_, i) => row(`id-${String(from + i).padStart(5, '0')}`))

const vec = (fill: number): number[] => Array.from({ length: 1536 }, () => fill)

describe('embeddable — what is worth spending on', () => {
  it('keeps a row with a description', () => {
    expect(embeddable([row('a')])).toHaveLength(1)
  })

  it('drops a blank or whitespace-only description, which would embed to a bare slug', () => {
    expect(embeddable([row('a', 'fit', ''), row('b', 'fit', '   '), row('c')]).map((r) => r.id)).toEqual(['c'])
  })

  it('survives a description the view handed back as null', () => {
    const nulled = { id: 'a', theme: 'fit', description: null } as unknown as EmbedCandidate
    expect(embeddable([nulled])).toEqual([])
  })
})

describe('embedRequests — one chunk is one embeddings request', () => {
  it('sends nothing for nothing', () => {
    expect(embedRequests([])).toEqual([])
  })

  it('keeps a sub-batch corpus in a single request', () => {
    expect(embedRequests(rows(37)).map((c) => c.length)).toEqual([37])
  })

  it('splits exactly at the endpoint batch size', () => {
    expect(embedRequests(rows(EMBED_BATCH)).map((c) => c.length)).toEqual([EMBED_BATCH])
    expect(embedRequests(rows(EMBED_BATCH + 1)).map((c) => c.length)).toEqual([EMBED_BATCH, 1])
  })

  it('splits the measured backlog (3,536 rows) into seven requests, none over the 2048-item API cap', () => {
    const sizes = embedRequests(rows(3536)).map((c) => c.length)
    expect(sizes).toEqual([512, 512, 512, 512, 512, 512, 464])
    expect(Math.max(...sizes)).toBeLessThanOrEqual(2048)
  })

  it('preserves order and loses nothing', () => {
    const all = rows(1100)
    const flat = embedRequests(all).flat()
    expect(flat.map((r) => r.id)).toEqual(all.map((r) => r.id))
  })
})

describe('writeChunks — one chunk is one RPC body', () => {
  const payload = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, embedding: vec(0.1) }))

  it('writes nothing for nothing', () => {
    expect(writeChunks([])).toEqual([])
  })

  it('splits at 25, the largest chunk the authenticator role\'s 8 s statement clock takes on an HNSW insert', () => {
    expect(EMBED_WRITE_CHUNK).toBe(25)
    expect(writeChunks(payload(60)).map((c) => c.length)).toEqual([25, 25, 10])
  })

  it('turns the whole 3,536-row backlog into 142 requests', () => {
    expect(writeChunks(payload(3536))).toHaveLength(142)
  })

  it('keeps a chunk body under the ~10MB that killed the themes insert', () => {
    // One vector is ~19.3 kB of JSON, measured across both tenants.
    const body = JSON.stringify(writeChunks(payload(EMBED_WRITE_CHUNK))[0])
    expect(body.length).toBeLessThan(10_000_000)
  })
})

describe('embedPayload — pairing a vector to its insight', () => {
  it('pairs positionally and carries only id and embedding', () => {
    const p = embedPayload([row('a'), row('b')], [vec(0.1), vec(0.2)])
    expect(p).toEqual([
      { id: 'a', embedding: vec(0.1) },
      { id: 'b', embedding: vec(0.2) },
    ])
    expect(Object.keys(p[0])).toEqual(['id', 'embedding'])
  })

  it('throws rather than write a vector against the wrong insight', () => {
    expect(() => embedPayload([row('a'), row('b')], [vec(0.1)])).toThrow('2 rows')
    expect(() => embedPayload([row('a')], [vec(0.1), vec(0.2)])).toThrow('2 vectors')
  })

  it('is empty for an empty request', () => {
    expect(embedPayload([], [])).toEqual([])
  })
})

describe('the embed text is the clusterer’s formula, not a second copy', () => {
  it('underscores become spaces and the description follows', () => {
    expect(embedInput(row('a', 'fit_comfort_in_heat', 'the liner slips'))).toBe('fit comfort in heat. the liner slips')
  })
})

describe('cost — the line run_costs.by_pass will read', () => {
  it('estimates tokens at four characters each', () => {
    expect(embedTokenEstimate(['12345678'])).toBe(2)
    expect(embedTokenEstimate(['123', '12345'])).toBe(2)
    expect(embedTokenEstimate([])).toBe(0)
    // Rounds up: a part-token is a token.
    expect(embedTokenEstimate(['123'])).toBe(1)
  })

  it('prices through MODEL_PRICING, input only', () => {
    const price = MODEL_PRICING[EMBEDDING_MODEL]
    expect(price).toBeDefined()
    expect(price.outputPer1M).toBe(0)
    // 4M characters ≈ 1M tokens ≈ one whole unit of the input price.
    expect(embedCostUsd(['x'.repeat(4_000_000)])).toBeCloseTo(price.inputPer1M, 10)
  })

  it('puts the whole measured backlog at about half a cent', () => {
    // 3,536 rows × ~157 characters of embed input, measured on production.
    const corpus = Array.from({ length: 3536 }, () => 'x'.repeat(157))
    expect(embedCostUsd(corpus)).toBeGreaterThan(0.002)
    expect(embedCostUsd(corpus)).toBeLessThan(0.01)
  })
})

describe('embedCallLog — one ledger row per embeddings request', () => {
  const texts = ['fit comfort. the liner slips in heat', 'cost. how much is a new socket']

  it('keys on the pass run_costs.by_pass will show, and the embedding model', () => {
    const log = embedCallLog({ clientId: 'c1', runId: 'r1', callIndex: 3, texts, vectors: [vec(0.1), vec(0.2)], durationMs: 412, error: null })
    expect(log.pass).toBe(EMBED_PASS)
    expect(log.pass).toBe('embed')
    expect(log.model).toBe(EMBEDDING_MODEL)
    expect(log.callIndex).toBe(3)
    expect(log.clientId).toBe('c1')
    expect(log.runId).toBe('r1')
    expect(log.durationMs).toBe(412)
  })

  it('stamps the embed-text formula as the prompt version, because that is what decides comparability', () => {
    const log = embedCallLog({ clientId: 'c1', runId: 'r1', callIndex: 1, texts, vectors: [vec(0.1), vec(0.2)], durationMs: 1, error: null })
    expect(log.promptVersion).toBe(EMBED_INPUT_VERSION)
  })

  it('summarises the request instead of copying the insight texts into the ledger', () => {
    const log = embedCallLog({ clientId: 'c1', runId: 'r1', callIndex: 1, texts, vectors: [vec(0.1), vec(0.2)], durationMs: 1, error: null })
    expect(log.request).toEqual({ inputs: 2, chars: texts[0].length + texts[1].length, tokens_estimated: true })
    expect(JSON.stringify(log.request)).not.toContain('liner slips')
    expect(log.systemPrompt).toBeUndefined()
    expect(log.userPrompt).toBeUndefined()
  })

  it('bills input tokens only, so estimateCost lands on the input price', () => {
    const log = embedCallLog({ clientId: 'c1', runId: 'r1', callIndex: 1, texts, vectors: [vec(0.1), vec(0.2)], durationMs: 1, error: null })
    expect(log.usage.completion_tokens).toBe(0)
    expect(log.usage.prompt_tokens).toBe(embedTokenEstimate(texts))
  })

  it('records vector count and dimension on success', () => {
    const log = embedCallLog({ clientId: 'c1', runId: null, callIndex: 1, texts, vectors: [vec(0.1), vec(0.2)], durationMs: 1, error: null })
    expect(log.response).toEqual({ vectors: 2, dimensions: 1536 })
    expect(log.validationStatus).toBe('ok')
    expect(log.error).toBeNull()
  })

  it('still logs a request that failed — the tokens went out either way', () => {
    const log = embedCallLog({ clientId: 'c1', runId: 'r1', callIndex: 2, texts, vectors: [], durationMs: 9, error: 'array length must be 2048 or less' })
    expect(log.validationStatus).toBe('call_failed')
    expect(log.error).toBe('array length must be 2048 or less')
    expect(log.response).toBeNull()
    expect(log.usage.prompt_tokens).toBe(embedTokenEstimate(texts))
  })

  it('takes a null run_id for the backfill script, which runs outside a run', () => {
    expect(embedCallLog({ clientId: 'c1', runId: null, callIndex: 1, texts, vectors: [vec(0.1), vec(0.2)], durationMs: 1, error: null }).runId).toBeNull()
  })
})

describe('isMissingEmbeddingWrite — surviving a deploy that lands before its migration', () => {
  it('recognises PostgREST and Postgres both saying the function is not there', () => {
    expect(isMissingEmbeddingWrite({
      code: 'PGRST202',
      message: `Could not find the function public.${SET_EMBEDDINGS_RPC}(p_rows) in the schema cache`,
    })).toBe(true)
    expect(isMissingEmbeddingWrite({
      code: '42883',
      message: `function public.${SET_EMBEDDINGS_RPC}(jsonb) does not exist`,
    })).toBe(true)
  })

  it('recognises it from the sentence alone, once the code has been flattened away', () => {
    expect(isMissingEmbeddingWrite(new Error(`Could not find the function public.${SET_EMBEDDINGS_RPC} in the schema cache`))).toBe(true)
    expect(isMissingEmbeddingWrite(new Error(`function public.${SET_EMBEDDINGS_RPC} does not exist`))).toBe(true)
  })

  it('does not swallow a real failure', () => {
    expect(isMissingEmbeddingWrite({ code: '22P02', message: `${SET_EMBEDDINGS_RPC}: invalid input syntax for type vector` })).toBe(false)
    expect(isMissingEmbeddingWrite({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false)
    expect(isMissingEmbeddingWrite({ code: 'PGRST202', message: 'Could not find the function public.monthly_denominators in the schema cache' })).toBe(false)
    expect(isMissingEmbeddingWrite(new Error('fetch failed'))).toBe(false)
    expect(isMissingEmbeddingWrite(null)).toBe(false)
    expect(isMissingEmbeddingWrite(undefined)).toBe(false)
    expect(isMissingEmbeddingWrite('PGRST202')).toBe(false)
  })
})

describe('embedSummary — what the step says when there was nothing to do', () => {
  it('says the index is current rather than printing zeroes', () => {
    expect(embedSummary(emptyEmbedResult())).toBe('nothing to embed — every live insight already carries a vector')
  })

  it('names the migration when the write path is not there yet', () => {
    expect(embedSummary({ ...emptyEmbedResult(), skipped: 'migration' })).toContain('20260915094000_insight_embedding.sql')
  })

  it('reports what landed', () => {
    const s = embedSummary({ candidates: 1449, attempted: 1449, embedded: 1449, written: 1449, requests: 3, costUsd: 0.0012, skipped: null, dryRun: false })
    expect(s).toBe('1449 of 1449 embedded in 3 request(s), ~$0.0012')
  })

  it('names rows it skipped and rows somebody else had already written', () => {
    const s = embedSummary({ candidates: 10, attempted: 8, embedded: 8, written: 6, requests: 1, costUsd: 0.0001, skipped: null, dryRun: false })
    expect(s).toContain('2 skipped (no description)')
    expect(s).toContain('2 already written or gone')
  })

  it('says "would" on a dry run, and never claims a row was written', () => {
    const s = embedSummary({ candidates: 2087, attempted: 2087, embedded: 0, written: 0, requests: 5, costUsd: 0.0017, skipped: null, dryRun: true })
    expect(s).toBe('would embed 2087 of 2087 in 5 request(s), ~$0.0017')
    expect(s).not.toContain('embedded in')
  })

  it('carries no pipeline jargon a client could not read', () => {
    const s = embedSummary({ candidates: 10, attempted: 10, embedded: 10, written: 10, requests: 1, costUsd: 0.0001, skipped: null, dryRun: false })
    for (const word of ['Pass A', 'Pass C', 'run_id', 'T#']) expect(s).not.toContain(word)
  })
})

describe('the backfill script', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'scripts', 'embed-insights.ts'), 'utf8')

  it('is dry by default and writes only on --apply', () => {
    expect(src).toContain("=== '--apply'")
    expect(src).toContain('dryRun: true')
    expect(src).toMatch(/if \(!apply\)/)
  })

  it('runs the same module the pipeline step runs, not a second loop', () => {
    expect(src).toContain("from '../lib/pipeline/embed-insights'")
    expect(src).not.toContain('embedTexts')
    expect(src).not.toContain(".from('audience_insights')")
  })

  it('refuses --force with a reason instead of silently writing nothing', () => {
    expect(src).toContain("=== '--force'")
    expect(src).toContain('--force is gone')
  })
})

describe('the migration and this module agree', () => {
  const sql = readFileSync(
    join(__dirname, '..', '..', 'supabase', 'migrations', '20260915094000_insight_embedding.sql'),
    'utf8',
  )

  it('names the same function', () => {
    expect(sql).toContain(`create or replace function public.${SET_EMBEDDINGS_RPC}(p_rows jsonb)`)
  })

  it('takes the argument under the name supabase-js sends', () => {
    // writeEmbeddings posts { p_rows }; PostgREST resolves the overload by name.
    expect(sql).toMatch(/set_insight_embeddings\(p_rows jsonb\)/)
  })

  it('writes the column embeddingCoverage reads', () => {
    expect(sql).toContain('add column if not exists embedded_at timestamptz')
    expect(sql).toContain('embedded_at = now()')
  })

  it('re-expands the view this module reads its candidates from', () => {
    expect(sql).toContain(`create or replace view public.${EMBED_SOURCE_VIEW}`)
    expect(sql).toContain('security_invoker = true')
  })

  it('never overwrites a vector, which is what makes a retry safe', () => {
    expect(sql).toContain('and ai.embedding is null')
    expect(sql).toContain('and r.emb is not null')
  })

  it('is reachable by the service role only', () => {
    expect(sql).toContain(`revoke all on function public.${SET_EMBEDDINGS_RPC}(jsonb) from public, anon, authenticated`)
    expect(sql).toContain(`grant execute on function public.${SET_EMBEDDINGS_RPC}(jsonb) to service_role`)
  })

  it('is idempotent in every statement that can be re-run', () => {
    expect(sql).toContain('add column if not exists')
    expect(sql).toContain('create or replace function')
    expect(sql).toContain('create or replace view')
  })
})

describe('writeEmbeddings — a statement timeout halves the chunk', () => {
  const vec = (x: number) => Array.from({ length: 1536 }, () => x)
  const payload = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, embedding: vec(0.1) }))
  const timeout = { code: '57014', message: 'canceling statement due to statement timeout' }
  /** An RPC that times out on any call above `fitsUpTo` rows and records every call's size. */
  function admin(fitsUpTo: number, calls: number[]) {
    return {
      rpc: async (_fn: string, args: { p_rows: unknown[] }) => {
        calls.push(args.p_rows.length)
        if (args.p_rows.length > fitsUpTo) return { data: null, error: timeout }
        return { data: args.p_rows.length, error: null }
      },
    } as unknown as Parameters<typeof writeEmbeddings>[0]
  }

  it('recognises SQLSTATE 57014 and nothing else', () => {
    expect(isStatementTimeout(timeout)).toBe(true)
    expect(isStatementTimeout({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isStatementTimeout(null)).toBe(false)
  })

  it('retries at half the size until the call fits, and writes every row exactly once', async () => {
    const calls: number[] = []
    expect(await writeEmbeddings(admin(10, calls), payload(25))).toBe(25)
    expect(calls).toEqual([25, 13, 7, 6, 12, 6, 6])
  })

  it('writes a fitting chunk in one call', async () => {
    const calls: number[] = []
    expect(await writeEmbeddings(admin(100, calls), payload(25))).toBe(25)
    expect(calls).toEqual([25])
  })

  it('gives up on a single row that still times out', async () => {
    const calls: number[] = []
    await expect(writeEmbeddings(admin(0, calls), payload(2))).rejects.toMatchObject({ code: '57014' })
    expect(calls).toEqual([2, 1])
  })

  it('re-throws anything that is not a timeout without retrying', async () => {
    const calls: number[] = []
    const denied = {
      rpc: async (_fn: string, args: { p_rows: unknown[] }) => { calls.push(args.p_rows.length); return { data: null, error: { code: '42501', message: 'permission denied' } } },
    } as unknown as Parameters<typeof writeEmbeddings>[0]
    await expect(writeEmbeddings(denied, payload(4))).rejects.toMatchObject({ code: '42501' })
    expect(calls).toEqual([4])
  })
})
