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

  it('prints no rank and says so', () => {
    const text = renderText(overviewRivals.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('no rank is printed')
    expect(text).not.toMatch(/\b(1st|2nd|3rd|ranked|leader|leads)\b/i)
  })

  it('says "not observed" for a brand the panel holds nothing for, never 0%', () => {
    const text = renderText(overviewRivals.render(refusedFixture(), 'app', ctx))
    expect(text).toContain('not observed')
    expect(text).not.toContain('0% 0 of')
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

  it('declares one attention figure per observed brand', () => {
    const { figures, verdicts } = blockAnswers(overviewRivals, overviewFixture())
    expect(Object.keys(figures).sort()).toEqual(['dual_mention_videos', 'rival_client_attention', 'rival_competitor_freitag_attention'])
    expect(verdicts).toHaveLength(2)
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
