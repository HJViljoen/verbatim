import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { PRODUCT_IDS } from '@/lib/pages/v2/products-fixture'
import { categoryFixture, PRODUCTS_LEVEL_FIXTURES, productFixture } from '@/lib/pages/v2/products-level-fixture'
import { PRODUCTS_NO_CATALOGUE, PRODUCTS_NOT_ON, setKey, type Crosses } from '@/lib/pages/v2/products'
import { CATEGORY_MISSING, PRODUCT_MISSING, type ProductsLevelData } from '@/lib/pages/v2/products-levels'
import { PRODUCT_TAG_COPY } from '@/lib/products/tags'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { ProductsCategoryPage, ProductsProductPage } from './levels'
import { NAMED_IN_VIDEO_ONLY, openedNamedNote, OWN_POST_NOTE, QUIET_FACT, showNamedOf } from './product-page'
import { tagSub } from './unclear'

// YOUR PRODUCTS' LEVEL PAGES, AS DRAWN (17 Oct; the G4 boards): every state a
// category's page and a product's draws, statically, against the copy
// contract and the boards' words.

const page = (d: ProductsLevelData) => (d.level === 'category' ? <ProductsCategoryPage data={d} /> : <ProductsProductPage data={d} />)
const ALL = Object.entries(PRODUCTS_LEVEL_FIXTURES) as [keyof typeof PRODUCTS_LEVEL_FIXTURES, () => ProductsLevelData][]

describe('every level page, every state', () => {
  it('keeps the copy contract', () => {
    for (const [k, f] of ALL) {
      try { assertCopyContract(page(f())) } catch (e) { throw new Error(`${k}: ${(e as Error).message}`) }
    }
  })

  it('prints no en or em dash, no "this month", no panel', () => {
    for (const [k, f] of ALL) {
      const m = render(page(f()))
      expect(m, k).not.toMatch(/[–—]/)
      expect(renderText(page(f())), k).not.toMatch(/this month/i)
      expect(m, k).not.toContain('data-panel')
    }
  })

  it('names its level: a category\'s three boxes on the yellow, a product\'s single box on the neutral, never the brand tag', () => {
    const c = render(page(PRODUCTS_LEVEL_FIXTURES.liners()))
    expect(c).toMatch(/data-level-tile="category" class="[^"]*bg-accent text-orange-text/)
    expect(c).toMatch(/data-level-label=""[^>]*>Category<\/p>/)
    const p = render(page(PRODUCTS_LEVEL_FIXTURES.sealinx()))
    expect(p).toMatch(/data-level-tile="product" class="[^"]*bg-track text-secondary-foreground/)
    expect(renderText(page(PRODUCTS_LEVEL_FIXTURES.sealinx()))).toContain('Product in Liners Iceross Seal-In X')
    // The board's tag glyph (Voices' brand tag) is drawn nowhere.
    for (const m of [c, p]) expect(m).not.toContain('M12.6 2.6A2 2 0 0 0 11.2 2H4')
  })

  it('the path, the switcher and the way back on a phone', () => {
    const m = render(page(PRODUCTS_LEVEL_FIXTURES.sealinx()))
    expect(m).toContain('data-crumb-row=""')
    expect(m).toContain('aria-label="Switch to another category"')
    expect(m).toContain('aria-label="Switch to another of your liners"')
    expect(m).toMatch(/data-back-link=""[^>]*href="\/dashboard\/products\/[^"]+"/)
    // The switcher drawn open: the category's products, the quiet ones under a hairline.
    const open = renderText(<ProductsProductPage data={PRODUCTS_LEVEL_FIXTURES.sealinx()} switcherOpen />)
    expect(open).toContain('Your liners Iceross Seal-In X Iceross Comfort Iceross Synergy Iceross Dermo Iceross Seal-In V Quiet in September')
  })
})

