import { describe, expect, it } from 'vitest'

import { isDocumentData } from './documents/types'
import { isWeeklyData } from './weekly-build'
import { isQuarterlyData } from './quarterly-build'
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
