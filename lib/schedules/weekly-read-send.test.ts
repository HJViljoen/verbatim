import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SupabaseClient } from '@supabase/supabase-js'

import { fakeDb } from '../test/fake-db'
import { frozen, sealandRead } from '../test/weekly-read-fixture'
import { SEALAND_CLIENT_ID } from '../config'
import { scheduleArtefact, sendsArtefact, sendsBlockArtefact, sendsWeeklyRead, starterKeyFor, artefactTitle, WEEKLY_READ_STARTER_KEY } from './artefact'
import { operatorEmails, reviewAudience, reviewRecipients } from './members'
import { onPlatform } from './platform-state'
import type { ScheduleRow } from './types'

// The weekly read's send rules (plan T7), through the real runner
// (`runSchedule`) and the real review door (`readyForReview`, `deliverSend`),
// on an offline table stand-in. Mail, Chromium, Storage and the quote words
// are stood in; everything that decides what goes out, and to whom, is not.

const mail = vi.hoisted(() => ({
  report: [] as { to: string[]; subject: string; html: string }[],
  alert: [] as { subject: string; text: string }[],
  review: [] as { to: string[]; studioUrl: string; forOperator?: boolean; reportTitle: string; recipients?: number; editable?: boolean; readOnPlatform?: boolean; inPastIssues?: boolean; alsoPublished?: unknown }[],
}))

vi.mock('../email', () => ({
  sendReportEmail: vi.fn(async (r: { to: string[]; subject: string; html: string }) => { mail.report.push(r); return { sent: true } }),
  sendAlertEmail: vi.fn(async (subject: string, text: string) => { mail.alert.push({ subject, text }); return { sent: true } }),
  sendReviewEmail: vi.fn(async (r: (typeof mail.review)[number]) => { mail.review.push(r); return { sent: true } }),
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
// The real publish, wrapped so one test can make it refuse.
vi.mock('./publish', async (importOriginal) => {
  const real = await importOriginal<typeof import('./publish')>()
  return { ...real, publishSend: vi.fn(real.publishSend) }
})
vi.mock('../quotes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../quotes')>()),
  // The words behind each ref, as the live read would resolve them.
  fetchQuoteResolutionsByRefs: vi.fn(async (_c: unknown, refs: string[]) => new Map(refs.map((r) => [r, { text: `the words of ${r}` }]))),
}))

const { runSchedule } = await import('./run')
const { deliverSend } = await import('./deliver')
const emailMod = await import('../email')
const renderMod = await import('../render/render')
const artifactsMod = await import('../artifacts')
const publishMod = await import('./publish')

const CLIENT = SEALAND_CLIENT_ID
const RUN = 'run-27'
const APP = 'https://app.verbatimintel.com'
const RECIPIENTS = ['daniela@sealandgear.com', 'brayden@sealandgear.com']

function schedule(over: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id: 'sched-wr', client_id: CLIENT, name: 'This week in your market', starter_key: WEEKLY_READ_STARTER_KEY, report_id: null,
    artefact: 'weekly_read', cadence: 'every_update', recipients: RECIPIENTS, attach_pdf: false, share_days: 30,
    active: true, review: true, is_default: false, last_sent_at: null, created_by: null,
    created_at: '2026-10-03T08:00:00Z', updated_at: '2026-10-03T08:00:00Z',
    ...over,
  }
}

type Stored = { status: 'ready' | 'thin' | 'failed'; data: unknown } | null | 'no-table'

function world(read: Stored, s = schedule()) {
  const tables: Record<string, Record<string, unknown>[]> = {
    report_sends: [],
    report_snapshots: [],
    share_links: [],
    artifacts: [{ id: 'art-1', stale: false, version: 1, format: 'pdf' }],
    export_events: [],
    clients: [{ id: CLIENT, company_name: 'Sealand' }],
    report_schedules: [s as unknown as Record<string, unknown>],
    reports: [],
    users: [{ client_id: CLIENT, email: 'member@sealandgear.com', created_at: '2026-09-01T00:00:00Z' }],
    config_changes: [],
  }
  if (read !== 'no-table') {
    tables.week_reads = read
      ? [{ client_id: CLIENT, run_id: RUN, kind: 'week', status: read.status, data: read.data, created_at: '2026-10-04T08:40:00Z' }]
      : []
  }
  const db = fakeDb(tables)
  return { tables, db, admin: db.client as SupabaseClient }
}

