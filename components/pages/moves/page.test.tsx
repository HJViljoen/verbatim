import { describe, expect, it } from 'vitest'

import { assertCopyContract } from '@/lib/test/copy-contract'
import { markupText, render } from '@/lib/test/render'
import type { MarketSurfaceData } from '@/lib/pages/market-surface'
import { marketFixture, sealandMovesFixture } from '@/components/pages/market-surface/fixture'
import { MovesPage } from '.'
import { MovesHeader } from './header'
import { MovesWorthConsidering, consideringRows } from './considering'
import { bansBroken, consideringFixture, statementsFixture } from './fixture'
import { priorityLabel, typeLabel } from './words'

// Your moves, the page (Page-Your-moves.dc.html): the head, the artboard's
// order, the advice rows, and the blocks the page review cut.

function sealandPage(over: Partial<MarketSurfaceData> = {}): MarketSurfaceData {
  const base = sealandMovesFixture()
  return {
    ...base,
    plans: [],
    moves: { ...base.moves, rows: [] },
    advice: { ...base.advice, shortlist: { rows: consideringFixture(), earlier: 0 } },
    ...over,
  }
}

describe('the head', () => {
  it('draws the title and the two buttons the artboard draws', () => {
    const data = sealandPage()
    const m = render(<MovesHeader dating={data.moves.dating} />)
    expect(m).toMatch(/<h1[^>]*text-\[26px\][^>]*>Your moves<\/h1>/)
    expect(m).toMatch(/<a[^>]*href="\/dashboard\/agent"[^>]*>[\s\S]*?Check a plan<\/a>/)
    expect(m).toMatch(/<button[^>]*border-\[#E4E2DC\][^>]*>[\s\S]*?Date a move<\/button>/)
    // No month line, no "as at", no Export.
    expect(markupText(m)).toBe('Your moves Check a plan Date a move')
  })

  it('offers no "Date a move" where there is nothing to date a move on', () => {
    expect(markupText(render(<MovesHeader dating={null} />))).toBe('Your moves Check a plan')
  })
})

describe('Moves worth considering', () => {
  const rows = consideringFixture()
  const m = render(<MovesWorthConsidering rows={rows} />)
  const t = markupText(m)

  it('draws the five pieces of advice with their priority, type, argument and two answers', () => {
    expect(t).toContain('Moves worth considering Accept one to date it as a move')
    expect(t).toContain('High priority Customer experience Install a proof-first product standard')
    expect(t).toContain('Medium priority Product Run a carry-comfort redesign')
    expect(t).toContain('Medium priority Positioning Pair Sealand’s purpose story')
    expect(t).toContain('Low priority Partnerships Turn community events')
    expect(t).toContain('Low priority Content Brief utility-led creators')
    expect(t).toContain('Comfort is part of perceived quality, not an extra. The evidence points to specific friction points')
    expect(t.match(/Accept/g)!.length).toBe(1 + 5)
    expect(t.match(/Not for us/g)).toHaveLength(5)
    expect(m).toMatch(/bg-orange font-semibold text-brand-foreground[^"]*"[^>]*>High priority/)
  })

  it('draws only undecided advice, at most five, and nothing at all without any', () => {
    const decided = rows.map((r, i) => (i === 0 ? { ...r, status: 'acted_on' as const } : i === 1 ? { ...r, status: 'dismissed' as const } : r))
    expect(consideringRows(decided).map((r) => r.lineageId)).toEqual(['L-3', 'L-4', 'L-5'])
    expect(consideringRows([...rows, ...rows.map((r) => ({ ...r, lineageId: `${r.lineageId}b` }))])).toHaveLength(5)
    expect(render(<MovesWorthConsidering rows={[]} />)).toBe('')
  })

  it('labels the stored type and priority as the artboard does', () => {
    expect(typeLabel('positioning_messaging')).toBe('Positioning')
    expect(typeLabel('content_communication')).toBe('Content')
    expect(typeLabel('local_partnerships')).toBe('Local partnerships')
    expect(typeLabel('other')).toBeNull()
    expect(priorityLabel('HIGH')).toBe('High priority')
    expect(priorityLabel(null)).toBeNull()
  })

  it('keeps the copy contract and the design bans', () => {
    assertCopyContract(m)
    expect(bansBroken(m)).toEqual([])
  })
})

describe('the page', () => {
  it('runs in the artboard order and draws no cut block', () => {
    const m = render(<MovesPage market={sealandPage()} statements={statementsFixture()} />)
    const t = markupText(m)
    const at = (s: string) => t.indexOf(s)
    expect(at('Your moves')).toBe(0)
    expect(at('Your statements')).toBeGreaterThan(at('Date a move'))
    expect(at('Moves worth considering')).toBeGreaterThan(at('Your statements'))
    for (const cut of ['In one line', 'What we concluded', 'How a move is made', 'What you published', 'Questions to answer', 'What you say, and what your market says back', 'Plans re-checked']) {
      expect(t).not.toContain(cut)
    }
    assertCopyContract(m)
    expect(bansBroken(m)).toEqual([])
  })

  it('draws Your moves and Plans re-checked only once there is a move and a plan', () => {
    const full = marketFixture({ advice: { ...marketFixture().advice, shortlist: { rows: consideringFixture(), earlier: 0 } } })
    expect(full.moves.rows.length).toBeGreaterThan(0)
    expect(full.plans.length).toBeGreaterThan(0)
    const m = render(<MovesPage market={full} statements={null} />)
    const withBoth = markupText(m)
    expect(withBoth.indexOf('Plans re-checked')).toBeGreaterThan(withBoth.indexOf('Moves worth considering'))
    expect(m.match(/rounded-\[16px\] bg-white/g)!.length).toBe(3)
    const none = render(<MovesPage market={sealandPage()} statements={null} />)
    expect(none.match(/rounded-\[16px\] bg-white/g)).toHaveLength(1)
  })

  it('still draws the head and the statements with no market read at all', () => {
    const t = markupText(render(<MovesPage market={null} statements={statementsFixture()} />))
    expect(t.startsWith('Your moves Check a plan Your statements')).toBe(true)
    expect(t).not.toContain('Moves worth considering')
  })
})
