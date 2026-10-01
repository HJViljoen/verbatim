import { describe, expect, it } from 'vitest'

import type { OurChange } from '../reading/comparability'
import type { MarketWeekRowRaw } from '../reading/weeks'
import type { WeekReadDataV1, WeekReadDataV2 } from '../written/types'
import type { RecCopy } from './market-surface'
import {
  adviceCount, competitiveTile, homeNumbers, homeTiles, homeWeeks, INSUFFICIENT, movesTile, overviewTile, standingLevel, tileInsufficient,
  subjectsTile, voiceTile, weekTile, MOVES_NONE, WEEK_COLUMNS, type HomeTheme,
} from './home'
import { HOME_READ } from './home-fixture'

// The Dashboard's rules (lib/pages/home.ts), on the artboard's Sealand
// September (lib/pages/home-fixture.ts).

describe('Your market in numbers', () => {
  it('prints the four figures the read froze, under the read’s own dates', () => {
    expect(homeNumbers(HOME_READ)).toEqual({
      week: { heading: 'This week, 21 to 27 September', videos: '262', comments: '4,528' },
      month: { heading: 'September so far', videos: '852', comments: '21,468' },
    })
  })

  it('names the month in total once the week has carried past its end', () => {
    const read: WeekReadDataV2 = { ...HOME_READ, window: { from: '2026-09-27T04:03:00Z', to: '2026-10-04T04:02:00Z' }, monthComplete: true }
    const n = homeNumbers(read)
    expect(n?.week?.heading).toBe('This week, 28 September to 4 October')
    expect(n?.month?.heading).toBe('September in total')
  })

  it('prints a half only where both its figures were read, and nothing without either', () => {
    const weekOnly = homeNumbers({ ...HOME_READ, market: { week: { videos: 262, comments: 4528 }, month: { videos: 852, comments: null } } })
    expect(weekOnly?.month).toBeNull()
    expect(weekOnly?.week?.videos).toBe('262')
    expect(homeNumbers({ ...HOME_READ, market: { week: { videos: null, comments: 1 }, month: { videos: 1, comments: null } } })).toBeNull()
    expect(homeNumbers({ ...HOME_READ, market: null })).toBeNull()
    expect(homeNumbers(null)).toBeNull()
  })

  it('draws nothing from an older read, which froze no market figures', () => {
    const v1: WeekReadDataV1 = { ...HOME_READ, version: 1, inShort: 'x', promptVersion: 'week_read_v2' }
    expect(homeNumbers(v1)).toBeNull()
  })
})

