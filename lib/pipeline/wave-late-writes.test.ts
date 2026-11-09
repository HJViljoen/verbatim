import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A LATE BATCH WRITES NO ROW (9 Nov, the release review). A wave's step
// returns at its deadline (`settleMembers`, lib/pipeline/step-budget.ts) and
// the batch still running then is abandoned, not stopped: its promise runs on
// in the instance while the batch reruns as a step of its own under its old
// id. Nothing makes the gather-time transcript and cover-text writes
// idempotent (an update by video id, any status), so a late answer from the
// abandoned pass, a Whisper fallback's `failed` or a timed-out vision call's,
// would land over the `ok` its own step had written. Past the wave's signal
// these batches write nothing and start nothing. No network, no model: the
// database is lib/test/fake-db.ts, the providers are stubs.

const h = vi.hoisted(() => ({
  db: null as unknown,
  resolve: vi.fn(),
  parse: vi.fn(),
}))
vi.mock('../supabase-admin', async (orig) => {
  const real = await orig<typeof import('../supabase-admin')>()
  return { ...real, createAdminClient: () => h.db }
})
vi.mock('../gather/transcript', async (orig) => {
  const real = await orig<typeof import('../gather/transcript')>()
  return { ...real, resolveTranscript: h.resolve }
})
vi.mock('../openai', async (orig) => {
  const real = await orig<typeof import('../openai')>()
  return { ...real, openai: { chat: { completions: { parse: h.parse } } } }
})

import { fakeDb, type FakeDb } from '../test/fake-db'
import { transcribeBatch } from '../gather/gather'
import { ocrBackfillBatch, resetOcrColumnCache } from './ocr'

const CLIENT = '00000000-0000-4000-8000-0000000000aa'
const RUN = 'c5690bb0-0000-4000-8000-000000000001'
const PIPELINE = readFileSync(join(__dirname, '..', '..', 'inngest', 'functions', 'pipeline.ts'), 'utf8')

const videoUpdates = (db: FakeDb) => db.calls.filter((c) => c.table === 'videos' && c.op === 'update')

describe('transcribe: a batch past its wave\'s deadline writes no transcript', () => {
  let db: FakeDb
  let rows: Record<string, unknown>[]
  beforeEach(() => {
    rows = ['v1', 'v2'].map((video_id) => ({
      client_id: CLIENT, platform: 'tiktok', video_id, transcript: null, transcript_status: null, transcript_attempts: 0,
    }))
    db = fakeDb({
      video_raw: ['v1', 'v2'].map((video_id, i) => ({
        id: i + 1, client_id: CLIENT, run_id: RUN, platform: 'tiktok', video_id, raw: { video: { url: `https://cdn.example/${video_id}.mp4` } },
      })),
      videos: rows,
      ai_call_log: [],
    })
    h.db = db.client
    h.resolve.mockReset()
  })

  /** v1 is still resolving at the deadline; meanwhile the batch's own step
   *  transcribes it, and the abandoned pass's Whisper fallback then fails. */
  const lateFailure = (wave?: AbortController) => async () => {
    wave?.abort()
    Object.assign(rows[0], { transcript: 'what the own step heard', transcript_status: 'ok', transcript_attempts: 1 })
    return { text: '', lang: null, source: null, status: 'failed' as const, error: 'whisper: Request timed out.' }
  }

  it('leaves the own step\'s ok as it is, and starts no further video', async () => {
    const wave = new AbortController()
    h.resolve.mockImplementation(lateFailure(wave))
    await transcribeBatch({ clientId: CLIENT, runId: RUN, platform: 'tiktok', videoIds: ['v1', 'v2'], batchNo: 1, signal: wave.signal })
    expect(videoUpdates(db)).toEqual([])
    expect(rows[0]).toMatchObject({ transcript: 'what the own step heard', transcript_status: 'ok', transcript_attempts: 1 })
    expect(h.resolve).toHaveBeenCalledTimes(1) // v2 is the own step's
    expect(rows[1].transcript_status).toBeNull()
    // what the pass spent is still on the ledger
    expect(db.calls.some((c) => c.table === 'ai_call_log' && c.op === 'insert')).toBe(true)
  })

  it('without the signal (the bug), the late failed lands over the ok', async () => {
    h.resolve.mockImplementationOnce(lateFailure()).mockResolvedValue({ text: '', lang: null, source: null, status: 'no_speech' })
    await transcribeBatch({ clientId: CLIENT, runId: RUN, platform: 'tiktok', videoIds: ['v1', 'v2'], batchNo: 1 })
    expect(rows[0]).toMatchObject({ transcript: null, transcript_status: 'failed' })
  })

  it('a batch whose wave has not reached its deadline writes as it always did', async () => {
    const wave = new AbortController()
    h.resolve.mockResolvedValue({ text: 'words heard', lang: 'en', source: 'assemblyai', status: 'ok' })
    await transcribeBatch({ clientId: CLIENT, runId: RUN, platform: 'tiktok', videoIds: ['v1', 'v2'], batchNo: 1, signal: wave.signal })
    expect(videoUpdates(db)).toHaveLength(2)
    expect(rows.map((r) => r.transcript_status)).toEqual(['ok', 'ok'])
  })
})

