import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SupabaseClient } from '@supabase/supabase-js'

import { fakeDb } from '../test/fake-db'
import { frozen, sealandRead } from '../test/weekly-read-fixture'
import { SEALAND_CLIENT_ID } from '../config'
import { scheduleArtefact, sendsArtefact, sendsBlockArtefact, sendsWeeklyRead, starterKeyFor, artefactTitle, WEEKLY_READ_STARTER_KEY } from './artefact'
import { operatorEmails, reviewAudience, reviewRecipients } from './members'
import type { ScheduleRow } from './types'

// The weekly read's send rules (plan T7), through the real runner
// (`runSchedule`) and the real review door (`readyForReview`, `deliverSend`),
// on an offline table stand-in. Mail, Chromium, Storage and the quote words
// are stood in; everything that decides what goes out, and to whom, is not.

const mail = vi.hoisted(() => ({
  report: [] as { to: string[]; subject: string; html: string }[],
  alert: [] as { subject: string; text: string }[],
  review: [] as { to: string[]; studioUrl: string; forOperator?: boolean; reportTitle: string; recipients?: number; editable?: boolean }[],
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
vi.mock('../quotes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../quotes')>()),
  // The words behind each ref, as the live read would resolve them.
  fetchQuoteResolutionsByRefs: vi.fn(async (_c: unknown, refs: string[]) => new Map(refs.map((r) => [r, { text: `the words of ${r}` }]))),
}))

const { runSchedule } = await import('./run')
const { deliverSend } = await import('./deliver')

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
      expect(mail.alert[0].text).toContain('Nobody was emailed')
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
