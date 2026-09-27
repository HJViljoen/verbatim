import { describe, expect, it } from 'vitest'

import { DIRECTION_WORDS } from '../calibration'
import { collapseRules } from '../charts/calendar'
import { calendarRulesFor, seriesToCalendar } from '../charts/from-series'
import { buildSeries, mergeNotes, mergeSeriesNotes, type DenominatorPoint, type MonthSeries, type SeriesChange } from '../reading/series'
import { readingCaveat } from '../reports/monthly'
import { captionOurChanges, NOTELESS_CHANGE_LINE, type CaptionRow } from './change-caveats'

// Heinrich, 27 Sep: our own change rows (gate_rule/relevance_gate,
// attribution/attribution_v3, segment/segments_v1, other/gather_capped) carry
// no note. The reading layer said every note-less change's months as "What
// this workspace tracks changed, and it moved this month."; a page now says
// such a change of ours in its title, in What we changed's words.

const AXIS = ['2026-07-01', '2026-08-01', '2026-09-01']

const den = (month: string, videos: number): DenominatorPoint => ({
  month, audience: 'industry-other', videos, comments: videos * 9,
  status: month === '2026-09-01' ? 'filling' : 'frozen', origin: 'live', read_at: `${month}T00:00:00Z`, run_id: 'r1',
})
const DENOMINATORS = AXIS.map((m) => den(m, 600))

/** A change-log row as `loadChanges` hands it over, cut to what the caption reads. */
const row = (surface: string, field: string, over: Partial<CaptionRow> = {}): CaptionRow => ({
  surface: surface as CaptionRow['surface'],
  field,
  note: null,
  changed_at: '2026-09-25T16:18:47.000Z',
  affects_months: '[2026-08-01,2026-10-01)',
  ...over,
})

/** `loadMonthSeries`' own mapping of a row (lib/reading/read.ts). */
const asSeriesChange = (c: CaptionRow): SeriesChange => ({ changed_at: c.changed_at, surface: c.surface, note: c.note ?? null, months: c.affects_months ?? null })

/** The line as the page hands it on: built by the reading layer from the log,
 *  then captioned from the same log. */
function pageSeries(changes: readonly CaptionRow[], captioned = true): MonthSeries {
  const s = buildSeries({ axis: AXIS, audience: 'industry-other', denominators: DENOMINATORS, changes: changes.map(asSeriesChange) })
  return captioned ? captionOurChanges(s, changes) : s
}

const saidOn = (s: MonthSeries, month: string): string[] =>
  s.points.find((p) => p.month === month)!.labels.filter((l) => l.kind === 'tracking_change').map((l) => l.text)

const GATE = row('gate_rule', 'relevance_gate')
const ATTRIBUTION = row('attribution', 'attribution_v3')
const SEGMENT = row('segment', 'segments_v1', { changed_at: '2026-09-27T12:00:00.000Z' })
const CAPPED = row('other', 'gather_capped', { changed_at: '2026-09-20T04:18:34.000Z' })
const OURS = [GATE, ATTRIBUTION, SEGMENT, CAPPED]