beforeEach(() => {
  mail.report.length = 0
  mail.alert.length = 0
  mail.review.length = 0
  vi.mocked(renderMod.renderMany).mockClear()
  vi.mocked(artifactsMod.storeArtifact).mockClear()
  vi.mocked(publishMod.publishSend).mockClear()
  vi.stubEnv('ALERT_EMAIL', 'heinrich@verbatim.test')
})
afterEach(() => vi.unstubAllEnvs())

describe('which schedule sends the weekly read', () => {
  it('is named by its column, or by its own starter key where the column is absent', () => {
    expect(scheduleArtefact({ starter_key: 'weekly_read', artefact: 'weekly_read' })).toBe('weekly_read')
    expect(scheduleArtefact({ starter_key: 'weekly_read' })).toBe('weekly_read')
    expect(sendsWeeklyRead({ starter_key: 'weekly_read', artefact: null })).toBe(true)
    // Never the weekly report under another name, and not a block artefact.
    expect(sendsWeeklyRead({ starter_key: 'weekly_report', artefact: 'weekly' })).toBe(false)
    expect(sendsBlockArtefact({ starter_key: 'weekly_read', artefact: 'weekly_read' })).toBe(false)
    expect(sendsArtefact({ starter_key: 'weekly_read', report_id: null, artefact: 'weekly_read' })).toBe(true)
    expect(starterKeyFor('weekly_read')).toBe('weekly_read')
    expect(artefactTitle('weekly_read')).toBe('This week in your market')
  })
})

describe('a run with no ready read sends NOTHING and tells the operator', () => {
  const cases: [string, Stored][] = [
    ['thin', { status: 'thin', data: frozen(sealandRead({ findings: [] })) }],
    ['failed', { status: 'failed', data: null }],
    ['missing', null],
    ['missing table', 'no-table'],
    ['ready but empty', { status: 'ready', data: frozen(sealandRead({ findings: [] })) }],
  ]
  for (const [name, read] of cases) {
    it(`${name}: the send is skipped, nobody is emailed, one alert`, async () => {
      const w = world(read)
      const r = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
      expect(r.status).toBe('skipped')
      expect(r.error).toMatch(/nothing was sent/)
      expect(mail.report).toEqual([])
      expect(mail.review).toEqual([])
      expect(w.tables.report_snapshots).toEqual([])
      expect(w.tables.share_links).toEqual([])
      expect(w.tables.report_sends).toHaveLength(1)
      expect(w.tables.report_sends[0]).toMatchObject({ status: 'skipped', schedule_id: 'sched-wr', run_id: RUN })
      expect(mail.alert).toHaveLength(1)
      expect(mail.alert[0].subject).toBe('Verbatim weekly read not sent: Sealand')
      expect(mail.alert[0].text).toContain('Nobody on the list was emailed')
      expect(mail.alert[0].text).toContain(`--run ${RUN}`)
    })
  }

  it('the fallback: once the read is written (the Monday script), Send now takes the skipped send over and holds it for review', async () => {
    const w = world({ status: 'failed', data: null })
    const first = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
    expect(first.status).toBe('skipped')
    // scripts/week-read.ts --write replaces the run's row with a ready read.
    Object.assign(w.tables.week_reads[0], { status: 'ready', data: frozen(sealandRead()) })
    const again = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
    expect(again.status).toBe('ready')
    expect(again.sendId).toBe(first.sendId)
    expect(w.tables.report_sends).toHaveLength(1)
    expect(w.tables.report_sends[0]).toMatchObject({ status: 'ready' })
    expect(mail.review).toHaveLength(1)
    expect(mail.report).toEqual([])
  })

  it('a test send over a run with no read emails nobody and alerts nobody', async () => {
    const w = world({ status: 'thin', data: null })
    const r = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'test', to: ['heinrich@verbatim.test'] })
    expect(r.status).toBe('skipped')
    expect(mail.report).toEqual([])
    expect(mail.alert).toEqual([])
    expect(w.tables.report_sends).toEqual([])
  })
})

