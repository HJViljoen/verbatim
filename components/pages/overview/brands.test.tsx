import { describe, it, expect } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { emptyBrandsRead, shippedBrandsRead, stagingBrandsRead } from '@/lib/test/brands-fixture'
import type { OverviewData } from '@/lib/pages/overview'
import { brandAxis, overviewRivals } from './rivals'
import { marketFrontFixture, ossurFrontFixture } from './fixture'

// "Brands in your market" in deploy 3's form (WP2.6; the approved preview's
// Main board): the name line first, then each brand counted in every video it
// comes up in, without any video our rival searches found (one base for every
// brand, the 27 Sep ruling) and in all. Staging's brands_v1 plan of 27 Sep
// (lib/test/brands-fixture.ts).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const read = (node: Parameters<typeof renderText>[0]): string =>
  renderText(node).replace(/\s+([,.)”’:])/g, '$1').replace(/([“(])\s+/g, '$1')
const withBrands = (brands: OverviewData['brands']): OverviewData => ({ ...marketFrontFixture(), brands })

describe('Brands in your market (WP2.6)', () => {
  it('prints the name line first, then each measured brand’s two counts, in every mode', () => {
    for (const mode of MODES) {
      const t = read(overviewRivals.render(withBrands(stagingBrandsRead()), mode, ctx))
      expect(t, mode).toContain('In September your name came up in none of your market’s 654 videos. The 8 videos that name you are your own posts.')
      expect(t.indexOf('your name came up'), mode).toBeLessThan(t.indexOf('Patagonia'))
      expect(t, mode).toMatch(/Patagonia\s*13\s*45/)
      expect(t, mode).toMatch(/The North Face\s*6\s*36/)
      expect(t, mode).toMatch(/Cotopaxi\s*3\s*28/)
      // Each count's head carries its base: the headline count's one base,
      // and the market's.
      expect(t, mode).toMatch(/Without any video our rival searches found\s*(·\s*)?of 516/)
      expect(t, mode).toMatch(/In all\s*(·\s*)?of 654/)
      assertCopyContract(render(overviewRivals.render(withBrands(stagingBrandsRead()), mode, ctx)))
    }
  })

  it('prints "not counted yet" for a brand nobody measured, never 0 and never its count', () => {
    for (const mode of MODES) {
      const t = read(overviewRivals.render(withBrands(stagingBrandsRead()), mode, ctx))
      for (const brand of ['Freitag', 'Rareform', 'Freedom of Movement', 'Old School']) {
        expect(t, mode).toMatch(new RegExp(`${brand}\\s*not counted yet`))
      }
      // Freitag's planned 6 and 1 are not printed.
      expect(t, mode).not.toMatch(/Freitag\s*[0-9]/)
    }
  })

  it('prints all eight "not counted yet" as deploy 3 ships, until production’s hand check holds each (the 27 Sep ruling)', () => {
    for (const mode of MODES) {
      const t = read(overviewRivals.render(withBrands(shippedBrandsRead()), mode, ctx))
      expect(t, mode).toContain('Your name in your market in September: not counted yet.')
      for (const brand of ['Cotopaxi', 'Patagonia', 'The North Face', 'Freitag', 'Rareform', 'Freedom of Movement', 'Old School']) {
        expect(t, mode).toMatch(new RegExp(`${brand}\\s*not counted yet`))
      }
      expect((t.match(/not counted yet/g) ?? []).length, mode).toBe(8)
      // No figure heads over a table that prints no figure.
      expect(t, mode).not.toMatch(/\b(13|45|516)\b/)
      assertCopyContract(render(overviewRivals.render(withBrands(shippedBrandsRead()), mode, ctx)))
    }
  })

  it('prints every brand and your name as "not counted yet" while the mention layer is empty (staging today)', () => {
    for (const mode of MODES) {
      const t = read(overviewRivals.render(withBrands(emptyBrandsRead()), mode, ctx))
      expect(t, mode).toContain('Your name in your market in September: not counted yet.')
      expect(t, mode).not.toMatch(/\b0\b/)
      expect((t.match(/not counted yet/g) ?? []).length, mode).toBe(8)
    }
  })

  it('draws the preview’s bars on one axis, the headline count over the count in all', () => {
    const b = stagingBrandsRead()
    expect(brandAxis(b)).toBe(48)
    const markup = render(overviewRivals.render(withBrands(b), 'app', ctx))
    expect(markup).toContain('width:93.8%')
    expect(markup).toContain('width:27.1%')
    expect(markup).toContain('var(--comp)')
    expect(markup).toContain('bg-you')
  })

  it('links Competitive by its current sidebar label, and no footnote', () => {
    const t = read(overviewRivals.render(withBrands(stagingBrandsRead()), 'app', ctx))
    expect(t).toContain('Open Competitive →')
    expect(t).not.toMatch(/Ninety-day|frozen months/)
  })

  it('keeps deploy 2’s line where the page read no brands (Össur, no rules)', () => {
    const t = read(overviewRivals.render(ossurFrontFixture(), 'app', ctx))
    expect(t).toContain('are not read for this workspace yet')
    expect(t).not.toContain('not counted yet')
  })
})
