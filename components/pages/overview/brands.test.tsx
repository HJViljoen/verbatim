import { describe, it, expect } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { emptyBrandsRead, noneFoundBrandsRead, uncheckedBrandsRead, stagingBrandsRead } from '@/lib/test/brands-fixture'
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
      expect(t, mode).toMatch(/Outside our brand searches\s*(·\s*)?of 516/)
      expect(t, mode).toMatch(/In all\s*(·\s*)?of 654/)
      assertCopyContract(render(overviewRivals.render(withBrands(stagingBrandsRead()), mode, ctx)))
    }
  })

  // Finish-list item 24: the route frames the front page, and the name line
  // then says "the market you sell into", never "your market’s".
  it('says "the market you sell into" on the framed front page, in every mode', () => {
    const frame = { subject: 'The market Sealand sells into', lede: 'x' }
    for (const mode of MODES) {
      const data = { ...withBrands(stagingBrandsRead()), frame }
      const t = read(overviewRivals.render(data, mode, ctx))
      expect(t, mode).toContain('In September your name came up in none of the 654 videos from the market you sell into. The 8 videos that name you are your own posts.')
      expect(t, mode).not.toContain('your market’s')
      assertCopyContract(render(overviewRivals.render(data, mode, ctx)))
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

  it('prints all eight "not counted yet" until production’s hand check holds each (the 27 Sep ruling)', () => {
    for (const mode of MODES) {
      const t = read(overviewRivals.render(withBrands(uncheckedBrandsRead()), mode, ctx))
      expect(t, mode).toContain('Your name in your market in September: not counted yet.')
      for (const brand of ['Cotopaxi', 'Patagonia', 'The North Face', 'Freitag', 'Rareform', 'Freedom of Movement', 'Old School']) {
        expect(t, mode).toMatch(new RegExp(`${brand}\\s*not counted yet`))
      }
      expect((t.match(/not counted yet/g) ?? []).length, mode).toBe(8)
      // No figure heads over a table that prints no figure.
      expect(t, mode).not.toMatch(/\b(13|45|516)\b/)
      assertCopyContract(render(overviewRivals.render(withBrands(uncheckedBrandsRead()), mode, ctx)))
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

  // The lead's ruling of 27 Sep (fast track): a brand production's list held
  // no match of is a zero by the rule, so it prints "none found"; "not
  // counted yet" stays for a brand whose matches are not checked.
  it('prints "none found" for a brand production’s list held no match of, in every mode, with no figure or head', () => {
    for (const mode of MODES) {
      const t = read(overviewRivals.render(withBrands(noneFoundBrandsRead()), mode, ctx))
      for (const brand of ['Rareform', 'Freedom of Movement', 'Old School']) {
        expect(t, mode).toMatch(new RegExp(`${brand}\\s*no video names it`))
      }
      for (const brand of ['Cotopaxi', 'Patagonia', 'The North Face', 'Freitag']) {
        expect(t, mode).toMatch(new RegExp(`${brand}\\s*not counted yet`))
      }
      expect((t.match(/no video names it/g) ?? []).length, mode).toBe(3)
      expect(t, mode).toContain('Your name in your market in September: not counted yet.')
      // A word, not a 0, and no figure heads over a table with no figure.
      expect(t, mode).not.toMatch(/\b0\b|\bof 516\b|In all/)
      assertCopyContract(render(overviewRivals.render(withBrands(noneFoundBrandsRead()), mode, ctx)))
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

  it('links the brands page by its current sidebar label, and no footnote', () => {
    const t = read(overviewRivals.render(withBrands(stagingBrandsRead()), 'app', ctx))
    // "Brands" since deploy 5 (WP3.5).
    expect(t).toContain('Open Brands →')
    expect(t).not.toMatch(/Ninety-day|frozen months/)
  })

  it('keeps deploy 2’s line where the page read no brands (Össur, no rules)', () => {
    const t = read(overviewRivals.render(ossurFrontFixture(), 'app', ctx))
    expect(t).toContain('are not read for this workspace yet')
    expect(t).not.toContain('not counted yet')
  })
})