describe('review mode: the build stops at ready and the OPERATOR reads it first', () => {
  it('a ready read on a review schedule is held, and the review email goes to the operator, never to the members', async () => {
    const w = world({ status: 'ready', data: frozen(sealandRead()) })
    const r = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
    expect(r.status).toBe('ready')
    expect(r.subject).toMatch(/^Sealand: Buyers treated bag choice/)
    // Nothing reached the recipients, and no public link was left behind.
    expect(mail.report).toEqual([])
    expect(w.tables.share_links).toEqual([])
    expect(w.tables.report_sends[0]).toMatchObject({ status: 'ready', subject: r.subject, snapshot_id: r.snapshotId })
    // The operator, with the way into this schedule in the Studio.
    expect(mail.review).toHaveLength(1)
    expect(mail.review[0].to).toEqual(['heinrich@verbatim.test'])
    expect(mail.review[0].to).not.toContain('member@sealandgear.com')
    expect(mail.review[0].forOperator).toBe(true)
    expect(mail.review[0].studioUrl).toBe(`${APP}/dashboard/studio?item=schedule%3Asched-wr`)
    expect(mail.review[0].reportTitle).toBe('This week in your market')
    expect(mail.review[0].recipients).toBe(2)
    expect(mail.review[0].editable).toBe(false)
    // The read is on the client's pages already (lib/written/published.ts):
    // the review email says so, and that Send emails the list.
    expect(mail.review[0].readOnPlatform).toBe(true)
    expect(mail.alert).toEqual([])
  })

  it('the snapshot stores the read whole with every quote as a ref: no words, the refs in evidence_ids', async () => {
    const w = world({ status: 'ready', data: frozen(sealandRead()) })
    await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
    const snap = w.tables.report_snapshots[0] as { kind: string; data: { kind: string; read: unknown }; evidence_ids: string[]; run_id: string }
    expect(snap.kind).toBe('report')
    expect(snap.data.kind).toBe('weekly_read')
    expect(snap.run_id).toBe(RUN)
    expect(JSON.stringify(snap.data)).not.toContain('Columbia')
    expect(snap.evidence_ids).toEqual(expect.arrayContaining(['e:bd2a2f71-2240-4365-9c44-01d685e970b1', 'e:e2e1146c-be79-452f-b943-2f3381a662f9']))
  })

  it("the operator's Send delivers it to the list, under the read's subject, with the words resolved and no figures recorded", async () => {
    const w = world({ status: 'ready', data: frozen(sealandRead()) })
    const held = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
    const out = await deliverSend({ admin: w.admin, sendId: held.sendId!, baseUrl: APP, mode: 'review', approvedBy: 'operator-user' })
    expect(out.status).toBe('sent')
    expect(mail.report).toHaveLength(1)
    expect(mail.report[0].to).toEqual(RECIPIENTS)
    expect(mail.report[0].subject).toBe(held.subject)
    expect(mail.report[0].html).toContain('the words of e:bd2a2f71-2240-4365-9c44-01d685e970b1')
    // "Read this week in full" is the share link minted at the Send.
    const token = (w.tables.share_links[0] as { token: string }).token
    expect(mail.report[0].html).toContain(`${APP}/r/${token}`)
    expect(w.tables.report_sends[0]).toMatchObject({ status: 'sent', approved_by: 'operator-user' })
    // `sent_figures`: none, as for a document.
    expect(w.db.calls.some((c) => c.table === 'sent_figures')).toBe(false)
  })

  it('without review, a ready read goes straight to the list', async () => {
    const w = world({ status: 'ready', data: frozen(sealandRead()) }, schedule({ review: false }))
    const r = await runSchedule({ admin: w.admin, schedule: schedule({ review: false }), runId: RUN, baseUrl: APP, mode: 'send' })
    expect(r.status).toBe('sent')
    expect(mail.report).toHaveLength(1)
    expect(mail.report[0].to).toEqual(RECIPIENTS)
    expect(mail.review).toEqual([])
    expect(w.db.calls.some((c) => c.table === 'sent_figures')).toBe(false)
    // The quotes' words, resolved for this render (the stored read has none).
    expect(mail.report[0].html).toContain('the words of e:bd2a2f71-2240-4365-9c44-01d685e970b1')
    expect(mail.report[0].html).toContain('the words of e:e2e1146c-be79-452f-b943-2f3381a662f9')
  })

  it('a test send and the Studio preview render the quotes too, and keep no snapshot', async () => {
    const w = world({ status: 'ready', data: frozen(sealandRead()) })
    const t = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'test', to: ['heinrich@verbatim.test'] })
    expect(t.status).toBe('sent')
    expect(mail.report).toHaveLength(1)
    expect(mail.report[0].to).toEqual(['heinrich@verbatim.test'])
    expect(mail.report[0].html).toContain('the words of e:bd2a2f71-2240-4365-9c44-01d685e970b1')
    const p = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'preview' })
    expect(p.status).toBe('preview')
    expect(p.html).toContain('the words of e:e2e1146c-be79-452f-b943-2f3381a662f9')
    expect(w.tables.report_snapshots).toEqual([])
    expect(w.tables.report_sends).toEqual([])
  })
})

