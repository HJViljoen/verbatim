import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { overviewRivals } from './rivals'
import { overviewFixture, refusedFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

describe('OV4 · rivals', () => {
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
    expect(Object.keys(figures).sort()).toEqual(['dual_mention_videos', 'rival_client_attention', 'rival_competitor_freitag_attention'])
    // Three: Freitag's two — its share of the panel's comments and its share of
    // the panel's videos, which are two readings of one object — and the
    // client's one. A row's verdicts are what the record keeps, and each says
    // what it was read over.
    expect(verdicts).toHaveLength(3)
    expect(verdicts.map((v) => v.countedOver?.measure)).toEqual(['comments', 'videos', 'comments'])
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
    expect(markup).toContain('their own posts are not readable yet · Verbatim engineering')
  })
})

// A BRIEF'S PRINT ARM IS READ BY SOMEBODY OUTSIDE THE WORKSPACE (WP19): the
// PDF and the /r/<token> share page. "Verbatim engineering" is a readiness
// owner, which is right where a reader can open Settings › Readiness and an
// internal label where they cannot; and "Open Competitive →" resolves, for
// such a reader, to a login wall.
describe('OV4 · rivals, read from outside the workspace', () => {
  it('names the absence without naming our own owner', () => {
    const print = renderText(overviewRivals.render(overviewFixture(), 'print', ctx))
    const app = renderText(overviewRivals.render(overviewFixture(), 'app', ctx))
    expect(app).toContain('their own posts are not readable yet')
    expect(app).toContain('Verbatim engineering')
    expect(print).toContain('their own posts are not readable yet')
    expect(print).not.toContain('Verbatim engineering')
  })

  it('draws no in-app affordance on paper', () => {
    expect(render(overviewRivals.render(overviewFixture(), 'print', ctx))).not.toContain('Open Competitive')
    expect(render(overviewRivals.render(overviewFixture(), 'app', ctx))).toContain('Open Competitive')
  })
})
