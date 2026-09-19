import { describe, expect, it } from 'vitest'
import { CountBadge, MovementBadge, MOVEMENT_WORDS } from './delta-badge'
import { Delta, favourability } from './charts/stat'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import type { Verdict, VerdictState } from '@/lib/reading/verdicts'

const verdict = (state: VerdictState, extra: Partial<Verdict> = {}): Verdict => ({
  objectKind: 'theme',
  objectId: 'r1',
  objectLabel: 'Durability',
  audience: 'client',
  window: { kind: 'month', from: '2026-08-01', to: '2026-09-01' },
  value: { k: 26, n: 84 },
  changePts: null,
  bandPts: null,
  state,
  flags: [],
  ...extra,
})

describe('MovementBadge', () => {
  it('arrows and colours a movement that cleared its band', () => {
    const markup = render(<MovementBadge verdict={verdict('moved', { changePts: 3.2, bandPts: 2.4 })} unit="pts" />)
    expect(markup).toContain('▲')
    expect(markup).toContain('text-positive')
    expect(markup).toContain('moved beyond the 2.4 pt margin')
  })

  it('points the arrow down and colours it for a fall', () => {
    const markup = render(<MovementBadge verdict={verdict('moved', { changePts: -3.2, bandPts: 2.4 })} unit="pts" />)
    expect(markup).toContain('▼')
    expect(markup).toContain('text-negative')
  })

  it('never arrows and never colours a non-answer', () => {
    for (const state of ['no_clear_change', 'too_little_data', 'baseline_forming', 'refused'] as const) {
      const markup = render(<MovementBadge verdict={verdict(state)} />)
      expect(markup).not.toContain('▲')
      expect(markup).not.toContain('▼')
      expect(markup).not.toContain('text-positive')
      expect(markup).not.toContain('text-negative')
      expect(markup).toContain('font-medium')
    }
  })

  it('has exactly one wording per state, and no two states share one', () => {
    // MOVEMENT_WORDS is typed `Record<Exclude<VerdictState,'moved'>|'unchanged'>`,
    // so tsc is what makes this list total; the test checks it is a BIJECTION
    // and that the badge actually prints each entry.
    const words = Object.values(MOVEMENT_WORDS)
    expect(new Set(words).size).toBe(words.length)
    for (const state of Object.keys(MOVEMENT_WORDS) as (keyof typeof MOVEMENT_WORDS)[]) {
      if (state === 'unchanged') continue
      expect(renderText(<MovementBadge verdict={verdict(state)} />)).toBe(MOVEMENT_WORDS[state])
    }
  })

  it('says WHY a comparison was refused, rather than only that it was', () => {
    const markup = render(<MovementBadge verdict={verdict('refused', { refusedReason: 'rename' })} />)
    expect(markup).toContain('comparison refused')
    expect(markup).toContain('two names for one rival')
  })

  it("still takes the band's own three-state DeltaVerdict", () => {
    // THE BAND IS PRINTED, NOT HOVERED: a `title` is invisible in print and in
    // email, and this product never prints a change without the band it cleared.
    expect(renderText(<MovementBadge verdict={{ state: 'moved', change: 4.1, band: 2 }} unit="pts" />)).toBe('▲ 4.1 pts · band 2')
    expect(renderText(<MovementBadge verdict={{ state: 'moved', changePts: 4.1, bandPts: null } as never} unit="pts" />)).toBe('▲ 4.1 pts')
    expect(renderText(<MovementBadge verdict={{ state: 'no_clear_change', change: 0.4, band: 2 }} />)).toBe('no clear change')
    // P0 item 6 / mock-gap §6 D11: the thin-reading word is "too few to
    // compare" — the phrase GLOSSARY.change, the agent, the quarterly and the
    // overview note already used. Asserted against the table, so the day it
    // moves again it moves in one place.
    expect(renderText(<MovementBadge verdict={{ state: 'too_little_data', change: 0, band: 2 }} />)).toBe(MOVEMENT_WORDS.too_little_data)
    expect(MOVEMENT_WORDS.too_little_data).toBe('too few to compare')
  })

  it('lets a non-answer WRAP rather than paint over the column beside it (SH2)', () => {
    // "comparison refused" needs about 117px; the quarterly standings' Change
    // track is about 100. `whitespace-nowrap` made that an overprint rather
    // than a second line — "comparison refuseCon" over "Comments per video".
    const markup = render(<MovementBadge verdict={verdict('refused', { refusedReason: 'rename' })} />)
    expect(markup).not.toContain('whitespace-nowrap')
    // The magnitude still may not break: the arrow and its number stay one run.
    const moved = render(<MovementBadge verdict={verdict('moved', { changePts: 3.2, bandPts: 2.4 })} unit="pts" />)
    expect(moved).toContain('whitespace-nowrap')
  })

  it('shows no comparison at all when there is none', () => {
    expect(MovementBadge({ verdict: null })).toBeNull()
    expect(MovementBadge({ verdict: undefined })).toBeNull()
  })

  it('prints no direction word — a badge carries a magnitude, not a claim about a run', () => {
    const moved = verdict('moved', { changePts: 3.2, bandPts: 2.4, direction: 'growing' })
    const markup = render(<span data-copy="figure">{MovementBadge({ verdict: moved, unit: 'pts' })}</span>)
    assertCopyContract(markup)
    expect(renderText(markup)).not.toContain('growing')
  })
})

describe('CountBadge', () => {
  it('arrows a count that changed — there is no band to clear', () => {
    expect(renderText(<CountBadge delta={118} />)).toBe('▲ 118')
    expect(renderText(<CountBadge delta={-6} unit="themes" />)).toBe('▼ 6 themes')
  })

  it('says "unchanged" for an exact zero, muted and unarrowed', () => {
    const markup = render(<CountBadge delta={0} />)
    expect(markup).toContain(MOVEMENT_WORDS.unchanged)
    expect(markup).toContain('text-muted-foreground')
    expect(markup).not.toContain('▲')
  })

  it('renders nothing before there is a previous update', () => {
    expect(CountBadge({ delta: null })).toBeNull()
  })

  it('uses the same wording table as the verdict arm', () => {
    expect(renderText(<CountBadge delta={0} />)).toBe(MOVEMENT_WORDS.unchanged)
  })
})

describe('favourability without its epsilon', () => {
  it('calls exactly zero flat, and nothing else', () => {
    expect(favourability(0, 'up')).toBeNull()
    expect(favourability(0.3, 'up')).toBe(true)
    expect(favourability(0.01, 'up')).toBe(true)
    expect(favourability(-0.01, 'up')).toBe(false)
  })

  it('is null for a direction-neutral figure whatever it did', () => {
    expect(favourability(9, 'neutral')).toBeNull()
  })

  it('reads a fall as favourable where down is good', () => {
    expect(favourability(-4, 'down')).toBe(true)
    expect(favourability(4, 'down')).toBe(false)
  })

  it('colours the value Delta PRINTS, so a 0.3-count delta shown as ±0 is grey', () => {
    const markup = render(<Delta value={0.3} good="up" />)
    expect(markup).toContain('±0')
    expect(markup).toContain('text-muted-foreground')
    expect(markup).not.toContain('text-positive')
  })

  it('colours a 0.06-point delta that prints as +0.1', () => {
    const markup = render(<Delta value={0.06} unit="pt" good="up" />)
    expect(markup).toContain('+0.1')
    expect(markup).toContain('text-positive')
  })
})
