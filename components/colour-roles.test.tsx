import { describe, expect, it } from 'vitest'
import { Hash } from 'lucide-react'
import { render, renderText } from '@/lib/test/render'
import { BAR_FILL, BrandChip, ChipSep, EYEBROW, IconTile, KIND_ICON, NewNumber, SELECTED, TAG } from './colour-roles'
import { DashboardPage } from './pages/v2/home'
import { dashboardFixture } from '@/lib/pages/v2/home-fixture'
import { MarketPage } from './pages/v2/market'
import { marketFixture } from '@/lib/pages/v2/market-fixture'
import { VoicesPage } from './pages/v2/voices'
import { VOICES_FIXTURES } from '@/lib/pages/v2/voices-fixture'
import { VOICES_LEVEL_FIXTURES } from '@/lib/pages/v2/voices-levels-fixture'
import { VoicesBrandPage, VoicesCreatorPage, VoicesGroupPage } from './pages/v2/voices/pages'
import { ProductsPage } from './pages/v2/products'
import { PRODUCTS_FIXTURES } from '@/lib/pages/v2/products-fixture'
import { ContentPage } from './pages/v2/content'
import { contentFixture } from '@/lib/pages/v2/content-fixture'
import { MovesV2Page } from './pages/v2/moves'
import { movesFixture, movesOpenFixture, statementsV2 } from '@/lib/pages/v2/moves-fixture'
import { ProductsTab } from './pages/settings/products'
import { productsFixtureRead } from './pages/settings/products/fixture'
import { productSettingsView } from '@/lib/settings/products'
import { YourSubjectsTab } from './pages/settings/subjects'
import { subjectsFixtureRows } from './pages/settings/subjects/fixture'
import { yourSubjectsView } from '@/lib/settings/your-subjects'
import { MarketPicturePage } from './pages/overview/picture'
import { PICTURE_FIXTURE } from './pages/overview/picture/fixture'
import { VoiceSurfacePage } from './pages/voice-surface'
import { conversationFixture } from './pages/voice-surface/fixture-conversation'
import { CompetitivePage } from './pages/competitive-surface/page'
import { designFixture } from './pages/competitive-surface/page/fixture'

// The colour roles (colour pass, 1 Oct; MASTER.md §Colour roles): each colour
// one job, drawn through ./colour-roles. These pin the jobs, and the bans that
// came with more colour, on the pages' own fixtures.

describe('the colour roles', () => {
  it('fills a bar by whose videos it counts: the market yellow, you gold, a rival grey, the second series orange', () => {
    expect(BAR_FILL).toEqual({ market: 'bg-brand', you: 'bg-you', rival: 'bg-comp', second: 'bg-orange' })
  })

  it('labels in the orange text, selects and tags in the pale yellow', () => {
    expect(EYEBROW).toContain('text-orange-text')
    expect(SELECTED).toBe('bg-accent text-accent-foreground')
    expect(TAG).toBe('bg-accent text-accent-foreground')
  })

  it('draws you as a gold chip with white words and a rival as a chip with the grey dot, never wrapping inside one', () => {
    const you = render(<BrandChip who="you">Sealand</BrandChip>)
    expect(you).toContain('bg-you')
    expect(you).toContain('text-you-foreground')
    expect(you).toContain('whitespace-nowrap')
    const rival = render(<BrandChip who="rival">Cotopaxi</BrandChip>)
    expect(rival).toContain('bg-track')
    expect(rival).toMatch(/<span aria-hidden="true" class="[^"]*bg-comp[^"]*"><\/span>Cotopaxi/)
    // Shorter than the line it sits in, so it never grows one.
    for (const m of [you, rival]) expect(m).toContain('leading-none')
  })

  it('keeps the separator between chips for the words, and does not draw it', () => {
    expect(renderText(<>A<ChipSep />B</>)).toBe('A · B')
    expect(render(<ChipSep />)).toContain('<span class="sr-only">·</span>')
  })

  it('draws an icon tile as decoration, on the pale yellow under the orange text, taking no height', () => {
    const m = render(<IconTile icon={Hash} />)
    expect(m).toContain('aria-hidden="true"')
    expect(m).toContain('bg-accent text-orange-text')
    expect(m).toContain('-my-[5px] size-7')
    expect(render(<IconTile icon={Hash} tone="brand" />)).toContain('bg-brand text-brand-foreground')
  })

  it('marks what is new with the orange fill and ink numerals (4.6 to 1), never orange words', () => {
    const m = render(<NewNumber n={2} />)
    expect(m).toContain('bg-orange')
    expect(m).toContain('text-brand-foreground')
    expect(m).not.toMatch(/text-orange(?!-text)/)
  })

  it('gives every kind of comment its own glyph', () => {
    for (const k of ['praise', 'purchase_intent', 'question', 'pain_point', 'feature_request', 'objection']) expect(KIND_ICON[k], k).toBeDefined()
  })
})

/** Palette A's colours as a page may write them out (scripts/check-design-drift.sh
 *  (e), the light block): ink, the muted words, white, the ground, the
 *  hairline, the track, the brand yellow, its pale, the text-safe orange, the
 *  orange, the gold, the rival grey and the sidebar's hover; and the boards'
 *  dashed add-chip edge (`#C9C6BE`, E8-Settings-Products' `.addc`). */
const PALETTE_A = new Set([
  '#26292C', '#5F656B', '#FFFFFF', '#F7F6F2', '#E4E2DC', '#ECEAE4', '#FFD43B', '#FFF4C7',
  '#C2410C', '#F2651D', '#9A6B00', '#8A9097', 'RGBA(38,41,44,0.07)', '#C9C6BE',
])

