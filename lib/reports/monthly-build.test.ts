import { describe, expect, it } from 'vitest'
import { MONTHLY_SNAPSHOT_VERSION, isMonthlyData, staleMonthlySnapshot, type MonthlySnapshotData } from './monthly-build'
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

describe('staleMonthlySnapshot', () => {
  const snapshot = (version: number) => ({ version } as Parameters<typeof staleMonthlySnapshot>[0])

  // THE SIBLING OF `staleWeeklySnapshot` AND `staleQuarterlySnapshot`, added at
  // the wave-3 merge. This module had the `version` field and no constant, so
  // `monthly-deck.tsx` inferred staleness from "no key resolved" — which
  // catches a row whose KEYS moved on and not one whose reading SHAPE did —
  // and the single-tile arm of `app/render/[snapshotId]` had no check at all
  // and rendered a stored row straight into a block.
  it('is null at the version this build writes, and a sentence below it', () => {
    expect(staleMonthlySnapshot(snapshot(MONTHLY_SNAPSHOT_VERSION))).toBeNull()
    expect(staleMonthlySnapshot(snapshot(MONTHLY_SNAPSHOT_VERSION - 1))).toContain('older version of Verbatim')
  })

  // And a bump is the only thing that may make an existing row stale, so the
  // constant is pinned: it changes in a diff that says why, never by accident.
  // 2 since market-first WP2.1: the front page's reading on an ended month,
  // ten keys and four slots, where version 1 held Phase 1's eight sections.
  it('writes version 2 today, so a Phase 1 row prints the stale line', () => {
    expect(MONTHLY_SNAPSHOT_VERSION).toBe(2)
    expect(staleMonthlySnapshot(snapshot(1))).toContain('older version of Verbatim')
  })

  // `isMonthlyData` still matches on `kind` alone, deliberately: telling a
  // monthly artefact from an arranged report is one question and telling a
  // readable one from a stale one is another. The arranged-report path reads
  // `data.sections` and would throw on a monthly row of ANY version.
  it('does not fold the version into the type predicate', () => {
    expect(isMonthlyData({ kind: 'monthly', version: 99 })).toBe(true)
  })
})
