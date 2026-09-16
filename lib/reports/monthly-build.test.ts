import { describe, expect, it } from 'vitest'
import { isMonthlyData, type MonthlySnapshotData } from './monthly-build'
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
