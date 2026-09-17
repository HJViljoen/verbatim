import { describe, it, expect } from 'vitest'
import {
  planPurge, planTotal, RECENT_SEND_MS,
  type PurgeTables, type PurgePlan,
} from './purge'

// The selection logic behind scripts/purge-reports.ts. Nothing here touches a
// database: rows in, delete/keep sets out.

const NOW = Date.parse('2026-09-17T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const DAY = 24 * 60 * 60 * 1000

const empty: PurgeTables = {
  snapshots: [], sends: [], builds: [], artifacts: [], links: [],
  exportEvents: [], edits: [], reports: [], schedules: [], weekly: [],
}
const tables = (over: Partial<PurgeTables>): PurgeTables => ({ ...empty, ...over })
const ids = (rows: { id: string | number }[]) => rows.map((r) => String(r.id)).sort()
const keptIds = (p: PurgePlan, table: string) => p.kept.filter((k) => k.table === table).map((k) => k.id).sort()

const snapshot = (id: string, over: Partial<PurgeTables['snapshots'][number]> = {}) =>
  ({ id, kind: 'report', title: `Snapshot ${id}`, report_id: null, created_at: ago(30 * DAY), ...over })
const send = (id: string, over: Partial<PurgeTables['sends'][number]> = {}) =>
  ({ id, snapshot_id: null, share_link_id: null, subject: 'Update', recipients: ['a@example.com'], status: 'sent', claimed_at: ago(30 * DAY), sent_at: ago(30 * DAY), ...over })
const build = (id: string, over: Partial<PurgeTables['builds'][number]> = {}) =>
  ({ id, report_id: null, snapshot_id: null, status: 'done', started_at: ago(30 * DAY), error: null, ...over })
const artifact = (id: string, over: Partial<PurgeTables['artifacts'][number]> = {}) =>
  ({ id, snapshot_id: null, format: 'pdf', bytes: 1000, storage_path: `client/${id}/page-v1.pdf`, rendered_at: ago(30 * DAY), ...over })
const link = (id: string, over: Partial<PurgeTables['links'][number]> = {}) =>
  ({ id, snapshot_id: null, title: 'Link', view_count: 0, last_viewed_at: null, created_at: ago(30 * DAY), ...over })
const report = (id: string, over: Partial<PurgeTables['reports'][number]> = {}) =>
  ({ id, title: `Report ${id}`, kind: 'arranged', template_key: 'weekly_digest', created_at: ago(30 * DAY), ...over })
const schedule = (id: string, reportId: string, over: Partial<PurgeTables['schedules'][number]> = {}) =>
  ({ id, report_id: reportId, name: 'Weekly digest', active: false, is_default: true, ...over })
const weekly = (id: string, over: Partial<PurgeTables['weekly'][number]> = {}) =>
  ({ id, subject: 'Update', week_start: '2026-08-02', week_end: '2026-08-09', sent_at: null, sent_to: [], ...over })

describe('planPurge — what counts as delivered', () => {
  const t = tables({
    snapshots: [snapshot('draft'), snapshot('emailed'), snapshot('opened'), snapshot('minted')],
    sends: [
      send('s-sent', { snapshot_id: 'emailed' }),
      send('s-failed', { snapshot_id: 'minted', status: 'failed', sent_at: null }),
    ],
    links: [
      link('l-viewed', { snapshot_id: 'opened', view_count: 8, last_viewed_at: ago(2 * DAY) }),
      link('l-cold', { snapshot_id: 'draft' }),
    ],
  })

  it('drafts keeps a snapshot that was emailed', () => {
    const p = planPurge(t, { scope: 'drafts', now: NOW })
    expect(ids(p.snapshots)).toEqual(['draft', 'minted'])
    expect(keptIds(p, 'report_snapshots')).toEqual(['emailed', 'opened'])
  })

  it('drafts keeps a snapshot whose share link has been opened, even with no send', () => {
    const p = planPurge(t, { scope: 'drafts', now: NOW })
    expect(ids(p.links)).toEqual(['l-cold'])
    expect(keptIds(p, 'share_links')).toEqual(['l-viewed'])
  })

  it('a failed send does not make its snapshot delivered', () => {
    const p = planPurge(t, { scope: 'drafts', now: NOW })
    expect(ids(p.snapshots)).toContain('minted')
  })

  it('drafts never deletes a send row', () => {
    expect(planPurge(t, { scope: 'drafts', now: NOW }).sends).toEqual([])
  })

  it('all takes every snapshot, link and send', () => {
    const p = planPurge(t, { scope: 'all', now: NOW })
    expect(ids(p.snapshots)).toEqual(['draft', 'emailed', 'minted', 'opened'])
    expect(ids(p.links)).toEqual(['l-cold', 'l-viewed'])
    expect(ids(p.sends)).toEqual(['s-failed', 's-sent'])
  })
})

describe('planPurge — the schedule protection rule', () => {
  // The whole reason this script is careful: report_schedules.report_id is
  // ON DELETE CASCADE, and Sealand's paused default must survive.
  const t = tables({
    reports: [report('with-schedule'), report('duplicate')],
    schedules: [schedule('sched', 'with-schedule')],
  })

  it('never deletes a reports row that owns a schedule, at either scope', () => {
    for (const scope of ['drafts', 'all'] as const) {
      const p = planPurge(t, { scope, now: NOW })
      expect(ids(p.reports)).toEqual(['duplicate'])
      expect(p.kept.find((k) => k.table === 'reports' && k.id === 'with-schedule')?.why)
        .toMatch(/schedule/i)
    }
  })

  it('protects the schedule even when the report has nothing left of it', () => {
    const p = planPurge(tables({
      reports: [report('with-schedule')],
      schedules: [schedule('sched', 'with-schedule', { active: true })],
      snapshots: [],
    }), { scope: 'all', now: NOW })
    expect(p.reports).toEqual([])
  })

  it('lists every schedule as kept, and never as deleted', () => {
    const p = planPurge(t, { scope: 'all', now: NOW })
    expect(keptIds(p, 'report_schedules')).toEqual(['sched'])
    expect(Object.keys(p)).not.toContain('schedules')
  })

  it('keeps a report that still has a snapshot', () => {
    const p = planPurge(tables({
      reports: [report('r1')],
      snapshots: [snapshot('kept', { report_id: 'r1' })],
      sends: [send('s1', { snapshot_id: 'kept' })],
    }), { scope: 'drafts', now: NOW })
    expect(p.reports).toEqual([])
    expect(p.kept.find((k) => k.table === 'reports' && k.id === 'r1')?.why).toMatch(/snapshot/)
  })
})

describe('planPurge — builds, artifacts and export events', () => {
  const t = tables({
    snapshots: [snapshot('doomed'), snapshot('safe')],
    sends: [send('s1', { snapshot_id: 'safe' })],
    builds: [
      build('b-doomed', { snapshot_id: 'doomed' }),
      build('b-safe', { snapshot_id: 'safe' }),
      build('b-failed', { status: 'failed', error: 'Could not start the build.' }),
      build('b-orphan', { snapshot_id: 'gone-already' }),
    ],
    artifacts: [artifact('a-doomed', { snapshot_id: 'doomed' }), artifact('a-safe', { snapshot_id: 'safe' })],
    edits: [{ id: 'e-doomed', snapshot_id: 'doomed', block_id: 'b1' }],
    exportEvents: [
      { id: 1, snapshot_id: 'doomed', action: 'export', kind: 'report', format: 'pdf', created_at: ago(20 * DAY) },
      { id: 2, snapshot_id: 'safe', action: 'export', kind: 'report', format: 'pdf', created_at: ago(20 * DAY) },
      { id: 3, snapshot_id: null, action: 'export', kind: 'report', format: 'pdf', created_at: ago(40 * DAY) },
    ],
  })

  it('takes the doomed snapshot, its build, its artifact, its edit and its export event', () => {
    const p = planPurge(t, { scope: 'drafts', now: NOW })
    expect(ids(p.builds)).toEqual(['b-doomed', 'b-failed', 'b-orphan'])
    expect(ids(p.artifacts)).toEqual(['a-doomed'])
    expect(ids(p.edits)).toEqual(['e-doomed'])
    expect(ids(p.exportEvents)).toEqual(['1'])
  })

  it('names the storage object of every deleted artifact', () => {
    const p = planPurge(t, { scope: 'drafts', now: NOW })
    expect(p.storagePaths).toEqual(['client/a-doomed/page-v1.pdf'])
  })

  it('keeps an export event that already points at nothing', () => {
    const p = planPurge(t, { scope: 'drafts', now: NOW })
    expect(keptIds(p, 'export_events')).toEqual(['3'])
  })
})

describe('planPurge — weekly_reports', () => {
  const t = tables({ weekly: [weekly('w-draft'), weekly('w-sent', { sent_at: ago(40 * DAY), sent_to: ['a@example.com'] })] })

  it('drafts takes the rows that were never emailed', () => {
    expect(ids(planPurge(t, { scope: 'drafts', now: NOW }).weekly)).toEqual(['w-draft'])
  })

  it('all takes them both', () => {
    expect(ids(planPurge(t, { scope: 'all', now: NOW }).weekly)).toEqual(['w-draft', 'w-sent'])
  })
})

describe('planPurge — guards', () => {
  it('refuses to delete a send that is still in flight', () => {
    for (const status of ['claimed', 'ready']) {
      const p = planPurge(tables({ sends: [send('s1', { status, sent_at: null, claimed_at: ago(10 * DAY) })] }), { scope: 'all', now: NOW })
      expect(p.blockers.join(' ')).toMatch(new RegExp(`'${status}'`))
    }
  })

  it('does not refuse a terminal send', () => {
    for (const status of ['sent', 'failed', 'skipped']) {
      const p = planPurge(tables({ sends: [send('s1', { status, claimed_at: ago(10 * DAY), sent_at: ago(10 * DAY) })] }), { scope: 'all', now: NOW })
      expect(p.blockers).toEqual([])
    }
  })

  it('warns, without refusing, about a send younger than 48 hours', () => {
    const p = planPurge(tables({ sends: [send('s1', { sent_at: ago(RECENT_SEND_MS / 2), claimed_at: ago(RECENT_SEND_MS / 2) })] }), { scope: 'all', now: NOW })
    expect(p.blockers).toEqual([])
    expect(p.warnings.join(' ')).toMatch(/report_missed/)
  })

  it('says nothing about a send older than 48 hours', () => {
    const p = planPurge(tables({ sends: [send('s1', { sent_at: ago(3 * DAY), claimed_at: ago(3 * DAY) })] }), { scope: 'all', now: NOW })
    expect(p.warnings).toEqual([])
  })

  it('refuses to delete a build that has not finished', () => {
    const p = planPurge(tables({ builds: [build('b1', { status: 'writing' })] }), { scope: 'drafts', now: NOW })
    expect(p.blockers.join(' ')).toMatch(/'writing'/)
  })

  it('keeps an unviewed share link a surviving send minted', () => {
    // The URL is sitting in an email somebody received; drafts must not break it.
    const p = planPurge(tables({
      snapshots: [snapshot('sent-snap')],
      sends: [send('s1', { snapshot_id: 'sent-snap', share_link_id: 'l1' })],
      links: [link('l1', { snapshot_id: 'sent-snap' })],
    }), { scope: 'drafts', now: NOW })
    expect(p.links).toEqual([])
    expect(keptIds(p, 'share_links')).toEqual(['l1'])
  })
})

describe('planTotal', () => {
  it('is zero for an empty workspace', () => {
    expect(planTotal(planPurge(empty, { scope: 'all', now: NOW }))).toBe(0)
  })

  it('counts every table', () => {
    const p = planPurge(tables({
      snapshots: [snapshot('s1')],
      artifacts: [artifact('a1', { snapshot_id: 's1' })],
      weekly: [weekly('w1')],
      reports: [report('r1')],
    }), { scope: 'all', now: NOW })
    expect(planTotal(p)).toBe(4)
  })
})