describe('Week by week', () => {
  const row = (week: string, videos: number, comments: number, extra: Partial<MarketWeekRowRaw> = {}): MarketWeekRowRaw => ({
    week, audience: 'industry-other', videos, comments, comments_next_month: 0, under_5: 0,
    median_dated: 6, mean_dated: 9, older_videos: 0, unchecked: 0, ...extra,
  })
  const rows = [row('2026-09-21', 262, 4528), row('2026-09-28', 281, 4902), row('2026-10-05', 254, 4210), row('2026-10-12', 120, 1500)]
  const sundays = ['2026-10-04T06:10:00Z', '2026-10-11T06:10:00Z', '2026-10-18T06:10:00Z', '2026-10-25T06:10:00Z']
  const base = { rows, rivalAudiences: [], changes: [] as OurChange[] }

  it('is drawn from ONE clean week from 28 September, a week still filling marked as such (Heinrich, 1 Oct)', () => {
    // Before any update has closed it, the week of 28 September is under way:
    // drawn, faint.
    const one = homeWeeks({ ...base, updates: [], now: '2026-10-01T08:00:00Z' })
    expect(one!.columns.map((c) => c.videos)).toEqual([281, null, null, null, null, null, null, null])
    expect(one!.columns[0].settled).toBe(false)
    // On 19 October only the week of 28 September has two updates behind it;
    // the weeks of 5 and 12 October are drawn, still filling.
    const three = homeWeeks({ ...base, updates: sundays.slice(0, 3), now: '2026-10-19T08:00:00Z' })
    expect(three!.columns.map((c) => c.videos)).toEqual([281, 254, 120, null, null, null, null, null])
    expect(three!.columns.map((c) => c.settled)).toEqual([true, false, false, false, false, false, false, false])
  })

  it('is omitted only where no clean week exists', () => {
    expect(homeWeeks({ ...base, rows: [], updates: sundays, now: '2026-10-26T08:00:00Z' })).toBeNull()
    // The week of 21 September is before the series starts: never drawn.
    expect(homeWeeks({ ...base, rows: [row('2026-09-21', 262, 4528)], updates: [], now: '2026-09-27T08:00:00Z' })).toBeNull()
  })

  it('frames eight weeks from 28 September; settled weeks solid, the filling one faint', () => {
    const w = homeWeeks({ ...base, updates: sundays, now: '2026-10-26T08:00:00Z' })
    expect(w).not.toBeNull()
    expect(w!.columns).toHaveLength(WEEK_COLUMNS)
    expect(w!.columns.map((c) => c.label)).toEqual(['28 Sep', '5 Oct', '12 Oct', '19 Oct', '26 Oct', '2 Nov', '9 Nov', '16 Nov'])
    // The week of 21 September is never drawn; the week of 12 October is still filling.
    expect(w!.columns.map((c) => c.videos)).toEqual([281, 254, 120, null, null, null, null, null])
    expect(w!.columns.map((c) => c.comments)).toEqual([4902, 4210, 1500, null, null, null, null, null])
    expect(w!.columns.map((c) => c.settled)).toEqual([true, true, false, false, false, false, false, false])
    expect(w!.maxVideos).toBe(281)
    expect(w!.maxComments).toBe(4902)
  })

  it('pools the market (the category and the tracked brands), never the client’s own posts', () => {
    const pooled = [
      ...rows,
      row('2026-09-28', 10, 100, { audience: 'competitor:Patagonia' }),
      row('2026-09-28', 99, 999, { audience: 'client' }),
    ]
    const w = homeWeeks({ ...base, rows: pooled, rivalAudiences: ['competitor:Patagonia'], updates: sundays, now: '2026-10-26T08:00:00Z' })
    expect(w!.columns[0]).toMatchObject({ videos: 291, comments: 5002 })
  })

  it('never spans a change to our searches: weeks before it are not drawn', () => {
    const change: OurChange = { id: 'c1', surface: 'terms', changedAt: '2026-10-07T10:00:00Z', note: null, affects: [] }
    const w = homeWeeks({ ...base, changes: [change], updates: sundays, now: '2026-10-26T08:00:00Z' })
    // Only the week of 12 October is after the change: drawn alone, still filling.
    expect(w!.columns.map((c) => c.videos)).toEqual([null, null, 120, null, null, null, null, null])
    expect(w!.columns[2].settled).toBe(false)
  })

  it('leaves out a week holding videos let in before relevance was checked', () => {
    const dirty = [row('2026-09-28', 281, 4902, { unchecked: 3 }), row('2026-10-05', 254, 4210), row('2026-10-12', 120, 1500)]
    const w = homeWeeks({ ...base, rows: dirty, updates: sundays, now: '2026-10-26T08:00:00Z' })
    expect(w!.columns.map((c) => c.videos)).toEqual([null, 254, 120, null, null, null, null, null])
    expect(w!.columns.map((c) => c.settled).slice(0, 3)).toEqual([false, true, false])
  })
})

