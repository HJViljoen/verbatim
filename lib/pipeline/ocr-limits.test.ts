import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OpenAI, { APIConnectionTimeoutError } from 'openai'
import { LengthFinishReasonError } from 'openai/core/error'

// THE COVER READ'S LIMITS (17 Nov). Sealand's resumed run `d8a15862` failed
// with a 504 because `ocr:instagram:16-of-17` hit Vercel's 300 s on all three
// attempts: a cover sent gpt-4.1-mini into a loop inside its structured
// output, and the call had no output ceiling, a ten-minute timeout and two
// silent retries. These pin the ceiling, the timeout and the retry the call
// now carries, the batch's clock, and that a loop or a timeout is stamped as
// one of the video's OCR attempts, never thrown out of the step. And (the
// review of f5778a15) that a batch reads the covers it has tried least first,
// that a batch its clock stopped inside its wave gets its own step, once, and
// that what is still unread then is a warning. No network, no model: the
// database is lib/test/fake-db.ts, the SDK is a stub (the real client only
// where its retry timing is the point, over a fetch that never answers).

const h = vi.hoisted(() => ({ db: null as unknown, parse: vi.fn() }))
vi.mock('../supabase-admin', async (orig) => {
  const real = await orig<typeof import('../supabase-admin')>()
  return { ...real, createAdminClient: () => h.db }
})
vi.mock('../openai', async (orig) => {
  const real = await orig<typeof import('../openai')>()
  return { ...real, openai: { chat: { completions: { parse: h.parse } } } }
})

import { fakeDb, type FakeDb } from '../test/fake-db'
import {
  buildOcrPrompt, emptyOcrResult, mergeOcrResults, needsOcr, ocrBackfillBatch, ocrBatch, ocrCallOptions, ocrCoverFrame,
  ocrCutByClock, resetOcrColumnCache, type OcrResult,
} from './ocr'
import {
  ANALYSIS_TEMPERATURE, OCR_BATCH, OCR_CALL_CAP_MS, OCR_CALL_FLOOR_MS, OCR_FETCH_TIMEOUT_MS, OCR_MAX_ATTEMPTS,
  OCR_MAX_OUTPUT_TOKENS, OCR_MAX_RETRIES, OCR_MODEL, OCR_STEP_BUDGET_MS, estimateCost,
} from '../config'
import { fanOut, WAVE_DEADLINE_MS } from './step-budget'
import { untilAborted } from './translate'
import { runWarning, warningSentence, WARNING_STEPS } from './run-warnings'

const CLIENT = 'ac16988e-0000-4000-8000-0000000000aa'
const RUN = 'd8a15862-0000-4000-8000-000000000001'
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const LENGTH = 'Could not parse response content as the length limit was reached'
const PIPELINE = readFileSync(join(__dirname, '..', '..', 'inngest', 'functions', 'pipeline.ts'), 'utf8')
/** The cover urls fetched, in order: which video each read was. */
const fetched: string[] = []

const answer = (lines: string[]) => ({
  choices: [{ message: { refusal: null, parsed: { lines } } }],
  usage: { prompt_tokens: 5261, completion_tokens: 18 },
})

beforeEach(() => {
  resetOcrColumnCache()
  h.parse.mockReset()
  fetched.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
    fetched.push(String(url))
    return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } })
  }))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

// ---- the numbers, against the ledger they were chosen from ---------------------

