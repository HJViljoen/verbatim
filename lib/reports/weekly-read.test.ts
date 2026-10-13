import { describe, expect, it } from 'vitest'

import { levelOneRead, olderRead, sealandFlag, sealandRead, sealandUnusual, SEALAND_READ_WINDOW } from '../test/weekly-read-fixture'
import {
  ALSO_ROWS, BIGGEST_HEADING, flagFigure, levelOneView, objectHref, usualOver, WEEK_READ_HELD_MESSAGE, weekReadDates, weekReadSendState, weeklyReadSubject, weeklyReadView,
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
  it('leads with the update\'s first flag, beside its month and the months the check pooled', () => {
    const v = levelOneView(levelOneRead())
    expect(v.headline).toMatch(/^Buyers treated bag choice/)
    expect(v.numbers).toEqual({ week: { videos: 274, comments: 4777 }, month: { videos: 852, comments: 21468 }, where: 'in September so far' })
    expect(v.lead).toMatchObject({ kind: 'flag', usual: { k: 38, n: 1089, months: 'June, July and August' }, href: '/dashboard/market?conv=t3' })
    expect(flagFigure(sealandFlag())).toBe('19 of 241 videos this week · usually 38 of 1,089 over June, July and August')
  })
  it('says the usual as the check pooled it, never a rounded month: a small baseline is not "0 of 363"', () => {
    const small = sealandFlag({ baseline: { k: 2, n: 1089 } })
    expect(usualOver(small)).toEqual({ k: 2, n: 1089, months: 'June, July and August' })
    expect(flagFigure(small)).toBe('19 of 241 videos this week · usually 2 of 1,089 over June, July and August')
    expect(flagFigure(sealandFlag({ baselineMonths: [] }))).toBe('19 of 241 videos this week')
  })
  it('opens each object where it lives: a conversation and a subject in Market, a rival in its Voices brand panel', () => {
    expect(objectHref('theme', 'reg 1')).toBe('/dashboard/market?conv=reg%201')
    expect(objectHref('subject', 's9')).toBe('/dashboard/market?subject=s9')
    expect(objectHref('rival', 'competitor:Ottobock')).toBe('/dashboard/voices?brand=Ottobock')
    expect(objectHref('rival', 'Osprey Packs')).toBe('/dashboard/voices?brand=Osprey%20Packs')
    expect(objectHref('kind', 'question')).toBe('/dashboard/market')
  })
  it('the other flags come first among the rows, then the biggest conversations on the lead\'s counts; never one set apart; each once', () => {
    const second = sealandFlag({ objectKind: 'subject', objectId: 's9', label: 'Comfort', rank: 2 })
    const v = levelOneView(levelOneRead({ unusual: sealandUnusual([sealandFlag(), second]) }))
    expect(v.lead?.kind === 'flag' && v.lead.flag.objectId).toBe('t3')
    expect(v.also.map((r) => [r.kind, r.label, r.figure, r.href])).toEqual([
      ['flag', 'Comfort', '19 of 241 videos this week · usually 38 of 1,089 over June, July and August', '/dashboard/market?subject=s9'],
      ['heard', 'Comparing named bags by trip fit', '18 videos this week · 47 in September so far', '/dashboard/market?conv=t1'],
      ['heard', 'Laptop sleeves that fit a 16-inch machine', '12 videos this week · 30 in September so far', '/dashboard/market?conv=t7'],
    ])
    expect(v.also).toHaveLength(ALSO_ROWS)
  })
  it('without a flag, the new conversation with the most videos this week leads, on the category\'s count, its own sentence under it', () => {
    const v = levelOneView(levelOneRead({
      unusual: sealandUnusual([]),
      newThisWeek: [
        // The read's own (lenient) count says t8 is bigger; the category's window count says t7.
        { themeId: 't8', label: 'Straps that dig in on a long walk', body: 'Straps.', videos: { week: 9, month: 9 }, evidence: '' },
        { themeId: 't7', label: 'Laptop sleeves that fit a 16-inch machine', body: 'Sleeves.', videos: { week: 5, month: 6 }, evidence: '' },
        // Set apart: never leads, never a row.
        { themeId: 'tm', label: 'Makers showing their own builds', body: 'Makers.', videos: { week: 20, month: 20 }, evidence: '' },
      ],
    }))
    expect(v.lead).toEqual({ kind: 'new', themeId: 't7', label: 'Laptop sleeves that fit a 16-inch machine', labelKind: 'theme', body: 'Sleeves.', videos: { week: 12, month: 30 }, href: '/dashboard/market?conv=t7' })
    expect(v.also.map((r) => [r.kind, r.label])).toEqual([
      ['new', 'Straps that dig in on a long walk'],
      ['heard', 'Asking for the bag in more colours'],
      ['heard', 'Comparing named bags by trip fit'],
    ])
  })
  it('with nothing flagged or new, the week\'s biggest conversation leads ("Most talked about this week"); a set-apart one never', () => {
    const v = levelOneView(levelOneRead({ unusual: sealandUnusual([]) }))
    expect(v.lead).toEqual({ kind: 'biggest', themeId: 't3', label: 'Asking for the bag in more colours', labelKind: 'theme', body: null, videos: { week: 24, month: 61 }, href: '/dashboard/market?conv=t3' })
    expect(v.also.map((r) => r.label)).toEqual(['Comparing named bags by trip fit', 'Laptop sleeves that fit a 16-inch machine', 'Straps that dig in on a long walk'])
    expect(BIGGEST_HEADING).toBe('Most talked about this week')
  })
  it('a check that could not be read gives no flag lead (and no "nothing unusual"): the lead falls to the next source', () => {
    const unread = { outcome: 'flagged', flags: [sealandFlag()], flaggedCount: 1, unread: true }
    const v = levelOneView(levelOneRead({ unusual: unread }))
    expect(v.lead?.kind).toBe('biggest')
    expect(v.also.some((r) => r.kind === 'flag')).toBe(false)
  })
  it('a read stored before its conversations were kept ranks on what it holds: what was also heard, and each finding resting on one conversation, named by its headline', () => {
    const v = levelOneView(sealandRead())
    // The first finding rests on t1 alone (7 this week, 16 in September).
    expect(v.lead).toMatchObject({ kind: 'biggest', themeId: 't1', labelKind: 'finding', label: 'Buyers ask for named alternatives that match exact bag needs', videos: { week: 7, month: 16 } })
    const older = levelOneView(levelOneRead({ unusual: sealandUnusual([]), conversations: undefined }))
    expect(older.lead).toMatchObject({ kind: 'biggest', themeId: 't7', labelKind: 'theme', videos: { week: 9, month: 21 } })
    expect(levelOneView(sealandRead({ market: null })).numbers).toBeNull()
  })
  it('nothing at all leaves the slot empty', () => {
    const none = levelOneView(sealandRead({ findings: sealandRead().findings.map((f) => ({ ...f, basedOn: ['a', 'b'] })) }))
    expect(none.lead).toBeNull()
    expect(none.also).toEqual([])
    expect(levelOneView(levelOneRead({ unusual: sealandUnusual([]), conversations: [] })).lead).toBeNull()
  })
  it('an older read leads with its first finding\'s headline', () => {
    expect(levelOneView(olderRead()).headline).toBe('Buyers ask for named alternatives that match exact bag needs.')
  })
})
