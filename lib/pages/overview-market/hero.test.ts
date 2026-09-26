import { describe, it, expect } from 'vitest'

import { buildThemeBoard, LEAD_MAX_MAKER_SHARE, type MarketTheme } from './board'
import {
  figureText,
  heroLead,
  heroView,
  leadNewSearch,
  THEME_N,
  THEME_PREV_N,
  themeToken,
  type HeroPart,
} from './hero'
import type { FigureTable } from '../../reading/verdicts'
import { AUGUST, AUGUST_CATEGORY_N, SEPTEMBER, SEPTEMBER_CATEGORY_N, septemberThemes } from '../../test/market-fixture'

const board = (themes: MarketTheme[] = septemberThemes(), segments: 'measured' | 'unknown' | 'no_rule' = 'measured') =>
  buildThemeBoard(themes, SEPTEMBER_CATEGORY_N, SEPTEMBER, segments, { month: AUGUST, n: AUGUST_CATEGORY_N })

/** The parts as a reader sees them, figures substituted. */
function text(parts: HeroPart[] | null, figures: FigureTable): string {
  return (parts ?? [])
    .map((p) => (p.t === 'figure' ? figureText(figures[p.key]) : p.t === 'label' ? `“${p.s}”` : p.s))
    .join('')
}

// Staging's eight subjects' calibration (0.857, 1, 0.917, 0.333 on 33 labels;
// Community & purpose unchecked), in the three states WP1.1 reads them as.
const SUBJECTS = [
  { id: 'looks', name: 'Looks & style', k: 104, n: 626, calibration: 'ready' as const },
  { id: 'comfort', name: 'Comfort', k: 38, n: 626, calibration: 'ready' as const },
  { id: 'repair', name: 'Repair & warranty', k: 33, n: 626, calibration: 'failed' as const },
  { id: 'community', name: 'Community & purpose', k: 8, n: 626, calibration: 'provisional' as const },
]

describe('the hero lead (plan §4.2 heroLead)', () => {
  it('on Sealand’s September names the three biggest rows and leads with airline sizes, a quarter makers or fewer', () => {
    const lead = heroLead(board(), SUBJECTS, new Set())
    expect(lead.kind).toBe('themes')
    if (lead.kind !== 'themes') return
    expect(lead.top.map((t) => t.label)).toEqual(['Ready to buy handmade bags', 'Love for stylish bag design', 'Confusion over airline bag sizes'])
    expect(lead.lead?.label).toBe('Confusion over airline bag sizes')
    expect(lead.lead?.makerShare).toBeLessThanOrEqual(LEAD_MAX_MAKER_SHARE)
  })

  it('never leads with "Ready to buy handmade bags", about a third makers (the staging twin measured 36%)', () => {
    const lead = heroLead(board(), [], new Set())
    expect(lead.kind === 'themes' && lead.lead?.registryId).not.toBe('th-ready-to-buy')
    expect(lead.kind === 'themes' && lead.lead?.makerShare).toBeLessThanOrEqual(0.25)
  })

  it('skips an excluded theme, a stripped label and an identity this run minted', () => {
    const themes = septemberThemes().map((t) => (t.registryId === 'th-shipping' ? { ...t, identityNewThisRun: true } : t))
    const excluded = heroLead(board(themes), [], new Set(['th-airline']))
    // Airline sizes is excluded, shipping is new this run, so the next row a
    // quarter makers or fewer leads: packing tips at 21% (brand comparisons and
    // featured products are not measured, so neither may lead).
    expect(excluded.kind === 'themes' && excluded.lead?.label).toBe('Praise for practical packing tips')
    const stripped = septemberThemes().map((t) => (t.registryId === 'th-airline' ? { ...t, labelStripped: true } : t))
    expect(heroLead(board(stripped), [], new Set()).kind === 'themes' && heroLead(board(stripped), [], new Set())).toMatchObject({ lead: { registryId: 'th-shipping' } })
  })

  it('before MF1 names the biggest themes and leads with none, so no voice prints', () => {
    const lead = heroLead(board(septemberThemes({ measured: false }), 'unknown'), SUBJECTS, new Set())
    expect(lead).toMatchObject({ kind: 'themes', lead: null })
  })

  it('for a tenant with no maker rule (Össur) leads on the label check alone', () => {
    const lead = heroLead(board(septemberThemes({ measured: false }), 'no_rule'), [], new Set())
    expect(lead.kind === 'themes' && lead.lead?.label).toBe('Admiration for upcycled bag creativity')
  })

  it('with no readable theme leads with a READY subject, and never a provisional or failed one', () => {
    const empty = board([])
    expect(heroLead(empty, SUBJECTS, new Set())).toEqual({ kind: 'subject', subjectId: 'looks', label: 'Looks & style', k: 104, n: 626 })
    expect(heroLead(empty, SUBJECTS.map((s) => ({ ...s, calibration: 'provisional' as const })), new Set())).toEqual({ kind: 'size' })
    expect(heroLead(empty, [SUBJECTS[2]], new Set())).toEqual({ kind: 'size' })
  })

  it('every subject provisional and no theme readable: the size alone (WP1.5’s test, kept)', () => {
    expect(heroLead(board([]), SUBJECTS.map((s) => ({ ...s, calibration: 'provisional' as const })), new Set())).toEqual({ kind: 'size' })
  })
})