describe('a category\'s page, the hub (G4-Products-Category)', () => {
  const d = PRODUCTS_LEVEL_FIXTURES.liners()
  const text = renderText(page(d))

  it('opens with its meta and switch, then the header card in code\'s words and its four figures', () => {
    expect(text).toContain('September · the last full month · 118 of 839 videos · 4 of your 10 liners came up July August September')
    expect(text).toContain('Liners · September Liners talk is mostly about liners in general 14% of your market’s videos 118 of 839 in September No clear change +2.1 pts against August, 12% 73 of 612 in August 19 of the 118 name one of your liners 78 are about liners in general, none of yours named 21 are about one of yours, but we couldn’t tell which Tag them below ↓')
    // No read card: the board's "Our read" is not written (decision 1).
    expect(text).not.toMatch(/Our read|What people are saying|What it means/)
  })

  it('then the products: three cards, all of them as a list in the shelf\'s order, each opening its page', () => {
    expect(text).toContain('Your liners 4 of your 10 came up in September · the three with the most, then all ten')
    expect(text).toContain('Iceross Seal-In X Praise in the comments under 7 of its 10 videos. 10 videos in September 6 in August Fit & comfort, 8 of 10 Open →')
    expect(text).toContain('All 10 of your liners Most videos first, as on your shelf. Each opens as its own page.')
    expect(text).toContain('Product What its videos are about most September August Iceross Seal-In X Fit & comfort, 8 of 10 10 6')
    const m = render(page(d))
    expect(m).toContain(`href="/dashboard/products/${PRODUCT_IDS.liners()}/${PRODUCT_IDS.sealInX()}"`)
    expect(m.match(/data-quiet-mark=""/g)!.length).toBeGreaterThanOrEqual(6)
  })

  it('the couldn\'t-tell-which list with Tag, true to what a tag does in an open month', () => {
    expect(text).toContain(`About one of your liners, but we couldn’t tell which 21 videos in September. ${tagSub(false, 'September')}`)
    expect(text).toContain('“This liner gave me a rash after a week, back to my old one now.” TikTok · 29 Sep · video by @stepbystep.amp Watch the video Tag the product')
    expect(text).toContain('See all 6 →')
    expect(render(page(d))).toContain('data-tag-control="closed"')
    // A closed month keeps a tag and moves no count: the page says so.
    expect(renderText(page(categoryFixture({ over: { now: '2026-11-20T08:00:00.000Z' } })))).toContain(tagSub(true, 'September'))
  })

  it('a member reads the words and Watch the video, and the one line why there is no Tag (Thin, frame 5)', () => {
    const member = page(PRODUCTS_LEVEL_FIXTURES['liners-member']())
    expect(render(member)).not.toContain('data-tag-control')
    expect(renderText(member)).not.toContain('Tag the product')
    expect(renderText(member)).not.toContain('Tag them below')
    expect(renderText(member)).toContain('See them below ↓')
    expect(renderText(member)).toContain(PRODUCT_TAG_COPY.role)
    expect(renderText(member)).toContain('21 videos in September. “This liner')
  })

  it('"See all N" only where the opened list draws all N; else "See the first N", and the opened list says so', () => {
    expect(renderText(page(PRODUCTS_LEVEL_FIXTURES.liners()))).toContain('See all 6 →')
    const cut = categoryFixture({ reads: { unclearCut: true } })
    const closed = renderText(page(cut))
    expect(closed).toContain('See the first 6 →')
    expect(closed).not.toContain('See all')
    assertCopyContract(page(cut))
    const opened = renderText(page(categoryFixture({ params: { unclear: 'all' }, reads: { unclearCut: true } })))
    expect(opened).toContain('The first 6 are listed here. Show fewer')
    expect(renderText(page(PRODUCTS_LEVEL_FIXTURES['liners-all']()))).not.toContain('are listed here')
  })

  it('a card over one video says "its 1 video", never "its 1 videos"', () => {
    const t = renderText(page(PRODUCTS_LEVEL_FIXTURES['today-feet']()))
    expect(t).toContain('Praise in the comments under 1 of its 1 video.')
    expect(t).not.toMatch(/of its 1 videos/)
  })

  it('"See all" makes the list longer on the same page, and the way back', () => {
    const all = renderText(page(PRODUCTS_LEVEL_FIXTURES['liners-all']()))
    expect(all).toContain('The video itself names one of your products here. YouTube · 15 Sep · video by @amputee.life')
    expect(all).not.toContain('See all')
    expect(all).toContain('Show fewer')
  })

  it('the numbers: month by month, subjects opening Market, kinds, groups opening Voices, where', () => {
    expect(text).toContain('The numbers Liners’ videos in September, every audience together, your own posts’ comments included')
    expect(text).toContain('What it’s about · of 117 Fit & comfort 70 Cost & access 18 Choosing the right device 12 Look & style 4 Each opens its subject in Market')
    expect(text).toContain('Who’s talking · of 118 New amputees, first year 47 of 118')
    expect(text).toContain('Each opens in Voices')
    const m = render(page(d))
    expect(m).toContain('href="/dashboard/market/subjects/s-fit-comfort?period=month&amp;month=2026-09"')
    expect(m).toContain('href="/dashboard/voices/groups/new"')
    // Group names are Pass E's, replayed with their slot.
    expect(m).toContain('data-slot="pass_e_persona">New amputees, first year')
  })

  it('the products against the category, a comment naming each product, the Agent and Settings', () => {
    expect(text).toContain('Your liners against liners in general · what their videos are about What it’s about All liners Iceross Seal-In X Iceross Comfort Iceross Synergy')
    expect(text).toContain('In their words · 3 comments, each naming its product Iceross Seal-In X “El Seal-In X me aguanta todo el día, pero ponérmelo cuesta.” Spanish · machine translation The Seal-In X holds all day for me, but putting it on is hard.')
    expect(text).toContain('Ask what people say about liners, in your own words. Edit Liners in Settings → Ask the Agent about liners')
  })

  it('U6: subjects not measured yet are named, never counted; the comparison keeps its rows and says why once', () => {
    const today = renderText(page(PRODUCTS_LEVEL_FIXTURES['today-liners']()))
    expect(today).toContain(`What it’s about · of 23 Choosing the right device ${SUBJECT_NOT_MEASURED} Community & encouragement ${SUBJECT_NOT_MEASURED}`)
    expect(today).toContain('What these videos are about: Not measured yet. A subject is counted here once its check has passed.')
    expect(today).toContain('None of your liners was named in September.')
    const feet = renderText(page(PRODUCTS_LEVEL_FIXTURES['today-feet']()))
    expect(feet).toContain(`What it’s about · ${SUBJECT_NOT_MEASURED}`)
    expect(feet).toContain('Product What its videos are about September')
    expect(feet).not.toContain('about most')
  })

  it('a tracked subject is never hidden: a failed one is named once with its reason, a ready one on none of its videos named (14 Oct)', () => {
    const base = categoryFixture()
    const crosses: Crosses = {
      ...base.category!.detail.crosses!,
      subjects: [{ id: 's-fit', label: 'Fit & comfort', k: 12 }],
      quiet: [{ id: 's-function', label: 'Function & movement' }],
      pending: [{ id: 's-cost', label: 'Cost & access', state: 'provisional' }, { id: 's-community', label: 'Community & encouragement', state: 'failed' }],
    }
    const d = categoryFixture({ over: { crosses: new Map([[setKey('group', PRODUCT_IDS.liners()), crosses]]) } })
    const node = page(d)
    const html = render(node)
    expect(html.split(FAILED_EXPLAINED).length - 1).toBe(1)
    expect(renderText(node)).toContain('On none of its videos: Function & movement')
    expect(renderText(node)).toContain(`Cost & access ${SUBJECT_NOT_MEASURED}`)
    assertCopyContract(node)
  })
})