describe('the run that closes a month: the operator\'s review email carries the long-run read Your market prints already (fresh review B1; 5 Oct)', () => {
  const longRun = (over: Record<string, unknown> = {}) => ({
    client_id: CLIENT, run_id: RUN, kind: 'month', status: 'ready', month: '2026-09-01', created_at: '2026-10-04T08:41:00Z',
    data: {
      version: 1, kind: 'longrun', promptVersion: 'longrun_read_v1', month: '2026-09-01', months: ['2026-08-01', '2026-09-01'],
      window: { from: '2026-08-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' },
      inShort: 'Buyers like the idea of a sustainable bag but ask harder questions before they commit.',
      ideas: [
        { headline: 'Interest stalls when the way to buy isn’t clear', body: ['People who already want the bag stop on basic buying questions.', 'Price and size are asked in the same breath.'], basedOn: ['th-a'], videos: 42, months: [], who: [], sure: 'strong' },
        { headline: '  ', body: ['A headline that did not survive prints nothing.'], basedOn: [], videos: 1, months: [], who: [], sure: 'strong' },
      ],
      held: [], model: 'm', costUsd: 0.13,
    },
    ...over,
  })

  it('the operator\'s review email carries its title, lead, headlines and sentences', async () => {
    const w = world({ status: 'ready', data: frozen(sealandRead()) })
    w.tables.week_reads.push(longRun())
    const r = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
    expect(r.status).toBe('ready')
    expect(mail.review).toHaveLength(1)
    expect(mail.review[0].forOperator).toBe(true)
    expect(mail.review[0].alsoPublished).toEqual({
      title: 'What holds across August and September',
      inShort: 'Buyers like the idea of a sustainable bag but ask harder questions before they commit.',
      ideas: [{ headline: 'Interest stalls when the way to buy isn’t clear', body: ['People who already want the bag stop on basic buying questions.', 'Price and size are asked in the same breath.'] }],
    })
    // The client's email, at the Send, is unchanged: no long-run read in it.
    await deliverSend({ admin: w.admin, sendId: r.sendId!, baseUrl: APP, mode: 'review', approvedBy: 'operator-user' })
    expect(mail.report).toHaveLength(1)
    expect(mail.report[0].html).not.toContain('What holds across')
    expect(mail.report[0].html).not.toContain('Interest stalls')
  })

  it('every other week (no long-run read, a thin one, another run\'s) adds nothing', async () => {
    for (const extra of [[], [longRun({ status: 'thin' })], [longRun({ run_id: 'run-20' })]]) {
      mail.review.length = 0
      const w = world({ status: 'ready', data: frozen(sealandRead()) })
      w.tables.week_reads.push(...extra)
      await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
      expect(mail.review).toHaveLength(1)
      expect(mail.review[0].alsoPublished ?? null).toBeNull()
    }
  })
})

