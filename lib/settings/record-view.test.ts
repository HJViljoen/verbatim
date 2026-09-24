import { describe, expect, it } from 'vitest'

import { recordDate, recordRows, datesLine } from '../reading/record'
import type { DenominatorPoint } from '../reading/series'
import { changeLogMeta, changeNote, readChangeLog } from './change-log'
import { deliveryRecord, deliveryStats, gapFigure, gapMonth } from './delivery'
import { monthsLine, readingsRecord } from './readings'
import {
  changeRowsFixture, denominatorsFixture, recordInputsFixture, freshRecordInputsFixture, updatesFixture,
} from '../../components/settings/record/fixture'

// The pure half of the record page's port (block E wave 2). The render tier
// (components/settings/record/blocks.test.tsx) checks what the blocks PRINT;
// this checks what the composers ANSWER, including the four places the artboard
// asks for a figure the data cannot honestly give.

describe('the delivery stat cells', () => {
  it('converts the longest gap once, and leaves a short gap in days', () => {
    expect(gapFigure(35)).toEqual({ figure: '5', unit: 'weeks' })
    expect(gapFigure(38)).toEqual({ figure: '5.4', unit: 'weeks' })
    // Under a fortnight "1.7 weeks" is a worse sentence than "12 days".
    expect(gapFigure(12)).toEqual({ figure: '12', unit: 'days' })
    expect(gapFigure(1)).toEqual({ figure: '1', unit: 'day' })
    expect(gapFigure(null)).toBeNull()
  })

  it('names the month the longest gap ended in, from the shared answer', () => {
    const updates = updatesFixture()
    const record = deliveryRecord({ updates, slotsRecorded: true })
    expect(record.longestGapDays).toBe(35)
    expect(gapMonth(updates, record.longestGapDays)).toBe('2026-05')
    // A length no pair of updates has is not a month.
    expect(gapMonth(updates, 999)).toBeNull()
  })

  it('draws four cells and never claims a start date or a next update', () => {
    const updates = updatesFixture()
    const stats = deliveryStats(deliveryRecord({ updates, slotsRecorded: true }), updates)
    expect(stats.map((s) => s.id)).toEqual(['since', 'delivered', 'gap', 'last'])
    // D14: the first update on record is earliest evidence, not a start date.
    expect(stats[0].caption).toBe('first update on record')
    // And the second cell counts every run row — the fixture's failed June run
    // among them — so it may not be captioned "delivered" (code review
    // finding 1). 22 on record, 21 delivered, and the strip says the other.
    expect(stats[1].figure).toBe('22')
    expect(stats[1].caption).toBe('on record')
    expect(stats.some((s) => /delivered/.test(s.caption))).toBe(false)
    expect(stats.some((s) => /next/.test(s.caption))).toBe(false)
    expect(stats[2].caption).toBe('longest gap, in May')
  })

  it('has no cells to draw where no update has ever run', () => {
    expect(deliveryStats(deliveryRecord({ updates: [], slotsRecorded: false }), [])).toEqual([])
  })
})

