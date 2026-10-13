import { LengthFinishReasonError } from 'openai/core/error'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 13 Oct: Sealand's run 78a6eb3c closed partial on one classify-meta batch
// whose answer ran to the model's window ("Could not parse response content as
// the length limit was reached"). This runs the batch's own step body
// (`runClassifyMetaBatch`) over a table-driven stand-in for the database and a
// stub model that answers the way the SDK does when an answer hits its
// ceiling: it throws `LengthFinishReasonError`. No network, no model.

const h = vi.hoisted(() => ({
  parse: vi.fn(),
  db: null as unknown,
}))
vi.mock('../openai', async (orig) => {
  const real = await orig<typeof import('../openai')>()
  return { ...real, openai: { chat: { completions: { parse: h.parse } } } }
})
vi.mock('../supabase-admin', async (orig) => {
  const real = await orig<typeof import('../supabase-admin')>()
  return { ...real, createAdminClient: () => h.db }
})

import { fakeDb, type FakeDb } from '../test/fake-db'
import { CLASSIFY_META_BATCH, CLASSIFY_META_MAX_OUTPUT_TOKENS, runClassifyMetaBatch } from './classify-meta'

const CLIENT = '00000000-0000-4000-8000-0000000000aa'
const RUN = '78a6eb3c-0000-4000-8000-000000000001'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const IDS = Array.from({ length: CLASSIFY_META_BATCH }, (_, i) => id(i + 1))

function database(): FakeDb {
  const videos = IDS.map((v, i) => ({
    id: v, client_id: CLIENT, platform: 'tiktok', account_name: `acc${i + 1}`, caption: `bag video ${i + 1}`, hashtags: null,
    transcript: null, transcript_en: null, transcript_status: null, ocr_text: null, ocr_status: null,
    classified_type: null, source: 'discovered',
  }))
  return fakeDb({ videos, ai_call_log: [] })
}

/** The blocks a prompt holds, `[v1]` to `[vN]`. */
const blocks = (prompt: string): number => (prompt.match(/^\[v\d+\]/gm) ?? []).length
const userPrompt = (req: { messages: { role: string; content: string }[] }) => req.messages.find((m) => m.role === 'user')!.content

/** A model that runs away on any part of `overrunAt` blocks, and otherwise
 *  answers every block of the part with a review. */
function model(overrunAt: (n: number, prompt: string) => boolean) {
  return async (req: { messages: { role: string; content: string }[]; max_completion_tokens?: number }) => {
    const prompt = userPrompt(req)
    const n = blocks(prompt)
    if (overrunAt(n, prompt)) throw new LengthFinishReasonError()
    return {
      choices: [{ message: { refusal: null, parsed: { videos: Array.from({ length: n }, (_, i) => ({ ref: `v${i + 1}`, classified_type: 'review', hook_style: 'question', hook_text: null, topics: ['bags'], sentiment: 'neutral' })) } } }],
      usage: { prompt_tokens: 100 * n, completion_tokens: 40 * n },
    }
  }
}

const classifiedIds = (db: FakeDb): string[] => db.calls.filter((c) => c.table === 'videos' && c.op === 'update').flatMap((c) => c.filters.filter((f) => f.startsWith('id=')).map((f) => f.slice(3)))

describe('runClassifyMetaBatch: a batch whose answer runs into the output ceiling', () => {
  let db: FakeDb
  beforeEach(() => {
    db = database()
    h.db = db.client
    h.parse.mockReset()
  })

  it('asks with the ceiling set, and a batch that fits is one call', async () => {
    h.parse.mockImplementation(model(() => false))
    const r = await runClassifyMetaBatch(CLIENT, RUN, IDS, 1)
    expect(h.parse).toHaveBeenCalledTimes(1)
    expect(h.parse.mock.calls[0][0]).toMatchObject({ max_completion_tokens: CLASSIFY_META_MAX_OUTPUT_TOKENS })
    expect(r).toMatchObject({ requested: 25, classified: 25, nulls: 0 })
    expect(r).not.toHaveProperty('error')
    expect(r).not.toHaveProperty('lengthSplit')
  })

  it('is asked again in halves, classifies every video, and returns no error (Sealand, 11 Oct)', async () => {
    h.parse.mockImplementation(model((n) => n === CLASSIFY_META_BATCH))
    const r = await runClassifyMetaBatch(CLIENT, RUN, IDS, 3)
    expect(h.parse.mock.calls.map((c) => blocks(userPrompt(c[0])))).toEqual([25, 13, 12])
    expect(r).toMatchObject({ requested: 25, classified: 25, nulls: 0, lengthSplit: true })
    expect(r).not.toHaveProperty('error')
    expect(r).not.toHaveProperty('lengthSkipped')
    expect(new Set(classifiedIds(db))).toEqual(new Set(IDS))
    // The overrun is in the ledger, billed at the ceiling, beside the two halves.
    const logged = db.calls.filter((c) => c.table === 'ai_call_log' && c.op === 'insert').map((c) => (c.values as Record<string, unknown>[])[0])
    expect(logged).toHaveLength(3)
    expect(logged[0]).toMatchObject({ pass: 'classify_meta', call_index: 3, completion_tokens: CLASSIFY_META_MAX_OUTPUT_TOKENS, validation_status: 'parse_error' })
    expect(String(logged[0].error_message)).toMatch(/length limit was reached \(25 videos, 8000-token ceiling\)/)
    expect(r.costUsd).toBeGreaterThan(Number(logged[0].cost_usd))
  })

  it('leaves the half that runs away again unclassified, writes the other, and still throws nothing', async () => {
    // The second half's prompt starts at the fourteenth video's caption.
    h.parse.mockImplementation(model((n, prompt) => n === CLASSIFY_META_BATCH || prompt.includes('bag video 14\n')))
    const r = await runClassifyMetaBatch(CLIENT, RUN, IDS, 2)
    expect(h.parse).toHaveBeenCalledTimes(3)
    expect(r).toMatchObject({ requested: 25, classified: 13, lengthSplit: true, lengthSkipped: 12 })
    expect(r).not.toHaveProperty('error')
    expect(new Set(classifiedIds(db))).toEqual(new Set(IDS.slice(0, 13)))
  })

  it('any other model failure still throws, for Inngest to retry the step', async () => {
    h.parse.mockImplementation(async () => { throw new Error('500 upstream error') })
    await expect(runClassifyMetaBatch(CLIENT, RUN, IDS, 1)).rejects.toThrow('500 upstream error')
  })
})