describe('the hero’s words', () => {
  it('print §2.2’s clause, one denominator in it, and the makers sentence', () => {
    const b = board()
    const lead = heroLead(b, [], new Set())
    const view = heroView(lead, b, SEPTEMBER)
    expect(text(view.parts, view.figures)).toBe(
      'Its three biggest conversations not led by makers, of the 626 category videos: “Ready to buy handmade bags” 69, “Love for stylish bag design” 60 and “Confusion over airline bag sizes” 21. About a third of each of the first two sits under makers’ own posts.',
    )
    expect(text(view.prev, view.figures)).toBe('August: 7%, 7% and 3% of 351')
  })

  it('declares each figure once, on the board’s own tokens', () => {
    const b = board()
    const view = heroView(heroLead(b, [], new Set()), b, SEPTEMBER)
    expect(view.figures[THEME_N]).toMatchObject({ value: 626, unit: 'videos' })
    expect(view.figures[THEME_PREV_N]).toMatchObject({ value: 351 })
    expect(view.figures[themeToken('th-ready-to-buy', 'k')]).toMatchObject({ value: 69, unit: 'videos' })
    expect(view.figures[themeToken('th-ready-to-buy', 'prev')]).toMatchObject({ value: 7, unit: 'pct' })
    expect(view.figures[themeToken('th-airline', 'prev')]).toMatchObject({ value: 3, unit: 'pct' })
  })

  it('say "Its biggest conversations" where no maker rule applies, and claim nothing about makers', () => {
    const b = board(septemberThemes({ measured: false }), 'no_rule')
    const view = heroView(heroLead(b, [], new Set()), b, SEPTEMBER)
    const said = text(view.parts, view.figures)
    expect(said.startsWith('Its biggest conversations, of the 626 category videos:')).toBe(true)
    expect(said).not.toContain('makers')
    expect(said.toLowerCase()).not.toContain('buyer')
  })

  it('print the lead’s new-search count only at a third or more of its videos', () => {
    const lead = { ...septemberThemes()[5], provenance: { fromNewSearches: 7, of: 21 } }
    expect(leadNewSearch(lead)).toEqual({ fromNewSearches: 7, of: 21 })
    expect(leadNewSearch({ ...lead, provenance: { fromNewSearches: 6, of: 21 } })).toBeNull()
    expect(leadNewSearch({ ...lead, provenance: null })).toBeNull()
    const themes = septemberThemes().map((t) => (t.registryId === 'th-airline' ? lead : t))
    const b = board(themes)
    const view = heroView(heroLead(b, [], new Set()), b, SEPTEMBER)
    expect(text(view.newSearch, view.figures)).toBe('7 of its 21 videos came from searches we added in September')
  })

  it('under 100 videos in the previous month prints counts, never a share', () => {
    const b = buildThemeBoard(septemberThemes(), SEPTEMBER_CATEGORY_N, SEPTEMBER, 'measured', { month: '2026-07-01', n: 35 })
    const themes = b.rows.map((t) => ({ ...t, prev: { month: '2026-07-01', k: 2, n: 35 } }))
    const b2 = { ...b, rows: themes }
    const view = heroView(heroLead(b2, [], new Set()), b2, SEPTEMBER)
    expect(text(view.prev, view.figures)).toBe('July: 2, 2 and 2 of 35')
  })

  it('a subject lead reads "the subject we read most", on the market’s videos', () => {
    const view = heroView({ kind: 'subject', subjectId: 'looks', label: 'Looks & style', k: 104, n: 655 }, null, SEPTEMBER)
    expect(text(view.parts, view.figures)).toBe('The subject we read most, of the 655 videos in your market: “Looks & style” 104.')
  })

  it('the size alone adds nothing', () => {
    expect(heroView({ kind: 'size' }, board(), SEPTEMBER)).toEqual({ parts: [], prev: null, newSearch: null, figures: {} })
  })
})
