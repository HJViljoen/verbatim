import { describe, expect, it } from 'vitest'

import {
  cannotTell,
  crosscheckLine,
  leanOf,
  LINE_MIN_READINGS,
  monthLine,
  scriptedLines,
  switchingFigure,
  type SwitchingVideo,
} from './figures'
import { monthlyLineLabel } from '../../pages/overview'
import { REFUSAL_WHY } from '../../reading/record'
import type { FigureTable as ReadingFigures, RefusedReason, Verdict, VerdictState, VerdictWindow } from '../../reading/verdicts'

const WINDOW: VerdictWindow = { kind: 'month', from: '2026-09-01', to: '2026-10-01' }
const BASIS = 'dated by when each video was posted'

const pool = (spec: { toward?: number; away?: number; neither?: number }): SwitchingVideo[] => {
  const out: SwitchingVideo[] = []
  let n = 0
  for (let i = 0; i < (spec.toward ?? 0); i += 1) out.push({ id: `v${n++}`, sentiment: 'positive' })
  for (let i = 0; i < (spec.away ?? 0); i += 1) out.push({ id: `v${n++}`, sentiment: 'negative' })
  for (let i = 0; i < (spec.neither ?? 0); i += 1) out.push({ id: `v${n++}`, sentiment: null })
  return out
}

const switching = (videos: SwitchingVideo[]) =>
  switchingFigure({ window: WINDOW, audience: 'client', audienceLabel: 'your own videos', videos, basis: BASIS })

describe('leanOf', () => {
  it('reads the two stored words and nothing else', () => {
    expect(leanOf('positive')).toBe('toward')
    expect(leanOf('negative')).toBe('away')
    expect(leanOf('neutral')).toBe('neither')
    expect(leanOf(null)).toBe('neither')
    // The older writer's vocabulary is not guessed at: it is "nothing says
    // which way", which is what it is.
    expect(leanOf('mixed')).toBe('neither')
    expect(leanOf('POSITIVE ')).toBe('toward')
  })
})

describe('switchingFigure', () => {
  it('is null on a pool of zero — 0 of 0 is not a measurement', () => {
    expect(switching([])).toBeNull()
  })

  it('counts all three buckets over the pool, never over each other', () => {
    const f = switching(pool({ toward: 7, away: 3, neither: 2 }))
    expect(f).not.toBeNull()
    expect(f?.pool).toBe(12)
    expect(f?.toward).toEqual({ k: 7, n: 12 })
    expect(f?.away).toEqual({ k: 3, n: 12 })
    expect(f?.neither).toEqual({ k: 2, n: 12 })
    // Every bucket's n is the pool, so the three are independent readings of
    // one denominator — not slices of a partition.
    expect(f?.toward.n).toBe(f?.pool)
    expect(f?.away.n).toBe(f?.pool)
  })

  it('refuses below the floor and says how many it had', () => {
    const f = switching(pool({ toward: 42, neither: 12 }))
    expect(f?.verdict).toBeNull()
    expect(f?.unread).toContain('54')
    expect(f?.unread).toContain('100')
    expect(f?.unread).toMatch(/too few to compare/i)
  })

  it('bands the toward share once the pool clears the floor, and flags the measurement', () => {
    const f = switching(pool({ toward: 60, away: 30, neither: 30 }))
    expect(f?.verdict).not.toBeNull()
    expect(f?.verdict?.value).toEqual({ k: 60, n: 120 })
    // No baseline: the level, never "flat".
    expect(f?.verdict?.changePts).toBeNull()
    expect(f?.verdict?.state).toBe<VerdictState>('too_little_data')
    expect(f?.verdict?.flags).toContain('measurement_changed')
    expect(f?.verdict?.countedOver?.measure).toBe('videos')
  })

  it('still refuses when the pool clears n but the toward count is under minK', () => {
    const f = switching(pool({ toward: 4, away: 40, neither: 80 }))
    expect(f?.pool).toBe(124)
    expect(f?.verdict).toBeNull()
  })

  it('prints the pool in the line and names what nothing judged', () => {
    const f = switching(pool({ toward: 7, away: 3, neither: 2 }))
    expect(f?.line).toContain('12 videos named both')
    expect(f?.line).toContain('7 of 12 leaned toward you')
    expect(f?.unread).toContain('2 of 12 carry nothing')
  })

  it('carries its basis, because it is not comment-dated', () => {
    expect(switching(pool({ toward: 1 }))?.basis).toBe(BASIS)
  })
})

describe('crosscheckLine', () => {
  it('names both populations and draws no arithmetic between them', () => {
    const f = switching(pool({ toward: 7, away: 3, neither: 2 }))
    const line = crosscheckLine(f!, { label: 'Objections', value: { k: 28, n: 205 } })
    expect(line).toContain('7 of 12')
    expect(line).toContain('28 of 205')
    expect(line).toContain('Two populations, two denominators')
  })

  it('is null where the objection has no denominator', () => {
    const f = switching(pool({ toward: 7 }))
    expect(crosscheckLine(f!, null)).toBeNull()
    expect(crosscheckLine(f!, { label: 'Objections', value: { k: 0, n: 0 } })).toBeNull()
  })
})

