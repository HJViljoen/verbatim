import { describe, expect, it } from 'vitest'

import { priorPrintable } from '../../reading/verdicts'
import type { PairComparability } from '../../reading/comparability'
import type { RecCopy } from '../market-surface'
import {
  adviceAims, adviceHistory, axisLine, compareMonths, conclusionViews, decisionLine, headerParts, largestStance, leadClaims, moveAxis, moveCards, movedMove,
  recordRows, restsOnRows, streakLabel, adviceHref, adviceParam, adviceTitle, waitingAdvice, MOVES_PATH, MOVE_UNREAD, UNTITLED_ADVICE,
} from './moves'
import { buildAdviceRows } from '../market-surface'
import { MOVE_CARDS, PLAN, THIN_MOVE, movesRecordFixture } from './moves-fixture'

// Your moves, Design v2 (T7): the page's pure half. The loader's reads feed
// these, and the render tests draw what they return.

const copy = (lineage: string, run: string, at: string, over: Partial<RecCopy> = {}): RecCopy => ({
  id: `${lineage}-${run}`, lineage_id: lineage, title: lineage, type: 'product', status: 'new', created_at: at, run_id: run, ...over,
})

describe('adviceHistory', () => {
  const copies = [
    copy('A', 'r1', '2026-08-01T06:00:00Z'),
    copy('A', 'r2', '2026-08-08T06:00:00Z'),
    copy('B', 'r2', '2026-08-08T06:00:00Z'),
    copy('A', 'r3', '2026-08-15T06:00:00Z'),
    copy('B', 'r3', '2026-08-15T06:00:00Z'),
    copy('C', 'r1', '2026-08-01T06:00:00Z'),
  ]

  it('counts the updates in a row that ended with the latest update, and since when', () => {
    expect(adviceHistory('A', copies)).toEqual({ dates: ['2026-08-01', '2026-08-08', '2026-08-15'], streak: 3, since: '2026-08-01', recent: [true, true, true] })
    expect(adviceHistory('B', copies)).toEqual({ dates: ['2026-08-08', '2026-08-15'], streak: 2, since: '2026-08-08', recent: [false, true, true] })
  })

  it('advice the latest update did not raise has no streak, and keeps its dates', () => {
    expect(adviceHistory('C', copies)).toEqual({ dates: ['2026-08-01'], streak: 0, since: null, recent: [true, false, false] })
  })

  it('a copy with no lineage is its own (`coalesce(lineage_id, id)`)', () => {
    const solo = [copy('X', 'r1', '2026-08-01T06:00:00Z', { id: 'solo', lineage_id: null })]
    expect(adviceHistory('solo', solo).streak).toBe(1)
  })

  it('keeps at most nine dots, the latest', () => {
    const many = Array.from({ length: 12 }, (_, i) => copy('A', `r${i}`, `2026-0${i < 9 ? 1 : 2}-${String(10 + i).padStart(2, '0')}T06:00:00Z`))
    expect(adviceHistory('A', many).recent).toHaveLength(9)
  })
})

describe('waitingAdvice: the one count the page and the tile print', () => {
  // Six pieces the latest update raised, two saying the same thing, one
  // decided; and one an earlier update raised.
  const copies = [
    ...['A', 'B', 'C', 'D', 'E', 'F'].map((l, i) => copy(l, 'r2', '2026-08-08T06:00:00Z', { id: `${l}-2`, priority: i === 0 ? 'high' : 'medium' })),
    copy('OLD', 'r1', '2026-08-01T06:00:00Z'),
  ]
  const rows = buildAdviceRows(copies, [{ id: 'd', lineage_id: 'F', status: 'acted_on', decided_at: '2026-08-09T00:00:00Z' }])
  const v = (x: number) => [x, Math.sqrt(1 - x * x)]
  const vectors = new Map([['A', v(1)], ['B', v(0.999)], ['C', v(0)], ['D', [0.6, -0.8]], ['E', [-1, 0]], ['F', v(1)], ['OLD', [0, -1]]])

  it('folds what says the same thing, leaves out the decided and the earlier, and is not capped', () => {
    const waiting = waitingAdvice(rows, vectors).map((r) => r.lineageId)
    expect(waiting).not.toContain('F')
    expect(waiting).not.toContain('OLD')
    expect(waiting.filter((l) => l === 'A' || l === 'B')).toHaveLength(1)
    expect(waiting).toHaveLength(4)
  })

  it('without vectors nothing is folded', () => {
    expect(waitingAdvice(rows, null)).toHaveLength(5)
  })
})

