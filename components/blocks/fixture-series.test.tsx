import { describe, expect, it } from 'vitest'
import { BlockCalendar } from './calendar'
import { BlockFrame } from './frame'
import { BlockMovement } from './movement'
import { render, markupText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { buildSeries, monthAxis, type DenominatorPoint, type NumeratorPoint } from '@/lib/reading/series'
import { calendarBandsFor, calendarRulesFor, seriesToCalendar } from '@/lib/charts/from-series'
import { monthChange } from '@/lib/reading/bands'

// The WP10 "done when": a fixture series carrying a hollow month, a filling
// month, a clustering boundary and a RENAME renders in all three modes without
// a React error and keeps the copy contract.
//
// The fixture is built through the real `buildSeries` rather than hand-written
// as CalendarSeries, so the test exercises the seam the eight Block B pages
// will actually use: stored rows → MonthSeries → CalendarSeries → markup. A
// hand-written chart fixture would prove the chart draws what it is given and
// nothing about whether the reading layer gives it the right thing.

const MODES: readonly RenderMode[] = ['app', 'print', 'email']
const AXIS = monthAxis('2026-04-01', '2026-09-01')

/** Freitag, renamed to "Freitag Bags" on 2 August — so April–July are filed
 *  under the old key and August onward under the new one. May is hollow (no
 *  row at all), June is below the floor, September is still filling. */
const den = (month: string, audience: string, videos: number, status: 'frozen' | 'filling', key: string | null, origin: 'live' | 'back_read' = 'live'): DenominatorPoint => ({
  month, audience, videos, comments: videos * 12, status, origin, read_at: '2026-09-15T00:00:00Z',
  run_id: key, clustering_key: key,
})

const num = (month: string, audience: string, videos: number, key: string | null): NumeratorPoint => ({
  month, audience, videos, comments: videos * 9, run_id: key, clustering_key: key,
})

const DENOMINATORS: DenominatorPoint[] = [
  den('2026-04-01', 'competitor:Freitag', 140, 'frozen', 'c1', 'back_read'),
  // May: no row at all — hollow.
  den('2026-06-01', 'competitor:Freitag', 41, 'frozen', 'c1'),          // below the 100-video floor
  den('2026-07-01', 'competitor:Freitag', 138, 'frozen', 'c1'),
  den('2026-08-01', 'competitor:Freitag Bags', 139, 'frozen', 'c2'),    // clustering changed here too
  den('2026-09-01', 'competitor:Freitag Bags', 142, 'filling', 'c2'),
]

const READINGS: NumeratorPoint[] = [
  num('2026-04-01', 'competitor:Freitag', 51, 'c1'),
  num('2026-06-01', 'competitor:Freitag', 12, 'c1'),
  num('2026-07-01', 'competitor:Freitag', 55, 'c1'),
  num('2026-08-01', 'competitor:Freitag Bags', 57, 'c2'),
  num('2026-09-01', 'competitor:Freitag Bags', 62, 'c2'),
]

const series = buildSeries({
  axis: AXIS,
  audience: 'competitor:Freitag Bags',
  denominators: DENOMINATORS,
  readings: READINGS,
  renames: [{ from: 'competitor:Freitag', to: 'competitor:Freitag Bags', at: '2026-08-02T09:00:00Z' }],
  changes: [{ changed_at: '2026-09-03T10:00:00Z', surface: 'rivals', note: 'Poler was added to what we track.', months: '[2026-09-01,2026-10-01)' }],
  objectId: 'registry-durability',
  objectLabel: 'Durability',
  changeLogFrom: '2026-09-15T00:00:00Z',
})

const line = seriesToCalendar(series, { color: 'var(--comp)' })
const rules = calendarRulesFor([series])
const bands = calendarBandsFor([series])

describe('the fixture series', () => {
  it('carries a hollow month, a filling month, a boundary and a rename', () => {
    const byMonth = new Map(series.points.map((p) => [p.month, p]))
    expect(byMonth.get('2026-05-01')!.state).toBe('hollow')
    expect(byMonth.get('2026-06-01')!.state).toBe('below_floor')
    expect(byMonth.get('2026-09-01')!.state).toBe('filling')
    expect(series.names).toEqual(['competitor:Freitag', 'competitor:Freitag Bags'])
    expect(rules.map((r) => r.kind).sort()).toEqual(['clustering_changed', 'renamed', 'tracking_change'])
  })

  it('maps every state the chart has a token for', () => {
    const states = new Map(line.points.map((p) => [p.month, p.state]))
    expect(states.get('2026-04-01')).toBe('read')
    expect(states.get('2026-05-01')).toBe('hollow')
    expect(states.get('2026-06-01')).toBe('below_floor')
    expect(states.get('2026-07-01')).toBe('read')
    expect(states.get('2026-09-01')).toBe('filling')
  })

  it('shades the month that was read back at setup', () => {
    expect(bands).toHaveLength(1)
    expect(bands[0].months).toEqual(['2026-04-01'])
  })

  it('plots the share against the audience own denominator, never against a sum', () => {
    const july = line.points.find((p) => p.month === '2026-07-01')!
    expect(july.k).toBe(55)
    expect(july.n).toBe(138)
    expect(july.value).toBe(39.9)
  })
})

describe('the fixture, rendered', () => {
  const block = (mode: RenderMode) => (
    <BlockFrame
      mode={mode}
      title="Durability"
      question="How often does durability come up under this rival's videos?"
      meta="September 2026 · still filling"
    >
      <BlockCalendar
        mode={mode}
        ctx={blockContext('https://app.verbatimintel.com', EMAIL)}
        blockKey="voice.rival-line"
        axis={AXIS}
        series={[line]}
        rules={rules}
        bands={bands}
        format={(v) => `${v}%`}
        caption={series.notes.map((n) => n.text).join(' ')}
      />
      <BlockMovement
        mode={mode}
        verdict={monthChange({
          object: { kind: 'theme', id: 'registry-durability', label: 'Durability' },
          audience: 'competitor:Freitag Bags',
          curr: { month: '2026-09-01', videos: 142, k: 62, audience: 'competitor:Freitag Bags', clusteringKey: 'c2' },
          prev: { month: '2026-08-01', videos: 139, k: 57, audience: 'competitor:Freitag Bags', clusteringKey: 'c2' },
        })}
        unit="pts"
      />
    </BlockFrame>
  )

  it('renders in all three modes without a React error', () => {
    for (const mode of MODES) {
      const markup = render(block(mode))
      expect(markup.length).toBeGreaterThan(200)
      expect(markup).not.toContain('undefined')
      expect(markup).not.toContain('NaN')
    }
  })

  it('keeps the copy contract in all three modes', () => {
    for (const mode of MODES) assertCopyContract(render(block(mode)))
  })

  it('says the rename and the re-grouping on the screen, once each', () => {
    const words = markupText(render(block('app')))
    expect(words).toContain('Themes were re-grouped')
    expect((words.match(/Themes were re-grouped/g) ?? [])).toHaveLength(1)
  })

  it('prints the filling month as a bar on the screen and as a marked number in the email', () => {
    expect(render(block('app'))).toContain('Still filling: this month is still taking comments')
    const email = markupText(render(block('email')))
    expect(email).toContain('43.7%')
    // And not as though it were finished: the email says so in a word.
    expect(email).toContain('filling')
  })

  it('draws no inline SVG in the email arm', () => {
    expect(render(block('email'))).not.toContain('<svg')
  })
})