describe('the limits, against the ledger (every OCR call to 17 Nov: 17,056)', () => {
  it('the output ceiling is twice the largest answer ever returned, so no real read reaches it', () => {
    // max 1,977 tokens (itself a degenerate list that ended on its own); p99.9 336.
    expect(OCR_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(2 * 1_977)
  })

  it('a loop reaches the ceiling before the timeout, so it ends on a length error the SDK does not retry', () => {
    // 68 tokens a second is the slowest rate on the ledger (the cover fetch
    // counted in, so the real rate is faster); the 17 Nov loops ran at ~109.
    expect((OCR_MAX_OUTPUT_TOKENS / 68) * 1000).toBeLessThan(OCR_CALL_CAP_MS)
    // and the timeout is far above the slowest real read (10.9 s, fetch included).
    expect(OCR_CALL_CAP_MS).toBeGreaterThan(8 * 10_900)
  })

  it('two retries, the SDK default and the translate step\'s: three hung attempts would pass the clock, which is what ends them', () => {
    expect(OCR_MAX_RETRIES).toBe(2)
    expect((OCR_MAX_RETRIES + 1) * OCR_CALL_CAP_MS).toBeGreaterThan(OCR_STEP_BUDGET_MS)
  })

  it('the batch clock is the wave deadline, so the route keeps its 60 s for the replay and the answer', () => {
    expect(OCR_STEP_BUDGET_MS).toBe(WAVE_DEADLINE_MS)
    expect(300_000 - OCR_STEP_BUDGET_MS).toBeGreaterThanOrEqual(60_000)
    // a read starts only with room for a fetch and the slowest real read
    expect(OCR_CALL_FLOOR_MS).toBeGreaterThanOrEqual(OCR_FETCH_TIMEOUT_MS + 10_900)
  })

  it('without the clock, a batch of looping covers alone would pass 300 s', () => {
    const perLoop = OCR_FETCH_TIMEOUT_MS + (OCR_MAX_OUTPUT_TOKENS / 68) * 1000
    expect(OCR_BATCH * perLoop).toBeGreaterThan(300_000)
  })
})

// ---- the request ---------------------------------------------------------------

describe('ocrCoverFrame: the request carries the limits and nothing else changes', () => {
  const COVER = 'https://i.ytimg.com/vi/abc/hqdefault.jpg'

  it('sends the ceiling with the same model, prompt, temperature and schema', async () => {
    h.parse.mockResolvedValue(answer(['SALE ENDS SUNDAY']))
    const r = await ocrCoverFrame(COVER)
    expect(r.lines).toEqual(['SALE ENDS SUNDAY'])
    const [body, options] = h.parse.mock.calls[0]
    // Exactly the old body plus the ceiling: no other key moved.
    expect(Object.keys(body).sort()).toEqual(['max_completion_tokens', 'messages', 'model', 'response_format', 'temperature'])
    expect(body.max_completion_tokens).toBe(OCR_MAX_OUTPUT_TOKENS)
    expect(body.model).toBe(OCR_MODEL)
    expect(body.temperature).toBe(ANALYSIS_TEMPERATURE)
    expect(body.response_format.json_schema.name).toBe('on_screen_text')
    expect(body.messages[0]).toEqual({ role: 'system', content: buildOcrPrompt().system })
    expect(body.messages[1].content[0]).toEqual({ type: 'text', text: buildOcrPrompt().user })
    expect(body.messages[1].content[1].image_url.url).toMatch(/^data:image\/png;base64,/)
    // Off a batch's clock (a script): the cap and the one retry, never the SDK's ten minutes and two.
    expect(options).toEqual({ timeout: OCR_CALL_CAP_MS, maxRetries: OCR_MAX_RETRIES })
  })

  it('hands the SDK a batch read\'s timeout, retry and clock signal', async () => {
    h.parse.mockResolvedValue(answer([]))
    const request = ocrCallOptions(240_000, 200_000)!
    await ocrCoverFrame(COVER, request)
    expect(h.parse.mock.calls[0][1]).toBe(request)
    expect(request).toMatchObject({ timeout: 40_000, maxRetries: OCR_MAX_RETRIES })
  })

  it('ends at the clock whatever the SDK is still doing (a Retry-After sleep included)', async () => {
    h.parse.mockReturnValue(new Promise(() => {}))
    const ctrl = new AbortController()
    const read = ocrCoverFrame(COVER, { timeout: OCR_CALL_CAP_MS, maxRetries: OCR_MAX_RETRIES, signal: ctrl.signal })
    await vi.waitFor(() => expect(h.parse).toHaveBeenCalled())
    ctrl.abort()
    await expect(read).rejects.toThrow('Request was aborted.')
  })
})

describe('ocrCallOptions and ocrCutByClock', () => {
  it('gives a read its cap while the batch has room, then what is left, and nothing under the floor', () => {
    expect(ocrCallOptions(240_000, 0)).toMatchObject({ timeout: OCR_CALL_CAP_MS, maxRetries: OCR_MAX_RETRIES })
    expect(ocrCallOptions(240_000, 200_000)?.timeout).toBe(40_000)
    expect(ocrCallOptions(240_000, 240_000 - OCR_CALL_FLOOR_MS)).not.toBeNull()
    expect(ocrCallOptions(240_000, 240_000 - OCR_CALL_FLOOR_MS + 1)).toBeNull()
    expect(ocrCallOptions(240_000, 0)?.signal).toBeInstanceOf(AbortSignal)
  })

  it('blames the clock only for its abort, or an SDK timeout on an attempt it shortened', () => {
    const full = { timeout: OCR_CALL_CAP_MS, maxRetries: OCR_MAX_RETRIES, signal: new AbortController().signal }
    const shortened = { ...full, timeout: 40_000 }
    const ctrl = new AbortController()
    ctrl.abort()
    expect(ocrCutByClock({ ...full, signal: ctrl.signal }, new Error('Request was aborted.'))).toBe(true)
    expect(ocrCutByClock(shortened, new APIConnectionTimeoutError())).toBe(true)
    // The video's own: a full-length timeout, the output ceiling, and the
    // cover fetch's 8 s timeout even late in the batch.
    expect(ocrCutByClock(full, new APIConnectionTimeoutError())).toBe(false)
    expect(ocrCutByClock(shortened, new LengthFinishReasonError())).toBe(false)
    expect(ocrCutByClock(shortened, new Error('The operation was aborted due to timeout'))).toBe(false)
  })
})

// ---- the error path ------------------------------------------------------------

/** A gather-time Instagram batch over the run's raw items. */
function instagramBatch(ids: string[], over: Record<string, Record<string, unknown>> = {}) {
  const rows = ids.map((video_id) => ({
    client_id: CLIENT, platform: 'instagram', video_id, ocr_text: null, ocr_status: null, ocr_attempts: 0, ocr_error: null,
    ...over[video_id],
  }))
  const db = fakeDb({
    video_raw: ids.map((video_id, i) => ({
      id: 25_000 + i, client_id: CLIENT, run_id: RUN, platform: 'instagram', video_id,
      raw: { displayUrl: `https://scontent-ams4-1.cdninstagram.com/v/${video_id}.jpg` },
    })),
    videos: rows,
    ai_call_log: [],
  })
  h.db = db.client
  const byId = (id: string) => rows.find((r) => r.video_id === id)!
  return { db, rows, byId }
}
const videoUpdates = (db: FakeDb) => db.calls.filter((c) => c.table === 'videos' && c.op === 'update')

describe('a looping or timed-out read is one failed OCR attempt, and the batch goes on', () => {
  it('stamps the output ceiling\'s length error as an attempt and reads the next cover', async () => {
    const { rows, byId } = instagramBatch(['DfpRqHWihH0', 'Dfv_4bNlyd7'])
    h.parse.mockRejectedValueOnce(new LengthFinishReasonError()).mockResolvedValueOnce(answer(['Free shipping']))
    const r = await ocrBatch({ clientId: CLIENT, runId: RUN, platform: 'instagram', videoIds: rows.map((x) => x.video_id), batchNo: 16 })
    expect(r).toMatchObject({ failed: 1, ok: 1, outOfTime: 0, rateLimited: false })
    expect(r.errors).toEqual([`ocr (DfpRqHWihH0): ${LENGTH}`])
    expect(byId('DfpRqHWihH0')).toMatchObject({ ocr_status: 'failed', ocr_error: LENGTH, ocr_attempts: 1 })
    expect(byId('Dfv_4bNlyd7')).toMatchObject({ ocr_status: 'ok', ocr_text: 'Free shipping', ocr_attempts: 1 })
  })

  it('stamps a full-length timeout as an attempt too', async () => {
    const { rows, byId } = instagramBatch(['Dfv_4bNlyd7'])
    h.parse.mockRejectedValue(new APIConnectionTimeoutError())
    const r = await ocrBatch({ clientId: CLIENT, runId: RUN, platform: 'instagram', videoIds: rows.map((x) => x.video_id), batchNo: 16 })
    expect(r).toMatchObject({ failed: 1, outOfTime: 0 })
    expect(byId('Dfv_4bNlyd7')).toMatchObject({ ocr_status: 'failed', ocr_error: 'Request timed out.', ocr_attempts: 1 })
  })

  it('so OCR_MAX_ATTEMPTS bounds a cover that loops every time: its last attempt makes it terminal', async () => {
    const { rows, byId } = instagramBatch(['DfpRqHWihH0'], { DfpRqHWihH0: { ocr_status: 'failed', ocr_attempts: OCR_MAX_ATTEMPTS - 1, ocr_error: LENGTH } })
    h.parse.mockRejectedValue(new LengthFinishReasonError())
    expect(needsOcr(byId('DfpRqHWihH0'), { coverStillAnswers: true })).toBe(true)
    await ocrBatch({ clientId: CLIENT, runId: RUN, platform: 'instagram', videoIds: rows.map((x) => x.video_id), batchNo: 16 })
    expect(byId('DfpRqHWihH0').ocr_attempts).toBe(OCR_MAX_ATTEMPTS)
    expect(needsOcr(byId('DfpRqHWihH0'), { coverStillAnswers: true })).toBe(false)
    // and a later pass over the batch (its own step, a retry, the next run) pays nothing for it
    h.parse.mockClear()
    const again = await ocrBatch({ clientId: CLIENT, runId: RUN, platform: 'instagram', videoIds: rows.map((x) => x.video_id), batchNo: 16 })
    expect(h.parse).not.toHaveBeenCalled()
    expect(again.skipped).toBe(1)
  })

  it('the YouTube backfill takes the same path', async () => {
    const rows = [{ client_id: CLIENT, platform: 'youtube', video_id: 'f9K6ieuYvrk', ocr_text: null, ocr_status: null, ocr_attempts: 0, ocr_error: null }]
    const db = fakeDb({ videos: rows, ai_call_log: [] })
    h.db = db.client
    h.parse.mockRejectedValue(new LengthFinishReasonError())
    const r = await ocrBackfillBatch({ clientId: CLIENT, runId: RUN, videoIds: ['f9K6ieuYvrk'], batchNo: 1 })
    expect(r).toMatchObject({ failed: 1, outOfTime: 0 })
    expect(rows[0]).toMatchObject({ ocr_status: 'failed', ocr_error: LENGTH, ocr_attempts: 1 })
  })
})

// ---- the batch's clock -------------------------------------------------------------

describe('the batch clock: no batch of covers outlives OCR_STEP_BUDGET_MS', () => {
  it('holds each read to what is left and leaves what it cannot reach unstamped', async () => {
    const { db, rows, byId } = instagramBatch(['v1', 'v2', 'v3'])
    let t = 0
    const timeouts: number[] = []
    // v1 takes 200 s of the batch's 240, so v2 gets the 40 s left, not its
    // 90 s cap; v2 takes 30 s, which leaves v3 under the floor.
    h.parse.mockImplementation(async (_body: unknown, request: { timeout: number }) => {
      timeouts.push(request.timeout)
      t += timeouts.length === 1 ? 200_000 : 30_000
      return answer(['TEXT'])
    })
    const r = await ocrBatch({ clientId: CLIENT, runId: RUN, platform: 'instagram', videoIds: rows.map((x) => x.video_id), batchNo: 1, now: () => t })
    expect(timeouts).toEqual([OCR_CALL_CAP_MS, 40_000])
    expect(r).toMatchObject({ ok: 2, outOfTime: 1, failed: 0 })
    expect(videoUpdates(db).length).toBe(2)
    expect(byId('v3')).toMatchObject({ ocr_status: null, ocr_attempts: 0 })
  })

  it('costs a video none of its attempts when the clock cut its read short', async () => {
    const { rows, byId } = instagramBatch(['v1', 'v2'])
    let t = 0
    h.parse.mockImplementation(async (_body: unknown, request: { timeout: number }) => {
      if (request.timeout < OCR_CALL_CAP_MS) throw new APIConnectionTimeoutError()
      t += 200_000
      return answer(['TEXT'])
    })
    const r = await ocrBatch({ clientId: CLIENT, runId: RUN, platform: 'instagram', videoIds: rows.map((x) => x.video_id), batchNo: 1, now: () => t })
    expect(r).toMatchObject({ ok: 1, outOfTime: 1, failed: 0 })
    expect(byId('v2')).toMatchObject({ ocr_status: null, ocr_attempts: 0 })
  })

  it('the worst case: a whole batch of looping covers ends inside the clock, and none of it throws', async () => {
    const ids = Array.from({ length: OCR_BATCH }, (_, i) => `loop${i + 1}`)
    const { rows } = instagramBatch(ids)
    let t = 0
    const spans: [number, number][] = []
    // Each loop runs to the ceiling at the slowest rate on the ledger.
    const loop = Math.ceil((OCR_MAX_OUTPUT_TOKENS / 68) * 1000)
    h.parse.mockImplementation(async (_body: unknown, request: { timeout: number }) => {
      const start = t
      t += Math.min(loop, request.timeout)
      spans.push([start, start + request.timeout])
      throw t - start < loop ? new APIConnectionTimeoutError() : new LengthFinishReasonError()
    })
    const r = await ocrBatch({ clientId: CLIENT, runId: RUN, platform: 'instagram', videoIds: ids, batchNo: 16, now: () => t })
    // 0, 59, 118, 177 s: four loops stamped; the fifth would start at 236 s, under the floor.
    expect(r.failed).toBe(4)
    expect(r.outOfTime).toBe(OCR_BATCH - 4)
    expect(t).toBeLessThanOrEqual(OCR_STEP_BUDGET_MS)
    // no read was allowed past the clock
    for (const [, end] of spans) expect(end).toBeLessThanOrEqual(OCR_STEP_BUDGET_MS)
    expect(rows.filter((x) => x.ocr_status === 'failed').map((x) => x.ocr_attempts)).toEqual([1, 1, 1, 1])
    expect(rows.filter((x) => x.ocr_status === null)).toHaveLength(OCR_BATCH - 4)
  })

  it('the backfill keeps the same clock', async () => {
    const rows = ['y1', 'y2'].map((video_id) => ({ client_id: CLIENT, platform: 'youtube', video_id, ocr_text: null, ocr_status: null, ocr_attempts: 0 }))
    h.db = fakeDb({ videos: rows, ai_call_log: [] }).client
    let t = 0
    h.parse.mockImplementation(async () => { t += OCR_STEP_BUDGET_MS - OCR_CALL_FLOOR_MS + 1; return answer([]) })
    const r = await ocrBackfillBatch({ clientId: CLIENT, runId: RUN, videoIds: ['y1', 'y2'], batchNo: 1, now: () => t })
    expect(r).toMatchObject({ none: 1, outOfTime: 1 })
    expect(rows[1].ocr_status).toBeNull()
  })

  it('confirmed on the real SDK: three attempts and their backoff pass the clock, and the clock ends them', async () => {
    // Scaled 1:1000: 90 ms attempts, OCR_MAX_RETRIES retries, a 240 ms clock,
    // over a fetch that never answers (each attempt ends on its timeout).
    const attempts: number[] = []
    const hang = (async (_url: unknown, init?: RequestInit) => {
      attempts.push(Date.now())
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })
    }) as typeof fetch
    const client = new OpenAI({ apiKey: 'test', fetch: hang })
    const body = { model: OCR_MODEL, messages: [{ role: 'user' as const, content: 'x' }] }
    const t0 = Date.now()
    await expect(client.chat.completions.create(body, { timeout: 90, maxRetries: OCR_MAX_RETRIES })).rejects.toThrow(/timed out/i)
    const unbounded = Date.now() - t0
    expect(attempts).toHaveLength(OCR_MAX_RETRIES + 1)
    // 3 × 90 ms plus the SDK's backoff (0.5 s and 1 s, less up to a quarter's jitter)
    expect(unbounded).toBeGreaterThan(1_000)
    const clock = AbortSignal.timeout(240)
    const t1 = Date.now()
    await expect(untilAborted(client.chat.completions.create(body, { timeout: 90, maxRetries: OCR_MAX_RETRIES, signal: clock }), clock))
      .rejects.toThrow(/aborted/i)
    // ended at the clock, inside the backoff sleep the SDK's signal cannot reach
    expect(Date.now() - t1).toBeLessThan(1_000)
  })
})