describe('the monthly readings strip', () => {
  const updatesByMonth = (): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const u of updatesFixture()) {
      if (u.status !== 'completed' && u.status !== 'partial') continue
      out[`${u.startedAt.slice(0, 7)}-01`] = (out[`${u.startedAt.slice(0, 7)}-01`] ?? 0) + 1
    }
    return out
  }

  const strip = () =>
    readingsRecord({
      denominators: denominatorsFixture(),
      substrate: 'seeded',
      updatesByMonth: updatesByMonth(),
      firstRunMonth: '2026-04-01',
      month: '2026-09-01',
    })

  it('counts the readings over the gathered era, the way Overview counts them', () => {
    // Nine months have rows; three of them are before the first update and are
    // not readings we took.
    expect(strip().readings).toBe(6)
    expect(strip().counter).toContain('6th monthly reading')
  })

  it('names the back-read months off the stored origin, never off a date', () => {
    expect(strip().backRead).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
    expect(strip().backReadLabel).toBe('January, February and March')
    // A month with any live row is a gathered month, not a setup month.
    const mixed = denominatorsFixture().map((d): DenominatorPoint =>
      d.month === '2026-02-01' && d.audience === 'client' ? { ...d, origin: 'live' } : d)
    expect(
      readingsRecord({
        denominators: mixed, substrate: 'seeded', updatesByMonth: updatesByMonth(),
        firstRunMonth: '2026-04-01', month: '2026-09-01',
      }).backRead,
    ).toEqual(['2026-01-01', '2026-03-01'])
  })

  it('takes the trailing median over the gathered era alone', () => {
    // April to August pooled: 2203, 2370, 2403, 2357, 2400 → median 2370.
    // Off the whole history the three setup months would drag it to ~2203.
    expect(strip().trailingMedian).toBe(2370)
    expect(strip().monthVideos).toBe(2359)
  })

  it('names the months under the band’s floor, thinnest first', () => {
    const below = strip().belowFloor
    expect(below[0]).toMatchObject({ month: '2026-04-01', videos: 22, who: 'Your own brand' })
    expect(strip().floor).toBe(100)
  })

  it('counts every month under the floor, not just the ones it lists', () => {
    // Four are under it (April 22, January 44, February 51, March 60) and the
    // strip carries three, so a remainder counted off the truncated list said
    // "2 other months" over a workspace with three (code review finding 2).
    const s = strip()
    expect(s.belowFloor).toHaveLength(3)
    expect(s.belowFloorTotal).toBe(4)
    // Three of the four are setup months, which will never fill up — so the
    // strip can stop saying "has not filled up" about all four.
    expect(s.belowFloorBackRead).toBe(3)
    expect(s.belowFloor[0].backRead).toBe(false)
  })

  it('prints the months line the artboard draws, with the current month still filling', () => {
    expect(monthsLine(strip().months)).toBe('July 4 updates · August 5 updates · September 4 so far')
  })

  it('says the reading is not recorded rather than counting zero of it', () => {
    const none = readingsRecord({
      denominators: [], substrate: 'missing', updatesByMonth: {}, firstRunMonth: null, month: '2026-09-01',
    })
    expect(none.recorded).toBe(false)
    expect(none.months).toEqual([])
    expect(none.trailingMedian).toBeNull()
  })

  it('offers the quarter view’s remaining months while there are fewer than six readings', () => {
    const three = readingsRecord({
      denominators: denominatorsFixture().filter((d) => d.month >= '2026-07-01'),
      substrate: 'seeded',
      updatesByMonth: updatesByMonth(),
      firstRunMonth: '2026-07-01',
      month: '2026-09-01',
    })
    expect(three.readings).toBe(3)
    expect(three.counter).toContain('the quarter view needs 6')
  })
})

describe('the change log’s header meta and its coverage clause', () => {
  const log = () => readChangeLog({ rows: changeRowsFixture(), viewerUserId: 'u1' })

  it('counts recorded rows only, and dates them from the day the record began', () => {
    // "Since" is `firstLoggedAt`, not the first update: the fixture's oldest
    // RECORDED change is 6 Apr and its reconstructed one is 2 Mar, and on a
    // tenant that predates the log — the reason changeLogBoundary exists —
    // anchoring to the first update claims a record we did not keep (code
    // review finding 5).
    expect(changeLogMeta(log(), { now: '2026-09-28T09:00:00.000Z' }))
      .toBe('4 changes since 6 Apr · 1 this month')
    const late = readChangeLog({ rows: changeRowsFixture().filter((c) => c.changed_at >= '2026-08-01'), viewerUserId: 'u1' })
    expect(changeLogMeta(late, { now: '2026-09-28T09:00:00.000Z' })).toBe('3 changes since 11 Aug · 1 this month')
    // The reconstructed row is never summed with the record.
    expect(log().recorded).toHaveLength(4)
    expect(log().prehistory).toHaveLength(1)
  })

  it('drops the "this month" half rather than printing a zero', () => {
    expect(changeLogMeta(log(), { now: '2026-10-05T09:00:00.000Z' }))
      .toBe('4 changes since 6 Apr')
  })

  it('names the change inside the window, so the coverage row can say which', () => {
    expect(changeNote(log(), { from: '2026-09-01', to: '2026-09-28' })).toBe('Poler added as a rival, 3 Sep')
    expect(changeNote(log(), { from: '2026-08-01', to: '2026-08-31' })).toBe('the newest Six subjects named, 19 Aug')
    expect(changeNote(log(), { from: '2026-07-01', to: '2026-07-31' })).toBeNull()
  })

  it('says "the newest" where the count beside it holds rows this clause cannot name', () => {
    // `ChangeRecord.inWindow` counts reconstructed rows too, so a window with
    // one logged and one reconstructed change printed "2 — Poler added as a
    // rival, 3 Sep", naming one of two (code review finding 4).
    expect(changeNote(log(), { from: '2026-09-01', to: '2026-09-28' }, { counted: 2 }))
      .toBe('the newest Poler added as a rival, 3 Sep')
    expect(changeNote(log(), { from: '2026-09-01', to: '2026-09-28' }, { counted: 1 }))
      .toBe('Poler added as a rival, 3 Sep')
    // Nothing recorded inside the window is still nothing to name.
    expect(changeNote(log(), { from: '2026-07-01', to: '2026-07-31' }, { counted: 1 })).toBeNull()
  })
})

