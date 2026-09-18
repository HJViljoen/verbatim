import { describe, expect, it } from 'vitest'

import { recordRows, datesLine } from '../reading/record'
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

  it('counts recorded rows only, and this month on the wall clock', () => {
    expect(changeLogMeta(log(), { since: '2026-04-06', now: '2026-09-28T09:00:00.000Z' }))
      .toBe('4 changes since 6 Apr · 1 this month')
    // The reconstructed row is never summed with the record.
    expect(log().recorded).toHaveLength(4)
    expect(log().prehistory).toHaveLength(1)
  })

  it('drops the "this month" half rather than printing a zero', () => {
    expect(changeLogMeta(log(), { since: '2026-04-06', now: '2026-10-05T09:00:00.000Z' }))
      .toBe('4 changes since 6 Apr')
  })

  it('names the change inside the window, so the coverage row can say which', () => {
    expect(changeNote(log(), { from: '2026-09-01', to: '2026-09-28' })).toBe('Poler added as a rival, 3 Sep')
    expect(changeNote(log(), { from: '2026-08-01', to: '2026-08-31' })).toBe('the newest Six subjects named, 19 Aug')
    expect(changeNote(log(), { from: '2026-07-01', to: '2026-07-31' })).toBeNull()
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

  it('carries the all-time basis on both read-depth rows, and says it twice in one voice', () => {
    // D15: the basis is part of the figure, so both rows carry one. They land
    // side by side in the grid, so the second says it in seven words rather
    // than repeating the first's twenty at the same eye level (design review
    // finding 5) — and it is self-contained, never "as above".
    for (const id of ['speech', 'ocr']) {
      expect(row(id).basis).toContain('of everything we have ever read')
      expect(row(id).basis).toContain('Reddit excluded')
      expect(row(id).lead).toBe('on')
    }
    expect(row('ocr').basis).not.toBe(row('speech').basis)
    expect(row('ocr').basis.length).toBeLessThan(row('speech').basis.length / 1.5)
    expect(row('ocr').basis).not.toMatch(/above|beside|same as/)
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
