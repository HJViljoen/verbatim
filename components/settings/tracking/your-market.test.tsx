import { describe, expect, it } from 'vitest'

import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { searchPlan, type TermShare } from '@/lib/settings/your-market'

import { marketSplit, SEARCH_ROWS, SearchesEachUpdate, WhereItCameFrom, WhereWeReadIt, YourMarketCard, type IndexEntry } from './your-market'

// Settings › What we read, the market's cards as the approved preview draws
// them (WP3.10): Your market with the page's index, Where your market came
// from (each search with its makers, as bars), Where we read it (the
// category's platforms) and Searches each update (the cap as used of 120).
// Staging, read-only, 27 Sep 2026 (Sealand, September).

const MONTH = '2026-09-01'
// The CATEGORY's 625 September videos by platform (the market's 654 less the
// 29 filed under a brand you track).
const MIX = [
  { platform: 'youtube', label: 'YouTube', videos: 277 }, { platform: 'tiktok', label: 'TikTok', videos: 180 },
  { platform: 'reddit', label: 'Reddit', videos: 115 }, { platform: 'instagram', label: 'Instagram', videos: 53 },
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
const read = (t: string): string => t.replace(/\s+([,.)])/g, '$1').replace(/\(\s+/g, '(').replace(/\s+/g, ' ')
const INDEX: IndexEntry[] = [
  { href: '#search-set', title: 'The search set', sub: '22 terms · held still' },
  { href: '#by-search', title: 'Where your market came from', sub: 'each search, with its makers' },
  { href: '#platforms', title: 'Where we read it', sub: '4 platforms · 113 searches' },
  { href: '#brands', title: 'Brands you track', sub: '7 · 4 with September videos' },
  { href: '#makers', title: 'Makers', sub: 'kept, grouped and marked' },
  { href: '#not-mine', title: 'This is not my market', sub: 'what is set aside' },
]
const hero = (over: Partial<Parameters<typeof YourMarketCard>[0]> = {}) => (
  <YourMarketCard
    month={MONTH}
    soFar={false}
    videos={654}
    split={SEP}
    prev={{ month: '2026-08-01', split: AUG }}
    ownPosts={20}
    movesLabel="Your moves"
    movesHref="/dashboard/market"
    marketLabel="Your market"
    marketHref="/dashboard"
    index={INDEX}
    {...over}
  />
)

describe('Your market, the card the preview opens on (WP3.10)', () => {
  it('splits the market into the category and the brands you track, as counts of one market', () => {
    expect(SEP).toEqual({ videos: 654, category: 625, brands: 29, byBrand: [
      { name: 'Cotopaxi', videos: 12 }, { name: 'Freitag', videos: 6 }, { name: 'The North Face', videos: 6 }, { name: 'Patagonia', videos: 5 },
    ] })
  })

  it('says what the market is and its size, "so far" only while the month runs', () => {
    expect(read(renderText(hero()))).toContain('Your market is everything we read except your own posts: 654 videos in September.')
    expect(read(renderText(hero({ soFar: true })))).toContain('654 videos in September so far.')
  })

  // The month before prints only where the page's market pair joins (T0a,
  // ST-10: the loader passes none where it is refused, and the card carries
  // no refusal chip at all).
  it('draws the bar of its two parts, and prints the split, the month before and what is not in it, with no chip', () => {
    const html = render(hero())
    expect(html).toContain('role="img" aria-label="654 videos: 625 in the category, 29 filed under brands you track"')
    expect(html).toContain('flex:625 1 0')
    expect(html).toContain('flex:29 1 0')
    const t = read(renderText(hero()))
    expect(t).toContain('625 in the category')
    expect(t).toContain('not filed under any brand')
    expect(t).toContain('29 filed under brands you track')
    expect(t).toContain('Cotopaxi 12, Freitag 6, The North Face 6, Patagonia 5')
    expect(t).toContain('August: 377 · 351 in the category and 26 under brands you track')
    expect(t).not.toContain(CHIP)
    expect(html).not.toContain('data-pair-chip')
    expect(t).toContain('Not in it: your own posts (20 in September, read on Your moves) and the comments under brands’ own posts.')
  })

  it('carries the page\'s index beside it, each entry an anchor on the page', () => {
    const html = render(hero())
    const t = read(renderText(hero()))
    expect(t).toContain('On this page')
    for (const e of INDEX) {
      expect(html).toContain(`href="${e.href}"`)
      expect(t).toContain(`${e.title} ${e.sub}`)
    }
  })

  it('has one link out in its footer, to the front page by its current label, and no share anywhere', () => {
    expect(render(hero())).toContain('href="/dashboard"')
    expect(read(renderText(hero()))).toContain('Read it on Your market →')
    expect(renderText(hero())).not.toMatch(/\d%/)
  })

  it('leaves out what it could not read, and reads "not measured" before MF1', () => {
    const t = read(renderText(hero({ prev: null, ownPosts: null })))
    expect(t).not.toContain('August:')
    expect(t).not.toContain('not read as a change')
    expect(t).toContain('Not in it: your own posts, read on Your moves, and the comments under brands’ own posts.')
    expect(renderText(<YourMarketCard month={MONTH} videos={null} />)).toContain('not measured')
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

const came = (over: Partial<Parameters<typeof WhereItCameFrom>[0]> = {}) => (
  <WhereItCameFrom month={MONTH} marketVideos={654} terms={{ rows: TERMS, unknown: 0 }} makers="measured" allHref="/dashboard/settings?searches=all#by-search" topHref="/dashboard/settings#by-search" {...over} />
)

describe('Where your market came from', () => {
  const text = read(renderText(came()))
  it('leads with the biggest search and its makers, over its own videos', () => {
    expect(text).toContain('Your biggest search, upcycled bag, finds mostly makers: 84% of 110 videos.')
  })
  it('draws each search as the videos that are not makers\' and the makers\' hatch beside them, scaled to the biggest', () => {
    const html = render(came())
    // upcycled bag: 18 not makers, 92 makers, of the biggest search's 110.
    expect(html).toContain(`width:${(18 / 110) * 100}%`)
    expect(html).toContain(`width:${(92 / 110) * 100}%`)
    expect(text).toContain('not makers makers')
    expect(text).toMatch(/1 upcycled bag mostly makers 110 92/)
    expect(text).toMatch(/2 handmade bag mostly makers 85 44/)
    expect(text).toMatch(/8 r\/onebag 27 0/)
    // The column heads carry the month and what the makers are of.
    expect(text).toContain('Videos Sep')
    expect(text).toContain('Makers of them')
  })
  it('prints at most twelve rows, and "Show all" opens the rest', () => {
    expect(text).not.toContain('rareform bag')
    expect(text).toContain('Show all 14 searches →')
    const all = read(renderText(came({ all: true })))
    expect(all).toContain('rareform bag')
    expect(all).toContain(`Show the first ${SEARCH_ROWS} →`)
  })
  it('says the biggest search waits for our next call only where the searches are held still', () => {
    expect(read(renderText(came({ askOnCall: true })))).toContain('Taking upcycled bag out would bring in fewer makers, but it would restart the count, so we will look at it with you on our next call.')
    expect(text).not.toContain('next call')
    expect(text).not.toMatch(/13 Oct/)
  })
  it('reads "not measured" without video_provenance or MF1, and draws no makers where no maker rule is on', () => {
    expect(renderText(came({ terms: null }))).toContain('not measured')
    expect(renderText(came({ marketVideos: null, terms: null, makers: 'not_measured' }))).toContain('not measured')
    // Össur on staging: 362 September market videos, none with a provenance row, no maker rule.
    const ossur = renderText(came({ marketVideos: 362, terms: { rows: [], unknown: 362 }, makers: 'no_rule' }))
    expect(ossur).toContain('No video in September carries a record of the search that found it yet.')
    const noRule = read(renderText(came({ terms: { rows: TERMS.slice(0, 1), unknown: 0 }, makers: 'no_rule' })))
    expect(noRule).toContain('Your biggest search, upcycled bag, found 110 of your market’s 654 videos in September.')
    expect(noRule).not.toContain('Makers')
    expect(noRule).not.toContain('mostly makers')
  })
  it('keeps the copy contract, with no em dash', () => {
    assertCopyContract(came({ askOnCall: true }))
    expect(renderText(came())).not.toContain('—')
  })
})

describe('Where we read it', () => {
  const el = <WhereWeReadIt month={MONTH} category={625} mix={MIX} conversationLabel="Conversation" conversationHref="/dashboard/voice" />
  const text = read(renderText(el))
  it('prints the category\'s platforms, with the two biggest named over the category\'s base', () => {
    expect(text).toContain('YouTube and TikTok hold 73% of 625 category videos in September.')
    expect(text).toMatch(/YouTube comments, titles and speech 277 44%/)
    expect(text).toMatch(/Instagram comments and captions 53 8%/)
    // The share column's base is its head.
    expect(text).toContain('Share of 625')
  })
  it('links to where the market talks, on Conversation', () => {
    expect(text).toContain('Where your market talks, on Conversation →')
    expect(render(el)).toContain('href="/dashboard/voice"')
  })
  it('reads "not measured" before MF1', () => {
    expect(renderText(<WhereWeReadIt month={MONTH} category={null} mix={null} conversationLabel="Conversation" conversationHref="/dashboard/voice" />)).toContain('not measured')
  })
  it('keeps the copy contract', () => {
    assertCopyContract(el)
  })
})

describe('Searches each update', () => {
  const el = <SearchesEachUpdate plan={PLAN} terms={22} />
  const text = read(renderText(el))
  it('prints the cap as used of 120, what is free, and each group\'s terms and searches', () => {
    expect(text).toContain('113 of 120 searches each update 7 free')
    expect(text).toMatch(/Your name 3 terms 15/)
    expect(text).toMatch(/Brands you track 7 terms 35/)
    expect(text).toMatch(/The category 12 terms 60/)
    expect(text).toMatch(/Communities 3 on Reddit 3/)
  })
  it('draws the stacked bar of the four groups and what is free', () => {
    const html = render(el)
    expect(html).toContain('aria-label="113 of 120 searches: your name 15, brands you track 35, the category 60, communities 3, 7 free"')
    for (const f of ['flex:15 1 0', 'flex:35 1 0', 'flex:60 1 0', 'flex:3 1 0', 'flex:7 1 0']) expect(html).toContain(f)
  })
  it('says a plan over the cap is over it', () => {
    expect(renderText(<SearchesEachUpdate plan={{ ...PLAN, used: 124 }} terms={22} />)).toContain('4 over')
  })
  it('points back up at the search set', () => {
    expect(text).toContain('See the 22 terms in the search set ↑')
    expect(render(el)).toContain('href="#search-set"')
  })
  it('keeps the copy contract', () => {
    assertCopyContract(el)
  })
})
