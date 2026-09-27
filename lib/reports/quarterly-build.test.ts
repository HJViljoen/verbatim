import { describe, expect, it } from 'vitest'

import { isDocumentData } from './documents/types'
import { isWeeklyData } from './weekly-build'
import { QUARTERLY_SNAPSHOT_VERSION, isQuarterlyData, staleQuarterlySnapshot } from './quarterly-build'
import {
  QUARTERLY_STARTER_KEY,
  WEEKLY_STARTER_KEY,
  artefactTitle,
  scheduleArtefact,
  sendsQuarterly,
  sendsWeekly,
} from '../schedules/artefact'

describe('isQuarterlyData', () => {
  it('knows its own snapshot and nobody else’s', () => {
    expect(isQuarterlyData({ kind: 'quarterly', reading: {} })).toBe(true)
    expect(isQuarterlyData({ kind: 'weekly' })).toBe(false)
    expect(isQuarterlyData({ kind: 'document', pages: [] })).toBe(false)
    expect(isQuarterlyData({ version: 1, sections: [] })).toBe(false)
    expect(isQuarterlyData(null)).toBe(false)
  })

  // Four readers branch on `data.kind` inside one snapshot kind. A value that
  // answered true to two of them would render one artefact as another.
  it('is exclusive with the other two branch tests', () => {
    const q = { kind: 'quarterly', reading: {} }
    expect(isWeeklyData(q)).toBe(false)
    expect(isDocumentData(q)).toBe(false)
  })
})

describe('staleQuarterlySnapshot', () => {
  const snapshot = (version: number) => ({ version } as Parameters<typeof staleQuarterlySnapshot>[0])

  it('is null at the version this build writes, and a sentence below it', () => {
    expect(staleQuarterlySnapshot(snapshot(QUARTERLY_SNAPSHOT_VERSION))).toBeNull()
    // `quarterly-build.ts` existed before block D, so a v1 row can be sitting
    // in `report_snapshots` right now — and `reading.subjects.quotes`,
    // `.category.quotes`, `.rivals.ownPosts` and `.rivals.saidAbout` are all
    // dereferenced three components into a server render.
    const stale = staleQuarterlySnapshot(snapshot(1))
    expect(stale).toBeTruthy()
    expect(stale).toContain('older version of Verbatim')
  })

  it('says it in the reader’s words', () => {
    const stale = staleQuarterlySnapshot(snapshot(1)) as string
    for (const jargon of ['build', 'block', 'snapshot', 'version:', 'render']) {
      expect(stale.toLowerCase()).not.toContain(jargon)
    }
    // And it says what happens next, which is the half a reader can act on.
    expect(stale).toContain('next scheduled review')
  })

  // Telling a quarterly artefact from a report is one question; telling a
  // readable one from a stale one is another. A v1 row is still quarterly.
  it('does not change what `isQuarterlyData` answers', () => {
    expect(isQuarterlyData({ kind: 'quarterly', version: 1 })).toBe(true)
  })
})

describe('which artefact a schedule sends', () => {
  it('reads the M8 column first, and the starter key when there is none', () => {
    expect(scheduleArtefact({ starter_key: null, artefact: 'quarterly' })).toBe('quarterly')
    expect(scheduleArtefact({ starter_key: QUARTERLY_STARTER_KEY })).toBe('quarterly')
    expect(scheduleArtefact({ starter_key: WEEKLY_STARTER_KEY })).toBe('weekly')
    // A schedule that says nothing sends exactly what it sent before.
    expect(scheduleArtefact({ starter_key: 'weekly_digest' })).toBeNull()
  })

  it('tells the two artefact branches apart, both ways', () => {
    const quarterly = { starter_key: QUARTERLY_STARTER_KEY }
    const weekly = { starter_key: WEEKLY_STARTER_KEY }
    expect(sendsQuarterly(quarterly)).toBe(true)
    expect(sendsWeekly(quarterly)).toBe(false)
    expect(sendsQuarterly(weekly)).toBe(false)
    expect(sendsWeekly(weekly)).toBe(true)
  })

  it('names it the way the rest of the product does', () => {
    expect(artefactTitle('quarterly')).toBe('Quarterly review')
  })
})