describe('a product\'s page, the evidence (G4-Products-Product)', () => {
  const d = PRODUCTS_LEVEL_FIXTURES.sealinx()
  const text = renderText(page(d))

  it('opens with its meta and its one line in code\'s words', () => {
    expect(text).toContain('September · the last full month · named in 10 of 839 videos · 10 of 118 about liners · 8 comments name it')
    expect(text).toContain('Almost every video naming it is about Fit & comfort, and most have praise in their comments.')
  })

  it('where it was named: each video, the comments naming it under it, an own post marked, the rest one click on', () => {
    expect(text).toContain('Where it was named 10 videos in September, most comments naming it first The Amputee Diaries YouTube · posted 2 Sep Named in the video Twelve miles on the Seal-In X: an honest review after a month')
    expect(text).toContain('3 comments name it, of 148 on the video Watch the video ↗ “Switched from the Comfort to the Seal-In X and the slipping stopped.” 6 Sep')
    expect(text).toContain(`Össur Instagram · posted 1 Sep Your post Meet the people who make our liners 2 comments name it, of 64 on the post Watch the video ↗ ${OWN_POST_NOTE}`)
    expect(text).toContain('Spanish · machine translation The Seal-In X holds all day for me, but putting it on is hard. 9 Sep')
    expect(text).toContain('Show the other 6 videos')
    expect(render(page(d))).toContain('data-who-chip="you"')
  })

  it('the facts: its place, month by month, what people did, what it is about (U6), who, where', () => {
    expect(text).toContain('The facts Its place in liners · of 118 Iceross Seal-In X 10 Your other liners 9 One of yours, not which 21 Liners in general 78')
    expect(text).toContain('Month by month · share naming it 1.0% Jul 5 of 520 1.0% Aug 6 of 612 1.2% Sep 10 of 839')
    expect(text).toContain('What people did · of 10 Praise in the comments 7 Questions in the comments 6 Complaints in the comments 3')
    expect(text).toContain(`What it’s about · of 10 Fit & comfort 8 Choosing the right device 3 Cost & access 1 On none of its videos: Community & encouragement, Look & style Function & movement ${SUBJECT_NOT_MEASURED}`)
    expect(text).toContain('Who’s talking · of 10')
  })

  it('its siblings, the whole category, the Agent', () => {
    expect(text).toContain('Your other liners Liners, the whole category → Iceross Comfort 5 videos in September Iceross Synergy 3 videos in September Iceross Dermo 1 video in September Iceross Seal-In V Quiet in September')
    expect(text).toContain('Ask about these videos and what people said about the Iceross Seal-In X, in your own words. Edit its names in Settings → Ask the Agent about this')
  })

  it('one video opened shows its comments and the way back; every video listed', () => {
    const open = renderText(page(PRODUCTS_LEVEL_FIXTURES['sealinx-open']()))
    expect(open).toContain('Show fewer comments')
    const all = renderText(page(PRODUCTS_LEVEL_FIXTURES['sealinx-all']()))
    expect(all).not.toContain('Show the other')
    expect(all).toContain('Show fewer videos')
  })

  it('"Show all" never names fewer than the card\'s own count, and the opened list says what it leaves out (Market\'s rule)', () => {
    expect(showNamedOf({ quotable: 14, named: 14 })).toEqual({ shown: 14, of: null })
    expect(showNamedOf({ quotable: 9, named: 14 })).toEqual({ shown: 9, of: 14 })
    expect(showNamedOf({ quotable: 120, named: 120 })).toEqual({ shown: 50, of: 120 })
    expect(openedNamedNote({ quotable: 14, named: 14 })).toBeNull()
    expect(openedNamedNote({ quotable: 9, named: 14 })).toBe('The other 5 are counted, not quoted here.')
    expect(openedNamedNote({ quotable: 13, named: 14 })).toBe('The other one is counted, not quoted here.')
    expect(openedNamedNote({ quotable: 120, named: 128 })).toBe('The first 50 of the 120 that can be quoted are shown; 8 more are counted, not quoted here.')
    expect(openedNamedNote({ quotable: 120, named: 120 })).toBe('The first 50 of the 120 that can be quoted are shown.')
    // As drawn: a card whose printable comments are fewer than its count.
    const d = PRODUCTS_LEVEL_FIXTURES.sealinx()
    const v = d.product!.evidence.videos[0]
    const fewer = { ...d, product: { ...d.product!, evidence: { ...d.product!.evidence, videos: [{ ...v, named: 14, quotable: 9, quotes: v.quotes.slice(0, 3) }] } } }
    const t = renderText(page(fewer))
    expect(t).toContain('14 comments name it, of 148 on the video')
    expect(t).toContain('Show 9 of 14 comments')
    expect(t).not.toMatch(/Show all 9/)
    assertCopyContract(page(fewer))
    const opened = { ...fewer, product: { ...fewer.product, evidence: { ...fewer.product.evidence, videos: [{ ...fewer.product.evidence.videos[0], open: true }] } } }
    expect(renderText(page(opened))).toContain('The other 5 are counted, not quoted here. Show fewer comments')
  })

  it('a video named only in its own words says so', () => {
    expect(renderText(page(PRODUCTS_LEVEL_FIXTURES['sealinx-all']()))).toContain(NAMED_IN_VIDEO_ONLY)
  })

  it('a quiet month (Thin, frame 1): no video, one last month and the way to it, the facts in one line each', () => {
    const q = renderText(page(PRODUCTS_LEVEL_FIXTURES['quiet-product']()))
    expect(q).toContain('October so far · named in no video · 1 in September')
    expect(q).toContain('Nobody in your market named it in October so far. Where it was named No video in October so far No video named it in October so far. One did in September. See September →')
    expect(q.match(new RegExp(QUIET_FACT, 'g'))).toHaveLength(4)
    expect(q).toContain('Its place in feet · of 14 Proprio Foot 0 Your other feet 1')
  })

  it('a first month wears its flag', () => {
    expect(render(page(PRODUCTS_LEVEL_FIXTURES.navii()))).toContain('data-flag="new"')
  })
})

