import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { brandLabel, caveatLine, overviewRivals, rowInk } from './rivals'
import { overviewFixture, refusedFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

describe('OV4 · rivals', () => {

  // WHICH ROW IS YOURS IS THE FIRST THING A READER LOOKS FOR (Block D wave 3,
  // M15). "(you)" at the end of a label was the only marker, and on a tenant
  // whose own name sorts between two rivals that is one row of six with nothing
  // to catch the eye. The artboard draws a 6px dot in the entity's own ink
  // before every name and sets the client's at 600 on the inner ground.
  it('marks each row with its entity ink, and the client row with weight', () => {
    const data = overviewFixture()
    const markup = render(overviewRivals.render(data, 'app', ctx))
    expect(markup).toContain('var(--you)')
    expect(markup).toContain('var(--comp)')
    expect(markup).toContain('var(--cat)')
    expect(markup).toContain('bg-inner')
    // The ink is by ROLE first, then by place among the rivals.
    const rows = data.rivals.rows
    const client = rows.find((r) => r.role === 'client')!
    expect(rowInk(rows, client)).toBe('var(--you)')
    const rivals = rows.filter((r) => r.role === 'rival')
    expect(rowInk(rows, rivals[0])).toBe('var(--comp)')
    if (rivals[1]) expect(rowInk(rows, rivals[1])).not.toBe('var(--comp)')
    // And the dot never speaks: the name beside it is what the row is read by.
    expect(markup).toContain('aria-hidden')
  })
  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [overviewFixture(), refusedFixture()]) {
      for (const mode of MODES) {
        assertCopyContract(render(overviewRivals.render(data, mode, ctx)))
      }
    }
  })

  it('prints both shares side by side, each with its own denominator', () => {
    const text = renderText(overviewRivals.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('15% 6,200 of 41,200')
    expect(text).toContain('15% 150 of 1,000')
  })

  // OV4 READS THE PANEL, CO2 READS THE CORPUS, AND THE META LINE SAYS WHICH.
  // The line named CO2's denominator for three work packages; it is latent only
  // while every cell reads "not recorded yet".
  it('names the panel as its denominator, never the corpus', () => {
    const text = renderText(overviewRivals.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('both shares of a frozen panel of accounts')
    expect(text).not.toContain('what our search plan found')
  })

  it('prints no rank and says so', () => {
    const text = renderText(overviewRivals.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('no rank is printed')
    expect(text).not.toMatch(/\b(1st|2nd|3rd|ranked|leader|leads)\b/i)
  })

  it('says "not observed" for a brand the panel holds nothing for, never 0%', () => {
    const data = overviewFixture()
    const rows = data.rivals.rows.map((r) => ({ ...r, observed: false, attention: null, content: null }))
    const text = renderText(overviewRivals.render({ ...data, rivals: { ...data.rivals, rows } }, 'app', ctx))
    expect(text).toContain('not observed')
    expect(text).not.toContain('0% 0 of')
  })

  // A MISSING TABLE IS NOT A MEASUREMENT. `recorded: false` means
  // month_audience_stats is not applied for this workspace — nobody looked —
  // and the cells said "not observed" on both live tenants while Competitive,
  // off a table that IS applied, printed a rival at 9.4% of the same month.
  it('says "not recorded yet" — never "not observed" — while the panel reading does not exist', () => {
    for (const mode of MODES) {
      const text = renderText(overviewRivals.render(refusedFixture(), mode, ctx))
      expect(text).toContain('not recorded yet')
      expect(text).not.toContain('not observed')
    }
  })

  it('says their own posts are not tracked rather than implying they said nothing', () => {
    const text = renderText(overviewRivals.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('— not tracked')
  })

  it('carries the precedence caveat with its count', () => {
    const text = renderText(overviewRivals.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('counts in your audience only')
    expect(text).toContain('41 did this month')
  })

  it('keeps a retired rival’s row and dates the retirement', () => {
    const data = overviewFixture()
    const rows = data.rivals.rows.map((r, i) => (i === 0 ? { ...r, retiredAt: '2026-09-09' } : r))
    const text = renderText(overviewRivals.render({ ...data, rivals: { ...data.rivals, rows } }, 'app', ctx))
    expect(text).toContain('tracked until 9 Sep')
  })

  it('declares one attention figure per observed brand, and every verdict a row drew', () => {
    const { figures, verdicts } = blockAnswers(overviewRivals, overviewFixture())
    expect(Object.keys(figures).sort()).toEqual([
      'dual_mention_videos', 'rival_client_attention', 'rival_competitor_freitag_attention',
      // The category is a row of this table too — `buildStandings` always emits
      // it, and OV3's attention card is that row's verdict handed across.
      'rival_industry_other_attention',
    ])
    // Five: Freitag's two — its share of the panel's comments and its share of
    // the panel's videos, which are two readings of one object — the client's
    // one, and the category's two. A row's verdicts are what the record keeps,
    // and each says what it was read over.
    expect(verdicts).toHaveLength(5)
    expect(verdicts.map((v) => v.countedOver?.measure)).toEqual(['comments', 'videos', 'comments', 'comments', 'videos'])
  })

  it('draws the category’s attention on the same denominator as every rival’s', () => {
    // One `buildStandings` call gives every row the SAME panel total — the k's
    // differ, the n does not. A fixture stating two panel totals on one page is
    // a page a port can bind two incompatible shares off.
    const rows = overviewFixture().rivals.rows
    expect(new Set(rows.map((r) => r.attention?.n))).toEqual(new Set([41200]))
    expect(new Set(rows.map((r) => r.attentionVerdict?.value.n))).toEqual(new Set([41200]))
  })

  it('is email-safe', () => {
    const markup = render(overviewRivals.render(overviewFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })

  it('says why a rival\u2019s own posts are not read, and says nothing of the kind about you or the category', () => {
    const markup = render(overviewRivals.render(overviewFixture(), 'app', ctx))
    // One rival row, one client row, in the fixture.
    expect((markup.match(/not readable yet/g) ?? []).length).toBe(1)
    expect(markup).toContain('their own posts are not readable yet · Settings › Readiness')
  })
})

// A BRIEF'S PRINT ARM IS READ BY SOMEBODY OUTSIDE THE WORKSPACE (WP19): the
// PDF and the /r/<token> share page. The tenant's form of the absence points
// at the page where the readiness of this is tracked — which such a reader has
// no way to open — and "Open Competitive →" resolves, for them, to a login
// wall. (The clause said "· Verbatim engineering" until the fix pass: a
// readiness OWNER, dangling in the middle of a client's rivals table with
// nothing saying where that owner could be seen. Design review nit 25.)
describe('OV4 · rivals, read from outside the workspace', () => {
  it('names the absence without pointing a stranger at a page they cannot open', () => {
    const print = renderText(overviewRivals.render(overviewFixture(), 'print', ctx))
    const app = renderText(overviewRivals.render(overviewFixture(), 'app', ctx))
    expect(app).toContain('their own posts are not readable yet')
    expect(app).toContain('Settings › Readiness')
    expect(print).toContain('their own posts are not readable yet')
    expect(print).not.toContain('Settings')
    expect(print).not.toContain('Verbatim engineering')
  })

  it('draws no in-app affordance on paper', () => {
    expect(render(overviewRivals.render(overviewFixture(), 'print', ctx))).not.toContain('Open Competitive')
    expect(render(overviewRivals.render(overviewFixture(), 'app', ctx))).toContain('Open Competitive')
  })
})

// ---- Block D wave 2 · the artboard's §4 ------------------------------------

describe('OV4, ported to the artboard', () => {
  it('marks your own row, so a reader can find it', () => {
    // `main.rivals.col.brand`. On a tenant whose name sorts between two rivals
    // there was nothing at all marking which row was theirs.
    const text = renderText(overviewRivals.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('Sealand (you)')
    expect(text).toContain('The category')
    const rows = overviewFixture().rivals.rows
    expect(brandLabel(rows.find((r) => r.role === 'rival')!)).toBe('Freitag')
  })

  it('stacks every share over its two counts, never the percentage alone', () => {
    // D10: the mock prints "39%" with no denominator anywhere, which is the
    // score this product does not show.
    const markup = render(overviewRivals.render(overviewFixture(), 'app', ctx))
    const text = renderText(overviewRivals.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('data-copy="level"')
    expect(text).toContain('6,200 of 41,200')
  })

  it('puts the dual-mention caveat in the footer note, with its count only where there is one', () => {
    const r = overviewFixture().rivals
    expect(caveatLine(r)).toBe(`${r.caveat} 41 did this month.`)
    expect(caveatLine({ ...r, dualMention: 0 })).toBe(r.caveat)
    expect(caveatLine({ ...r, dualMention: null })).toBe(r.caveat)
    const markup = render(overviewRivals.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('font-normal text-muted-foreground">')
  })
})