describe('the record as rows', () => {
  const rows = () => recordRows(recordInputsFixture(), {
    trailingMedian: 2370,
    changeNote: 'Poler added as a rival, 3 Sep',
    belowFloor: { label: 'April', who: 'Your own brand', videos: 22, floor: 100, more: 2 },
  })
  const row = (id: string) => rows().find((r) => r.id === id)!

  it('prints the update dates in the reader’s form, never an ISO day', () => {
    expect(datesLine(['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27'])).toBe('6, 13, 20, 27 Sep')
    // A window that crosses a month dates every one of them.
    expect(datesLine(['2026-08-31', '2026-09-06'])).toBe('31 Aug · 6 Sep')
    // And one that crosses a YEAR carries the year on the last, which is the
    // rule `recordLines` states one row over (code review finding 8).
    expect(datesLine(['2026-12-28', '2027-01-04'])).toBe('28 Dec · 4 Jan 2027')
    // A date nothing can parse is refused rather than printed as NaN.
    expect(datesLine(['not a date', '2026-09-06'])).toBe('6 Sep')
    expect(datesLine(['not a date'])).toBe('')
    expect(rows().some((r) => /\d{4}-\d{2}-\d{2}/.test(`${r.figure ?? ''} ${r.rest} ${r.basis}`))).toBe(false)
  })

  it('refuses the per-update comment ratio, because it divides two clocks', () => {
    expect(row('comments').figure).toBe('11,840')
    expect(row('comments').rest).toBe('dated by the comment, not by the update')
    expect(rows().some((r) => /per update/.test(`${r.rest} ${r.basis}`))).toBe(false)
  })

  it('never keys the instrument figure by a calendar month', () => {
    expect(row('themes').figure).toBe('2.4')
    expect(row('themes').basis).toContain('an update’s own measure, never a month’s')
    expect(row('themes').basis).not.toContain('August')
  })

  it('prints the platform mix as counts, because audience denominators do not add', () => {
    expect(row('platforms').figure).toBeNull()
    expect(row('platforms').rest).toContain('TikTok 894')
    expect(row('platforms').rest).not.toMatch(/%/)
  })

  it('says where a refused comparison is counted rather than printing a zero', () => {
    expect(row('refused').figure).toBeNull()
    expect(row('refused').rest).toContain('Counted by the page that draws the comparisons')
  })

  it('carries the all-time basis on both read-depth rows, and says the sentence once', () => {
    // D15: the basis is part of the figure, so both rows carry one. The full
    // sentence is said once, on the speech row; the on-screen-text row beside
    // it carries "all time" (copy de-clutter C15), self-contained, never "as above".
    expect(row('speech').basis).toContain('of everything we have ever read')
    expect(row('speech').basis).toContain('Reddit excluded')
    expect(row('ocr').basis).toBe('all time')
    for (const id of ['speech', 'ocr']) expect(row(id).lead).toBe('on')
    expect(row('ocr').basis).not.toMatch(/above|beside|same as/)
  })

  it('sets the date the record begins as a figure, short like every other date', () => {
    // Design review finding 9: it was passed as `rest` with `figure: null`, so
    // the one number in the row missed the grid's mono/semibold treatment, and
    // it was the only long-form date on a page of short ones.
    expect(row('changelog').figure).toBe('6 Apr')
    expect(row('changelog').rest).toBe('')
    // C94: the reconstructed count is the change log's section note, not repeated here.
    expect(row('changelog').basis ?? '').not.toContain('worked out afterwards')
    // The year is kept where the year is the point.
    expect(recordDate('2025-04-06T06:00:00.000Z', '2026-09-28')).toBe('6 Apr 2025')
    expect(recordDate('2026-04-06T06:00:00.000Z', '2026-09-28')).toBe('6 Apr')
  })

  it('states the Reddit cap the product actually enforces', () => {
    expect(row('reddit').figure).toBe('214')
    expect(row('reddit').basis).toContain('40 comments and no deeper')
  })

  it('says what a fresh database cannot say, with no figure anywhere it has none', () => {
    const fresh = recordRows(freshRecordInputsFixture())
    expect(fresh.find((r) => r.id === 'updates')!.rest).toBe('No update ran inside this window.')
    expect(fresh.find((r) => r.id === 'coverage')!.rest).toContain('has not been recorded for this workspace yet')
    expect(fresh.find((r) => r.id === 'gate')!.rest).toContain('we do not yet show it to you')
    expect(fresh.every((r) => r.figure === null)).toBe(true)
  })
})