describe('the states around the two levels', () => {
  it('switched off keeps the path, the title and the list with no count, and says so (Thin, frame 2)', () => {
    const off = renderText(page(PRODUCTS_LEVEL_FIXTURES['not-on']()))
    expect(off).toContain(`Your products / Liners Your products Category Liners 10 products in Liners ${PRODUCTS_NOT_ON} Review your products in Settings →`)
    expect(off).toContain('All 10 of your liners Each opens as its own page. Product Videos Iceross Seal-In X Not read yet')
    expect(render(page(PRODUCTS_LEVEL_FIXTURES['not-on']()))).not.toContain('aria-label="Month"')
    const product = renderText(page(PRODUCTS_LEVEL_FIXTURES['not-on-product']()))
    expect(product).toContain(`Product in Liners Iceross Seal-In X In Liners ${PRODUCTS_NOT_ON}`)
    expect(product).toContain('Your other liners')
    expect(product).not.toMatch(/Iceross Seal-In X Not read yet/)
  })

  it('a month not read keeps the frame and the switch', () => {
    const u = renderText(page(PRODUCTS_LEVEL_FIXTURES.unread()))
    expect(u).toContain('Your products have not been read for October yet.')
    expect(render(page(PRODUCTS_LEVEL_FIXTURES.unread()))).toContain('aria-label="Month"')
  })

  it('an address the catalogue does not hold: one calm line and the way back, never a 404', () => {
    expect(renderText(page(PRODUCTS_LEVEL_FIXTURES.missing()))).toBe(`Your products ${CATEGORY_MISSING} Back to Your products →`)
    expect(renderText(page(PRODUCTS_LEVEL_FIXTURES['missing-product']()))).toBe(`Your products ${PRODUCT_MISSING} Back to Your products →`)
    expect(renderText(page(PRODUCTS_LEVEL_FIXTURES.sealand()))).toBe(`Your products ${PRODUCTS_NO_CATALOGUE} Add your products in Settings →`)
  })

  it('the product fixture builds its own page, not a redirect', () => {
    expect(productFixture().redirect).toBeNull()
  })
})
