import { describe, expect, it } from 'vitest'

import {
  dateFilterLine,
  hasDateFilter,
  emptyGroupLine,
  listCap,
  parseDateFilter,
  printedFigures,
  readingLine,
  readingStampOf,
  sentFigures,
  withinDates,
} from './archive'
import { mergeFigures } from '../blocks/types'
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
    expect(dateFilterLine(parseDateFilter('2025-01-01', '2025-03-01'), 0, 340, { cappedAt: 100 }))
      .toBe('0 of 340 items 1 Jan 2025 to 1 Mar 2025. Only the 100 most recent are searched, so anything older than those is not counted here.')
  })

  it('adds no caveat where nothing is behind the cap', () => {
    // An uncapped group is unchanged, passed or omitted.
    expect(dateFilterLine(parseDateFilter('2026-09-01', '2026-09-30'), 12, 47, { cappedAt: null }))
      .toBe('12 of 47 items 1 Sep 2026 to 30 Sep 2026.')
    expect(dateFilterLine(parseDateFilter('2026-09-01', '2026-09-30'), 12, 47))
      .toBe('12 of 47 items 1 Sep 2026 to 30 Sep 2026.')
  })

  it('names the clock the cap is on where it is not the filter\'s', () => {
    // The Built list is the 100 most recently BUILT rows; the filter compares
    // the day each artefact read. "Most recent" alone left the two as one.
    expect(dateFilterLine(parseDateFilter('2025-01-01', '2025-03-01'), 0, 340, { cappedAt: 100, clock: 'built' }))
      .toBe('0 of 340 items 1 Jan 2025 to 1 Mar 2025. Only the 100 most recently built are searched, so anything built before those is not counted here.')
  })

  it('does not weigh the cap against a total drawn from another pool', () => {
    // The Built group's total is the head count minus the snapshots a send has
    // taken; the cap applies to the head count. 130 built, 40 sent, the newest
    // 100 loaded: the old `total > cappedAt` test compared 90 against 100 and
    // suppressed the caveat over 30 rows that were never looked at.
    expect(dateFilterLine(parseDateFilter('2025-01-01', '2025-03-01'), 0, 90, { cappedAt: 100 }))
      .toBe('0 of 90 items 1 Jan 2025 to 1 Mar 2025. Only the 100 most recent are searched, so anything older than those is not counted here.')
  })
})

describe('dateFilterLine, where the list could not be read', () => {
  it('says so instead of counting an archive it did not see', () => {
    // readRows returns [] and logs; the head count beside it still answers, so
    // the honest line is the one that makes no claim about the workspace.
    expect(dateFilterLine(parseDateFilter('2025-01-01', '2025-03-01'), 0, 340, { unread: true }))
      .toBe('We could not read this list just now, so this is not a count of what is in those dates. Try again in a moment.')
  })

  it('outranks the cap caveat — neither number is worth anything', () => {
    expect(dateFilterLine(parseDateFilter('2025-01-01', '2025-03-01'), 0, 340, { cappedAt: 100, clock: 'built', unread: true }))
      .not.toMatch(/340|100/)
  })

  it('still says nothing where nothing is filtered', () => {
    expect(dateFilterLine(parseDateFilter(undefined, undefined), 0, 340, { unread: true })).toBeNull()
  })
})