describe('restsOnRows and conclusionViews', () => {
  const videos = new Map<string, string | null>([['a1', 'v1'], ['a2', 'v1'], ['a3', 'v2'], ['a4', null]])
  const market = new Map([['m1', { title: 'Access decides', evidence: ['a1', 'a2', 'a3'] }], ['m2', { title: 'Pruned', evidence: ['a4'] }]])
  const rival = new Map([['c1', { title: 'Ottobock talk is about paying' }]])

  it('resolves each cited id once, in order: a conclusion with its videos, a rival finding by its title', () => {
    expect(restsOnRows({ basedOn: ['m1', 'c1', 'gone', 'm1', 'm2'], market, rival, videoByInsight: videos, onPage: new Set(['m1']) })).toEqual([
      { id: 'm1', kind: 'market', title: 'Access decides', videos: 2, anchor: 'conclusion-m1' },
      { id: 'c1', kind: 'rival', title: 'Ottobock talk is about paying', videos: null, anchor: null },
      { id: 'm2', kind: 'market', title: 'Pruned', videos: null, anchor: null },
    ])
  })

  it('tags each conclusion with the current advice citing it, built-on first', () => {
    const views = conclusionViews(
      [
        { id: 'm1', title: 'Access decides', evidence: { supporting_theme_ids: ['a1', 'a3'] } },
        { id: 'm3', title: 'Athletes share most', evidence: { supporting_theme_ids: ['a1', 'a2', 'a3'] } },
      ],
      [{ lineageId: 'L1', title: 'Help desk', basedOn: ['m1'] }],
      videos,
    )
    expect(views.map((v) => [v.id, v.videos, v.advice.map((a) => a.lineageId)])).toEqual([['m1', 2, ['L1']], ['m3', 2, []]])
  })
})

