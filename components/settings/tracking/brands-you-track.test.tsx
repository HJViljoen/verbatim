import { describe, expect, it } from 'vitest'

import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'

import { BrandsYouTrackCard, type BrandRow } from './brands-you-track'

// Settings › What we read, "Brands you track" as the approved preview draws it
// (WP3.10). Sealand on staging, read-only, 27 Sep 2026 (the page's own render):
// the seven brands, what each is searched as, since when it has been tracked,
// the September videos filed under it (Cotopaxi 12, Freitag 6, The North Face
// 6, Patagonia 5, of 654) and its own posts. No brand has a production hand
// check on this branch, so every "Came up in" reads the Brands page's "not
// counted yet"; the counted arm is staging's own September count for
// Patagonia, The North Face and Cotopaxi as the Brands page reads it once a
// hand check lets it print (lib/pages/overview-brands.ts, read 27 Sep: 13, 6
// and 3 of the 516 videos no rival search of ours found; 45, 36 and 28 of all
// 654), and the Freitag line is the Brands page's words for a brand under the
// precision floor.

const NOT_YET = { note: 'not counted yet' }
const ROWS: BrandRow[] = [
  { name: 'Patagonia', searchedAs: ['patagonia black hole'], since: '17 Sep', filed: 5, came: { kOrganic: 13, kAny: 45 }, ownPosts: 19 },
  { name: 'Cotopaxi', searchedAs: ['cotopaxi backpack'], since: 'by 28 Jun', filed: 12, came: { kOrganic: 3, kAny: 28 }, ownPosts: 21 },
  { name: 'Freitag', searchedAs: ['freitag bag', 'frtg'], since: 'by 28 Jun', filed: 6, came: { note: 'mostly the German word for Friday · not counted' }, ownPosts: 14 },
  { name: 'The North Face', searchedAs: ['north face backpack'], since: '17 Sep', filed: 6, came: { kOrganic: 6, kAny: 36 }, ownPosts: 23 },
  { name: 'Freedom of Movement', searchedAs: ['fombrand'], since: '17 Sep', filed: 0, came: NOT_YET, ownPosts: 30 },
  { name: 'Old School', searchedAs: [], since: '17 Sep', filed: 0, came: NOT_YET, ownPosts: 8 },
  { name: 'Rareform', searchedAs: ['rareform bag'], since: '9 Sep', filed: 0, came: NOT_YET, ownPosts: 1 },
]
const read = (t: string): string => t.replace(/\s+([,.)])/g, '$1').replace(/\s+/g, ' ')
const card = (rows: BrandRow[] = ROWS) => <BrandsYouTrackCard month="2026-09-01" rows={rows} brandsLabel="Brands" brandsHref="/dashboard/competitive" />

describe('Brands you track', () => {
  const t = read(renderText(card()))

  it('says how many had videos filed under them this month, and how many videos, all in the market', () => {
    expect(t).toContain('Four of the seven had videos filed under them in September: 29, all part of your market.')
    expect(read(renderText(card(ROWS.map((r) => ({ ...r, filed: 0 })))))).toContain('None of the seven had a video filed under them in September.')
    expect(read(renderText(card(ROWS.slice(0, 4))))).toContain('All four had videos filed under them in September: 29, all part of your market.')
  })

  it('prints the preview\'s columns: searched as, tracked since, filed, came up in (two ways) and its own posts', () => {
    expect(t).toContain('Brand Searched as Tracked since Filed under it Sep Came up in, Sep outside our brand searches in all Its own posts Sep')
    expect(t).toContain('Patagonia patagonia black hole 17 Sep 5 13 45 19')
    expect(t).toContain('Cotopaxi cotopaxi backpack by 28 Jun 12 3 28 21')
    expect(t).toContain('Freitag freitag bag · frtg by 28 Jun 6 mostly the German word for Friday · not counted 14')
    expect(t).toContain('Old School no search term 17 Sep 0 not counted yet 8')
    expect(t).toContain('Rareform rareform bag 9 Sep 0 not counted yet 1')
    // A brand none of whose accounts is read: a dot, never a 0.
    expect(read(renderText(card([{ ...ROWS[6], ownPosts: null }])))).toContain('Rareform rareform bag 9 Sep 0 not counted yet ·')
  })

  it('draws the counted brand\'s two counts as one bar: in all, and without our rival searches inside it', () => {
    const html = render(card())
    // Patagonia's 45 is the longest "in all"; its 13 sit inside it.
    expect(html).toContain('width:100%')
    expect(html).toContain(`width:${(13 / 45) * 100}%`)
    expect(html).toContain(`width:${(36 / 45) * 100}%`)
  })

  it('links to the Brands page by its current label, and nothing else', () => {
    expect(t).toContain('Open Brands →')
    expect(render(card()).match(/<a /g)).toHaveLength(1)
  })

  it('says a workspace with no brand tracks none, and a market it could not read is "not measured"', () => {
    expect(renderText(card([]))).toContain('No brand is tracked yet.')
    const unread = read(renderText(card(ROWS.map((r) => ({ ...r, filed: null })))))
    expect(unread).toContain('not measured')
    expect(unread).not.toContain('had videos filed')
  })

  it('keeps the copy contract, with no em dash', () => {
    assertCopyContract(card())
    expect(renderText(card())).not.toContain('—')
  })
})
