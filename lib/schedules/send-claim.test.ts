import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SupabaseClient } from '@supabase/supabase-js'
import { RetryAfterError } from 'inngest'

import { fakeDb } from '../test/fake-db'
import { frozen, sealandRead } from '../test/weekly-read-fixture'
import { SCHEDULE_CLAIM_STALE_MS, SEALAND_CLIENT_ID } from '../config'
import { WEEKLY_READ_STARTER_KEY } from './artefact'
import type { ScheduleRow } from './types'

// THE DEAD CLAIM (22 Nov, Sealand's weekly issue), end to end and offline.
// The real `send:<scheduleId>` step body (inngest/functions/report.ts), its
// fetch answered by the real route (app/api/admin/schedules/run/route.ts),
// over the real runner and claim (lib/schedules/run.ts) on the table
// stand-in. Mail, Chromium, Storage and the quote words are stood in, as in
// weekly-read-send.test.ts. Inngest is stood in by calling the step's body
// once per attempt, as many times as `retries` allows, with the clock moved
// the way the executor would move it.

const mail = vi.hoisted(() => ({
  report: [] as { to: string[]; subject: string }[],
  alert: [] as { subject: string; text: string }[],
  review: [] as { to: string[] }[],
}))
const env = vi.hoisted(() => ({ client: null as unknown, stallParts: false, partsCalled: 0 }))

vi.mock('../email', () => ({
  sendReportEmail: vi.fn(async (r: { to: string[]; subject: string }) => { mail.report.push(r); return { sent: true } }),
  sendAlertEmail: vi.fn(async (subject: string, text: string) => { mail.alert.push({ subject, text }); return { sent: true } }),
  sendReviewEmail: vi.fn(async (r: { to: string[] }) => { mail.review.push(r); return { sent: true } }),
}))
vi.mock('../render/render', () => ({
  renderMany: vi.fn(async ({ jobs }: { jobs: unknown[] }) => jobs.map(() => ({ buffer: Buffer.from('%PDF-1.7'), ms: 1 }))),
  renderBaseUrl: (b: string) => b,
}))
vi.mock('../artifacts', () => ({
  storeArtifact: vi.fn(async () => ({ id: 'art-1', version: 1, format: 'pdf', stale: false })),
  replaceArtifactFile: vi.fn(async (_a: unknown, art: unknown) => art),
  logExport: vi.fn(async () => {}),
  artifactFilename: () => 'this-week-in-your-market.pdf',
}))
vi.mock('../quotes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../quotes')>()),
  fetchQuoteResolutionsByRefs: vi.fn(async (_c: unknown, refs: string[]) => new Map(refs.map((r) => [r, { text: `the words of ${r}` }]))),
}))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: () => env.client }))
// The functions' client: `createFunction` hands back what it was given, and
// no document build may start (`enqueueDocumentBuild` sends through it).
vi.mock('@/inngest/client', () => ({
  inngest: {
    createFunction: (opts: unknown, handler: unknown) => ({ opts, handler }),
    send: vi.fn(async () => { throw new Error('a build was enqueued') }),
  },
}))
// The parts' reads, which a test can stall the way Sealand's stalled.
vi.mock('../reports/weekly-read-lines-load', async (importOriginal) => {
  const real = await importOriginal<typeof import('../reports/weekly-read-lines-load')>()
  return {
    ...real,
    loadWeeklyReadParts: (...args: Parameters<typeof real.loadWeeklyReadParts>) => {
      env.partsCalled++
      return env.stallParts ? new Promise<never>(() => {}) : real.loadWeeklyReadParts(...args)
    },
  }
})

