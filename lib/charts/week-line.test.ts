import { describe, expect, it } from 'vitest'

import { directionRe } from '../test/copy-contract'
import { WEEK_LINE_FIXTURE, WEEK_LINE_FIXTURE_AXIS, WEEK_LINE_FIXTURE_FIRST } from '../test/week-line-fixture'
import type { WeekLineBlock } from '../reading/week-line'
import {
  evenColumns, WEEK_LINE_ROW, WEEK_PAIR_REASON_WORDS, weekLineFigureLine, weekLineHover, weekLineLayout, weekLineLevel, weekLineTable,
} from './week-line'

// The same-age line's geometry and words (WP3.13 "Design of the line"), on the
// fixture: staging's weeks of 24 Aug to 14 Sep re-dated to 28 Sep to 19 Oct
// (HYPOTHETICAL dates, real counts; lib/test/week-line-fixture.ts).

const COLUMNS = evenColumns(WEEK_LINE_FIXTURE_AXIS)
const L = weekLineLayout(WEEK_LINE_FIXTURE, COLUMNS)

describe('the columns', () => {
  it("take the caller's axis: eleven weeks, 31 Aug to 9 Nov, each at the centre of its slot", () => {
    expect(COLUMNS).toHaveLength(11)
    expect(COLUMNS[0]).toEqual({ week: '2026-08-31', cx: 0.5 / 11 })
    expect(COLUMNS[10]).toEqual({ week: '2026-11-09', cx: 10.5 / 11 })
  })
})

describe('weekLineLayout', () => {
  it('stacks one row per object, 24 px tall and 8 px apart', () => {
    expect(L.rows.map((r) => r.top)).toEqual([0, 32, 64, 96, 128, 160, 192])
    expect(L.height).toBe(7 * WEEK_LINE_ROW.height + 6 * WEEK_LINE_ROW.gap)
  })

  it('places each point under its week, from the x the caller gave', () => {
    const cx = new Map(COLUMNS.map((c) => [c.week, c.cx]))
    for (const row of L.rows) for (const p of row.points) expect(p.cx).toBe(cx.get(p.week))
    // Only the columns shown are drawn.
    const narrow = weekLineLayout(WEEK_LINE_FIXTURE, COLUMNS.filter((c) => c.week >= '2026-10-12'))
    expect(narrow.rows[0].points.map((p) => p.week)).toEqual(['2026-10-12', '2026-10-19'])
  })

  it("puts each row on its own y scale: its highest share at the top of the row, its lowest at the foot, ticks at both", () => {
    const praise = L.rows[0]
    const byWeek = new Map(praise.points.map((p) => [p.week, p.y]))
    // 42.8% (28 Sep) lowest, 61.9% (12 Oct) highest.
    expect(byWeek.get('2026-09-28')).toBe(WEEK_LINE_ROW.height - WEEK_LINE_ROW.pad)
    expect(byWeek.get('2026-10-12')).toBe(WEEK_LINE_ROW.pad)
    expect(praise.ticks).toEqual([{ text: '62%', y: 4 }, { text: '43%', y: 20 }])
    const looks = L.rows[6]
    expect(looks.ticks.map((t) => t.text)).toEqual(['16%', '6%'])
  })

  it('draws the latest point larger', () => {
    expect(L.rows[0].points.map((p) => p.r)).toEqual([WEEK_LINE_ROW.r, WEEK_LINE_ROW.r, WEEK_LINE_ROW.r, WEEK_LINE_ROW.rLast])
  })

  it('joins only the pair read the same way (12 → 19 Oct); the two refused on depth keep both points and no segment', () => {
    for (const row of L.rows) expect(row.segments.map((s) => `${s.from}→${s.to}`)).toEqual(['2026-10-12→2026-10-19'])
  })

  it("ends each row with the latest share and its \"of N\", and the latest pair's verdict; a provisional subject has none", () => {
    expect(L.rows[0].latest).toMatchObject({ level: '61% · 195 of 318', verdict: { state: 'no_clear_change' } })
    expect(L.rows[6]).toMatchObject({ label: 'Looks & style', provisional: true, latest: { level: '12% · 38 of 318', verdict: null } })
  })

  it("prints no verdict at the row's end when the week before the latest has no point, never an older pair's", () => {
    // The week of 12 Oct's capture missed (HYPOTHETICAL): 19 Oct is the latest
    // point and its pair has no earlier side; 28 Sep → 5 Oct is not the latest pair.
    const missed: WeekLineBlock = {
      ...WEEK_LINE_FIXTURE,
      reads: WEEK_LINE_FIXTURE.reads?.filter((r) => r.week !== '2026-10-12'),
      rows: WEEK_LINE_FIXTURE.rows.map((r) => ({
        ...r,
        points: r.points.filter((p) => p.week !== '2026-10-12'),
        pairs: r.pairs.map((p) => (p.prevWeek === '2026-10-12' || p.week === '2026-10-12'
          ? { ...p, mode: 'refuse' as const, reasons: ['not_kept' as const], verdict: null }
          : p)),
      })),
    }
    const row = weekLineLayout(missed, COLUMNS).rows[0]
    expect(row.points.map((p) => p.week)).toEqual(['2026-09-28', '2026-10-05', '2026-10-19'])
    expect(row.latest).toEqual({ level: '61% · 195 of 318', verdict: null })
    expect(weekLineTable(missed, COLUMNS).rows[0].verdict).toBeNull()
  })

  it('reads a flat row at the middle, with one tick', () => {
    const one = weekLineLayout(WEEK_LINE_FIXTURE_FIRST, COLUMNS)
    expect(one.rows[0].points).toHaveLength(1)
    expect(one.rows[0].points[0].y).toBe(WEEK_LINE_ROW.height / 2)
    expect(one.rows[0].ticks).toEqual([{ text: '43%', y: 12 }])
    expect(one.rows[0].segments).toEqual([])
    expect(one.rows[0].latest?.verdict).toBeNull()
  })

  it('names each row for a screen reader with every week, share and count', () => {
    expect(L.rows[0].aria).toBe(
      'Praising it, read at the same age: week of 28 Sep, 43% (80 of 187); week of 5 Oct, 57% (131 of 229); week of 12 Oct, 62% (250 of 404); week of 19 Oct, 61% (195 of 318).',
    )
  })
})

