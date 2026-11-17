import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APIConnectionTimeoutError } from 'openai'
import { LengthFinishReasonError } from 'openai/core/error'

// THE COVER READ'S LIMITS (17 Nov). Sealand's resumed run `d8a15862` failed
// with a 504 because `ocr:instagram:16-of-17` hit Vercel's 300 s on all three
// attempts: a cover sent gpt-4.1-mini into a loop inside its structured
// output, and the call had no output ceiling, a ten-minute timeout and two
// silent retries. These pin the ceiling, the timeout and the retry the call
// now carries, the batch's clock, and that a loop or a timeout is stamped as
// one of the video's OCR attempts, never thrown out of the step. No network,
// no model: the database is lib/test/fake-db.ts, the SDK is a stub.

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
  buildOcrPrompt, needsOcr, ocrBackfillBatch, ocrBatch, ocrCallOptions, ocrCoverFrame, ocrCutByClock, resetOcrColumnCache,
} from './ocr'
import {
  ANALYSIS_TEMPERATURE, OCR_BATCH, OCR_CALL_CAP_MS, OCR_CALL_FLOOR_MS, OCR_FETCH_TIMEOUT_MS, OCR_MAX_ATTEMPTS,
  OCR_MAX_OUTPUT_TOKENS, OCR_MAX_RETRIES, OCR_MODEL, OCR_STEP_BUDGET_MS,
} from '../config'
import { WAVE_DEADLINE_MS } from './step-budget'

const CLIENT = 'ac16988e-0000-4000-8000-0000000000aa'
const RUN = 'd8a15862-0000-4000-8000-000000000001'
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const LENGTH = 'Could not parse response content as the length limit was reached'

const answer = (lines: string[]) => ({
  choices: [{ message: { refusal: null, parsed: { lines } } }],
  usage: { prompt_tokens: 5261, completion_tokens: 18 },
})

beforeEach(() => {
  resetOcrColumnCache()
  h.parse.mockReset()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } })))
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

  it('one retry, and a hung read with its retry still fits a batch started on time', () => {
    expect(OCR_MAX_RETRIES).toBe(1)
    expect((OCR_MAX_RETRIES + 1) * OCR_CALL_CAP_MS).toBeLessThan(OCR_STEP_BUDGET_MS - OCR_CALL_FLOOR_MS)
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
})
