import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { bandVerdict } from '@/lib/reading/verdicts'
import { ossurLinersFixture, ossurNaviiFixture, ossurProductsFixture, ossurSealInXFixture, PRODUCT_IDS, PRODUCTS_FIXTURES } from '@/lib/pages/v2/products-fixture'
import type { CategoryPanel, GapStandout, ProductPanel } from '@/lib/pages/v2/products'
import { PRODUCT_TAG_COPY } from '@/lib/products/tags'
import { CatalogueCard, shelfColumn } from './shelf'
import { shareWords, StandoutCard, Standouts } from './standouts'
import { CategoryPanelView, ProductPanelView } from './panels'

// Every block of Your products, rendered statically against the copy
// contract and the board's words (depth v2, T5).

const d = ossurProductsFixture()

describe('the standouts (E4-Products, the four cards)', () => {
  it('each card says only what code counted: no model prose, no quote, no weekly word, every number marked', () => {
    const node = <Standouts standouts={d.standouts} monthName={d.monthName} />
    const text = renderText(node)
    expect(text).toContain('Navii came up for the first time 3 videos in September')
    expect(text).toContain('2 of its 3 videos are about Function & movement.')
    expect(text).toContain('Hands talk is mostly about hands in general Hands in general 98 of 110 · 89% One of yours 12 of 110 · 11%')
    // What is counted: videos naming it with praise in their comments, about anything.
    expect(text).toContain('Praise in the comments Feet Almost every Flex-Foot Cheetah video has praise in its comments 7 of its 9 videos Videos that name it with praise in their comments, about it or about anything else in the video.')
    expect(text).not.toMatch(/is praised|said it worked/)
    expect(text).toContain('Rheo Knee talk is mostly about Cost & access 5 of its 7 videos')
    expect(text.match(/Open →/g)).toHaveLength(4)
    expect(render(node)).not.toContain('data-copy="quote"')
    expect(text).not.toMatch(/this week|rising|usual/i)
    assertCopyContract(node)
  })

  it('the first month is the flag chip, a verdict node fed by its verdict, over the months read', () => {
    const m = render(<StandoutCard s={d.standouts[0]} monthName="September" />)
    expect(m).toContain('data-flag="new"')
    expect(m).toMatch(/aria-label="Videos naming Navii each month, June to September: none until September, then 3\."/)
  })

  it('the gap card, where its band clears, words the pair in the direction the verdict gives', () => {
    const verdict = bandVerdict({
      objectKind: 'product', objectId: PRODUCT_IDS.sealInX(), objectLabel: 'Iceross Seal-In X · Sweat and heat', audience: 'market',
      window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' }, value: { k: 12, n: 120 }, baseline: { k: 150, n: 400 },
    })
    const s: GapStandout = {
      kind: 'gap', open: { kind: 'group', id: PRODUCT_IDS.liners() }, href: '/dashboard/products?group=x#category-panel', name: 'Liners', where: 'Liners',
      subject: 'Sweat and heat', category: { k: 150, n: 400 }, product: { name: 'Iceross Seal-In X', k: 12, n: 120 }, verdict,
    }
    expect(verdict.state).toBe('moved')
    const node = <StandoutCard s={s} monthName="September" />
    expect(renderText(node)).toContain('Sweat and heat is a liners matter, not a Iceross Seal-In X one All liners 150 of 400 · 38% Iceross Seal-In X 12 of 120 · 10%')
    expect(render(node)).toContain('data-copy="verdict"')
    assertCopyContract(node)
  })

  it('words a share from the level alone', () => {
    expect([shareWords(9, 9), shareWords(7, 9), shareWords(5, 9)]).toEqual(['Every', 'Almost every', 'Most'])
  })

  it('draws nothing where nothing stood out', () => {
    expect(render(<Standouts standouts={[]} monthName="September" />)).toBe('')
  })
})