describe('reviewAudience: who reads a build before it goes', () => {
  it('the operator, while the Studio is hidden from tenants (today), for every tenant', () => {
    expect(reviewAudience(CLIENT)).toBe('operator')
    expect(reviewAudience('another-tenant')).toBe('operator')
  })
  it('the operator for a send-locked tenant even once the Studio is open; the members otherwise', () => {
    expect(reviewAudience(CLIENT, { studioVisible: true })).toBe('operator')
    expect(reviewAudience('another-tenant', { studioVisible: true })).toBe('members')
    expect(reviewAudience('another-tenant', { studioVisible: true, sendsLocked: true })).toBe('operator')
  })
  it("the operator's inbox is ALERT_EMAIL; with none set, nobody", async () => {
    expect(operatorEmails({ ALERT_EMAIL: 'Heinrich@Verbatim.test, ops@verbatim.test' })).toEqual(['heinrich@verbatim.test', 'ops@verbatim.test'])
    expect(operatorEmails({})).toEqual([])
    const w = world(null)
    expect(await reviewRecipients(w.admin, 'another-tenant', { studioVisible: true, sendsLocked: false })).toEqual({ audience: 'members', to: [] })
    expect(await reviewRecipients(w.admin, CLIENT, { env: { ALERT_EMAIL: 'heinrich@verbatim.test' } })).toEqual({ audience: 'operator', to: ['heinrich@verbatim.test'] })
  })
})

describe('L1: a Chromium hiccup never stops the weekly read, and every failure reaches the operator at once', () => {
  it('review path, PDF not attached: nothing is rendered, the build is held and kept, the review email goes', async () => {
    const w = world({ status: 'ready', data: frozen(sealandRead()) })
    const r = await runSchedule({ admin: w.admin, schedule: schedule({ attach_pdf: false }), runId: RUN, baseUrl: APP, mode: 'send' })
    expect(r.status).toBe('ready')
    expect(renderMod.renderMany).not.toHaveBeenCalled()
    expect(artifactsMod.storeArtifact).not.toHaveBeenCalled()
    expect(w.tables.report_snapshots).toHaveLength(1)
    expect(w.tables.report_sends[0]).toMatchObject({ status: 'ready', artifact_id: null })
    expect(mail.review).toHaveLength(1)
    expect(mail.alert).toEqual([])
  })

  it('review path, PDF attached: it is rendered and stored, as before', async () => {
    const w = world({ status: 'ready', data: frozen(sealandRead()) }, schedule({ attach_pdf: true }))
    await runSchedule({ admin: w.admin, schedule: schedule({ attach_pdf: true }), runId: RUN, baseUrl: APP, mode: 'send' })
    expect(renderMod.renderMany).toHaveBeenCalledTimes(1)
    expect(w.tables.report_sends[0]).toMatchObject({ status: 'ready', artifact_id: 'art-1' })
  })

  it('a send whose PDF will not render still goes, without it, when the PDF is not attached', async () => {
    vi.mocked(renderMod.renderMany).mockRejectedValueOnce(new Error('chromium crashed'))
    const w = world({ status: 'ready', data: frozen(sealandRead()) }, schedule({ review: false }))
    const r = await runSchedule({ admin: w.admin, schedule: schedule({ review: false, attach_pdf: false }), runId: RUN, baseUrl: APP, mode: 'send' })
    expect(r.status).toBe('sent')
    expect(mail.report).toHaveLength(1)
    expect(w.tables.report_sends[0]).toMatchObject({ status: 'sent', artifact_id: null })
    expect(mail.alert).toEqual([])
  })

  it('the operator\'s Send delivers without a PDF when it will not render and is not attached', async () => {
    const w = world({ status: 'ready', data: frozen(sealandRead()) })
    const held = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
    vi.mocked(renderMod.renderMany).mockRejectedValueOnce(new Error('chromium crashed'))
    const out = await deliverSend({ admin: w.admin, sendId: held.sendId!, baseUrl: APP, mode: 'review', approvedBy: 'op' })
    expect(out.status).toBe('sent')
    expect(mail.report[0].to).toEqual(RECIPIENTS)
  })

  it('a failure while building alerts at once, and the send is failed', async () => {
    const w = world({ status: 'ready', data: frozen(sealandRead()) })
    delete w.tables.report_snapshots   // the snapshot insert fails
    const r = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
    expect(r.status).toBe('failed')
    expect(mail.report).toEqual([])
    expect(mail.alert).toHaveLength(1)
    expect(mail.alert[0].subject).toBe('Verbatim weekly read failed on its way out: Sealand')
    expect(mail.alert[0].text).toMatch(/It failed on its way out: snapshot: insert failed/)
  })

  it('held but the review email did not go: the operator is told it waits', async () => {
    vi.mocked(emailMod.sendReviewEmail).mockResolvedValueOnce({ sent: false })
    const w = world({ status: 'ready', data: frozen(sealandRead()) })
    const r = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
    expect(r).toMatchObject({ status: 'ready', notified: false })
    expect(mail.alert).toHaveLength(1)
    expect(mail.alert[0].subject).toBe('Verbatim weekly read waiting for review (the review email did not go): Sealand')
  })

  it('the email to the list not accepted (review off): failed, and the operator is told at once', async () => {
    vi.mocked(emailMod.sendReportEmail).mockResolvedValueOnce({ sent: false })
    const w = world({ status: 'ready', data: frozen(sealandRead()) }, schedule({ review: false }))
    const r = await runSchedule({ admin: w.admin, schedule: schedule({ review: false }), runId: RUN, baseUrl: APP, mode: 'send' })
    expect(r.status).toBe('failed')
    expect(mail.alert.map((x) => x.subject)).toEqual(['Verbatim weekly read failed on its way out: Sealand'])
  })

  it("the operator's Send not accepted: it waits again, and the operator is told", async () => {
    const w = world({ status: 'ready', data: frozen(sealandRead()) })
    const held = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
    vi.mocked(emailMod.sendReportEmail).mockResolvedValueOnce({ sent: false })
    const out = await deliverSend({ admin: w.admin, sendId: held.sendId!, baseUrl: APP, mode: 'review', approvedBy: 'op' })
    expect(out.status).toBe('failed')
    expect(w.tables.report_sends[0]).toMatchObject({ status: 'ready' })
    expect(mail.alert).toHaveLength(1)
    expect(mail.alert[0].subject).toBe('Verbatim weekly read did not reach its list: Sealand')
  })

  it('a test send that fails alerts nobody (it is a rehearsal)', async () => {
    vi.mocked(emailMod.sendReportEmail).mockResolvedValueOnce({ sent: false })
    const w = world({ status: 'ready', data: frozen(sealandRead()) })
    const r = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'test', to: ['heinrich@verbatim.test'] })
    expect(r.status).toBe('failed')
    expect(mail.alert).toEqual([])
  })
})

