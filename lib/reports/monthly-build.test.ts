import { describe, expect, it } from 'vitest'
import { isMonthlyData, withBriefShareLink, type MonthlySnapshotData } from './monthly-build'
import { isWeeklyData } from './weekly-build'
import { isDocumentData } from './documents/types'
import { isMissingReadingColumns } from './reading-stamp'
import { MONTHLY_STARTER_KEY, WEEKLY_STARTER_KEY, scheduleArtefact, sendsBlockArtefact, sendsMonthly, sendsWeekly, artefactTitle } from '../schedules/artefact'
import { starterTemplate, starterTemplates } from './templates'

const monthly = { kind: 'monthly' } as unknown as MonthlySnapshotData

describe('telling the four artefacts apart inside one snapshot kind', () => {
  it('knows a monthly report', () => {
    expect(isMonthlyData(monthly)).toBe(true)
    expect(isWeeklyData(monthly)).toBe(false)
    expect(isDocumentData(monthly)).toBe(false)
  })

  it('does not claim an arranged report or a weekly one', () => {
    expect(isMonthlyData({ kind: 'weekly' })).toBe(false)
    expect(isMonthlyData({ sections: [] })).toBe(false)
    expect(isMonthlyData(null)).toBe(false)
    expect(isMonthlyData('monthly')).toBe(false)
  })
})

describe('which artefact a schedule sends', () => {
  const schedule = (over: { starter_key?: string | null; artefact?: string | null } = {}) =>
    ({ starter_key: null, ...over }) as { starter_key: string | null; artefact?: string | null }

  it('reads the column first, where M8 has landed', () => {
    expect(scheduleArtefact(schedule({ starter_key: WEEKLY_STARTER_KEY, artefact: 'monthly' }))).toBe('monthly')
  })

  it('falls back to the starter key, which is the only stored answer until then', () => {
    expect(scheduleArtefact(schedule({ starter_key: MONTHLY_STARTER_KEY }))).toBe('monthly')
    expect(sendsMonthly(schedule({ starter_key: MONTHLY_STARTER_KEY }))).toBe(true)
    expect(sendsWeekly(schedule({ starter_key: MONTHLY_STARTER_KEY }))).toBe(false)
  })

  it('answers nothing for a schedule nobody has migrated', () => {
    expect(scheduleArtefact(schedule({ starter_key: 'weekly_digest' }))).toBeNull()
    expect(sendsBlockArtefact(schedule({ starter_key: 'weekly_digest' }))).toBe(false)
  })

  it('treats the two block artefacts as one transport', () => {
    expect(sendsBlockArtefact(schedule({ starter_key: WEEKLY_STARTER_KEY }))).toBe(true)
    expect(sendsBlockArtefact(schedule({ starter_key: MONTHLY_STARTER_KEY }))).toBe(true)
  })

  it('names it on a screen', () => {
    expect(artefactTitle('monthly')).toBe('Monthly report')
  })
})

describe('the monthly starter key resolves but is never offered', () => {
  it('resolves, so editing a migrated schedule is not refused with "Pick a template."', () => {
    expect(starterTemplate(MONTHLY_STARTER_KEY)).toBeTruthy()
    expect(starterTemplate(MONTHLY_STARTER_KEY)?.sections).toEqual([])
  })

  it('is not a starting point for a report', () => {
    expect(starterTemplates().map((t) => t.key)).not.toContain(MONTHLY_STARTER_KEY)
  })
})

describe('M9 not applied here', () => {
  it('recognises a column this migration adds, by name', () => {
    expect(isMissingReadingColumns({ code: 'PGRST204', message: "Could not find the 'reading_at' column of 'report_snapshots' in the schema cache" })).toBe(true)
    expect(isMissingReadingColumns({ code: '42703', message: 'column "window_basis" of relation "report_snapshots" does not exist' })).toBe(true)
  })

  it('does not read an unrelated outage as a missing migration', () => {
    expect(isMissingReadingColumns({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false)
    expect(isMissingReadingColumns({ code: '42703', message: 'column "themes.match_kind" does not exist' })).toBe(false)
    expect(isMissingReadingColumns(null)).toBe(false)
  })
})

// A LIVE /r/ TOKEN MUST NOT REACH report_snapshots.data. The row is readable by
// every tenant member; share_links.token is deliberately not ("The token and
// the password hash never reach a session client"). loadBriefLink froze the app
// href and the snapshot id; the send resolves the link here, over a copy, and
// the stored reading is untouched.
describe('the brief’s share link, resolved on the send', () => {
  const brief = {
    title: 'Marketing brief',
    snapshotId: 'snap-1',
    href: '/dashboard/reports?view=snap-1',
    public: false,
    locked: false,
    builtAt: '2026-09-12T08:25:00.000Z',
    stale: false,
  }
  const data = (over: Record<string, unknown> = {}) =>
    ({ kind: 'monthly', readingAt: '2026-10-01T06:00:00.000Z', reading: { brief, ...over } }) as unknown as MonthlySnapshotData

  const admin = (rows: { token: string; expires_at: string | null; password_hash: string | null }[]) => {
    const chain: Record<string, unknown> = {}
    for (const fn of ['select', 'eq', 'is', 'order']) chain[fn] = () => chain
    chain.limit = async () => ({ data: rows })
    return { from: () => chain } as never
  }

  it('swaps in a live public link for the email and leaves the input alone', async () => {
    const frozen = data()
    const out = await withBriefShareLink(admin([{ token: 'tok', expires_at: null, password_hash: null }]), 'c1', frozen)
    expect(out.reading.brief?.href).toBe('/r/tok')
    expect(out.reading.brief?.public).toBe(true)
    expect(frozen.reading.brief?.href).toBe('/dashboard/reports?view=snap-1')
    expect(frozen.reading.brief?.public).toBe(false)
  })

  it('says a locked link is locked rather than public', async () => {
    const out = await withBriefShareLink(admin([{ token: 'tok', expires_at: null, password_hash: 'x' }]), 'c1', data())
    expect(out.reading.brief?.locked).toBe(true)
    expect(out.reading.brief?.public).toBe(false)
  })

  it('keeps the app href where every link has expired, and where there is no brief', async () => {
    const expired = await withBriefShareLink(admin([{ token: 'tok', expires_at: '2026-09-01T00:00:00.000Z', password_hash: null }]), 'c1', data())
    expect(expired.reading.brief?.href).toBe('/dashboard/reports?view=snap-1')
    const none = await withBriefShareLink(admin([]), 'c1', data({ brief: null }))
    expect(none.reading.brief).toBeNull()
  })
})