describe('moveCards', () => {
  const subjects = new Map([['s1', { name: 'Cost & access', calibration: 'ready' as const }], ['s2', { name: 'Fit', calibration: 'provisional' as const }], ['s3', { name: 'Repair', calibration: 'failed' as const }]])
  const N: Record<string, number> = { '2026-06-01': 600, '2026-07-01': 600, '2026-08-01': 600, '2026-09-01': 600, '2026-10-01': 300 }
  const K: Record<string, number> = { '2026-06-01': 60, '2026-07-01': 60, '2026-08-01': 70, '2026-09-01': 120, '2026-10-01': 50 }
  const base = {
    month: '2026-09-01', now: '2026-10-13T08:00:00Z', subjects, themes: new Map([['t1', 'Liner life']]), adviceTargets: new Map([['L1', 't1']]),
    levels: (_k: 'subject' | 'theme', _id: string, m: string) => K[m] ?? null, n: (m: string) => N[m] ?? null,
  }
  const move = (over: Record<string, unknown>) => ({
    id: 'm', kind: 'subject' as const, subject_id: 's1', registry_ids: null, lineage_id: null, title: 'Price page',
    declared_at: '2026-08-20', dated_on: null, status: 'active' as const, direction: 'up' as const, ...over,
  })

  it('reads two months before the move through the reading month, and bands the month before against the latest', () => {
    const [c] = moveCards({ ...base, moves: [move({})] })
    expect(c.points.map((p) => [p.month, p.role])).toEqual([['2026-06-01', 'before'], ['2026-07-01', 'before'], ['2026-08-01', 'move'], ['2026-09-01', 'after']])
    expect(c.compare?.before.month).toBe('2026-07-01')
    expect(c.compare?.after.month).toBe('2026-09-01')
    expect(c.compare?.verdict.state).toBe('moved')
    expect(c.compare?.verdict.value).toEqual({ k: 120, n: 600 })
    expect(c.compare?.verdict.baseline).toEqual({ k: 60, n: 600 })
    expect(c.openHref).toBe('/dashboard/market?subject=s1')
  })

  it('draws no month across a refused step, and a refused pair prints no earlier month', () => {
    const [c] = moveCards({ ...base, moves: [move({})], joined: (prev) => prev !== '2026-06-01' })
    expect(c.points[0].month).toBe('2026-07-01')
    const refused = (prevMonth: string, month: string): PairComparability => ({
      prevMonth, month, mode: 'refuse', row: null,
      reasons: [{ kind: 'searches', changeId: 'ch-1', share: 0.2, changedAt: '2026-08-12T00:00:00Z', surface: null }],
    })
    const [r] = moveCards({ ...base, moves: [move({})], pair: refused })
    expect(r.compare?.verdict.state).toBe('refused')
    expect(priorPrintable(r.compare?.verdict)).toBe(false)
  })

  it('compares the month before against the move’s own month when nothing is read after it', () => {
    const [c] = moveCards({ ...base, moves: [move({ declared_at: '2026-09-14' })] })
    expect(c.compare?.before.month).toBe('2026-08-01')
    expect(c.compare?.after.month).toBe('2026-09-01')
  })

  it('a move dated after the reading month draws the months before it and reads its month later', () => {
    const [c] = moveCards({ ...base, moves: [move({ declared_at: '2026-10-05' })] })
    expect(c.pending).toBe('2026-10-01')
    expect(c.points.map((p) => p.month)).toEqual(['2026-08-01', '2026-09-01'])
    expect(c.compare).toBeNull()
  })

  it('a subject not ready, several themes, and an advice move read on its leading theme', () => {
    const cards = moveCards({
      ...base,
      moves: [
        move({ id: 'a', subject_id: 's2' }),
        move({ id: 'b', kind: 'theme', subject_id: null, registry_ids: ['t1', 't2'] }),
        move({ id: 'c', kind: 'advice', subject_id: null, lineage_id: 'L1' }),
        move({ id: 'd', subject_id: 's3' }),
      ],
    })
    const by = new Map(cards.map((c) => [c.id, c]))
    // Ruling U6: an open check is "not measured yet", never "being re-described".
    expect(by.get('a')?.unread).toBe('not_measured')
    expect(MOVE_UNREAD.not_measured).not.toMatch(/re-described/)
    expect(by.get('d')?.unread).toBe('not_ready')
    expect(by.get('b')?.unread).toBe('several')
    expect(by.get('c')?.label).toBe('Liner life')
    expect(by.get('c')?.openHref).toBe(adviceHref('L1'))
  })

  it('a month still under way is "so far"', () => {
    const [c] = moveCards({ ...base, month: '2026-10-01', moves: [move({ declared_at: '2026-09-02' })] })
    expect(c.points.at(-1)).toMatchObject({ month: '2026-10-01', soFar: true })
  })

  it('active moves first, newest first', () => {
    const cards = moveCards({ ...base, moves: [move({ id: 'old', declared_at: '2026-07-02' }), move({ id: 'done', status: 'done', declared_at: '2026-09-01' }), move({ id: 'new', declared_at: '2026-09-01' })] })
    expect(cards.map((c) => c.id)).toEqual(['new', 'old', 'done'])
  })
})

describe('movedMove: the Dashboard tile’s move', () => {
  it('takes the move whose comparison cleared its band', () => {
    expect(movedMove(MOVE_CARDS)?.title).toBe('Price transparency page')
  })
  it('else the newest move with a comparison that may print, else none', () => {
    const quiet = MOVE_CARDS.map((c) => (c.compare ? { ...c, compare: { ...c.compare, verdict: { ...c.compare.verdict, state: 'no_clear_change' as const } } } : c))
    expect(movedMove(quiet)?.title).toBe('Running & Mobility Clinic campaign')
    expect(movedMove([])).toBeNull()
  })
})

