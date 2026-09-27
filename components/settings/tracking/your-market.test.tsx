import { describe, expect, it } from 'vitest'

import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { searchPlan, type TermShare } from '@/lib/settings/your-market'

import { marketSplit, SEARCH_ROWS, WhereItCameFrom, WhereWeReadIt, YourMarketSize } from './your-market'

// Settings › Tracking › Your market (WP3.10): the market's platform mix, the
// search cap as used of 120, and each search's share of the market with its
// makers. Staging, read-only, 27 Sep 2026 (Sealand, September).

const MONTH = '2026-09-01'
const MIX = [
  { platform: 'youtube', label: 'YouTube', videos: 289 }, { platform: 'tiktok', label: 'TikTok', videos: 183 },
  { platform: 'reddit', label: 'Reddit', videos: 128 }, { platform: 'instagram', label: 'Instagram', videos: 54 },
]
const TERMS: TermShare[] = [
  { search: 'upcycled bag', videos: 110, makers: 92 }, { search: 'handmade bag', videos: 85, makers: 44 },
  { search: 'sustainable fashion', videos: 60, makers: 23 }, { search: 'recycled bag', videos: 59, makers: 43 },
  { search: 'eco backpack', videos: 48, makers: 5 }, { search: 'travel gear', videos: 42, makers: 1 },
  { search: 'freitag bag', videos: 28, makers: 1 }, { search: 'r/onebag', videos: 27, makers: 0 },
  { search: 'cotopaxi backpack', videos: 24, makers: 1 }, { search: 'sustainable backpack', videos: 23, makers: 5 },
  { search: 'upcycled backpack', videos: 23, makers: 18 }, { search: 'north face backpack', videos: 20, makers: 1 },
  { search: 'rareform bag', videos: 19, makers: 0 }, { search: 'sailcloth bag', videos: 19, makers: 2 },
]
const PLAN = searchPlan({
  brand_keywords: ['sealand gear', '#sealandgear', 'sealand bag'],
  competitor_keywords: ['cotopaxi backpack', 'freitag bag', 'rareform bag', 'frtg', 'north face backpack', 'patagonia black hole', 'fombrand'],
  industry_keywords: ['eco backpack', 'recycled bag', 'sustainable backpack', 'upcycled bag', 'recycled sailcloth', 'sailcloth bag', 'upcycled backpack', 'handmade bag', 'sustainable fashion', 'travel gear', 'made from waste', 'locally made south africa'],
  platforms: ['youtube', 'tiktok', 'instagram', 'reddit'],
  subreddits: [{ name: 'backpacks', status: 'active' }, { name: 'onebag', status: 'active' }, { name: 'travelgear', status: 'active' }],
}, true)

// Staging, read-only, 27 Sep 2026 (Sealand; WP3.10's probe of the page's own
// reads): September's market 654 = 625 in the category + 29 filed under a
// brand you track; August's 377 = 351 + 26; 20 own posts in September.
const SEP = marketSplit([
  ...Array.from({ length: 625 }, () => ({ audience: 'industry-other' })),
  ...Array.from({ length: 12 }, () => ({ audience: 'competitor:Cotopaxi' })),
  ...Array.from({ length: 6 }, () => ({ audience: 'competitor:Freitag' })),
  ...Array.from({ length: 6 }, () => ({ audience: 'competitor:The North Face' })),
  ...Array.from({ length: 5 }, () => ({ audience: 'competitor:Patagonia' })),
])
const AUG = marketSplit([
  ...Array.from({ length: 351 }, () => ({ audience: 'industry-other' })),
  ...Array.from({ length: 22 }, () => ({ audience: 'competitor:Cotopaxi' })),
  ...Array.from({ length: 4 }, () => ({ audience: 'competitor:Freitag' })),
])
const CHIP = 'not read as a change: we changed our searches in September'
/** renderText spaces every tag boundary; a reader sees no space before a
 *  comma, a stop or a closing bracket, or after an opening one. */
