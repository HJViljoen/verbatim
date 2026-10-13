import { describe, expect, it } from 'vitest'

import { levelOneRead, olderRead, sealandFlag, sealandRead, sealandUnusual, SEALAND_READ_WINDOW } from '../test/weekly-read-fixture'
import {
  ALSO_ROWS, flagFigure, levelOneView, WEEK_READ_HELD_MESSAGE, weekReadDates, weekReadSendState, weeklyReadSubject, weeklyReadView,
} from './weekly-read'
import { isLevelOne, isWeeklyReadData, staleWeeklyReadSnapshot, weeklyReadSnapshotData } from './weekly-read-build'

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
    expect(data).toMatchObject({ kind: 'weekly_read', version: 2, title: 'Sealand · This week in your market', period: '21 to 27 September', month: '2026-09-01', readingAt: '2026-09-27T07:20:00Z', lines: [] })
    expect(data.subject).toMatch(/^Sealand: Buyers treated bag choice/)
    expect(data.read.findings).toHaveLength(3)
    expect(staleWeeklyReadSnapshot(data)).toBeNull()
    // The report every snapshot stored before level 1 carries still draws.
    expect(staleWeeklyReadSnapshot({ ...data, version: 1 })).toBeNull()
    expect(isLevelOne(data)).toBe(true)
    expect(isLevelOne({ ...data, version: 1 })).toBe(false)
    expect(staleWeeklyReadSnapshot({ ...data, version: 3 })).toMatch(/\S/)
  })
})

describe('level 1 (depth v2, T11b): the email a new snapshot sends', () => {
  it('leads with the update\'s first flag, its month and its usual month', () => {
    const v = levelOneView(levelOneRead())
    expect(v.headline).toMatch(/^Buyers treated bag choice/)
    expect(v.numbers).toEqual({ week: { videos: 274, comments: 4777 }, month: { videos: 852, comments: 21468 }, where: 'in September so far' })
    expect(v.lead).toMatchObject({ kind: 'flag', usual: { k: 13, n: 363 }, href: '/dashboard/market?conv=t3' })
    expect(flagFigure(sealandFlag())).toBe('19 of 241 videos this week · usually about 13 of 363 a month')
  })
  it('takes the flags in the check\'s order: the first leads, the rest are rows before anything else', () => {
    const second = sealandFlag({ objectKind: 'subject', objectId: 's9', label: 'Comfort', rank: 2 })
    const v = levelOneView(levelOneRead({ unusual: sealandUnusual([sealandFlag(), second]) }))
    expect(v.lead?.kind === 'flag' && v.lead.flag.objectId).toBe('t3')
    expect(v.also.map((r) => [r.kind, r.label, r.href])).toEqual([
      ['flag', 'Comfort', '/dashboard/market?subject=s9'],
      ['heard', 'Laptop sleeves that fit a 16-inch machine', '/dashboard/market?conv=t7'],
      ['heard', 'Straps that dig in on a long walk', '/dashboard/market?conv=t8'],
    ])
  })
  it('without a flag, the biggest new conversation leads; the others are rows; each conversation once; at most three rows', () => {
    const v = levelOneView(levelOneRead({
      unusual: sealandUnusual([]),
      newThisWeek: [
        { themeId: 'tb', label: 'Small', body: 'Small one.', videos: { week: 2, month: 2 }, evidence: '' },
        { themeId: 'ta', label: 'Big', body: 'Big one.', videos: { week: 6, month: 7 }, evidence: '' },
        { themeId: 't7', label: 'Also heard and new', body: 'It.', videos: { week: 9, month: 21 }, evidence: '' },
      ],
    }))
    expect(v.lead).toMatchObject({ kind: 'new', themeId: 't7', label: 'Also heard and new', videos: { week: 9, month: 21 } })
    expect(v.also.map((r) => [r.kind, r.label, r.figure])).toEqual([
      ['new', 'Big', '6 videos this week · 7 in September so far'],
      ['new', 'Small', '2 videos this week · 2 in September so far'],
      ['heard', 'Straps that dig in on a long walk', '6 videos this week · 11 in September so far'],
    ])
    expect(v.also).toHaveLength(ALSO_ROWS)
  })
  it('a read stored before the flag was frozen has no lead but what was new; nothing at all leaves the slot empty', () => {
    expect(levelOneView(sealandRead()).lead).toBeNull()
    expect(levelOneView(sealandRead({ market: null })).numbers).toBeNull()
    // A flag the check could not read is no lead (and no "nothing unusual").
    expect(levelOneView(levelOneRead({ unusual: { outcome: 'flagged', flags: [], flaggedCount: 2, unread: true } })).lead).toBeNull()
    // A conversation also heard without its month count has no row (decision 1).
    expect(levelOneView(levelOneRead({ alsoHeard: [{ themeId: 'x', label: 'X', videos: 4, videoIds: [] }] })).also).toEqual([])
  })
  it('an older read leads with its first finding\'s headline', () => {
    expect(levelOneView(olderRead()).headline).toBe('Buyers ask for named alternatives that match exact bag needs.')
  })
})