describe('the words', () => {
  it('the bar’s counts', () => {
    expect(headerParts({ waiting: 1, dated: 2, plans: 0 }).map((p) => `${p.n} ${p.words}`)).toEqual(['1 piece of advice waiting', '2 moves dated', '0 plans checked'])
  })
  it('the streak and the decision', () => {
    expect(streakLabel({ dates: ['2026-08-01', '2026-08-08'], streak: 2, since: '2026-08-01', recent: [] })).toBe('updates in a row, since 1 Aug')
    expect(streakLabel({ dates: ['2026-08-01'], streak: 0, since: null, recent: [] })).toBe('update raised it')
    expect(streakLabel({ dates: ['2026-10-12'], streak: 1, since: '2026-10-12', recent: [] })).toBe('update, first raised 12 Oct')
    expect(decisionLine({ firstMade: '2026-07-20', status: 'new', statusLabel: 'New', decidedAt: null })).toBe('First suggested 20 Jul. Nobody has decided on it yet.')
    expect(decisionLine({ firstMade: '2026-07-20', status: 'dismissed', statusLabel: 'Dismissed', decidedAt: '2026-08-02T10:00:00Z' })).toBe('First suggested 20 Jul. Dismissed since 2 Aug.')
  })
  it('the largest stance, as a level', () => {
    expect(largestStance({ base: 20, backs: 11, doubts: 4, asks: 5 })).toEqual({ k: 11, n: 20, words: 'back it up' })
    expect(largestStance({ base: 0, backs: 0, doubts: 0, asks: 0 })).toBeNull()
    expect(largestStance(null)).toBeNull()
  })
  it('the plan’s lead claims: contradicted, then supported', () => {
    expect(leadClaims(PLAN).map((c) => c.verdict)).toEqual(['contradicts', 'contradicts', 'echoes'])
  })
  it('the advice record is every piece, in the ledger’s order', () => {
    const rows = movesRecordFixture().record.rows
    expect(rows).toHaveLength(4)
    expect(rows[0].current).toBe(true)
    expect(rows.find((r) => r.status === 'dismissed')?.decidedAt).toBe('2026-08-02T10:00:00.000Z')
    expect(recordRows([], 5)).toEqual([])
  })
  it('a blank stored title is named by its body\'s first clause, and by the page only where both are blank', () => {
    expect(adviceTitle('')).toBe(UNTITLED_ADVICE)
    expect(adviceTitle('  ')).toBe(UNTITLED_ADVICE)
    expect(adviceTitle(null)).toBe(UNTITLED_ADVICE)
    expect(adviceTitle('', '  ')).toBe(UNTITLED_ADVICE)
    expect(adviceTitle(' Help desk ')).toBe('Help desk')
    expect(adviceTitle(' Help desk ', 'Put a help desk on every reel.')).toBe('Help desk')
    expect(adviceTitle('', 'Put a help desk on every reel. Buyers ask there.')).toBe('Put a help desk on every reel')
  })

  it('names a blank-titled piece of advice by its body in the record and the conclusions\' chips', () => {
    const rows = movesRecordFixture().record.rows
    expect(rows.every((r) => r.title !== UNTITLED_ADVICE)).toBe(true)
    const views = conclusionViews(
      [{ id: 'm1', title: 'Access decides', evidence: { supporting_theme_ids: [] } }],
      [{ lineageId: 'L1', title: '', why: 'Create a guided access path, not a standalone price answer. It reads as a path.', basedOn: ['m1'] }],
      new Map(),
    )
    expect(views[0].advice[0].title).toBe('Create a guided access path, not a standalone price answer')
  })
  it('reads `?advice=`, and the old item, rec and ledger that stored links carry', () => {
    expect(adviceParam({ advice: 'L1', ledger: 'all' })).toBe('L1')
    expect(adviceParam({ ledger: 'all' })).toBe('all')
    expect(adviceParam({ item: 'L2' })).toBe('L2')
    expect(adviceParam({ rec: 'r3' })).toBe('r3')
    expect(adviceParam({ item: 'L2', rec: 'r3', ledger: 'all' })).toBe('L2')
    expect(adviceParam({ advice: ' ', horizon: 'last_3' })).toBe('')
  })
  it('a piece of advice opens in place on Your moves', () => {
    expect(adviceHref('L1')).toBe(`${MOVES_PATH}?advice=L1#advice-panel`)
  })
})

// Decision 3: a move's later month carries the reading month's label where it
// IS the reading month and that is not the current calendar month.
describe('compareMonths and the reading month\'s label', () => {
  const c = (after: string, soFar = false) => ({
    before: { month: '2026-07-01', role: 'before' as const, k: 1, n: 10, soFar: false },
    after: { month: after, role: 'after' as const, k: 2, n: 10, soFar },
    verdict: MOVE_CARDS.find((m) => m.compare)!.compare!.verdict,
  })
  const sep = { month: '2026-09-01', label: 'the last full month' }

  it('labels the later month where it is the reading month', () => {
    expect(compareMonths(c('2026-09-01'), '2026-08-01', sep)).toEqual({ before: 'July, the month before', after: 'September, the last full month' })
    expect(compareMonths(c('2026-09-01'), '2026-09-01', sep).after).toBe('September, the last full month and the month of the move')
  })

  it('names it alone where there is no label, or the month is not the reading month', () => {
    expect(compareMonths(c('2026-09-01'), '2026-08-01').after).toBe('September')
    expect(compareMonths(c('2026-09-01'), '2026-09-01', { month: '2026-09-01', label: null }).after).toBe('September, the month of the move')
    expect(compareMonths(c('2026-08-01'), '2026-07-01', sep).after).toBe('August')
    expect(compareMonths(c('2026-10-01', true), '2026-08-01', { month: '2026-10-01', label: null }).after).toBe('October so far')
  })
})