describe('scriptedLines', () => {
  const figures: ReadingFigures = {
    objection_share: { value: 13.7, unit: 'pct', label: 'the objection’s share of the month' },
  }

  it('drops a drafted sentence in which the model typed a figure', () => {
    const [line] = scriptedLines({
      figures,
      lines: [
        {
          objection: { label: 'Price', registryId: 'r1', value: { k: 28, n: 205 } },
          because: [{ label: 'compared with a rival', value: { k: 11, n: 205 } }],
          draft: 'Price came up in 28 of 205 videos. Say that the warranty is included.',
        },
      ],
    })
    expect(line.say).not.toContain('28')
    expect(line.say).toContain('warranty')
  })

  it('keeps a sentence whose figure is a key the table holds', () => {
    const [line] = scriptedLines({
      figures,
      lines: [
        {
          objection: { label: 'Price', registryId: 'r1', value: { k: 28, n: 205 } },
          because: [],
          draft: 'Price is running at [[objection_share]] of the month.',
        },
      ],
    })
    expect(line.say).toContain('[[objection_share]]')
  })

  it('invents no sentence where there is no draft', () => {
    const [line] = scriptedLines({
      figures,
      lines: [{ objection: { label: 'Price', registryId: 'r1', value: { k: 28, n: 205 } }, because: [] }],
    })
    expect(line.say).toBe('')
    expect(line.objection.value).toEqual({ k: 28, n: 205 })
  })

  it('drops an objection one person raised, and a reason nobody counted', () => {
    const lines = scriptedLines({
      figures,
      lines: [
        { objection: { label: 'One voice', registryId: 'r2', value: { k: 1, n: 205 } }, because: [] },
        {
          objection: { label: 'Price', registryId: 'r1', value: { k: 28, n: 205 } },
          because: [
            { label: 'counted', value: { k: 11, n: 205 } },
            { label: 'uncounted', value: { k: 0, n: 0 } },
          ],
        },
      ],
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].because.map((b) => b.label)).toEqual(['counted'])
  })
})

describe('monthLine', () => {
  const months = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']

  it('draws only the side that has the readings', () => {
    const line = monthLine({
      months,
      labelFor: monthlyLineLabel,
      series: [
        { label: 'the category', points: [18, 19, 19.5, 20] },
        { label: 'you', points: [null, null, null, 31] },
      ],
    })
    expect(line.series.map((s) => s.label)).toEqual(['the category'])
    expect(line.label).toBeNull()
    expect(line.empty).toBeNull()
  })

  it('names the months instead when no side clears three readings', () => {
    const line = monthLine({
      months,
      labelFor: monthlyLineLabel,
      series: [{ label: 'you', points: [null, null, 19, 19.2] }],
    })
    expect(line.series).toHaveLength(0)
    expect(line.label).toBe('Aug → Sep only')
    expect(line.empty).toContain(String(LINE_MIN_READINGS))
  })

  it('says so when there is no series at all', () => {
    const line = monthLine({ months, labelFor: monthlyLineLabel, series: [] })
    expect(line.label).toBeNull()
    expect(line.empty).toContain('month series')
  })

  it('carries no direction word anywhere in its output', () => {
    const line = monthLine({
      months,
      labelFor: monthlyLineLabel,
      series: [{ label: 'the category', points: [18, 19, 19.5, 20] }],
    })
    const printed = [line.label, line.empty, ...line.series.map((s) => s.label)].filter(Boolean).join(' ')
    expect(printed).not.toMatch(/\b(grow|growing|fading|rising|narrowed|up|down|flat)\b/i)
  })
})

describe('cannotTell', () => {
  const verdict = (state: VerdictState, reason?: RefusedReason): Verdict => ({
    objectKind: 'theme',
    objectId: 't1',
    objectLabel: 'Price',
    audience: 'industry-other',
    window: WINDOW,
    value: { k: 3, n: 40 },
    changePts: null,
    bandPts: null,
    state,
    flags: [],
    ...(reason ? { refusedReason: reason } : {}),
  })

  it('says every comparison was drawn when none was refused', () => {
    const out = cannotTell([verdict('moved'), verdict('no_clear_change')])
    expect(out.refusals).toHaveLength(0)
    expect(out.items).toHaveLength(0)
    expect(out.line).toContain('Every comparison')
  })

  it('carries one item per refusal, in the record’s own words, for each reason', () => {
    const reasons: RefusedReason[] = ['unlogged_era', 'tracking_change', 'clustering_changed', 'rename']
    for (const reason of reasons) {
      const out = cannotTell([verdict('refused', reason)])
      expect(out.refusals).toEqual([{ state: 'refused', reason }])
      expect(out.items).toHaveLength(1)
      // The record's wording, capitalised and stopped — never a second wording.
      expect(out.items[0].toLowerCase()).toContain(REFUSAL_WHY[reason])
    }
  })

  it('counts the two not-drawn states as refusals too, each with its own reason', () => {
    const out = cannotTell([verdict('too_little_data'), verdict('baseline_forming'), verdict('moved')])
    expect(out.refusals).toHaveLength(2)
    expect(out.items[0]).toBe('Too little was read on one side or both.')
    expect(out.items[1]).toBe('There are not enough months behind it yet.')
    expect(out.line).toContain('2 comparisons')
  })
})
