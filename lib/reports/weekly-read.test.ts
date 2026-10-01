import { describe, expect, it } from 'vitest'

import { olderRead, sealandRead, SEALAND_READ_WINDOW } from '../test/weekly-read-fixture'
import {
  WEEK_READ_HELD_MESSAGE, weekReadDates, weekReadSendState, weeklyReadSubject, weeklyReadView,
} from './weekly-read'
import { isWeeklyReadData, staleWeeklyReadSnapshot, weeklyReadSnapshotData } from './weekly-read-build'

// The weekly read's pure half (artefact `weekly_read`): the dates it names, the
// subject it goes out under, the send rule, and its sections in the design's
// order.

describe('weekReadDates: the days the read covers', () => {
  it("names Sunday's seven-day window as the seven days ending on the run's day", () => {
    expect(weekReadDates(SEALAND_READ_WINDOW)).toBe('21 to 27 September')
  })
  it('names a week across a month end with both months', () => {
    expect(weekReadDates({ from: '2026-09-27T04:03:42.768Z', to: '2026-10-04T04:05:00.000Z' })).toBe('28 September to 4 October')
  })
  it('names a thirty-day window as thirty days, never as a week', () => {
    expect(weekReadDates({ from: '2026-08-28T04:00:00Z', to: '2026-09-27T04:00:00Z' })).toBe('29 August to 27 September')
  })
  it('a window ending at midnight ends on the day before', () => {
    expect(weekReadDates({ from: '2026-09-21T00:00:00Z', to: '2026-09-28T00:00:00Z' })).toBe('21 to 27 September')
  })
  it('a same-day run is that day, and a broken window names nothing', () => {
    expect(weekReadDates({ from: '2026-09-24T15:00:00Z', to: '2026-09-24T17:35:00Z' })).toBe('24 September')
    expect(weekReadDates({ from: 'x', to: '2026-09-27T04:00:00Z' })).toBe('')
    expect(weekReadDates({ from: '2026-09-27T04:00:00Z', to: '2026-09-20T04:00:00Z' })).toBe('')
    expect(weekReadDates(null)).toBe('')
  })
  it('a window across a year end names both years', () => {
    expect(weekReadDates({ from: '2026-12-27T04:00:00Z', to: '2027-01-03T04:00:00Z' })).toBe('28 December 2026 to 3 January 2027')
  })
})

describe('weeklyReadSubject: "Sealand: {the week in one line}"', () => {
  it('is the company and the week in one line, without its full stop', () => {
    expect(weeklyReadSubject('Sealand', sealandRead(), '21 to 27 September'))
      .toBe('Sealand: Buyers treated bag choice as a practical match, comparing named models by trip fit, proof of quality and the colour they wanted')
  })
  it('never carries a digit from the model: a line with one gives the code-built subject', () => {
    const read = sealandRead({ headline: 'Buyers compared 3 bags.' })
    expect(weeklyReadSubject('Sealand', read, '21 to 27 September')).toBe('Sealand: this week in your market, 21 to 27 September')
  })
  it('a line too long for an inbox, a missing line or an older read gives the code-built subject', () => {
    const long = sealandRead({ headline: `Buyers ${'compared bags and '.repeat(12)}decided.` })
    expect(weeklyReadSubject('Sealand', long, '21 to 27 September')).toBe('Sealand: this week in your market, 21 to 27 September')
    expect(weeklyReadSubject('Sealand', sealandRead({ headline: '' }), '21 to 27 September')).toBe('Sealand: this week in your market, 21 to 27 September')
    expect(weeklyReadSubject('Sealand', olderRead(), '')).toBe('Sealand: this week in your market')
  })
})

describe('weekReadSendState: only a ready read is sent', () => {
  const ready = { status: 'ready' as const, data: sealandRead() }
  it('a ready read with findings may go', () => {
    expect(weekReadSendState(ready)).toEqual({ ok: true })
  })
  it('missing, failed, thin or empty sends nothing, and says why', () => {
    expect(weekReadSendState(null)).toMatchObject({ ok: false, reason: 'missing' })
    expect(weekReadSendState({ status: 'failed', data: null })).toMatchObject({ ok: false, reason: 'failed' })
    expect(weekReadSendState({ status: 'thin', data: sealandRead({ findings: [] }) })).toMatchObject({ ok: false, reason: 'thin' })
    expect(weekReadSendState({ status: 'ready', data: null })).toMatchObject({ ok: false, reason: 'missing' })
    expect(weekReadSendState({ status: 'ready', data: sealandRead({ findings: [] }) })).toMatchObject({ ok: false, reason: 'empty' })
    for (const m of Object.values(WEEK_READ_HELD_MESSAGE)) expect(m).toMatch(/nothing was sent/)
  })
})

describe('weeklyReadView: the design order, and no empty section', () => {
  it('reads v3 top to bottom: the line, the story with its quotes, the implications, the watch line, the findings compact', () => {
    const v = weeklyReadView(sealandRead())
    expect(v.lead).toEqual({ label: 'The week in one line', body: sealandRead().headline })
    expect(v.story).toHaveLength(3)
    expect(v.story[0].quote?.text).toBe('I recommend looking at Columbia tiger brook series.')
    expect(v.story[1].quote).toBeNull()
    expect(v.implications).toHaveLength(3)
    // A watch line is stored as a bare clause; it prints as a sentence.
    expect(v.watch).toEqual(['Whether colour requests keep naming exact shades when people say they want the bag.'])
    expect(v.newThisWeek).toEqual([])
    expect(v.findings.map((f) => f.headline)).toHaveLength(3)
    expect(v.findings[0].line).toMatch(/^Choice is made inside a comparison set/)
    expect(v.findings[0].evidence).toBe('[[f1_week]] videos this week · [[f1_month]] in September so far')
    expect(v.market).toEqual({ week: { videos: 274, comments: 4777 }, month: { videos: 852, comments: 21468 } })
  })
  it('a frozen quote (no words) and a withdrawn one (nulled at render) print no panel', () => {
    const read = sealandRead()
    read.story[0].quote = { ...read.story[0].quote!, text: '' }
    read.story[2].quote = null
    expect(weeklyReadView(read).story.every((p) => p.quote === null)).toBe(true)
  })
  it('an older read leads with its In short and keeps its findings; nothing else is invented', () => {
    const v = weeklyReadView(olderRead())
    expect(v.lead?.label).toBe('In short')
    expect(v.story).toEqual([])
    expect(v.implications).toEqual([])
    expect(v.watch).toEqual([])
    expect(v.market).toBeNull()
    expect(v.findings).toHaveLength(3)
  })
})

describe('the snapshot', () => {
  it('names itself, its days and its subject, and keeps the read whole', () => {
    const data = weeklyReadSnapshotData({ company: 'Sealand', runId: 'run-27', read: sealandRead(), writtenAt: '2026-09-27T07:20:00Z' })
    expect(isWeeklyReadData(data)).toBe(true)
    expect(isWeeklyReadData({ kind: 'weekly' })).toBe(false)
    expect(data).toMatchObject({ kind: 'weekly_read', version: 1, title: 'Sealand · This week in your market', period: '21 to 27 September', month: '2026-09-01', readingAt: '2026-09-27T07:20:00Z' })
    expect(data.subject).toMatch(/^Sealand: Buyers treated bag choice/)
    expect(data.read.findings).toHaveLength(3)
    expect(staleWeeklyReadSnapshot(data)).toBeNull()
    expect(staleWeeklyReadSnapshot({ ...data, version: 2 })).toMatch(/\S/)
  })
})
