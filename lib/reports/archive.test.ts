import { describe, expect, it } from 'vitest'

import {
  dateFilterLine,
  hasDateFilter,
  listCap,
  parseDateFilter,
  readingLine,
  readingStampOf,
  sentFigures,
  withinDates,
} from './archive'
import type { FigureTable } from './types'

describe('parseDateFilter', () => {
  it('takes two days and nothing else', () => {
    expect(parseDateFilter('2026-09-01', '2026-09-30')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(parseDateFilter('nonsense', undefined)).toEqual({ from: null, to: null })
    expect(parseDateFilter('2026-9-1', undefined)).toEqual({ from: null, to: null })
  })

  it('swaps a reversed range rather than showing an empty archive', () => {
    expect(parseDateFilter('2026-09-30', '2026-09-01')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('knows when nothing is filtered', () => {
    expect(hasDateFilter(parseDateFilter(undefined, undefined))).toBe(false)
    expect(hasDateFilter(parseDateFilter(undefined, '2026-09-30'))).toBe(true)
  })
})

describe('withinDates', () => {
  const f = parseDateFilter('2026-09-01', '2026-09-30')

  it('is inclusive at both ends, on the day the reader typed', () => {
    expect(withinDates('2026-09-01T00:00:00.000Z', f)).toBe(true)
    expect(withinDates('2026-09-30T23:59:59.000Z', f)).toBe(true)
    expect(withinDates('2026-08-31T23:00:00.000Z', f)).toBe(false)
    expect(withinDates('2026-10-01T00:00:00.000Z', f)).toBe(false)
  })

  it('an undated row survives no filter and is excluded by one', () => {
    expect(withinDates(null, parseDateFilter(undefined, undefined))).toBe(true)
    expect(withinDates(null, f)).toBe(false)
  })
})

describe('listCap', () => {
  it('is null where the group holds no more than it searched', () => {
    expect(listCap([{ total: 47, cap: 100 }])).toBeNull()
    expect(listCap([{ total: 100, cap: 100 }])).toBeNull()
    expect(listCap([{ total: 0, cap: 50 }])).toBeNull()
  })

  it('names what was searched where the table holds more', () => {
    expect(listCap([{ total: 340, cap: 100 }])).toBe(100)
  })

  it('weighs the head count of the pool the list came from, not the rail', () => {
    // 130 kind='report' rows, 40 of them taken by the Sent group. The rail
    // reads 90 and the cap still hides 30: the test is the head count.
    expect(listCap([{ total: 130, cap: 100 }])).toBe(100)
  })

  it('counts a group read from two tables across both', () => {
    // 200 sends exactly (a complete list) plus 47 rows of the legacy table:
    // everything was searched, so there is nothing to caveat.
    expect(listCap([{ total: 200, cap: 200 }, { total: 47, cap: 1000 }])).toBeNull()
    // The same group with more sends than the cap searched 200 + 47.
    expect(listCap([{ total: 260, cap: 200 }, { total: 47, cap: 1000 }])).toBe(247)
  })

  it('reads a head count that could not be taken as nothing, never as negative', () => {
    expect(listCap([{ total: null, cap: 100 }])).toBeNull()
    expect(listCap([{ total: undefined, cap: 100 }, { total: 340, cap: 100 }])).toBe(100)
  })
})

describe('dateFilterLine', () => {
  it('is null where nothing is filtered', () => {
    expect(dateFilterLine(parseDateFilter(undefined, undefined), 5, 5)).toBeNull()
  })

  it('says how much of the archive is showing, and over what', () => {
    expect(dateFilterLine(parseDateFilter('2026-09-01', '2026-09-30'), 12, 47))
      .toBe('12 of 47 items 1 Sep 2026 to 30 Sep 2026.')
    expect(dateFilterLine(parseDateFilter('2026-09-01', undefined), 1, 47)).toBe('1 of 47 items from 1 Sep 2026.')
    expect(dateFilterLine(parseDateFilter(undefined, '2026-09-30'), 3, 47)).toBe('3 of 47 items up to 30 Sep 2026.')
  })

  it('says the list was capped where the cap actually hides something', () => {
    // 340 built, the newest 100 loaded, a filter reaching back past them: the
    // head alone reads as "this workspace has none in that span", which is a
    // claim about the archive rather than about what was looked at.
    expect(dateFilterLine(parseDateFilter('2025-01-01', '2025-03-01'), 0, 340, 100))
      .toBe('0 of 340 items 1 Jan 2025 to 1 Mar 2025. Only the 100 most recent are searched, so anything older than those is not counted here.')
  })

  it('adds no caveat where nothing is behind the cap', () => {
    // An uncapped group is unchanged, passed or omitted.
    expect(dateFilterLine(parseDateFilter('2026-09-01', '2026-09-30'), 12, 47, null))
      .toBe('12 of 47 items 1 Sep 2026 to 30 Sep 2026.')
    expect(dateFilterLine(parseDateFilter('2026-09-01', '2026-09-30'), 12, 47))
      .toBe('12 of 47 items 1 Sep 2026 to 30 Sep 2026.')
  })

  it('does not weigh the cap against a total drawn from another pool', () => {
    // The Built group's total is the head count minus the snapshots a send has
    // taken; the cap applies to the head count. 130 built, 40 sent, the newest
    // 100 loaded: the old `total > cappedAt` test compared 90 against 100 and
    // suppressed the caveat over 30 rows that were never looked at.
    expect(dateFilterLine(parseDateFilter('2025-01-01', '2025-03-01'), 0, 90, 100))
      .toBe('0 of 90 items 1 Jan 2025 to 1 Mar 2025. Only the 100 most recent are searched, so anything older than those is not counted here.')
  })
})

describe('readingStampOf', () => {
  const created = '2026-10-01T06:00:00.000Z'

  it('prefers M9\'s column the moment it exists', () => {
    const s = readingStampOf({ created_at: created, reading_at: '2026-09-30T00:00:00.000Z', month: 'September 2026', month_status: 'frozen' })
    expect(s).toEqual({ at: '2026-09-30T00:00:00.000Z', inferred: false, month: 'September 2026', monthStatus: 'frozen' })
  })

  it('reads a brief\'s own stamp out of data.reading', () => {
    const s = readingStampOf({ created_at: created, data: { reading: { readingAt: '2026-09-16T05:00:00.000Z', monthLabel: 'September 2026', monthStatus: 'filling' } } })
    expect(s.at).toBe('2026-09-16T05:00:00.000Z')
    expect(s.inferred).toBe(false)
    expect(s.month).toBe('September 2026')
  })

  it('reads the weekly report\'s data.readingAt', () => {
    const s = readingStampOf({ created_at: created, data: { readingAt: '2026-09-13T06:00:00.000Z' } })
    expect(s).toEqual({ at: '2026-09-13T06:00:00.000Z', inferred: false, month: null, monthStatus: null })
  })

  // THE SHAPE THE QUERIES ACTUALLY RETURN. `select('reading:data->reading')`
  // puts `reading` at the TOP LEVEL of the row, not under `data`. Reading only
  // the nested shape made the Built group, all three cards and the Built date
  // filter answer "built 1 Oct 2026 · no reading date recorded" for a snapshot
  // that carries a month — one page giving two answers for one artefact.
  it('reads the flat row PostgREST returns for an aliased data->reading', () => {
    const s = readingStampOf({ created_at: created, reading: { readingAt: '2026-09-16T05:00:00.000Z', monthLabel: 'September 2026', monthStatus: 'filling' } })
    expect(s).toEqual({ at: '2026-09-16T05:00:00.000Z', inferred: false, month: 'September 2026', monthStatus: 'filling' })
  })

  it('reads a weekly report\'s aliased data->>readingAt the same way', () => {
    const s = readingStampOf({ created_at: created, readingAt: '2026-09-13T06:00:00.000Z' })
    expect(s).toEqual({ at: '2026-09-13T06:00:00.000Z', inferred: false, month: null, monthStatus: null })
  })

  it('falls back to the build instant and SAYS it is one', () => {
    const s = readingStampOf({ created_at: created, data: {} })
    expect(s).toEqual({ at: created, inferred: true, month: null, monthStatus: null })
    expect(readingStampOf({ created_at: created, reading: null })).toEqual({ at: created, inferred: true, month: null, monthStatus: null })
  })
})

describe('readingLine', () => {
  it('names the month, whether it is still filling, and when it read', () => {
    expect(readingLine({ at: '2026-09-16T05:00:00.000Z', inferred: false, month: 'September 2026', monthStatus: 'filling' }))
      .toBe('September 2026 (still filling) · read as at 16 Sep 2026')
  })

  it('never calls a build instant a reading date', () => {
    expect(readingLine({ at: '2026-10-01T06:00:00.000Z', inferred: true, month: null, monthStatus: null }))
      .toBe('built 1 Oct 2026 · no reading date recorded')
  })
})

describe('sentFigures', () => {
  const figures: FigureTable = {
    videos: { label: 'videos analysed', value: '618', kind: 'count' },
    client_share_pct: { label: 'share of the tracked conversation', value: '2.8%', kind: 'pct' },
    top_theme: { label: 'the theme heard most', value: 'Insurance blocks care', kind: 'name' },
    g1_conversations: { label: 'conversations', value: '11', kind: 'count' },
    empty: { label: 'nothing', value: '', kind: 'count' },
  }

  it('is empty rather than undefined where nothing was frozen', () => {
    expect(sentFigures(null)).toEqual([])
    expect(sentFigures(undefined)).toEqual([])
  })

  it('drops a per-finding count and an empty value, and leads with the headline slots', () => {
    const rows = sentFigures(figures)
    expect(rows.map((r) => r.key)).toEqual(['videos', 'client_share_pct', 'top_theme'])
  })

  it('caps what it prints', () => {
    expect(sentFigures(figures, 1).map((r) => r.key)).toEqual(['videos'])
  })

  // A WP19 brief freezes the blocks' whole merged table — 7 to 20 keys beside
  // the curated cover slots — and kind-then-alphabetical handed a reader the
  // alphabetically first six of those instead of the figures the report is
  // recognised by. A theme's UUID key is a real figure nobody can read.
  it('is not crowded out by a brief\'s block keys, and never prints a UUID key', () => {
    const rows = sentFigures({
      ...figures,
      reading_month: { label: 'the month this reading is of', value: 'September 2026', kind: 'name' },
      conversations: { label: 'comments read in September 2026', value: '11,330', kind: 'count' },
      o_2418f4d7_54a2_497e_8433_6cd89bc2322b_share: { label: 'a theme', value: '8.8%', kind: 'pct' },
      standing_competitor_ottobock_content: { label: 'a standing', value: '4', kind: 'count' },
      kind_question_share: { label: 'a kind', value: '3.1%', kind: 'pct' },
    })
    expect(rows.map((r) => r.key).slice(0, 4)).toEqual(['reading_month', 'conversations', 'videos', 'client_share_pct'])
    expect(rows.map((r) => r.key)).not.toContain('o_2418f4d7_54a2_497e_8433_6cd89bc2322b_share')
  })
})
