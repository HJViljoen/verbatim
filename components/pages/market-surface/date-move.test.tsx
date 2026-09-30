import { describe, expect, it } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { moveMarketReads, type MarketSurfaceData } from '@/lib/pages/market-surface'
import { joins } from '@/lib/reading/comparability'
import { pairOn } from '@/lib/reading/pairs'
import { sealandJudge } from '@/lib/test/sealand-pairs'
import { headlineParts, marketLine as readLine, partsText } from '@/lib/pages/market-line'
import { DATE_MOVE_TODAY } from '@/lib/pages/date-move'
import { MarketSurfacePage } from './index'
import { marketMoves } from './moves'
import { DateMove } from './date-move'
import { ossurMovesFixture, sealandMovesFixture } from './fixture'

// "Date a move" (the approved preview's Your moves, WP3.6 wave 2): the green
// button under Your moves and in the page bar, the sheet it opens, and a move
// read from the day it was made (MF5 `moves.dated_on`).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

describe('Date a move · the control', () => {
  it('draws the green button under Your moves in the app, and nothing to press on paper or in an email', () => {
    const data = sealandMovesFixture()
    const app = render(marketMoves.render(data, 'app', ctx))
    expect(app).toMatch(/<button[^>]*class="[^"]*bg-primary[^"]*h-11[^"]*"[^>]*>[\s\S]*?Date a move<\/button>/)
    // Under the three empty cells, as the preview draws it.
    expect(app.indexOf('Date a move')).toBeGreaterThan(app.indexOf('Month after that'))
    for (const mode of ['print', 'email'] as const) {
      const markup = render(marketMoves.render(data, mode, ctx))
      expect(markup).not.toContain('<button')
      expect(renderText(markup)).not.toContain('Date a move')
    }
  })

  it('draws it in the page bar too, from sm up', () => {
    const page = render(<MarketSurfacePage data={sealandMovesFixture()} />)
    const bar = page.slice(0, page.indexOf('In one line'))
    const button = bar.match(/<button[^>]*class="([^"]*)"[^>]*>(?:(?!<\/button>)[\s\S])*Date a move<\/button>/)
    expect(button).not.toBeNull()
    // Hidden on a phone and nothing else competing for its display.
    const classes = button![1].split(/\s+/)
    expect(classes).toContain('hidden')
    expect(classes).toContain('sm:inline-flex')
    expect(classes).not.toContain('inline-flex')
  })

  it('draws no control where there is nothing to date a move on, or no record of moves', () => {
    const base = sealandMovesFixture()
    const bare: MarketSurfaceData = { ...base, moves: { ...base.moves, dating: { ...base.moves.dating!, subjects: [], themes: [], advice: null } } }
    expect(render(marketMoves.render(bare, 'app', ctx))).not.toContain('Date a move')
    expect(render(<MarketSurfacePage data={bare} />)).not.toContain('Date a move')
    const unrecorded: MarketSurfaceData = { ...base, moves: { ...base.moves, dating: undefined } }
    expect(render(<MarketSurfacePage data={unrecorded} />)).not.toContain('Date a move')
  })

  it('keeps the copy contract with the control drawn, in every mode', () => {
    for (const data of [sealandMovesFixture(), ossurMovesFixture()]) {
      for (const mode of MODES) assertCopyContract(render(marketMoves.render(data, mode, ctx)))
    }
  })

  it('opens closed: the sheet and its form render nothing until pressed', () => {
    const closed = render(<DateMove dating={sealandMovesFixture().moves.dating!} />)
    expect(closed).not.toContain('<form')
    expect(closed).not.toContain(DATE_MOVE_TODAY)
  })
})