// ---- the review of f5778a15: what the clock leaves is read, or said ---------------

/** A parse stub on the fake clock: a cover whose url names a loop runs to the
 *  ceiling at the slowest rate on the ledger (or to its shortened timeout); any
 *  other reads in 3 s. Reads are sequential in a batch, so the last cover
 *  fetched is the one being read. */
const LOOP_MS = Math.ceil((OCR_MAX_OUTPUT_TOKENS / 68) * 1000)
function clockedParse(clock: { t: number }) {
  return async (_body: unknown, request: { timeout: number }) => {
    const start = clock.t
    if (!/loop/.test(fetched.at(-1) ?? '')) { clock.t += 3_000; return answer(['TEXT']) }
    clock.t += Math.min(LOOP_MS, request.timeout)
    throw clock.t - start < LOOP_MS ? new APIConnectionTimeoutError() : new LengthFinishReasonError()
  }
}
const idOf = (url: string) => /\/v\/([^/.]+)\.jpg$/.exec(url)?.[1] ?? /\/vi\/([^/]+)\//.exec(url)?.[1] ?? url

describe('a batch reads the covers it has tried least first', () => {
  it('never-tried first, then by attempts, the raw items\' order within a count', async () => {
    const { rows } = instagramBatch(['a', 'b', 'c', 'd'], {
      a: { ocr_status: 'failed', ocr_attempts: 2 },
      c: { ocr_status: 'no_image', ocr_attempts: 1 },
    })
    h.parse.mockResolvedValue(answer(['TEXT']))
    const r = await ocrBatch({ clientId: CLIENT, runId: RUN, platform: 'instagram', videoIds: rows.map((x) => x.video_id), batchNo: 1 })
    expect(fetched.map(idOf)).toEqual(['b', 'd', 'c', 'a'])
    // the same covers read, the same answers stored: only the order moved
    expect(r).toMatchObject({ ok: 4, failed: 0, outOfTime: 0 })
    expect(rows.map((x) => x.ocr_status)).toEqual(['ok', 'ok', 'ok', 'ok'])
  })

  it('the backfill too', async () => {
    const rows = [
      { client_id: CLIENT, platform: 'youtube', video_id: 'y1', ocr_text: null, ocr_status: 'failed', ocr_attempts: 1 },
      { client_id: CLIENT, platform: 'youtube', video_id: 'y2', ocr_text: null, ocr_status: null, ocr_attempts: 0 },
    ]
    h.db = fakeDb({ videos: rows, ai_call_log: [] }).client
    h.parse.mockResolvedValue(answer([]))
    await ocrBackfillBatch({ clientId: CLIENT, runId: RUN, videoIds: ['y1', 'y2'], batchNo: 1 })
    expect(fetched.map(idOf)).toEqual(['y2', 'y1'])
  })

  it('so a batch\'s own step reads the never-tried covers before this run\'s loops (4 loops, then 4 never tried)', async () => {
    const ids = ['loop1', 'loop2', 'loop3', 'loop4', 'new1', 'new2', 'new3', 'new4']
    const tried = Object.fromEntries(ids.slice(0, 4).map((id) => [id, { ocr_status: 'failed', ocr_attempts: 1, ocr_error: LENGTH }]))
    const { byId } = instagramBatch(ids, tried)
    const clock = { t: 0 }
    h.parse.mockImplementation(clockedParse(clock))
    // its own step: no wave signal, a fresh clock
    const r = await ocrBatch({ clientId: CLIENT, runId: RUN, platform: 'instagram', videoIds: ids, batchNo: 16, now: () => clock.t })
    // new1-4 in 12 s; loops at 12, 71 and 130 s; the fourth, at 189 s, has 51 s left and is cut
    expect(fetched.map(idOf)).toEqual(['new1', 'new2', 'new3', 'new4', 'loop1', 'loop2', 'loop3', 'loop4'])
    expect(r).toMatchObject({ ok: 4, failed: 3, outOfTime: 1 })
    for (const id of ['new1', 'new2', 'new3', 'new4']) expect(byId(id).ocr_status, id).toBe('ok')
    expect(['loop1', 'loop2', 'loop3', 'loop4'].map((id) => byId(id).ocr_attempts)).toEqual([2, 2, 2, 1])
    expect(clock.t).toBeLessThanOrEqual(OCR_STEP_BUDGET_MS)
  })
})

