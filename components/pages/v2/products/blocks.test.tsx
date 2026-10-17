import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { bandVerdict } from '@/lib/reading/verdicts'
import { ossurProductsFixture, ossurTodayFixture, PRODUCT_IDS, PRODUCTS_FIXTURES } from '@/lib/pages/v2/products-fixture'
import { SHELF_TILES, type FocusStandout, type GapStandout } from '@/lib/pages/v2/products'
import { CatalogueCard, CatalogueFrame, shelfColumn } from './shelf'
import { emptyTitle, shareWords, StandoutCard, StandoutFrames, Standouts, SQUARES_MAX } from './standouts'

// Every block of Your products' root, rendered statically against the copy
// contract and the board's words (depth v2, T5). The level pages' blocks
// (17 Oct, the G4 boards) are ./levels.test.tsx's.

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
      kind: 'gap', open: { kind: 'group', id: PRODUCT_IDS.liners() }, href: '/dashboard/products/x', name: 'Liners', where: 'Liners',
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
    expect(text).toContain('Liners → 117 videos 14% of the market no clear change')
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

})

describe('the fresh check\'s fixes, as drawn', () => {
  it('the gap card\'s eyebrow says which side carries the subject', () => {
    const v = bandVerdict({
      objectKind: 'product', objectId: PRODUCT_IDS.sealInX(), objectLabel: 'x', audience: 'market',
      window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' }, value: { k: 80, n: 120 }, baseline: { k: 150, n: 400 },
    })
    const s: GapStandout = {
      kind: 'gap', open: { kind: 'group', id: PRODUCT_IDS.liners() }, href: '/dashboard/products/x', name: 'Liners', where: 'Liners',
      subject: 'Grip', category: { k: 150, n: 400 }, product: { name: 'Iceross Seal-In X', k: 80, n: 120 }, verdict: v,
    }
    const text = renderText(<StandoutCard s={s} monthName="September" />)
    expect(text).toContain('You, more than the category')
    expect(text).toContain('Grip stands out on Iceross Seal-In X')
    expect(text).not.toContain('Category, not you')
    assertCopyContract(<StandoutCard s={s} monthName="September" />)
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

})

describe('the fresh check\'s fixes on the parity pass, as drawn', () => {
  const focus = (over: Partial<FocusStandout>): FocusStandout => ({
    kind: 'focus', open: { kind: 'group', id: 'g' }, href: '/dashboard/products/g', name: 'Bracing & Supports', where: 'Bracing & Supports',
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

  it('the shelf keeps the board\'s height: eight tiles, the most videos first, then "+N more" into the category\'s page, which lists every product', () => {
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
    expect(renderText(<CatalogueCard data={d} />)).toContain('Pro-Flex LP Align no videos + 12 more →')
    // A column at the cap or under it has no "more".
    expect(shelfColumn(d.shelf.find((c) => c.name === 'Hands')!, 'September').more).toBeNull()
    assertCopyContract(<CatalogueCard data={d} />)
  })
})