describe('Date a move · a move read from the day it was made', () => {
  // A move declared on 2 Oct and dated 15 Sep, on Waterproofing: staging's
  // pooled market in September (Waterproofing 29 of 654), October not read.
  // Ready, as on staging: a provisional subject reads no level (T0a, YM-47).
  const reads = moveMarketReads({
    moves: [{ id: 'm-d', kind: 'subject', subject_id: 's-water', registry_ids: null, lineage_id: null, title: 'Zip test on every bag page', declared_at: '2026-10-02', dated_on: '2026-09-15' }],
    month: '2026-09-01',
    on: () => 'on the subject Waterproofing',
    subjects: new Map([['s-water', { name: 'Waterproofing', calibration: 'ready' as const }]]),
    themes: new Map(),
    adviceTargets: new Map(),
    levels: (_kind, _id, month) => (month === '2026-09-01' ? 29 : null),
    n: (month) => (month === '2026-09-01' ? 654 : null),
  })

  it('takes the move’s month from the day it was made, not the day it was declared', () => {
    expect(reads[0].datedOn).toBe('2026-09-15')
    expect(reads[0].months.map((m) => [m.role, m.month, m.state, m.k, m.n])).toEqual([
      ['move', '2026-09-01', 'read', 29, 654],
      ['after', '2026-10-01', 'not_yet', null, null],
      ['after_that', '2026-11-01', 'not_yet', null, null],
    ])
  })

  it('prints the day it was made, and the hero names it as the latest', () => {
    const base = sealandMovesFixture()
    const data: MarketSurfaceData = { ...base, moves: { ...base.moves, empty: null, market: reads } }
    for (const mode of MODES) {
      const text = renderText(marketMoves.render(data, mode, ctx))
      expect(text, mode).toContain('dated 15 Sep')
      expect(text, mode).toContain('29 of 654')
    }
    const line = readLine(data)
    expect(line && partsText(headlineParts(line))).toMatch(/ One move is dated: “Zip test on every bag page”, 15 Sep\.$/)
  })

  it('reads a move with no day from the day it was declared, as before MF5', () => {
    const [plain] = moveMarketReads({
      moves: [{ id: 'm-p', kind: 'subject', subject_id: 's-water', registry_ids: null, lineage_id: null, title: 'Zip test', declared_at: '2026-10-02' }],
      month: '2026-09-01',
      on: () => 'on the subject Waterproofing',
      subjects: new Map([['s-water', { name: 'Waterproofing', calibration: 'provisional' as const }]]),
      themes: new Map(),
      adviceTargets: new Map(),
      levels: () => null,
      n: () => null,
    })
    expect(plain.datedOn).toBeUndefined()
    expect(plain.months[0]).toMatchObject({ role: 'move', month: '2026-10-01', state: 'not_yet' })
  })
})

// T0a, YM-45 (the one condition): three levels side by side are a comparison,
// and a search change in the month after printed as the market's answer to
// the move. A later month prints only where every step from the move's month
// to it is read the same way (the pair judge on the market view).
describe('A move read in the market: no month across a refused step', () => {
  const read = (joined?: (prev: string, month: string) => boolean) => moveMarketReads({
    moves: [{ id: 'm-a', kind: 'subject', subject_id: 's-looks', registry_ids: null, lineage_id: null, title: 'New colourways', declared_at: '2026-08-12' }],
    month: '2026-10-01',
    on: () => 'on the subject Looks & style',
    subjects: new Map([['s-looks', { name: 'Looks & style', calibration: 'ready' as const }]]),
    themes: new Map(),
    adviceTargets: new Map(),
    // Looks & style: 38 of 377 in August, 103 of 654 in September; October
    // HYPOTHETICAL.
    levels: (_kind, _id, month) => ({ '2026-08-01': 38, '2026-09-01': 103, '2026-10-01': 90 } as Record<string, number>)[month] ?? null,
    n: (month) => ({ '2026-08-01': 377, '2026-09-01': 654, '2026-10-01': 600 } as Record<string, number>)[month] ?? null,
    ...(joined ? { joined } : {}),
  })[0]

  it('with every step joined, the three months print', () => {
    expect(read(() => true).months.map((m) => m.role)).toEqual(['move', 'after', 'after_that'])
  })

  it('August against September refused (Sealand: our September searches): the move\'s month prints alone', () => {
    const judge = pairOn(sealandJudge('2026-10-02T06:00:00.000Z'))
    const r = read((a, b) => joins(judge(a, b, 'market')))
    expect(r.months.map((m) => [m.role, m.month])).toEqual([['move', '2026-08-01']])
    const data: MarketSurfaceData = { ...sealandMovesFixture(), moves: { ...sealandMovesFixture().moves, empty: null, market: [r] } }
    for (const mode of MODES) {
      const text = renderText(marketMoves.render(data, mode, ctx))
      expect(text, mode).toContain('38 of 377')
      expect(text, mode).not.toContain('103 of 654')
      expect(text, mode).not.toContain('Month after')
    }
  })

  it('a refused step later on keeps the months before it and nothing after', () => {
    const r = read((_a, b) => b !== '2026-10-01')
    expect(r.months.map((m) => m.role)).toEqual(['move', 'after'])
  })
})