const route = await import('../../app/api/admin/schedules/run/route')
const { sendWeeklyReport } = (await import('../../inngest/functions/report')) as unknown as {
  sendWeeklyReport: {
    opts: { retries: number }
    handler: (ctx: { event: { data: unknown }; step: { run: (id: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => Promise<unknown>
  }
}
const { inngest } = await import('@/inngest/client')
const { runSchedule } = await import('./run')
const { snapshotWeeklyRead, WEEKLY_READ_BUILD_MS } = await import('../reports/weekly-read-build')

const CLIENT = SEALAND_CLIENT_ID
const RUN = 'run-47'
const RECIPIENTS = ['daniela@sealandgear.com', 'brayden@sealandgear.com']
// Sunday 22 Nov: the claim, and the step's retry 5 min 41 s later.
const CLAIMED_AT = '2026-11-22T07:57:45.000Z'
const RETRIED_AT = '2026-11-22T08:03:26.000Z'

function schedule(over: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id: 'sched-wr', client_id: CLIENT, name: 'This week in your market', starter_key: WEEKLY_READ_STARTER_KEY, report_id: null,
    artefact: 'weekly_read', cadence: 'every_update', recipients: RECIPIENTS, attach_pdf: false, share_days: 30,
    active: true, review: true, is_default: false, last_sent_at: null, created_by: null,
    created_at: '2026-10-03T08:00:00Z', updated_at: '2026-10-03T08:00:00Z',
    ...over,
  }
}

function world(s: ScheduleRow) {
  const tables: Record<string, Record<string, unknown>[]> = {
    report_sends: [],
    report_snapshots: [],
    share_links: [],
    artifacts: [{ id: 'art-1', stale: false, version: 1, format: 'pdf' }],
    export_events: [],
    clients: [{ id: CLIENT, company_name: 'Sealand' }],
    report_schedules: [s as unknown as Record<string, unknown>],
    reports: [],
    report_builds: [],
    users: [{ client_id: CLIENT, email: 'member@sealandgear.com', created_at: '2026-09-01T00:00:00Z' }],
    config_changes: [],
    week_reads: [{ client_id: CLIENT, run_id: RUN, kind: 'week', status: 'ready', data: frozen(sealandRead()), created_at: '2026-11-22T07:50:00Z' }],
  }
  const db = fakeDb(tables)
  env.client = db.client
  return { tables, admin: db.client as SupabaseClient }
}

/** The row the attempt that died left behind: claimed, nothing built. */
const deadClaim = (s: ScheduleRow, over: Record<string, unknown> = {}) => ({
  id: 'send-491c201a', client_id: CLIENT, schedule_id: s.id, schedule_name: s.name, run_id: RUN, status: 'claimed',
  claimed_at: CLAIMED_AT, recipients: s.recipients, snapshot_id: null, ready_at: null, published_at: null, error: null, ...over,
})

/** The `send:<scheduleId>` step's body, as the function hands it to Inngest. */
async function stepBody(s: ScheduleRow): Promise<() => Promise<unknown>> {
  let body: (() => Promise<unknown>) | null = null
  await sendWeeklyReport.handler({
    event: { data: { clientId: CLIENT, runId: RUN } },
    step: {
      run: async (id, fn) => {
        if (id === 'find-due-schedules') return [{ id: s.id, name: s.name }]
        expect(id).toBe(`send:${s.id}`)
        body = fn
        return { status: 'captured' }
      },
    },
  })
  return body!
}

/** The route, as the step's fetch reaches it; `killed` answers as Vercel does
 *  for a function past its 300 s, after the claim the dead attempt made. */
function serve(w: ReturnType<typeof world>, s: ScheduleRow, killed = false) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (killed) {
      killed = false
      w.tables.report_sends.push(deadClaim(s))
      return new Response('An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT', { status: 504 })
    }
    return route.POST(new Request(url, init))
  }))
}

/** One attempt: what the body returned, or what it threw. */
async function attempt(body: () => Promise<unknown>): Promise<{ ok: unknown } | { threw: unknown }> {
  try {
    return { ok: await body() }
  } catch (e) {
    return { threw: e }
  }
}