const read = (t: string): string => t.replace(/\s+([,.)])/g, '$1').replace(/\(\s+/g, '(')
const hero = (over: Partial<Parameters<typeof YourMarketSize>[0]> = {}) => (
  <YourMarketSize
    month={MONTH}
    soFar={false}
    videos={654}
    split={SEP}
    prev={{ month: '2026-08-01', split: AUG }}
    chip={CHIP}
    ownPosts={20}
    movesLabel="Your moves"
    movesHref="/dashboard/market"
    marketLabel="Your market"
    marketHref="/dashboard"
    {...over}
  />
)

describe('Your market, in the preview\'s words (WP3.10)', () => {
  it('splits the market into the category and the brands you track, as counts of one market', () => {
    expect(SEP).toEqual({ videos: 654, category: 625, brands: 29, byBrand: [
      { name: 'Cotopaxi', videos: 12 }, { name: 'Freitag', videos: 6 }, { name: 'The North Face', videos: 6 }, { name: 'Patagonia', videos: 5 },
    ] })
  })

  it('says what the market is and its size, "so far" only while the month runs', () => {
    expect(renderText(hero())).toContain('Your market is everything we read except your own posts: 654 videos in September.')
    expect(renderText(hero({ soFar: true }))).toContain('654 videos in September so far.')
  })

  it('prints the split, the month before as counts, the chip and what is not in it', () => {
    const t = read(renderText(hero()))
    expect(t).toContain('625 in the category')
    expect(t).toContain('not filed under any brand')
    expect(t).toContain('29 filed under brands you track')
    expect(t).toContain('Cotopaxi 12, Freitag 6, The North Face 6, Patagonia 5')
    expect(t).toContain('August: 377 · 351 in the category and 26 under brands you track')
    expect(t).toContain(CHIP)
    expect(t).toContain('Not in it: your own posts (20 in September, read on Your moves) and the comments under brands’ own posts.')
  })

  it('has one link out, to the front page by its current label, and no share anywhere', () => {
    const html = render(hero())
    expect(html).toContain('href="/dashboard"')
    expect(renderText(hero())).toContain('Read it on Your market →')
    expect(renderText(hero())).not.toMatch(/\d%/)
  })

  it('leaves out what it could not read, and reads "not measured" before MF1', () => {
    const t = read(renderText(hero({ prev: null, chip: null, ownPosts: null })))
    expect(t).not.toContain('August:')
    expect(t).not.toContain('not read as a change')
    expect(t).toContain('Not in it: your own posts, read on Your moves, and the comments under brands’ own posts.')
    expect(renderText(<YourMarketSize month={MONTH} videos={null} />)).toContain('not measured')
  })

  it('draws Össur, whose market holds one tracked brand (staging: 362 = 338 + 24 Ottobock)', () => {
    const ossur = marketSplit([
      ...Array.from({ length: 338 }, () => ({ audience: 'industry-other' })),
      ...Array.from({ length: 24 }, () => ({ audience: 'competitor:Ottobock' })),
    ])
    const t = renderText(hero({ videos: 362, split: ossur, prev: null, ownPosts: 109 }))
    expect(t).toContain('338 in the category')
    expect(t).toContain('24 filed under brands you track')
    expect(t).toContain('Ottobock 24')
  })

  it('keeps the copy contract, with no em dash', () => {
    assertCopyContract(hero())
    expect(renderText(hero())).not.toContain('—')
  })
})

describe('Where your market came from', () => {
  const text = renderText(<WhereItCameFrom month={MONTH} marketVideos={654} terms={{ rows: TERMS, unknown: 0 }} makers="measured" />)
  it('leads with the biggest search and its makers, one denominator', () => {
    expect(text).toContain('Your biggest search, upcycled bag , finds mostly makers: 84% of 110 videos .')
  })
  it('prints each search\'s share of the market and its makers, at most twelve rows, the base in the column head', () => {
    expect(text).toContain('Videos, Sep (of 654)')
    expect(text).toMatch(/upcycled bag mostly makers 110 17% 92/)
    expect(text).toMatch(/handmade bag mostly makers 85 13% 44/)
    expect(text).toMatch(/r\/onebag 27 4% 0/)
    expect(text).not.toContain('rareform bag')
    expect(text).toContain(`${SEARCH_ROWS} of 14 searches shown.`)
  })
  it('reads "not measured" without video_provenance or MF1, and "no rule" where no maker rule is on', () => {
    expect(renderText(<WhereItCameFrom month={MONTH} marketVideos={654} terms={null} makers="measured" />)).toContain('not measured')
    expect(renderText(<WhereItCameFrom month={MONTH} marketVideos={null} terms={null} makers="not_measured" />)).toContain('not measured')
    // Össur on staging: 362 September market videos, none with a provenance row, no maker rule.
    const ossur = renderText(<WhereItCameFrom month={MONTH} marketVideos={362} terms={{ rows: [], unknown: 362 }} makers="no_rule" />)
    expect(ossur).toContain('No video in September carries a record of the search that found it yet.')
    // Said once: with no search on record, the count of videos without one is the same sentence.
    expect(ossur).not.toContain('362 of September’s 362 videos carry no record')
    const some = renderText(<WhereItCameFrom month={MONTH} marketVideos={654} terms={{ rows: TERMS, unknown: 3 }} makers="measured" />)
    expect(some).toContain('3 of September’s 654 videos carry no record of the search that found them.')
    const noRule = renderText(<WhereItCameFrom month={MONTH} marketVideos={654} terms={{ rows: TERMS.slice(0, 1), unknown: 0 }} makers="no_rule" />)
    expect(noRule).toContain('no rule')
  })
  it('keeps the copy contract, with no em dash', () => {
    const markup = <WhereItCameFrom month={MONTH} marketVideos={654} terms={{ rows: TERMS, unknown: 3 }} makers="measured" />
    assertCopyContract(markup)
    expect(renderText(markup)).not.toContain('—')
  })
})

describe('Where we read it', () => {
  const text = renderText(<WhereWeReadIt month={MONTH} marketVideos={654} mix={MIX} plan={PLAN} />)
  it('prints the market\'s platform mix, not the client\'s', () => {
    expect(text).toContain('YouTube and TikTok hold 72% of 654 market videos in September .')
    expect(text).toMatch(/YouTube 289 44%/)
    expect(text).toMatch(/Instagram 54 8%/)
  })
  it('prints the search cap as used of 120, by group', () => {
    expect(text).toContain('113 of 120 searches each update · 7 free')
    expect(text).toMatch(/The category 12 60/)
    expect(text).toMatch(/Communities 3 on Reddit 3/)
  })
  it('reads "not measured" before MF1, and still prints the cap', () => {
    const none = renderText(<WhereWeReadIt month={MONTH} marketVideos={null} mix={null} plan={PLAN} />)
    expect(none).toContain('not measured')
    expect(none).toContain('113 of 120 searches each update')
  })
  it('keeps the copy contract', () => {
    assertCopyContract(<WhereWeReadIt month={MONTH} marketVideos={654} mix={MIX} plan={PLAN} />)
  })
})