describe('the figure line', () => {
  it('says why each slot is empty and each pair not joined', () => {
    expect(L.figureLine).toBe([
      'Weeks before 28 Sep were read on changing searches, so they get no point.',
      'The week of 21 Sep is left out: we changed how we check relevance that week.',
      '28 Sep and 5 Oct not read the same way: read to different depths.',
      '5 Oct and 12 Oct not read the same way: read to different depths.',
    ].join(' '))
  })

  it('names a week not kept at its age once, not its two pairs', () => {
    // The week of 5 Oct's capture missed (HYPOTHETICAL): its read and points gone.
    const missed: WeekLineBlock = {
      ...WEEK_LINE_FIXTURE,
      reads: WEEK_LINE_FIXTURE.reads?.filter((r) => r.week !== '2026-10-05'),
      rows: WEEK_LINE_FIXTURE.rows.map((r) => ({
        ...r,
        points: r.points.filter((p) => p.week !== '2026-10-05'),
        pairs: r.pairs.map((p) => (p.prevWeek === '2026-10-05' || p.week === '2026-10-05' ? { ...p, mode: 'refuse' as const, reasons: ['not_kept' as const] } : p)),
      })),
    }
    const line = weekLineFigureLine(missed, COLUMNS)
    expect(line).toContain('The week of 5 Oct was not kept at its age, so it has no point.')
    expect(line).not.toContain('5 Oct and 12 Oct')
    expect(line).not.toContain('28 Sep and 5 Oct')
  })

  it('says nothing about weeks the axis does not show', () => {
    expect(weekLineFigureLine(WEEK_LINE_FIXTURE, COLUMNS.filter((c) => c.week >= '2026-10-12'))).toBeNull()
  })

  it('words every reason with no digit and no direction word', () => {
    for (const words of Object.values(WEEK_PAIR_REASON_WORDS)) {
      expect(words).not.toMatch(/\d/)
      expect(words).not.toMatch(directionRe())
    }
  })
})

describe('the words', () => {
  it('prints a level with its "of N": a share at 100 videos or more, a count under it', () => {
    expect(weekLineLevel(195, 318)).toBe('61% · 195 of 318')
    expect(weekLineLevel(11, 97)).toBe('11 of 97')
  })

  it('leaves a hover clause out when its figure was not kept, never zero', () => {
    const p = WEEK_LINE_FIXTURE.rows[0].points[3]
    expect(weekLineHover({ label: 'Praising it' }, { ...p, standardised: null }, null)).toBe(
      'Week of 19 Oct, read with the 8 Nov update · Praising it 195 of 318 videos (61%)',
    )
    expect(weekLineHover({ label: 'Praising it' }, p, { week: p.week, readWith: p.readWith, videos: 318, medianDated: null, unchecked: 0, olderVideos: 39, rescrapeCapped: true }))
      .toMatch(/older videos · an update reached its limit on re-reading older videos$/)
  })

  it('lays the email table out as the weeks shown, a level each', () => {
    const t = weekLineTable(WEEK_LINE_FIXTURE, COLUMNS)
    expect(t.head).toEqual(['28 Sep', '5 Oct', '12 Oct', '19 Oct'])
    expect(t.rows[0].cells).toEqual(['43% · 80 of 187', '57% · 131 of 229', '62% · 250 of 404', '61% · 195 of 318'])
    expect(t.rows[6]).toMatchObject({ label: 'Looks & style', provisional: true, verdict: null })
  })
})
