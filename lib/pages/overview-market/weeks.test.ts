import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../../config'
import { changesFromLog } from '../../reading/comparability'
import { SEALAND_NEXT_UPDATE, STAGING_CHANGES, STAGING_RIVALS, STAGING_UPDATES, STAGING_WEEK_VOLUMES } from '../../test/week-fixture'
import { WEEK_LINE, weekLineConfigFor } from '../../week-line-config'
import { WEEKS_EMPTY, weekVolumesBlock, weekVolumesEmpty } from './weeks'

// Week by week's builder (WP2.9), on staging's real weeks. On the 11 Oct
// clock the weeks after 20 Sep hold nothing on staging (it holds no data after
// that day), so they read "none gathered" here; production's will not.

const base = {
  rows: STAGING_WEEK_VOLUMES,
  rivalAudiences: STAGING_RIVALS,
  updates: STAGING_UPDATES,
  changes: changesFromLog(STAGING_CHANGES),
  nextUpdateAfter: SEALAND_NEXT_UPDATE,
}

describe('weekVolumesBlock', () => {
  it('reads September on 11 Oct: the weeks of 27 Jul to 5 Oct, our changes on their weeks, the line pending with due 18 Oct and 25 Oct', () => {
    const b = weekVolumesBlock({ ...base, reading: { month: '2026-09-01' }, now: '2026-10-11T12:00:00.000Z', cfg: WEEK_LINE[SEALAND_CLIENT_ID] })
    expect(b.weeks.map((w) => w.week)).toHaveLength(11)
    expect(b.weeks.slice(2, 8).map((w) => w.videos)).toEqual([244, 226, 187, 229, 404, 318])
    expect([...new Set(b.rules.filter((r) => r.surface === 'terms').map((r) => r.date))]).toEqual(['2026-09-09', '2026-09-13', '2026-09-17'])
    expect(b.line).toEqual({
      state: 'pending', firstWeek: '2026-09-28', ageDays: 14,
      due: [{ week: '2026-09-28', date: '2026-10-18' }, { week: '2026-10-05', date: '2026-10-25' }],
    })
  })

  it('gives Össur, with no WEEK_LINE entry, no pending row', () => {
    const b = weekVolumesBlock({ ...base, reading: { month: '2026-09-01' }, now: '2026-10-11T12:00:00.000Z', cfg: weekLineConfigFor(OSSUR_CLIENT_ID) })
    expect(b.line).toBeNull()
  })

  it('stays pending while print is false, even with kept points', () => {
    const b = weekVolumesBlock({
      ...base, reading: { month: '2026-10-01' }, now: '2026-10-26T12:00:00.000Z', cfg: WEEK_LINE[SEALAND_CLIENT_ID],
      line: { reads: [], points: [] },
    })
    expect(b.line && 'state' in b.line ? b.line.state : null).toBe('pending')
  })

  it('is empty when no week on the axis has a dated comment', () => {
    const b = weekVolumesBlock({ ...base, rows: [], reading: { month: '2026-09-01' }, now: '2026-09-20T12:00:00.000Z', cfg: null })
    expect(weekVolumesEmpty(b)).toBe(true)
    expect(weekVolumesEmpty(null)).toBe(true)
    expect(WEEKS_EMPTY).toBe('No week has comments yet.')
  })
})