beforeEach(() => {
  mail.report.length = 0
  mail.alert.length = 0
  mail.review.length = 0
  env.stallParts = false
  env.partsCalled = 0
  vi.mocked(inngest.send).mockClear()
  vi.stubEnv('ALERT_EMAIL', 'heinrich@verbatim.test')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('a retry that meets a claim left by a dead attempt (22 Nov)', () => {
  it("Sealand's Sunday: killed, then 409 and a retry when the claim is stale, then taken over and built, inside the step's retries", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const s = schedule()
    const w = world(s)
    serve(w, s, true)
    const body = await stepBody(s)
    const attempts: Awaited<ReturnType<typeof attempt>>[] = []

    // Attempt 1 claims and is killed at the route's 300 s.
    vi.setSystemTime(new Date(CLAIMED_AT))
    attempts.push(await attempt(body))
    expect(attempts[0]).toMatchObject({ threw: expect.objectContaining({ message: expect.stringMatching(/^schedules\/run 504/) }) })

    // Attempt 2, Inngest's backoff later: the claim is young. Never "skipped,
    // 200, success": a 409, and a retry timed to the claim going stale.
    vi.setSystemTime(new Date(RETRIED_AT))
    attempts.push(await attempt(body))
    const second = attempts[1] as { threw: RetryAfterError }
    expect(second.threw).toBeInstanceOf(RetryAfterError)
    expect(second.threw.retryAfter).toBe(new Date(Date.parse(CLAIMED_AT) + SCHEDULE_CLAIM_STALE_MS + 60_000).toISOString())
    expect(w.tables.report_sends).toEqual([deadClaim(s)])
    expect(w.tables.report_snapshots).toEqual([])
    expect(mail.review).toEqual([])

    // Attempt 3, at that time: the claim is stale and taken over, and the
    // issue is built, held and reviewed once.
    vi.setSystemTime(new Date(second.threw.retryAfter))
    attempts.push(await attempt(body))
    expect(attempts[2]).toEqual({ ok: expect.objectContaining({ status: 'ready' }) })
    expect(attempts).toHaveLength(sendWeeklyReport.opts.retries + 1)
    expect(w.tables.report_sends).toHaveLength(1)
    expect(w.tables.report_sends[0]).toMatchObject({ id: 'send-491c201a', status: 'ready', snapshot_id: expect.any(String), published_at: expect.any(String) })
    expect(w.tables.report_snapshots).toHaveLength(1)
    // The takeover rides the same review path as a first attempt: the review
    // email goes to the operator, never Sealand's members (`reviewAudience`:
    // tenant reviews off, Sealand's sends locked), and nobody emails the list.
    expect(mail.review).toEqual([expect.objectContaining({ to: ['heinrich@verbatim.test'] })])
    expect(mail.report).toEqual([])
  })

  it('review off: the takeover emails the list once, and a later retry finds it sent', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const s = schedule({ review: false })
    const w = world(s)
    w.tables.report_sends.push(deadClaim(s))
    serve(w, s)
    const body = await stepBody(s)
    vi.setSystemTime(new Date(RETRIED_AT))
    const held = (await attempt(body)) as { threw: RetryAfterError }
    expect(held.threw).toBeInstanceOf(RetryAfterError)
    vi.setSystemTime(new Date(held.threw.retryAfter))
    expect(await attempt(body)).toEqual({ ok: expect.objectContaining({ status: 'sent' }) })
    expect(mail.report).toEqual([expect.objectContaining({ to: RECIPIENTS })])
    expect(await attempt(body)).toEqual({ ok: expect.objectContaining({ status: 'already_sent' }) })
    expect(mail.report).toHaveLength(1)
    expect(w.tables.report_snapshots).toHaveLength(1)
  })

  it('a holder that was alive and finished: the retry finds it sent and does nothing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const s = schedule({ review: false })
    const w = world(s)
    w.tables.report_sends.push(deadClaim(s))
    serve(w, s)
    const body = await stepBody(s)
    vi.setSystemTime(new Date(RETRIED_AT))
    const held = (await attempt(body)) as { threw: RetryAfterError }
    Object.assign(w.tables.report_sends[0], { status: 'sent', sent_at: RETRIED_AT, snapshot_id: 'snap-theirs' })
    vi.setSystemTime(new Date(held.threw.retryAfter))
    expect(await attempt(body)).toEqual({ ok: expect.objectContaining({ status: 'already_sent' }) })
    expect(mail.report).toEqual([])
    expect(w.tables.report_snapshots).toEqual([])
  })

  it('a holder that stood it ready and died delivering it: never rebuilt, so the list is never emailed twice', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const s = schedule({ review: false })
    const w = world(s)
    w.tables.report_sends.push(deadClaim(s))
    serve(w, s)
    const body = await stepBody(s)
    vi.setSystemTime(new Date(RETRIED_AT))
    const held = (await attempt(body)) as { threw: RetryAfterError }
    // It built, stood ready, and its delivery re-claimed the row and died
    // (perhaps after the email went): `deliverSend`'s claim on a ready row.
    Object.assign(w.tables.report_sends[0], { snapshot_id: 'snap-theirs', ready_at: '2026-11-22T08:04:00.000Z', claimed_at: '2026-11-22T08:04:01.000Z' })
    for (const at of [held.threw.retryAfter, '2026-11-22T09:30:00.000Z']) {
      vi.setSystemTime(new Date(at))
      expect(await attempt(body)).toEqual({ ok: expect.objectContaining({ status: 'skipped' }) })
    }
    expect(mail.report).toEqual([])
    expect(mail.review).toEqual([])
    expect(w.tables.report_snapshots).toEqual([])
    expect(w.tables.report_sends[0]).toMatchObject({ status: 'claimed', snapshot_id: 'snap-theirs' })
  })
})