describe('the catalogue (E4-Products, "Your catalogue")', () => {
  it('every category a column and every product a tile shaded by its videos, the quiet ones dashed', () => {
    const node = <CatalogueCard data={d} />
    const m = render(node)
    expect(m.match(/data-column=/g)).toHaveLength(6)
    expect(m).toContain('data-tone="3"')
    expect(m).toContain('data-tone="0"')
    expect(m).toContain('xl:grid-cols-6')
    const text = renderText(node)
    expect(text).toContain('Liners 117 videos 14% of the market no clear change')
    expect(text).toContain('Fit & comfort leads, 70 of 117')
    expect(text).toContain('Couldn’t tell which · 21')
    expect(text).toContain('Counted on every video in your market, including creators’ videos about Össur')
    assertCopyContract(node)
  })

  it('a column\'s head prints its verdict only where it is an answer, and a quiet column says so', () => {
    const hands = shelfColumn(d.shelf.find((c) => c.name === 'Hands')!, 'September')
    expect(renderText(<>{hands.line}</>)).toMatch(/^13% of the market ▲ 4\.3 pts/)
    const sockets = shelfColumn(d.shelf.find((c) => c.name === 'Sockets & Locks')!, 'September')
    expect(renderText(<>{sockets.line}</>)).toBe('1% of the market')
    const quiet = shelfColumn({ ...d.shelf[0], videos: 0, lead: null }, 'September')
    expect(renderText(<>{quiet.line}</>)).toBe('Quiet in September')
    expect(quiet.note).toBeNull()
  })

  it('wears the ring on the open category\'s head, the product\'s category where a product is open', () => {
    expect(render(<CatalogueCard data={ossurLinersFixture()} />)).toMatch(/aria-current="true"[^>]*ring-2 ring-foreground/)
    const product = ossurSealInXFixture()
    expect(product.shelf.find((c) => c.selected)?.name).toBe('Liners')
  })
})

describe('a category\'s panel (E4-Products-Liners)', () => {
  const open = ossurLinersFixture()
  const panel = open.panel as CategoryPanel

  it('the split, what it is about, what people did, the month line, the comparison, the list, Ask and Settings', () => {
    const node = <CategoryPanelView panel={panel} monthName="September" canTag />
    const text = renderText(node)
    expect(text).toContain('Category 14% of the market no clear change')
    expect(text).toContain('10 of your products · 4 came up in September')
    expect(text).toContain('117 of 839 videos talk about liners 18 name one of your products 21 are about one of yours, but we couldn’t tell which 78 are about liners in general, none of yours named')
    expect(text).toContain('What it’s about · of 117 Fit & comfort')
    expect(text).toContain('What people did · of 117 Complained about something')
    expect(text).toContain('Share of the market, month by month')
    expect(text).toContain('Your products against liners in general')
    expect(text).toContain('Too few videos on any one product to call a difference from the category yet.')
    expect(text).toContain('About one of your products, but we couldn’t tell which · 21 videos')
    expect(text).toContain('“This liner gave me a rash after a week, back to my old one now.” TikTok · 29 Sep · video by @stepbystep.amp Watch the video Tag the product')
    expect(text).toContain('1 more comment we do not quote here.')
    expect(text).toContain('See all 6 →')
    expect(text).toContain('Ask the Agent about liners')
    expect(text).toContain('Edit Liners in Settings →')
    expect(render(node)).toContain('data-tag-control="closed"')
    assertCopyContract(node)
  })

  it('draws no Tag control for a reader who may not tag, and says who can', () => {
    const member = PRODUCTS_FIXTURES['ossur-liners-member']().panel as CategoryPanel
    const node = <CategoryPanelView panel={member} monthName="September" canTag={false} />
    expect(render(node)).not.toContain('data-tag-control')
    expect(renderText(node)).not.toContain('Tag the product')
    expect(renderText(node)).toContain(PRODUCT_TAG_COPY.role)
    assertCopyContract(node)
  })

  it('a video\'s own words are a line too, with no quote', () => {
    const all = PRODUCTS_FIXTURES['ossur-liners-all']().panel as CategoryPanel
    const text = renderText(<CategoryPanelView panel={all} monthName="September" canTag />)
    expect(text).toContain('The video itself names one of your products here. YouTube · 15 Sep · video by @amputee.life')
    expect(text).not.toContain('See all')
  })

  it('leaves the list out where no video is about one of yours without saying which', () => {
    const node = <CategoryPanelView panel={{ ...panel, unclear: { ...panel.unclear, videos: 0, lines: [] } }} monthName="September" canTag />
    expect(render(node)).not.toContain('id="unclear"')
  })
})