describe('a note-less change of ours says its title on the months it reached (27 Sep)', () => {
  it('holds the line it replaces to the reading layer’s own words', () => {
    // A client's own edit, logged by the trigger with no note: series.ts's
    // sentence, unchanged. If series.ts ever re-words it, this fails first.
    const theirs = row('terms', 'industry_keywords', { changed_at: '2026-08-03T10:00:00.000Z', affects_months: '[2026-08-01,2026-09-01)' })
    expect(saidOn(pageSeries([theirs], false), '2026-08-01')).toEqual([NOTELESS_CHANGE_LINE])
    expect(saidOn(pageSeries([theirs]), '2026-08-01')).toEqual([NOTELESS_CHANGE_LINE])
  })

  it('pins each line: the title, dated by the month we made the change, no direction word', () => {
    const lines = Object.fromEntries(OURS.map((c) => [`${c.surface}/${c.field}`, saidOn(pageSeries([c]), '2026-09-01')]))
    expect(lines).toEqual({
      'gate_rule/relevance_gate': ['We changed how we check relevance in September'],
      'attribution/attribution_v3': ['We changed how we file a video to a brand in September'],
      'segment/segments_v1': ['We changed how we mark makers’ videos in September'],
      'other/gather_capped': ['We changed how we read in September'],
    })
    // No direction word: the calibrated list the copy contract enforces.
    for (const [text] of Object.values(lines)) {
      for (const w of DIRECTION_WORDS) expect(text.toLowerCase()).not.toMatch(new RegExp(`\\b${w}\\b`))
    }
  })

  it('says the same words on every month the change reached, so the chart draws one rule over them', () => {
    const s = pageSeries([GATE])
    expect(saidOn(s, '2026-07-01')).toEqual([])
    expect(saidOn(s, '2026-08-01')).toEqual(['We changed how we check relevance in September'])
    expect(saidOn(s, '2026-09-01')).toEqual(['We changed how we check relevance in September'])
    const rules = calendarRulesFor([s])
    expect(rules.map((r) => [r.month, r.kind, r.label])).toEqual([
      ['2026-08-01', 'tracking_change', 'We changed how we check relevance in September'],
      ['2026-09-01', 'tracking_change', 'We changed how we check relevance in September'],
    ])
    // The chart collapses the run into one rule with its band: the rule's
    // hover is the label, the band's title "<label>: affects Aug 2026 to Sep 2026".
    expect(collapseRules(AXIS, rules)).toEqual([
      { month: '2026-08-01', kind: 'tracking_change', label: 'We changed how we check relevance in September', affects: ['2026-08-01', '2026-09-01'] },
    ])
  })

  it('keeps a row with a note as it was: its note, where the reading layer put it', () => {
    const noted = { ...GATE, note: 'We corrected how we check that a video belongs to your market.' }
    const built = pageSeries([noted], false)
    expect(captionOurChanges(built, [noted])).toBe(built)
    expect(saidOn(built, '2026-09-01')).toEqual(['We corrected how we check that a video belongs to your market.'])
  })

  it('says each change once, and a client’s own note-less edit keeps the old line beside ours', () => {
    const theirs = row('rivals', 'competitor_names', { changed_at: '2026-09-03T08:00:00.000Z', affects_months: '[2026-09-01,2026-10-01)' })
    const noted = row('handles', 'competitor_handles', { changed_at: '2026-09-04T08:00:00.000Z', note: 'A TikTok account added for The North Face.', affects_months: '[2026-09-01,2026-10-01)' })
    // Two rows of the one gate fix (a re-run of the script) say it once.
    const s = pageSeries([theirs, GATE, noted, { ...GATE }, SEGMENT])
    expect(saidOn(s, '2026-09-01')).toEqual([
      NOTELESS_CHANGE_LINE,
      'We changed how we check relevance in September',
      'We changed how we mark makers’ videos in September',
      'A TikTok account added for The North Face.',
    ])
  })

  it('never guesses: a change log that does not explain the line leaves the series as it was', () => {
    const built = pageSeries([GATE], false)
    expect(captionOurChanges(built, [])).toBe(built)
    expect(captionOurChanges(built, [{ ...GATE, affects_months: '[2026-01-01,2026-02-01)' }])).toBe(built)
  })

  it('copies, never mutates: the loader’s series set is memoised and shared', () => {
    const built = pageSeries([GATE], false)
    const before = JSON.stringify(built)
    const out = captionOurChanges(built, [GATE])
    expect(out).not.toBe(built)
    expect(JSON.stringify(built)).toBe(before)
    // Only the caveat moved: every other field of every point is the same.
    const strip = (s: MonthSeries) => s.points.map((p) => ({ ...p, labels: p.labels.filter((l) => l.kind !== 'tracking_change') }))
    expect(strip(out)).toEqual(strip(built))
  })
})

describe('no "moved this month" can print for a change of ours', () => {
  // Every path a series' words take to a reader: the points' labels (the
  // Subjects chart's dated rules and their hover, Voice's theme points), the
  // chart's own hover notes, and the series' notes, which are all the
  // monthly (`readingCaveat`), the weekly and every page's foot print.
  const everyWord = (s: MonthSeries): string[] => [
    ...s.points.flatMap((p) => p.labels.map((l) => l.text)),
    ...s.notes.map((n) => n.text),
    ...mergeSeriesNotes([s]).map((n) => n.text),
    readingCaveat(mergeNotes([s.notes])) ?? '',
    ...calendarRulesFor([s]).map((r) => r.label),
    ...collapseRules(AXIS, calendarRulesFor([s])).map((r) => r.label),
    ...seriesToCalendar(s, { color: 'var(--cat)' }).points.map((p) => p.note ?? ''),
  ]

  for (const c of OURS) {
    it(`${c.surface}/${c.field}, alone and beside our other three`, () => {
      // Before the page's caption the line was there: the test is not vacuous.
      expect(everyWord(pageSeries([c], false)).join(' ')).toContain('moved this month')
      for (const changes of [[c], OURS]) {
        const words = everyWord(pageSeries(changes)).join(' ')
        expect(words).not.toMatch(/moved this month|\bmoved\b|\bmove\b/i)
        expect(words).toContain(`We changed how we`)
      }
    })
  }
})