describe('a batch its clock stopped inside its wave gets its own step, once', () => {
  /** fanOut over one batch, wired as the pipeline wires the gather-time OCR,
   *  on a step that memoises by id through JSON, as Inngest does. */
  async function runWave(ids: string[], clock: { t: number }, memo = new Map<string, unknown>()) {
    const runs: string[] = []
    const step = {
      run: async (id: string, fn: () => Promise<unknown>) => {
        if (!memo.has(id)) { runs.push(id); memo.set(id, JSON.parse(JSON.stringify(await fn()))) }
        return memo.get(id)
      },
    }
    const results = await fanOut<string[], OcrResult>(step, {
      waveId: (w, n) => `ocr-wave:instagram:${w}-of-${n}`,
      memberId: (w, j) => `ocr:instagram:${w + j + 1}-of-1`,
      items: [ids],
      parallel: 4,
      run: (videoIds, i, signal) => ocrBatch({ clientId: CLIENT, runId: RUN, platform: 'instagram', videoIds, batchNo: i + 1, signal, now: () => clock.t }),
      unfinished: (r) => (r.outOfTime ?? 0) > 0,
      merge: mergeOcrResults,
      fallback: () => emptyOcrResult(),
    })
    return { runs, results, memo }
  }
  const READ_USD = estimateCost(OCR_MODEL, 5261, 18)

  it('6 loops then 2: the wave stops at 236 s with 4 unread and comes back ok; its own step reads the 2', async () => {
    const ids = ['loop1', 'loop2', 'loop3', 'loop4', 'loop5', 'loop6', 'ok7', 'ok8']
    const { byId } = instagramBatch(ids)
    const clock = { t: 0 }
    h.parse.mockImplementation(clockedParse(clock))
    const { runs, results, memo } = await runWave(ids, clock)
    expect(runs).toEqual(['ocr-wave:instagram:1-of-1', 'ocr:instagram:1-of-1'])
    expect(byId('ok7').ocr_status).toBe('ok')
    expect(byId('ok8').ocr_status).toBe('ok')
    // own step: loop5, loop6, ok7, ok8 (never tried), then loop1 again; loop2 is cut at the clock
    const own = memo.get('ocr:instagram:1-of-1') as OcrResult
    expect(own).toMatchObject({ ok: 2, failed: 3, outOfTime: 3 })
    expect(ids.map((id) => byId(id).ocr_attempts)).toEqual([2, 1, 1, 1, 1, 1, 1, 1])
    // the run's tally: the wave's four stamps and the own step's three, its reads' cost, its unread
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ ok: 2, failed: 4 + 3, outOfTime: 3, rateLimited: false })
    expect(results[0].errors).toHaveLength(7)
    expect(results[0].costUsd).toBeCloseTo(2 * READ_USD, 10)
    // and its own step's leftovers are final: no third pass
    expect(runs.filter((id) => id === 'ocr:instagram:1-of-1')).toHaveLength(1)
  })

  it('a 429 inside the wave survives the merge, with the wave\'s reads and their cost', async () => {
    // rl1 is rate-limited once (not stamped), ok2 reads, four loops take the
    // clock to 239 s, and ok7 is left; the own step reads rl1 and ok7.
    const ids = ['rl1', 'ok2', 'loop3', 'loop4', 'loop5', 'loop6', 'ok7']
    const { byId } = instagramBatch(ids)
    const clock = { t: 0 }
    let limited = false
    const clocked = clockedParse(clock)
    h.parse.mockImplementation(async (body: unknown, request: { timeout: number }) => {
      if (!limited && /rl1/.test(fetched.at(-1) ?? '')) {
        limited = true
        clock.t += 1_000
        throw Object.assign(new Error('429 Rate limit reached for gpt-4.1-mini'), { status: 429 })
      }
      return clocked(body, request)
    })
    const { memo, results } = await runWave(ids, clock)
    const wave = (memo.get('ocr-wave:instagram:1-of-1') as { ok: true; value: OcrResult }[])[0].value
    const own = memo.get('ocr:instagram:1-of-1') as OcrResult
    expect(wave).toMatchObject({ ok: 1, failed: 5, outOfTime: 1, rateLimited: true })
    expect(own).toMatchObject({ ok: 2, failed: 3, outOfTime: 1, rateLimited: false })
    expect(results[0]).toMatchObject({ ok: 3, failed: 8, outOfTime: 1, rateLimited: true, skipped: 0 })
    expect(results[0].costUsd).toBeCloseTo(3 * READ_USD, 10)
    expect(results[0].errors[0]).toMatch(/^ocr \(rl1\): 429 Rate limit/)
    expect(byId('rl1')).toMatchObject({ ocr_status: 'ok', ocr_attempts: 1 })
  })

  it('a replay merges the same two memoised values, and reads nothing', async () => {
    const ids = ['loop1', 'loop2', 'loop3', 'loop4', 'loop5', 'loop6', 'ok7', 'ok8']
    instagramBatch(ids)
    const clock = { t: 0 }
    h.parse.mockImplementation(clockedParse(clock))
    const first = await runWave(ids, clock)
    h.parse.mockClear()
    fetched.length = 0
    const replay = await runWave(ids, clock, first.memo)
    expect(replay.runs).toEqual([])
    expect(h.parse).not.toHaveBeenCalled()
    expect(replay.results).toEqual(first.results)
  })

  it('a batch its clock did not stop comes back from its wave as before, with no step of its own', async () => {
    const { rows } = instagramBatch(['a', 'b'])
    h.parse.mockResolvedValue(answer(['TEXT']))
    const { runs, results } = await runWave(rows.map((x) => x.video_id), { t: 0 })
    expect(runs).toEqual(['ocr-wave:instagram:1-of-1'])
    expect(results[0]).toMatchObject({ ok: 2, outOfTime: 0 })
  })

  it('a wave memoised before the clock (no outOfTime) is done, as it was', () => {
    const memoised = { ...emptyOcrResult() } as Partial<OcrResult>
    delete memoised.outOfTime
    const unfinished = (r: Partial<OcrResult>) => (r.outOfTime ?? 0) > 0
    expect(unfinished(memoised)).toBe(false)
  })

  it('the pipeline wires it, and the merge, on both OCR fan-outs and on no other', () => {
    const wiring = ['unfinished: (r) => (r.outOfTime ?? 0) > 0,', 'merge: mergeOcrResults,']
    for (const w of wiring) expect(PIPELINE.split(w), w).toHaveLength(3)
    expect(PIPELINE.match(/\bunfinished: /g)).toHaveLength(2)
    expect(PIPELINE.match(/\bmerge: /g)).toHaveLength(2)
    for (const wave of ['`ocr-wave:${platform}:${w}-of-${n}`', '`ocr-backfill-wave:${w}-of-${n}`']) {
      const at = PIPELINE.indexOf(`waveId: (w, n) => ${wave}`)
      const call = PIPELINE.slice(at, PIPELINE.indexOf('fallback: (', at))
      for (const w of wiring) expect(call, wave).toContain(w)
    }
  })

  it('mergeOcrResults: counts, cost and errors added, a 429 kept, the unread and the skips the own step did not make', () => {
    const inWave = { ...emptyOcrResult(), ok: 1, none: 2, noImage: 1, skipped: 3, failed: 4, outOfTime: 4, costUsd: 0.25, rateLimited: true, errors: ['a'] }
    const own = { ...emptyOcrResult(), ok: 2, none: 1, skipped: 6, failed: 3, outOfTime: 1, costUsd: 0.5, errors: ['b'] }
    expect(mergeOcrResults(inWave, own)).toEqual({
      ok: 3, none: 3, noImage: 1, skipped: 3, failed: 7, outOfTime: 1, costUsd: 0.75, rateLimited: true, errors: ['a', 'b'], samples: [],
    })
  })
})