describe('a product\'s panel', () => {
  it('its videos against the market and its category, what it is about, its month by month, its comments', () => {
    const panel = ossurSealInXFixture().panel as ProductPanel
    const node = <ProductPanelView panel={panel} monthName="September" />
    const text = renderText(node)
    expect(text).toContain('Product Liners Iceross Seal-In X 9 videos in September')
    expect(text).toContain('9 of 839 videos in your market name it 9 of 117 videos about liners name it 6 of 9 are about Fit & comfort')
    expect(text).toContain('Share of the market naming it, month by month 1.0% Jun 4 of 410 1.0% Jul 5 of 520 1.0% Aug 6 of 612 1.1% Sep 9 of 839')
    expect(text).toContain('Iceross Seal-In X against liners in general')
    expect(text).toContain('In their words · 3 comments naming it in September')
    expect(render(node).match(/data-copy="quote"/g)).toHaveLength(3)
    assertCopyContract(node)
  })

  it('a first month wears its flag; a quiet product says so and draws no stats', () => {
    const navii = ossurNaviiFixture().panel as ProductPanel
    expect(render(<ProductPanelView panel={navii} monthName="September" />)).toContain('data-flag="new"')
    const quiet = { ...navii, videos: 0, flag: null, crosses: null, quotes: [] }
    const node = <ProductPanelView panel={quiet} monthName="September" />
    expect(renderText(node)).toContain('Nobody in your market named it in September.')
    expect(render(node)).not.toContain('videos in your market name it')
    assertCopyContract(node)
  })
})

describe('the fresh check\'s fixes, as drawn', () => {
  it('the gap card\'s eyebrow says which side carries the subject', () => {
    const v = bandVerdict({
      objectKind: 'product', objectId: PRODUCT_IDS.sealInX(), objectLabel: 'x', audience: 'market',
      window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' }, value: { k: 80, n: 120 }, baseline: { k: 150, n: 400 },
    })
    const s: GapStandout = {
      kind: 'gap', open: { kind: 'group', id: PRODUCT_IDS.liners() }, href: '/dashboard/products?group=x#category-panel', name: 'Liners', where: 'Liners',
      subject: 'Grip', category: { k: 150, n: 400 }, product: { name: 'Iceross Seal-In X', k: 80, n: 120 }, verdict: v,
    }
    const text = renderText(<StandoutCard s={s} monthName="September" />)
    expect(text).toContain('You, more than the category')
    expect(text).toContain('Grip stands out on Iceross Seal-In X')
    expect(text).not.toContain('Category, not you')
    assertCopyContract(<StandoutCard s={s} monthName="September" />)
  })

  it('a product not read yet says so, never that nobody named it', () => {
    const panel = { ...(ossurNaviiFixture().panel as ProductPanel), videos: null, flag: null, crosses: null, quotes: [] }
    const node = <ProductPanelView panel={panel} monthName="September" />
    const text = renderText(node)
    expect(text).toContain('Not read yet for September: it was not in your list when September was last read.')
    expect(text).not.toContain('Nobody in your market named it')
    expect(render(node)).not.toContain('videos in your market name it')
    assertCopyContract(node)
  })

  it('the month line outlines the reading month (the board\'s "so far" bar), never the orange; a catalogue change is footnoted', () => {
    const panel = ossurLinersFixture().panel as CategoryPanel
    const m = render(<CategoryPanelView panel={panel} monthName="September" canTag />)
    expect(m).not.toContain('data-bar="picked"')
    expect(m.match(/data-filling=""/g)).toHaveLength(1)
    const changed = { ...panel, line: panel.line.map((b, i) => ({ ...b, version: i < 2 ? 'pc1_a' : 'pc1_b' })) }
    expect(renderText(<CategoryPanelView panel={changed} monthName="September" canTag />)).toContain('Your product list changed before August: the months before it were read on the earlier list.')
  })

  it('the comparison sets each product\'s own largest subject in weight (the board\'s bold cells)', () => {
    const m = render(<CategoryPanelView panel={ossurLinersFixture().panel as CategoryPanel} monthName="September" canTag />)
    expect(m.match(/font-semibold">\d+ of \d+</g)?.length).toBeGreaterThanOrEqual(3)
  })
})