describe('the tiles', () => {
  it('Your market: the month’s market videos and the three biggest subjects, as the read printed them', () => {
    const t = overviewTile(HOME_READ)!
    expect(t).toMatchObject({ title: 'Your market', big: '852', sub: 'videos in September' })
    expect(t.rows).toEqual([
      { kind: 'bar', label: 'Buying & delivery', copy: null, pct: 23, value: '23%' },
      { kind: 'bar', label: 'Looks & style', copy: null, pct: 17, value: '17%' },
      { kind: 'bar', label: 'Comfort', copy: null, pct: 7, value: '7%' },
    ])
    expect(overviewTile({ ...HOME_READ, market: null })).toBeNull()
    expect(overviewTile(null)).toBeNull()
  })

  it('a subject that is not ready prints no figure, and a small base prints its count', () => {
    expect(standingLevel(HOME_READ.standing[5], HOME_READ.figures)).toBeNull()
    const small = { ...HOME_READ.standing[0] }
    expect(standingLevel(small, {
      subj_buying_delivery_level: { label: 'x', value: '12', kind: 'count' },
      subj_buying_delivery_n: { label: 'x', value: '80', kind: 'count' },
    })).toEqual({ pct: null, value: '12 of 80' })
  })

  it('This week: the findings’ count, the read’s dates and the first three headlines', () => {
    const t = weekTile(HOME_READ)!
    expect(t).toMatchObject({ title: 'This week', big: '4', sub: 'findings, 21 to 27 September' })
    expect(t.rows.map((r) => r.label)).toEqual([
      'Buyers compare bags by exact travel and carry needs',
      'Comfort is judged with weight in the bag',
      'Colour can decide whether someone wants the bag',
    ])
    expect(t.rows.every((r) => r.copy === 'finding')).toBe(true)
    expect(weekTile({ ...HOME_READ, findings: [] })).toBeNull()
    expect(weekTile({ ...HOME_READ, findings: HOME_READ.findings.slice(0, 1) })?.sub).toBe('finding, 21 to 27 September')
  })

  const theme = (registryId: string, label: string, k: number, makerShare: number | null = 0.1, noiseShare: number | null = 0): HomeTheme =>
    ({ registryId, label, k, makerShare, noiseShare })

  it('Conversation: this week’s count, then the month’s biggest three as the board ranks them', () => {
    const t = voiceTile({
      weekThemes: 40,
      categoryN: 814,
      monthThemes: [
        theme('a', 'Admiration for handmade bag design', 155, 0.8),
        theme('b', 'Ready to buy the bag', 92, 0.33),
        theme('c', 'Questions about shipping and availability', 34),
        theme('d', 'Curiosity about featured product details', 22),
        theme('e', 'Price and sale status questions', 21),
        theme('f', '', 50),
        theme('g', 'Below the floor', 9),
      ],
    })!
    expect(t).toMatchObject({ title: 'Conversation', big: '40', sub: 'conversations this week' })
    expect(t.rows).toEqual([
      { kind: 'bar', label: 'Ready to buy the bag', copy: 'theme', pct: 11, value: '11%' },
      { kind: 'bar', label: 'Questions about shipping and availability', copy: 'theme', pct: 4, value: '4%' },
      { kind: 'bar', label: 'Curiosity about featured product details', copy: 'theme', pct: 3, value: '3%' },
    ])
    expect(voiceTile({ weekThemes: 0, categoryN: 814, monthThemes: [] })).toBeNull()
    expect(voiceTile({ weekThemes: null, categoryN: 814, monthThemes: [] })).toBeNull()
    expect(voiceTile({ weekThemes: 3, categoryN: 80, monthThemes: [theme('b', 'Ready to buy the bag', 12)] })!.rows[0]).toMatchObject({ pct: null, value: '12 of 80' })
  })

  it('Competitive: the brands you track', () => {
    expect(competitiveTile(9)).toMatchObject({ title: 'Competitive', big: '9', sub: 'brands you track', rows: [] })
    expect(competitiveTile(1)?.sub).toBe('brand you track')
    expect(competitiveTile(0)).toBeNull()
    expect(competitiveTile(null)).toBeNull()
  })

  it('Subjects: how many you follow, the biggest this month and the one added last', () => {
    const subjects = [
      { name: 'Comfort', named_at: '2026-09-10T10:00:00Z' },
      { name: 'Buying & delivery', named_at: '2026-09-24T09:00:00Z' },
      { name: 'Price', named_at: '2026-09-12T10:00:00Z' },
    ]
    const now = '2026-09-29T08:00:00Z'
    const t = subjectsTile({ subjects, read: HOME_READ, now })!
    expect(t).toMatchObject({ title: 'Subjects', big: '3', sub: 'subjects you follow' })
    expect(t.rows).toEqual([
      { kind: 'text', label: 'Biggest this month', copy: null, value: 'Buying & delivery, 23%' },
      { kind: 'text', label: 'Added most recently', copy: null, value: 'Buying & delivery, 24 Sep' },
    ])
    expect(subjectsTile({ subjects, read: null, now })!.rows.map((r) => r.label)).toEqual(['Added most recently'])
    expect(subjectsTile({ subjects: [], read: HOME_READ, now })).toBeNull()
  })

  it('Subjects: a read of an ended month names it, never "this month" (fresh review B2, the crossing week)', () => {
    // The week of 28 Sep to 4 Oct is restated against September and reaches
    // the page once Heinrich sends it on Monday 5 Oct.
    const crossing: WeekReadDataV2 = { ...HOME_READ, window: { from: '2026-09-27T04:03:00Z', to: '2026-10-04T04:02:00Z' }, monthComplete: true }
    const t = subjectsTile({ subjects: [{ name: 'Comfort', named_at: null }], read: crossing, now: '2026-10-05T07:00:00Z' })!
    expect(t.rows[0]).toEqual({ kind: 'text', label: 'Biggest in September', copy: null, value: 'Buying & delivery, 23%' })
  })

  it('Your moves: posts published in the month, the moves worth considering and the moves you dated', () => {
    const t = movesTile({ month: '2026-09-01', posts: 25, advice: 5, moves: 0 })!
    expect(t).toMatchObject({ title: 'Your moves', big: '25', sub: 'posts published in September' })
    expect(t.rows).toEqual([
      { kind: 'text', label: 'Moves worth considering', copy: null, value: '5' },
      { kind: 'text', label: 'Moves you dated', copy: null, value: MOVES_NONE },
    ])
    expect(movesTile({ month: '2026-09-01', posts: 25, advice: 5, moves: 2 })!.rows[1].value).toBe('2')
    expect(movesTile({ month: '2026-09-01', posts: 0, advice: 0, moves: 0 })).toBeNull()
    expect(movesTile({ month: '2026-09-01', posts: null, advice: 5, moves: 1 })).toBeNull()
  })

  it('are always all six, in the artboard’s order; one not read is its title alone, marked insufficient (Heinrich, 1 Oct)', () => {
    const tiles = homeTiles([
      movesTile({ month: '2026-09-01', posts: 25, advice: 5, moves: 0 }),
      competitiveTile(9),
      null,
      overviewTile(HOME_READ),
      weekTile(HOME_READ),
    ])
    expect(tiles.map((t) => t.title)).toEqual(['Your market', 'This week', 'Conversation', 'Competitive', 'Subjects', 'Your moves'])
    const conversation = tiles.find((t) => t.key === 'voice')!
    expect(conversation).toMatchObject({ href: '/dashboard/voice', big: '', rows: [] })
    expect(tileInsufficient(conversation)).toBe(true)
    // Competitive keeps its number and says the rest is insufficient.
    expect(tiles.find((t) => t.key === 'competitive')).toMatchObject({ big: '9', sub: 'brands you track', rows: [] })
    expect(tileInsufficient(tiles.find((t) => t.key === 'competitive')!)).toBe(true)
    expect(tileInsufficient(tiles.find((t) => t.key === 'overview')!)).toBe(false)
    expect(INSUFFICIENT).toBe('Insufficient data')
  })
})

describe('Moves worth considering', () => {
  const copy = (id: string, run: string, at: string, status = 'new'): RecCopy => ({
    id, lineage_id: id, title: `Advice ${id}`, type: 'Product', status, created_at: at, run_id: run,
  })

  it('counts what Your moves’ short list draws: the decided ideas and a handful of the current ones', () => {
    const latest = Array.from({ length: 7 }, (_, i) => copy(`n${i}`, 'run-2', `2026-09-27T05:0${i}:00Z`))
    const older = [copy('o1', 'run-1', '2026-09-20T05:00:00Z'), copy('o2', 'run-1', '2026-09-20T05:01:00Z', 'in_progress')]
    // Seven current undecided ideas draw five; the decided one from the earlier update is drawn on top.
    expect(adviceCount([...older, ...latest], [])).toBe(6)
    expect(adviceCount(latest.slice(0, 3), null)).toBe(3)
    expect(adviceCount([], null)).toBe(0)
  })
})