// The parity pass (13 Oct): the board's chart whatever the data, and the
// advice card's "Would move".
describe('moveAxis and axisLine: the board’s axis, the months not drawn and why', () => {
  it('a move dated after the reading month, one month read: August cut, September drawn, October to come', () => {
    const [c] = THIN_MOVE
    expect(c.points.map((p) => p.month)).toEqual(['2026-09-01'])
    // Cut by the refused step at the run's near edge, for the record's reason.
    expect(c.gaps).toEqual([{ month: '2026-08-01', why: 'cut', reason: 'tracking_change' }])
    const slots = moveAxis(c, '2026-09-01')
    expect(slots.map((s) => [s.month, s.why])).toEqual([['2026-08-01', 'cut'], ['2026-09-01', null], ['2026-10-01', 'pending']])
    expect(axisLine(slots)).toBe('August is left off the line: what we track changed inside this window. October reads once the month has been read.')
  })

  it('a dump from before `gaps` still draws its axis, and says only what it can', () => {
    const { gaps: _gaps, ...card } = THIN_MOVE[0]
    const slots = moveAxis(card, '2026-09-01')
    expect(slots.map((s) => s.why)).toEqual(['unknown', null, 'pending'])
    expect(axisLine(slots)).toBe('August is left off the line. October reads once the month has been read.')
  })

  it('a month with no reading says so, and a full line says nothing', () => {
    const slots = moveAxis({ day: '2026-08-14', points: [{ month: '2026-07-01', role: 'before', k: 1, n: 10, soFar: false }, { month: '2026-08-01', role: 'move', k: 2, n: 10, soFar: false }, { month: '2026-09-01', role: 'after', k: 3, n: 10, soFar: false }], unread: null, gaps: [{ month: '2026-06-01', why: 'unread' }] }, '2026-09-01')
    expect(slots.map((s) => s.month)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'])
    expect(axisLine(slots)).toBe('June has no reading.')
    expect(axisLine(slots.filter((s) => s.point))).toBeNull()
  })

  it('a move with no line keeps the axis, and its own sentence says why', () => {
    const socket = MOVE_CARDS.find((c) => c.unread === 'not_measured')!
    const slots = moveAxis(socket, '2026-09-01')
    expect(slots.map((s) => s.month)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'])
    expect(slots.every((s) => s.why === 'move')).toBe(true)
    expect(axisLine(slots)).toBeNull()
  })

  it('stops at the board’s nine months', () => {
    expect(moveAxis({ day: '2025-11-02', points: [], unread: 'nothing' }, '2026-09-01')).toHaveLength(9)
  })
})

describe('adviceAims: what a piece of advice would move', () => {
  const base = {
    targets: new Map([['L1', 't1'], ['L2', 't2'], ['L3', 't3']]),
    labels: new Map([['t1', 'Cost and affordability'], ['t2', 'Liner life']]),
    levels: (_k: 'theme', id: string) => (id === 't1' ? 19 : null),
    n: (m: string) => (m === '2026-09-01' ? 521 : null),
    month: '2026-09-01',
  }
  it('the conversation its evidence leads with, and its level in the reading month', () => {
    const aims = adviceAims({ ...base, lineages: ['L1', 'L2', 'L3', 'L4'] })
    expect(aims.get('L1')).toEqual({ label: 'Cost and affordability', month: '2026-09-01', level: { k: 19, n: 521 } })
    // Named, with no reading of it that month: the name alone.
    expect(aims.get('L2')).toEqual({ label: 'Liner life', month: '2026-09-01', level: null })
    // A theme with no label, or no theme at all: nothing it would move.
    expect(aims.get('L3')).toBeNull()
    expect(aims.get('L4')).toBeNull()
  })
})