describe('5 Oct: every weekly read the runner builds is in the client\'s past issues at once; review holds the email only', () => {
  const ready = (): Stored => ({ status: 'ready', data: frozen(sealandRead()) })
  const changes = (w: ReturnType<typeof world>) => w.tables.config_changes as Record<string, unknown>[]
  const sendRow = (w: ReturnType<typeof world>) => w.tables.report_sends[0] as Record<string, unknown>

  it('review on: held for the Send, AND in the past issues, put there by the pipeline before the review email says so', async () => {
    const w = world(ready())
    let publishedWhenEmailed: unknown = 'not emailed'
    vi.mocked(emailMod.sendReviewEmail).mockImplementationOnce(async (r) => {
      publishedWhenEmailed = sendRow(w).published_at
      mail.review.push(r as (typeof mail.review)[number])
      return { sent: true }
    })
    const r = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
    expect(r.status).toBe('ready')
    expect(w.tables.report_sends).toHaveLength(1)
    // On the platform, as the operator's own publish leaves it: the status
    // stays ready, published_at is set, nobody's user id on it.
    expect(sendRow(w)).toMatchObject({ status: 'ready', snapshot_id: r.snapshotId, published_at: expect.any(String), published_by: null })
    expect(onPlatform(sendRow(w) as { status: string; published_at?: string | null })).toBe(true)
    expect(publishedWhenEmailed).toEqual(expect.any(String))
    // One logged change, naming the pipeline and the run.
    expect(changes(w)).toEqual([expect.objectContaining({ surface: 'schedule', field: 'published', actor_kind: 'pipeline', run_id: RUN })])
    // The operator's review email says it is in the past issues already; the
    // list has nothing, and no public link was minted.
    expect(mail.review).toHaveLength(1)
    expect(mail.review[0]).toMatchObject({ to: ['heinrich@verbatim.test'], readOnPlatform: true, inPastIssues: true, recipients: 2 })
    expect(mail.report).toEqual([])
    expect(w.tables.share_links).toEqual([])
    expect(mail.alert).toEqual([])
    // Send still emails the list, once.
    const out = await deliverSend({ admin: w.admin, sendId: r.sendId!, baseUrl: APP, mode: 'review', approvedBy: 'op' })
    expect(out.status).toBe('sent')
    expect(mail.report).toHaveLength(1)
    expect(mail.report[0].to).toEqual(RECIPIENTS)
  })

  it('a retried step (a lost response, a replay) builds nothing twice, emails nobody twice and publishes once', async () => {
    const w = world(ready())
    const first = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
    const again = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
    expect(again).toMatchObject({ status: 'ready', sendId: first.sendId })
    expect(w.tables.report_sends).toHaveLength(1)
    expect(w.tables.report_snapshots).toHaveLength(1)
    expect(mail.review).toHaveLength(1)
    expect(mail.report).toEqual([])
    expect(changes(w)).toHaveLength(1)
  })

  it('a build held before 5 Oct (ready, not in the past issues): the same call adds it, with no build and no email', async () => {
    const w = world(ready())
    w.tables.report_sends.push({
      id: 'send-held', client_id: CLIENT, schedule_id: 'sched-wr', run_id: RUN, status: 'ready', snapshot_id: 'snap-held',
      subject: 'Sealand: the week', claimed_at: '2026-10-04T12:13:00Z', ready_at: '2026-10-04T12:13:58Z', published_at: null,
    })
    const r = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
    expect(r).toMatchObject({ status: 'ready', sendId: 'send-held' })
    expect(w.tables.report_snapshots).toEqual([])
    expect(sendRow(w)).toMatchObject({ status: 'ready', snapshot_id: 'snap-held', published_at: expect.any(String) })
    expect(mail.review).toEqual([])
    expect(mail.report).toEqual([])
    expect(mail.alert).toEqual([])
    expect(changes(w)).toHaveLength(1)
  })

  for (const review of [true, false]) {
    it(`NO RECIPIENTS (Össur), review ${review ? 'on' : 'off'}: built, held and in the past issues; nobody emailed, no review email, no alert`, async () => {
      const s = schedule({ recipients: [], review })
      const w = world(ready(), s)
      const r = await runSchedule({ admin: w.admin, schedule: s, runId: RUN, baseUrl: APP, mode: 'send' })
      expect(r.status).toBe('ready')
      expect(r.subject).toMatch(/^Sealand: Buyers treated bag choice/)
      expect(sendRow(w)).toMatchObject({ status: 'ready', subject: r.subject, snapshot_id: r.snapshotId, ready_at: expect.any(String), published_at: expect.any(String) })
      expect(changes(w)).toEqual([expect.objectContaining({ field: 'published', actor_kind: 'pipeline', run_id: RUN })])
      expect(mail.report).toEqual([])
      expect(mail.review).toEqual([])
      expect(mail.alert).toEqual([])
      expect(w.tables.share_links).toEqual([])
      expect(renderMod.renderMany).not.toHaveBeenCalled()
    })
  }

  for (const review of [true, false]) {
    it(`A MANUAL RUN (noEmail), review ${review ? 'on' : 'off'}, a list of two: built and in the past issues, and nobody at all is emailed`, async () => {
      const s = schedule({ review })
      const w = world(ready(), s)
      const r = await runSchedule({ admin: w.admin, schedule: s, runId: RUN, baseUrl: APP, mode: 'send', noEmail: true })
      expect(r.status).toBe('ready')
      expect(sendRow(w)).toMatchObject({ status: 'ready', published_at: expect.any(String) })
      expect(mail.report).toEqual([])
      expect(mail.review).toEqual([])
      expect(mail.alert).toEqual([])
      expect(w.tables.share_links).toEqual([])
      // Send in the Studio emails it later, exactly as a reviewed build.
      const out = await deliverSend({ admin: w.admin, sendId: r.sendId!, baseUrl: APP, mode: 'review', approvedBy: 'op' })
      expect(out.status).toBe('sent')
      expect(mail.report[0].to).toEqual(RECIPIENTS)
    })
  }

  it('a manual run over a thin read: skipped, and no "not sent" alert (nothing was going to be sent)', async () => {
    const w = world({ status: 'thin', data: frozen(sealandRead({ findings: [] })) })
    const r = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send', noEmail: true })
    expect(r.status).toBe('skipped')
    expect(sendRow(w)).toMatchObject({ status: 'skipped' })
    expect(mail.alert).toEqual([])
    expect(changes(w)).toEqual([])
  })

  it('a manual run never starts another schedule: a legacy digest or weekly report is refused before any row is written', async () => {
    for (const other of [
      schedule({ id: 'sched-dg', name: 'Weekly digest', starter_key: 'weekly_report', artefact: 'weekly', recipients: [] }),
      schedule({ id: 'sched-dg', name: 'Weekly digest', starter_key: 'weekly_report', artefact: 'weekly', review: false }),
    ]) {
      const w = world(ready(), other)
      const r = await runSchedule({ admin: w.admin, schedule: other, runId: RUN, baseUrl: APP, mode: 'send', noEmail: true })
      expect(r).toMatchObject({ status: 'skipped', error: expect.stringMatching(/weekly read only/) })
      expect(w.tables.report_sends).toEqual([])
      expect(w.tables.report_snapshots).toEqual([])
    }
    expect(mail.report).toEqual([])
    expect(mail.review).toEqual([])
  })

  it('every other schedule still needs a list: a scheduled update skips it with "no recipients", as before', async () => {
    const digest = schedule({ id: 'sched-dg', name: 'Weekly digest', starter_key: 'weekly_report', artefact: 'weekly', recipients: [] })
    const w = world(ready(), digest)
    const r = await runSchedule({ admin: w.admin, schedule: digest, runId: RUN, baseUrl: APP, mode: 'send' })
    expect(r).toMatchObject({ status: 'skipped', error: 'no recipients' })
    expect(sendRow(w)).toMatchObject({ status: 'skipped' })
    expect(w.tables.report_snapshots).toEqual([])
    expect(changes(w)).toEqual([])
    expect(publishMod.publishSend).not.toHaveBeenCalled()
  })

  it('review off, a list, a scheduled update: straight to the list as before, on the platform by being sent, nothing published', async () => {
    const s = schedule({ review: false })
    const w = world(ready(), s)
    const r = await runSchedule({ admin: w.admin, schedule: s, runId: RUN, baseUrl: APP, mode: 'send' })
    expect(r.status).toBe('sent')
    expect(sendRow(w).published_at ?? null).toBeNull()
    expect(changes(w)).toEqual([])
    expect(mail.report[0].to).toEqual(RECIPIENTS)
  })

  it('Send now by a person: that person is the actor and published_by', async () => {
    const w = world(ready())
    const actor = { kind: 'operator' as const, user_id: 'user-op', label: 'heinrich@verbatim.test · Send now', at: '2026-10-05T09:00:00.000Z' }
    await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send', actor, publishedBy: 'user-op' })
    expect(sendRow(w)).toMatchObject({ published_by: 'user-op' })
    expect(changes(w)).toEqual([expect.objectContaining({ actor_kind: 'operator', actor_user_id: 'user-op' })])
  })

  it('publishing refused: the build stands held, the review email does not claim the past issues, the operator hears once, and the retry adds it', async () => {
    vi.mocked(publishMod.publishSend).mockResolvedValueOnce({ status: 'refused', error: 'The send could not be published: connection reset' })
    const w = world(ready())
    const r = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
    // 'failed' answers 500 from the route, so Inngest retries the step.
    expect(r).toMatchObject({ status: 'failed', error: expect.stringMatching(/not added to the past issues: The send could not be published/) })
    expect(sendRow(w)).toMatchObject({ status: 'ready', snapshot_id: r.snapshotId })
    expect(sendRow(w).published_at ?? null).toBeNull()
    expect(mail.review).toHaveLength(1)
    expect(mail.review[0].inPastIssues).toBe(false)
    expect(mail.alert.map((x) => x.subject)).toEqual(['Verbatim weekly read built, and not in the past issues: Sealand'])
    expect(mail.alert[0].text).toContain('Add to past issues (not emailed)')
    // The retry finds it waiting and adds it: no second build, email or alert.
    const again = await runSchedule({ admin: w.admin, schedule: schedule(), runId: RUN, baseUrl: APP, mode: 'send' })
    expect(again.status).toBe('ready')
    expect(sendRow(w)).toMatchObject({ status: 'ready', published_at: expect.any(String) })
    expect(w.tables.report_snapshots).toHaveLength(1)
    expect(mail.review).toHaveLength(1)
    expect(mail.alert).toHaveLength(1)
  })
})
