import { describe, expect, it } from 'vitest'
import { blockAnswers, blockContext, figureConflicts, figureCount, mergeFigures, type Block } from './types'
import { EMAIL } from '../email/theme'
import type { FigureTable, Verdict } from '../reading/verdicts'

const figure = (value: number, unit: FigureTable[string]['unit'], label: string) => ({ value, unit, label })

const verdict: Verdict = {
  objectKind: 'theme',
  objectId: 'r1',
  objectLabel: 'Durability',
  audience: 'client',
  window: { kind: 'month', from: '2026-08-01', to: '2026-09-01' },
  value: { k: 26, n: 84 },
  changePts: null,
  bandPts: null,
  state: 'too_little_data',
  flags: [],
}

interface D { rows: number }

const full: Block<D> = {
  key: 'overview.subjects',
  title: 'Your subjects',
  question: 'What are people saying about the things you decided to be known for?',
  render: () => null,
  figures: (d) => ({ rows: figure(d.rows, 'videos', 'videos') }),
  verdicts: () => [verdict],
  quotes: () => ['c:1', 'e:2'],
  emptyState: (d) => (d.rows === 0 ? 'Counted with the first update.' : null),
}

const bare: Block<D> = {
  key: 'overview.record',
  title: 'How sound is this month',
  render: () => null,
  emptyState: () => null,
}

describe('blockAnswers', () => {
  it('fills the three optional answers in rather than handing back undefined', () => {
    expect(blockAnswers(bare, { rows: 3 })).toEqual({ figures: {}, verdicts: [], quotes: [], empty: null })
  })

  it("carries a block's own answers through unchanged", () => {
    expect(blockAnswers(full, { rows: 84 })).toEqual({
      figures: { rows: figure(84, 'videos', 'videos') },
      verdicts: [verdict],
      quotes: ['c:1', 'e:2'],
      empty: null,
    })
  })

  it('reports the empty state as the sentence, not as a boolean', () => {
    expect(blockAnswers(full, { rows: 0 }).empty).toBe('Counted with the first update.')
  })
})

describe('mergeFigures / figureCount', () => {
  it('counts one token once however many blocks print it', () => {
    const a: FigureTable = { videos: figure(84, 'videos', 'videos'), share: figure(31, 'pct', '%') }
    const b: FigureTable = { videos: figure(84, 'videos', 'videos'), gap: figure(13, 'pts', 'points') }
    expect(figureCount([a, b])).toBe(3)
    expect(Object.keys(mergeFigures([a, b])).sort()).toEqual(['gap', 'share', 'videos'])
  })

  it('counts nothing for a page of blocks that print no figures', () => {
    expect(figureCount([])).toBe(0)
    expect(figureCount([{}, {}])).toBe(0)
  })
})

describe('figureConflicts', () => {
  it('is empty when two blocks agree about a token', () => {
    const a: FigureTable = { videos: figure(84, 'videos', 'videos') }
    expect(figureConflicts([a, { ...a }])).toEqual([])
  })

  it('names a token two blocks give two values', () => {
    const a: FigureTable = { videos: figure(84, 'videos', 'videos') }
    const b: FigureTable = { videos: figure(85, 'videos', 'videos') }
    expect(figureConflicts([a, b])).toEqual(['videos'])
  })

  it('names a token two blocks give two units, same number', () => {
    const a: FigureTable = { share: figure(31, 'pct', '%') }
    const b: FigureTable = { share: figure(31, 'pts', 'points') }
    expect(figureConflicts([a, b])).toEqual(['share'])
  })

  it('sorts, so a failure reads the same way twice', () => {
    const a: FigureTable = { b: figure(1, 'pct', '%'), a: figure(1, 'pct', '%') }
    const b: FigureTable = { b: figure(2, 'pct', '%'), a: figure(2, 'pct', '%') }
    expect(figureConflicts([a, b])).toEqual(['a', 'b'])
  })
})

describe('blockContext', () => {
  it('answers the email fields honestly rather than leaving them undefined', () => {
    const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
    expect(ctx.image('overview.subjects')).toBeNull()
    expect(ctx.theme.green).toBe('#0E8A5F')
    expect(ctx.params).toBeUndefined()
  })

  it('carries the page params when it is given them', () => {
    expect(blockContext('https://x', EMAIL, { item: 'durability' }).params).toEqual({ item: 'durability' })
  })
})