describe('what the clock still leaves is a housekeeping warning, outside the failure ratio', () => {
  it('names the count, and is housekeeping: on the run row and the ops page, no alert', () => {
    expect(WARNING_STEPS['ocr-out-of-time'].kind).toBe('housekeeping')
    const w = runWarning('ocr-out-of-time', '3 covers not read')
    expect(w).toMatchObject({ step: 'ocr-out-of-time', kind: 'housekeeping', cause: '3 covers not read' })
    expect(warningSentence(w)).toBe(
      'Housekeeping: the on-screen text reads ran out of their clock (3 covers not read). Those videos are analysed without their on-screen text until a later update reads their covers: YouTube’s through the backfill, TikTok’s and Instagram’s only if it gathers the video again.',
    )
  })

  it('the pipeline notes it after both OCR fan-outs, from the final count, and keeps it out of the ratio', () => {
    const note = "if (ocr.outOfTime > 0) noteWarning('ocr-out-of-time', `${ocr.outOfTime} ${ocr.outOfTime === 1 ? 'cover' : 'covers'} not read`)"
    expect(PIPELINE).toContain(note)
    expect(PIPELINE.indexOf(note)).toBeGreaterThan(PIPELINE.indexOf('for (const r of ocrBackfillResults)'))
    expect(PIPELINE).toContain('{ attempted: ocr.ok + ocr.none + ocr.noImage + ocr.failed, errored: ocr.failed,')
    // a warning, never a counted error
    expect(PIPELINE).not.toMatch(/noteError\([^)]*outOfTime/)
  })
})