describe('a document build holds its claim for minutes in Inngest: never taken over by the retry', () => {
  it('a young claim on a document schedule answers as before (skipped, 200): no 409, no retry to come back, no build started', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const s = schedule({ id: 'sched-doc', name: 'Sales brief', starter_key: null, artefact: null, report_id: 'rep-doc', review: true })
    const w = world(s)
    w.tables.reports.push({ id: 'rep-doc', client_id: CLIENT, kind: 'document', template_key: 'sales_brief', settings: {}, sections: [] })
    w.tables.report_sends.push(deadClaim(s))
    // The build the runner enqueued, still queued behind the account's slots.
    w.tables.report_builds.push({ id: 'build-1', client_id: CLIENT, report_id: 'rep-doc', schedule_id: s.id, send_id: 'send-491c201a', run_id: RUN, status: 'queued', started_at: CLAIMED_AT })
    serve(w, s)
    const body = await stepBody(s)
    for (const at of [RETRIED_AT, '2026-11-22T08:20:00.000Z']) {
      vi.setSystemTime(new Date(at))
      expect(await attempt(body)).toEqual({ ok: expect.objectContaining({ status: 'skipped' }) })
    }
    expect(inngest.send).not.toHaveBeenCalled()
    expect(w.tables.report_sends).toEqual([deadClaim(s)])
    expect(w.tables.report_builds).toHaveLength(1)
  })
})

describe('a stalled build fails visibly (22 Nov)', () => {
  it("the build's reads end by WEEKLY_READ_BUILD_MS: a stall is a failed send and the operator's alert, and the step's retry builds it", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(new Date(CLAIMED_AT))
    const s = schedule()
    const w = world(s)
    serve(w, s)
    const body = await stepBody(s)
    env.stallParts = true
    const first = attempt(body)
    // Wait (on the real event loop and clock: the parts' module may load from
    // cold) for the build to reach the parts' reads.
    const since = performance.now()
    while (env.partsCalled === 0 && performance.now() - since < 4000) await new Promise((r) => setImmediate(r))
    expect(env.partsCalled).toBe(1)
    await vi.advanceTimersByTimeAsync(WEEKLY_READ_BUILD_MS)
    const out = (await first) as { threw: Error }
    // A plain failure (500): Inngest's own backoff retries it at once.
    expect(out.threw).not.toBeInstanceOf(RetryAfterError)
    expect(out.threw.message).toMatch(/^schedules\/run 500: the weekly read's build ran past/)
    expect(w.tables.report_sends).toEqual([expect.objectContaining({ status: 'failed', error: expect.stringMatching(/the weekly read's build ran past/) })])
    expect(w.tables.report_snapshots).toEqual([])
    expect(mail.alert.map((a) => a.subject)).toEqual(['Verbatim weekly read failed on its way out: Sealand'])
    expect(mail.review).toEqual([])

    env.stallParts = false
    vi.setSystemTime(new Date(RETRIED_AT))
    expect(await attempt(body)).toEqual({ ok: expect.objectContaining({ status: 'ready' }) })
    expect(w.tables.report_sends).toEqual([expect.objectContaining({ status: 'ready', error: null })])
    expect(mail.review).toHaveLength(1)
    expect(mail.alert).toHaveLength(1)
  })

  it('snapshotWeeklyRead: a read past its time throws and writes nothing; in time, it freezes', async () => {
    const w = world(schedule())
    const never = () => new Promise<never>(() => {})
    await expect(snapshotWeeklyRead({ admin: w.admin, clientId: CLIENT, runId: RUN, company: 'Sealand', parts: never, deadlineMs: 20 }))
      .rejects.toMatchObject({ name: 'WeekReadTimeoutError', message: expect.stringMatching(/the weekly read's build ran past/) })
    expect(w.tables.report_snapshots).toEqual([])
    const empty = async () => ({ subjects: [], pages: {}, monthClose: null })
    const built = await snapshotWeeklyRead({ admin: w.admin, clientId: CLIENT, runId: RUN, company: 'Sealand', parts: empty, deadlineMs: 20 })
    expect(w.tables.report_snapshots).toEqual([expect.objectContaining({ id: built.snapshotId })])
  })

  it('the budget leaves the route its render and emails: well inside 300 s', () => {
    expect(WEEKLY_READ_BUILD_MS).toBeLessThanOrEqual(150_000)
  })
})

describe('the runner itself', () => {
  it('Send now over a young dead claim says so, and builds nothing', async () => {
    const s = schedule()
    const w = world(s)
    w.tables.report_sends.push(deadClaim(s, { claimed_at: new Date(Date.now() - 60_000).toISOString() }))
    const r = await runSchedule({ admin: w.admin, schedule: s, runId: RUN, baseUrl: 'https://app.verbatimintel.com', mode: 'send' })
    expect(r).toMatchObject({ status: 'in_progress', sendId: 'send-491c201a', retryAt: expect.any(String), error: expect.stringMatching(/Another attempt is building this update/) })
    expect(w.tables.report_snapshots).toEqual([])
    expect(mail.review).toEqual([])
  })
})
