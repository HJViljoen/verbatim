import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { bandVerdict } from '@/lib/reading/verdicts'
import { ossurLinersFixture, ossurNaviiFixture, ossurProductsFixture, ossurSealInXFixture, ossurTodayFixture, PRODUCT_IDS, PRODUCTS_FIXTURES } from '@/lib/pages/v2/products-fixture'
import { SHELF_TILES, type CategoryPanel, type FocusStandout, type GapStandout, type ProductPanel } from '@/lib/pages/v2/products'
import { PRODUCT_TAG_COPY } from '@/lib/products/tags'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { CatalogueCard, CatalogueFrame, shelfColumn } from './shelf'
import { emptyTitle, shareWords, StandoutCard, StandoutFrames, Standouts, SQUARES_MAX } from './standouts'
import { CategoryPanelView, ProductPanelView } from './panels'

// Every block of Your products, rendered statically against the copy
// contract and the board's words (depth v2, T5).

const d = ossurProductsFixture()

describe('the standouts (E4-Products, the four cards)', () => {
  it('each card says only what code counted: no model prose, no quote, no weekly word, every number marked', () => {
    const node = <Standouts slots={d.slots} monthName={d.monthName} />
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

  it('draws nothing where the page has no places (a state that reads no month draws the frames)', () => {
    expect(render(<Standouts slots={[]} monthName="September" />)).toBe('')
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
    // The verdict on its own line under the share (the board's "▲ from 14%"),
    // never run on after "of the market" as one phrase.
    expect(render(<>{hands.line}</>)).toMatch(/of the market<span data-copy="verdict" class="[^"]*\bblock\b/)
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
    expect(text).toContain('What people did · of 117 Complaints in the comments')
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

  it('keeps the list\'s place where no video is about one of yours without saying which, and says so once (the parity pass)', () => {
    const node = <CategoryPanelView panel={{ ...panel, unclear: { ...panel.unclear, videos: 0, lines: [] } }} monthName="September" canTag />
    expect(render(node)).toContain('id="unclear"')
    expect(renderText(node)).toContain('About one of your products, but we couldn’t tell which · 0 videos No video about liners in September was about one of yours without saying which.')
    expect(renderText(node)).not.toContain('Tag the product')
    assertCopyContract(node)
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

  it('says where a kind was found, never that people did it to the product ("Praised it" overclaims)', () => {
    // A kind's count is the product's videos with that kind anywhere in their
    // comments, about it or about anything else in the video.
    const panel = ossurSealInXFixture().panel as ProductPanel
    const text = renderText(<ProductPanelView panel={panel} monthName="September" />)
    expect(text).toMatch(/What people did · of 9 (Praise|Questions|Complaints|Talk of buying|Pushback) in the comments/)
    for (const shared of ['Praised it', 'Praised a', 'Asked a question', 'Complained about something', 'Said they want to buy', 'Pushed back']) {
      expect(text).not.toContain(shared)
    }
  })

  it('a first month wears its flag; a quiet product says so, its stats are read zeros (the parity pass)', () => {
    const navii = ossurNaviiFixture().panel as ProductPanel
    expect(render(<ProductPanelView panel={navii} monthName="September" />)).toContain('data-flag="new"')
    const quiet = { ...navii, videos: 0, comments: 0, flag: null, crosses: null, quotes: [] }
    const node = <ProductPanelView panel={quiet} monthName="September" />
    const text = renderText(node)
    expect(text).toContain('Nobody in your market named it in September.')
    expect(text).toContain('0 of 839 videos in your market name it 0 of 76 videos about knees name it 0 comments name it 52 of 76 are about knees in general, none of yours named')
    expect(text).toContain('In their words No comment named it in September.')
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

// THE PARITY PASS (13 Oct night): every state keeps the board's shape. The
// four places are always drawn, with what the month can honestly show.
describe('the four places, in production\'s thin state', () => {
  it('Össur today: the first place under the floor, then the three picks; four cards, each with its visual', () => {
    const d = PRODUCTS_FIXTURES['ossur-today']()
    const node = <Standouts slots={d.slots} monthName={d.monthName} />
    const m = render(node)
    expect(m.match(/<article /g)).toHaveLength(4)
    expect([...m.matchAll(/data-standout="([a-z]+)" data-tier="([a-z]+)"/g)].map((x) => `${x[1]}:${x[2]}`)).toEqual(['first:next', 'general:pick', 'praised:pick', 'focus:none'])
    const text = renderText(node)
    // Under the floor: the words "New", but no flag chip (one video earns no flag).
    expect(text).toContain('New Feet Proprio Foot came up for the first time 1 video in September')
    expect(text).toContain('Also new in September: Pro-Flex Terra, Total Knee 2000 and Rebound Post-Op Knee.')
    expect(m).not.toContain('data-flag="new"')
    expect(text).toContain('Hands talk is mostly about hands in general Hands in general 59 of 60 · 98% One of yours 1 of 60 · 2%')
    expect(text).toContain('Most Feet videos have praise in their comments 16 of its 29 videos')
    // Össur's subjects are provisional (ruling U6): the subject place names
    // none and prints no figure.
    expect(text).toContain('Worth a look What one product’s talk is about Not measured yet')
    expect(text).not.toMatch(/mostly about Fit|most often about/)
    // Past SQUARES_MAX the marks are one bar the board's row long.
    expect(m).toContain('data-units="16/29"')
    expect(m.match(/data-units="16\/29"[^>]*><i /)).toBeTruthy()
    expect(text.match(/Open →/g)).toHaveLength(3)
    expect(m).not.toContain('data-copy="quote"')
    assertCopyContract(node)
    // Once the subjects' checks pass, the subject place is the board's card.
    const calibrated = ossurTodayFixture({ calibrated: true })
    const after = renderText(<Standouts slots={calibrated.slots} monthName={calibrated.monthName} />)
    expect(after).toContain('Liners talk is mostly about Fit & comfort 12 of its 23 videos')
    expect(after.match(/Open →/g)).toHaveLength(4)
  })

  it('the thin state: nothing new (the strip, hollow, and the newest on the shelf), the praise and the subject under half, worded for it', () => {
    const d = PRODUCTS_FIXTURES['ossur-thin']()
    const node = <Standouts slots={d.slots} monthName={d.monthName} />
    const text = renderText(node)
    // Every dot of a short strip is named.
    expect(text).toContain('New Nothing came up for the first time in September Jun Jul Aug Sep Newest on your shelf: Proprio Foot, first named in August. Open →')
    expect(render(node)).toContain('aria-label="No product came up for the first time in September."')
    expect(text).toContain('Feet videos with praise in their comments 12 of its 29 videos')
    expect(text).not.toMatch(/Most Feet videos/)
    expect(text).toContain('Worth a look What one product’s talk is about Not measured yet')
    expect(render(node).match(/<article /g)).toHaveLength(4)
    const calibrated = ossurTodayFixture({ thin: true, calibrated: true })
    expect(renderText(<Standouts slots={calibrated.slots} monthName={calibrated.monthName} />)).toContain('Bracing & Supports talk is most often about Fit & comfort 5 of its 12 videos')
    assertCopyContract(node)
  })

  it('an empty place keeps its eyebrow, its visual (empty) and one line; it opens nothing', () => {
    const d = ossurTodayFixture({ over: { crosses: new Map() } })
    const node = <Standouts slots={d.slots} monthName={d.monthName} />
    const text = renderText(node)
    expect(text).toContain('Praise in the comments Not read for September yet')
    expect(text).toContain('Worth a look Not read for September yet')
    expect(text.match(/Open →/g)).toHaveLength(2)
    expect(emptyTitle({ slot: 'praised', reason: 'quiet' }, 'September')).toBe('No praise in the comments to show for September')
    expect(emptyTitle({ slot: 'category' }, 'September')).toBe('No category came up in September')
    assertCopyContract(node)
  })

  it('the frames for a page that reads no month: the four eyebrows, what each will show, no number and no link', () => {
    const node = <StandoutFrames />
    const text = renderText(node)
    expect(text).toBe('New A product’s first month Category, not you A category against your products in it In general One of yours Praise in the comments Praise in the comments on a product Worth a look What one product’s talk is about')
    expect(render(node)).not.toContain('href=')
    expect(render(node)).not.toContain('data-copy="figure"')
    assertCopyContract(node)
  })

  it('squares up to two of the board\'s rows', () => {
    expect(SQUARES_MAX).toBe(18)
  })
})

describe('the catalogue card where no month is read', () => {
  it('no catalogue: the board\'s card, its one line and the way on, over the shelf\'s empty shape', () => {
    const node = <CatalogueFrame data={PRODUCTS_FIXTURES.sealand()} link="Add your products in Settings" />
    const text = renderText(node)
    expect(text).toContain('Your catalogue Add the products you sell')
    expect(text).toContain('Add your products in Settings →')
    expect(render(node)).toContain('data-empty-shelf=""')
    expect(render(node)).not.toContain('data-column=')
    assertCopyContract(node)
  })

  it('a catalogue not read: every category a column, "Not read yet" once a column, every tile its name alone', () => {
    const node = <CatalogueFrame data={PRODUCTS_FIXTURES['not-on']()} link="Review your products in Settings" />
    const m = render(node)
    expect(m.match(/data-column=/g)).toHaveLength(6)
    expect(renderText(node).match(/Not read yet/g)).toHaveLength(6)
    expect(renderText(node)).not.toContain('not read yet')
    assertCopyContract(node)
  })
})

describe('ruling U6, as drawn: a provisional subject prints its name and "Not measured yet", never a figure', () => {
  it('the shelf heads: no "leads", no subject count; one line where the lead would be', () => {
    const d = PRODUCTS_FIXTURES['ossur-today']()
    const text = renderText(<CatalogueCard data={d} />)
    expect(text).not.toMatch(/ leads,/)
    expect(text.match(/What it’s about · Not measured yet/g)).toHaveLength(6)
    assertCopyContract(<CatalogueCard data={d} />)
    // Some ready, some not: the ready one's level, but not "leads" over the rest.
    const partial = { ...d.shelf[0], lead: { label: 'Fit & comfort', k: 12 }, subjectsPending: true, leads: false }
    expect(renderText(<>{shelfColumn(partial, 'September').note}</>)).toBe('Fit & comfort, 12 of 23')
    expect(renderText(<>{shelfColumn({ ...partial, subjectsPending: false, leads: true }, 'September').note}</>)).toBe('Fit & comfort leads, 12 of 23')
  })

  it('the panel: each subject by name with "Not measured yet" where its bar and count would be; the comparison keeps its rows, every cell empty', () => {
    const panel = PRODUCTS_FIXTURES['ossur-today-liners']().panel as CategoryPanel
    const node = <CategoryPanelView panel={panel} monthName="September" canTag />
    const text = renderText(node)
    expect(text).toContain('What it’s about · of 23 Choosing the right device Not measured yet Community & encouragement Not measured yet Cost & access Not measured yet Fit & comfort Not measured yet')
    expect(text).toContain('Your products against liners in general What it’s about All liners Iceross Seal-In X Iceross Dermo Iceross Seal-In V Choosing the right device · Not measured yet · Not measured yet')
    expect(text).not.toContain('– none')
    expect(text).toContain('What these videos are about: Not measured yet. A subject is counted here once its check has passed.')
    expect(text).not.toContain('Each count is videos')
    // Kinds are not subjects: still counted.
    expect(text).toContain('What people did · of 23 Complaints in the comments 11')
    assertCopyContract(node)
  })
})

describe('the fresh check\'s fixes on the parity pass, as drawn', () => {
  const focus = (over: Partial<FocusStandout>): FocusStandout => ({
    kind: 'focus', open: { kind: 'group', id: 'g' }, href: '/dashboard/products?group=g#category-panel', name: 'Bracing & Supports', where: 'Bracing & Supports',
    subject: 'Fit & comfort', level: { k: 5, n: 12 }, ranked: true, ...over,
  })

  it('the subject card says a rank only where the subject leads outright; otherwise the level alone', () => {
    const ranked = renderText(<StandoutCard s={focus({})} monthName="September" tier="next" />)
    expect(ranked).toContain('Bracing & Supports talk is most often about Fit & comfort 5 of its 12 videos')
    expect(ranked).toContain('More than any other subject in its videos.')
    // A tie, or a pending subject beside it: no "most often", no "more than any other".
    const level = renderText(<StandoutCard s={focus({ ranked: false })} monthName="September" tier="next" />)
    expect(level).toContain('Bracing & Supports videos about Fit & comfort 5 of its 12 videos')
    expect(level).not.toMatch(/most often|more than any other/i)
    // The pick's "mostly" is its level (half or more); the rank still needs `ranked`.
    const pick = renderText(<StandoutCard s={focus({ ranked: false, level: { k: 7, n: 12 } })} monthName="September" tier="pick" />)
    expect(pick).toContain('Bracing & Supports talk is mostly about Fit & comfort 7 of its 12 videos')
    expect(pick).not.toMatch(/more than any other/i)
    assertCopyContract(<StandoutCard s={focus({ ranked: false })} monthName="September" tier="next" />)
  })

  it('the shelf keeps the board\'s height: eight tiles, the most videos first, then "+N more" into the category\'s panel', () => {
    const d = PRODUCTS_FIXTURES['ossur-today']()
    const feet = d.shelf.find((c) => c.name === 'Feet')!
    expect(feet.products).toHaveLength(20)
    const col = shelfColumn(feet, 'September')
    expect(col.products).toHaveLength(SHELF_TILES)
    expect(col.products.slice(0, 3).map((p) => p.name)).toEqual(['Pro-Flex XC', 'Proprio Foot', 'Pro-Flex Terra'])
    expect(col.more).toEqual({ count: 12, href: feet.href })
    const m = render(<CatalogueCard data={d} />)
    // Liners (10), Feet (20), Knees (10) and Bracing & Supports (15).
    expect(m.match(/data-more=""/g)).toHaveLength(4)
    expect(renderText(<CatalogueCard data={d} />)).toContain('Pro-Flex LP Align – no videos + 12 more →')
    // A column at the cap or under it has no "more".
    expect(shelfColumn(d.shelf.find((c) => c.name === 'Hands')!, 'September').more).toBeNull()
    assertCopyContract(<CatalogueCard data={d} />)
  })
})

// A TRACKED SUBJECT IS NEVER HIDDEN (Heinrich, 14 Oct): a category's panel
// lists every active subject, the ready ones counted (a thin one's small
// count, one on none of its videos at 0), then those whose check has not
// passed by name, a failed one with its own reason and no figure.
describe('Your products: a tracked subject is never hidden (14 Oct)', () => {
  const base = PRODUCTS_FIXTURES['ossur-liners']().panel as CategoryPanel
  const crosses = {
    ...base.crosses!,
    subjects: [{ id: 's-fit', label: 'Fit & comfort', k: 12 }, { id: 's-look', label: 'Look & style', k: 1 }],
    quiet: [{ id: 's-function', label: 'Function & movement' }],
    pending: [{ id: 's-cost', label: 'Cost & access', state: 'provisional' as const }, { id: 's-community', label: 'Community & encouragement', state: 'failed' as const }],
  }
  const panel: CategoryPanel = { ...base, crosses }

  it('lists every subject: counted, thin, at 0, not measured yet, and being re-described with its reason', () => {
    const node = <CategoryPanelView panel={panel} monthName="September" canTag={false} />
    const text = renderText(node)
    expect(text).toContain(`What it’s about · of ${crosses.n} Fit & comfort 12 Look & style 1 Function & movement 0 Cost & access ${SUBJECT_NOT_MEASURED} Community & encouragement ${FAILED_EXPLAINED}`)
    const html = render(node)
    const at = html.indexOf('data-subject-failed')
    const row = html.slice(at, html.indexOf('</div>', at))
    expect(row).toContain('Community &amp; encouragement')
    expect(row).not.toMatch(/data-copy=/)
    assertCopyContract(node)
  })

  it('more than six subjects: every one is listed, none cut for being small', () => {
    const many = { ...crosses, subjects: Array.from({ length: 8 }, (_, i) => ({ id: `s-${i}`, label: `Subject ${i + 1}`, k: 9 - i })), quiet: undefined, pending: undefined }
    const text = renderText(<CategoryPanelView panel={{ ...base, crosses: many }} monthName="September" canTag={false} />)
    for (let i = 1; i <= 8; i++) expect(text).toContain(`Subject ${i} `)
  })

  it('the comparison, with no ready subject: a row being re-described says so in its cells and once under the table', () => {
    const compare = {
      columns: [{ key: 'g', label: 'All liners', tone: 'market' as const }, { key: 'p', label: 'Iceross Comfort', tone: 'you' as const }],
      rows: [
        { key: 's-cost', label: 'Cost & access', cells: [null, null] },
        { key: 's-community', label: 'Community & encouragement', cells: [null, null], failed: true },
      ],
      verdicts: [],
      empty: 'pending' as const,
    }
    const node = <CategoryPanelView panel={{ ...base, compare }} monthName="September" canTag={false} />
    const text = renderText(node)
    expect(text).toContain(`A subject is counted here once its check has passed. Community & encouragement: ${FAILED_EXPLAINED}`)
    const html = render(node)
    expect(html).toContain(`<span class="sr-only">${FAILED_EXPLAINED}</span>`)
    expect(html).toContain(`<span class="sr-only">${SUBJECT_NOT_MEASURED}</span>`)
    assertCopyContract(node)
  })
})