describe('cover text: a batch past its wave\'s deadline writes no ocr status', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  let db: FakeDb
  let rows: Record<string, unknown>[]
  beforeEach(() => {
    resetOcrColumnCache()
    rows = ['yt1', 'yt2'].map((video_id) => ({
      client_id: CLIENT, platform: 'youtube', video_id, ocr_text: null, ocr_status: null, ocr_attempts: 0,
    }))
    db = fakeDb({ videos: rows, ai_call_log: [] })
    h.db = db.client
    h.parse.mockReset()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } })))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  /** yt1's vision call is still out at the deadline; its own step reads the
   *  cover meanwhile, and the abandoned call then times out. */
  const lateTimeout = (wave?: AbortController) => async () => {
    wave?.abort()
    Object.assign(rows[0], { ocr_text: 'SALE ENDS SUNDAY', ocr_status: 'ok', ocr_attempts: 1 })
    throw new Error('Request timed out.')
  }

  it('leaves the own step\'s ok as it is, and starts no further cover', async () => {
    const wave = new AbortController()
    h.parse.mockImplementation(lateTimeout(wave))
    await ocrBackfillBatch({ clientId: CLIENT, runId: RUN, videoIds: ['yt1', 'yt2'], batchNo: 1, signal: wave.signal })
    expect(videoUpdates(db)).toEqual([])
    expect(rows[0]).toMatchObject({ ocr_text: 'SALE ENDS SUNDAY', ocr_status: 'ok', ocr_attempts: 1 })
    expect(h.parse).toHaveBeenCalledTimes(1)
    expect(rows[1].ocr_status).toBeNull()
  })

  it('without the signal (the bug), the late failed lands over the ok', async () => {
    h.parse.mockImplementationOnce(lateTimeout()).mockResolvedValue({
      choices: [{ message: { refusal: null, parsed: { lines: [] } } }], usage: { prompt_tokens: 10, completion_tokens: 2 },
    })
    await ocrBackfillBatch({ clientId: CLIENT, runId: RUN, videoIds: ['yt1', 'yt2'], batchNo: 1 })
    expect(rows[0].ocr_status).toBe('failed')
  })
})

describe('the pipeline hands each of these batches its wave\'s signal', () => {
  it('transcribe, cover text and the cover-text backfill, as comments already were', () => {
    expect(PIPELINE).toContain('transcribeBatch({ clientId, runId, platform, videoIds, batchNo: i + 1, signal })')
    expect(PIPELINE).toContain('ocrBatch({ clientId, runId, platform: platform as Platform, videoIds, batchNo: i + 1, signal })')
    expect(PIPELINE).toContain('ocrBackfillBatch({ clientId, runId, videoIds, batchNo: i + 1, signal })')
    expect(PIPELINE).toContain('scrapeCommentsBatch({ clientId, runId, platform, refs, skipScrapedThisRun: true, signal })')
  })
})