describe('the bans that hold with more colour, on the pages', () => {
  // [the page, its markup from its own fixture, whether it names a brand].
  // The 1 Oct pages still render stored snapshots; Design v2's eight are the
  // routed pages (integration, 13 Oct), each closed and with a panel open.
  const pages: [string, string, boolean][] = [
    ['your market (1 Oct)', render(<MarketPicturePage data={PICTURE_FIXTURE} />), true],
    ['conversation (1 Oct)', render(<VoiceSurfacePage data={conversationFixture()} params={{}} />), true],
    ['competitive (1 Oct)', render(<CompetitivePage data={designFixture()} />), true],
    // The Dashboard's Voices tile names brands ("Named most", Design v2).
    ['dashboard', render(<DashboardPage data={dashboardFixture()} />), true],
    ['market', render(<MarketPage data={marketFixture()} />), true],
    // This month closes with the month's long-run read (Heinrich, 13 Oct).
    ['market, this month with its long-run read', render(<MarketPage data={marketFixture({ period: 'month', closed: true, longRun: 'full' })} />), true],
    ['voices', render(<VoicesPage data={VOICES_FIXTURES.sealand()} />), true],
    // Voices' level pages (17 Oct): a brand's, a group's and a creator's.
    ['voices, a brand\'s page', render(<VoicesBrandPage data={VOICES_LEVEL_FIXTURES.brand()} />), false],
    ['voices, a group\'s page', render(<VoicesGroupPage data={VOICES_LEVEL_FIXTURES.group()} />), true],
    ['voices, a creator\'s page', render(<VoicesCreatorPage data={VOICES_LEVEL_FIXTURES.creator()} />), true],
    // Your products names the client's own products, never a brand by chip.
    ['your products', render(<ProductsPage data={PRODUCTS_FIXTURES.ossur()} />), false],
    ['your products, a category open', render(<ProductsPage data={PRODUCTS_FIXTURES['ossur-liners']()} />), false],
    ['your products, a product open', render(<ProductsPage data={PRODUCTS_FIXTURES['ossur-product']()} />), false],
    ['content', render(<ContentPage data={contentFixture()} />), false],
    ['content, an idea open', render(<ContentPage data={contentFixture({ open: { kind: 'idea', rank: 1 } })} />), false],
    ['your moves', render(<MovesV2Page data={movesFixture()} statements={statementsV2()} />), false],
    ['your moves, advice open', render(<MovesV2Page data={movesOpenFixture()} statements={statementsV2()} />), false],
    ['settings, your products', render(<ProductsTab view={productSettingsView(productsFixtureRead({}), { selected: null, canEdit: true })} />), false],
    ['settings, your subjects', render(<YourSubjectsTab view={yourSubjectsView(subjectsFixtureRows(), true)} />), false],
  ]

  it('puts no chip inside a sentence: a brand chip is a label on a brand line, never a marker in prose', () => {
    for (const [name, m, namesBrand] of pages) {
      if (namesBrand) expect(m, name).toContain('data-who-chip')
      // A paragraph, or any node of written prose, that holds a chip.
      expect(m, name).not.toMatch(/<p\b[^>]*>(?:(?!<\/p>)[\s\S])*data-who-chip/)
      expect(m, name).not.toMatch(/data-copy="(?:prose|stored)"[^>]*>[^<]*<[^>]*data-who-chip/)
    }
  })

  it('lays the pale yellow on small surfaces only: never a card, a paragraph or an article', () => {
    for (const [name, m] of pages) expect(m, name).not.toMatch(/<(?:section|article|p)\b[^>]*class="[^"]*\bbg-accent\b/)
  })

  it('lifts every card on the one card shadow, and an opened panel on its own token a step above', () => {
    for (const [name, m] of pages) {
      // A card is a section, or a v2 tile's article (the kit's `CARD`).
      const cards = m.match(/<(?:section|article)\b[^>]*class="[^"]*rounded-\[1[46]px\][^"]*"/g) ?? []
      expect(cards.length, name).toBeGreaterThan(0)
      for (const c of cards) {
        // The kit's `InPlacePanel` (`data-panel`) is `shadow-panel`; every
        // other card is `shadow-card`, and none is both.
        if (/\bdata-panel=""/.test(c)) {
          expect(c, name).toContain('shadow-panel')
          expect(c, name).not.toContain('shadow-card')
        } else {
          expect(c, name).toContain('shadow-card')
          expect(c, name).not.toContain('shadow-panel')
        }
      }
      // No shadow written out by hand, on a card or anything else.
      expect(m, name).not.toMatch(/\bshadow-\[/)
    }
  })

  it('never sets the orange as a text colour: words in orange are the text-safe #C2410C', () => {
    for (const [name, m] of pages) {
      expect(m, name).not.toMatch(/\btext-orange(?!-text)\b/)
      expect(m, name).not.toMatch(/\btext-\[#F2651D\]|color:\s*#F2651D/i)
    }
  })

  it('writes no colour of its own: every literal on a Design v2 page is palette A\'s', () => {
    for (const [name, m] of pages.slice(3)) {
      const literals = (m.match(/#[0-9A-Fa-f]{6}\b|rgba?\([^)]*\)/g) ?? []).map((c) => c.toUpperCase().replace(/\s+/g, ''))
      expect(literals.filter((c) => !PALETTE_A.has(c)), name).toEqual([])
    }
  })
})