describe('emptyGroupLine', () => {
  const invite = 'Nothing built by hand yet. Build any template in the Studio and its PDF lands here.'
  const args = { verb: 'was built', invite }

  it('invites where the archive really is empty', () => {
    expect(emptyGroupLine({ ...args, filtered: false, reach: {} })).toBe(invite)
  })

  it('says only what the filter looked at where a cap hides rows', () => {
    // The header says the newest 100 were searched; the pane may not say
    // "nothing was built in those dates" directly beneath it.
    expect(emptyGroupLine({ ...args, filtered: true, reach: { cappedAt: 100, clock: 'built' } }))
      .toBe('Nothing was built in those dates among the 100 we searched.')
  })

  it('claims the workspace only where the whole group was searched', () => {
    expect(emptyGroupLine({ ...args, filtered: true, reach: { cappedAt: null } }))
      .toBe('Nothing was built in those dates.')
  })

  it('says a failed read failed, filtered or not', () => {
    const failed = 'We could not read this list just now. Try again in a moment.'
    expect(emptyGroupLine({ ...args, filtered: true, reach: { unread: true } })).toBe(failed)
    expect(emptyGroupLine({ ...args, filtered: false, reach: { unread: true } })).toBe(failed)
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

// A MONTHLY SEND IS THE ONE ARTEFACT WHOSE IDENTITY IS A MONTH, and the
// archive dropped it: `readingStampOf` took its month from
// `reading.monthLabel`, which only a WP19 brief has. WP17's weekly and WP18's
// monthly carry `month: '2026-09'` TOP-LEVEL, so the month — and with it the
// "(still filling)" marker, which readingLine prints only inside the month
// clause — never reached the line.
describe('readingStampOf over the month carriers', () => {
  it('takes a brief’s label as it stands', () => {
    const stamp = readingStampOf({ created_at: '2026-10-01T00:00:00Z', reading: { readingAt: '2026-10-01T06:00:00Z', monthLabel: 'September 2026', monthStatus: 'filling' } })
    expect(readingLine(stamp)).toBe('September 2026 (still filling) · read as at 1 Oct 2026')
  })

  it('takes a weekly’s or a monthly’s top-level month key and says it in words', () => {
    const stamp = readingStampOf({ created_at: '2026-10-01T00:00:00Z', readingAt: '2026-10-01T06:00:00Z', dataMonth: '2026-09', monthStatus: 'filling' })
    expect(stamp.month).toBe('September 2026')
    expect(readingLine(stamp)).toBe('September 2026 (still filling) · read as at 1 Oct 2026')
  })

  // M9's `month` is a Postgres date, so PostgREST hands back '2026-09-01'.
  // Preferring the column must not start printing a raw date.
  it('says M9’s date column in words too', () => {
    const stamp = readingStampOf({ created_at: '2026-10-01T00:00:00Z', reading_at: '2026-10-01T06:00:00Z', month: '2026-09-01', month_status: 'frozen' })
    expect(readingLine(stamp)).toBe('September 2026 · read as at 1 Oct 2026')
  })

  it('still says nothing about a month where no carrier has one', () => {
    const stamp = readingStampOf({ created_at: '2026-10-01T00:00:00Z', readingAt: '2026-10-01T06:00:00Z' })
    expect(stamp.month).toBeNull()
    expect(readingLine(stamp)).toBe('read as at 1 Oct 2026')
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

  // THERE ARE TWO FIGURE-TABLE SHAPES AND THE ARCHIVE READ ONE. WP17's weekly,
  // WP18's monthly and WP20's quarterly all freeze the MEASURED table
  // (`mergeFigures(blocks.map(b => b.figures()))`), whose values are numbers.
  // The filter tested `typeof f.value === 'string'`, so every send this
  // product makes yielded nothing and the Sent pane printed "This report
  // stored no figure table." beside an artefact that stored a complete one.
  it('reads a measured table as well as a printed one', () => {
    const measured = mergeFigures([{
      client_share_pct: { value: 8.8, unit: 'pct', label: 'share of the tracked conversation' },
      videos: { value: 34, unit: 'videos', label: 'videos this month' },
      month_change_pts: { value: -4.1, unit: 'pts', label: 'against last month' },
    }])
    const rows = sentFigures(measured)
    expect(rows.map((r) => [r.key, r.value])).toEqual([
      ['videos', '34'],
      ['client_share_pct', '8.8%'],
      ['month_change_pts', '-4.1 pts'],
    ])
  })

  it('leaves a printed table exactly as it was frozen', () => {
    expect(printedFigures(figures)).toBe(figures)
    expect(printedFigures(null)).toBeNull()
  })
})
