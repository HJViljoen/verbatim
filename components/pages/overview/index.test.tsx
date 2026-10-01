import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, figureConflicts, figureCount, mergeFigures, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { NUMBER_BUDGET, RIVAL_FIGURES_MAX, type OverviewData, type RivalRow, type SubjectRow } from '@/lib/pages/overview'
import { FRONT_PAGE_BLOCKS, MARKET_TITLES, OVERVIEW_BLOCKS, OverviewPage, TILE_BLOCKS, frontTile, horizonRange } from './index'
import { overviewPage } from './page'
import { FRONT_TILE_KEYS } from './tiles'
import DashboardLoading from '@/app/dashboard/(front)/loading'
import { SidebarTenant } from '@/components/sidebar-tenant-loader'
import { PAGES } from '@/components/pages/registry'
import { marketBeforeMakersFixture, marketFrontFixture, ossurFrontFixture, overviewFixture, refusedFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

const tablesOf = (data: OverviewData) => OVERVIEW_BLOCKS.map((b) => blockAnswers(b, data).figures)

/**
 * The busiest page a tenant can have: eight subjects (SUBJECTS_MAX) and, on
 * OV4, your own row, the category's, and as many rivals as a tenant likes —
 * nothing caps `tracking_configs.competitor_names`. The fixture carries TEN, so
 * the budget is asserted against a tenant rather than against a number that
 * happens to fit.
 *
 * `base.rivals.rows` is one rival and the client row, so the count below is
 * ten rivals, the client and the category.
 */
function fullHouse(): OverviewData {
  const base = overviewFixture()
  const subject = (i: number): SubjectRow => ({ ...base.subjects.rows[0], id: `s${i}`, label: `Subject ${i}` })
  const rival = (i: number): RivalRow => ({
    ...base.rivals.rows[0],
    audience: `competitor:Rival ${i}`,
    label: `Rival ${i}`,
    attention: { k: 1000 + i, n: 41200, pct: 2 + i },
  })
  // THE CATEGORY ROW IS THE FIXTURE'S OWN. It used to be synthesised here,
  // because the fixture carried none; now that it does, building a second one
  // put two rows under `industry-other` on one table, and the figures they
  // declare are keyed by audience — so the two collided and the cap silently
  // declared one fewer figure than it was asked for.
  return {
    ...base,
    subjects: { ...base.subjects, rows: Array.from({ length: 8 }, (_, i) => subject(i)) },
    rivals: { ...base.rivals, rows: [...Array.from({ length: 9 }, (_, i) => rival(i)), ...base.rivals.rows] },
  }
}

describe('the Overview’s blocks', () => {
  it('are the registry’s eleven, keyed stably: Phase 1’s six and the front page’s five new ones, and OV6 is not among them (25 Sep rulings)', () => {
    expect(OVERVIEW_BLOCKS.map((b) => b.key)).toEqual([
      'overview.bar', 'overview.sentence', 'overview.themes', 'overview.category', 'overview.asks',
      'overview.subjects', 'overview.rivals', 'overview.change', 'overview.moves', 'overview.foryou',
      // "With this update" (market-first WP2.7), which holds the weekly bars
      // (WP2.9): the front page adds no other key.
      'overview.arrivals',
    ])
    expect(OVERVIEW_BLOCKS.map((b) => b.key)).not.toContain('overview.record')
  })

  it('every one renders in all three modes, in every state, and keeps the copy contract', () => {
    for (const data of [overviewFixture(), refusedFixture(), marketFrontFixture(), marketBeforeMakersFixture(), ossurFrontFixture()]) {
      for (const block of OVERVIEW_BLOCKS) {
        for (const mode of MODES) {
          const node = block.render(data, mode, ctx)
          // T0a: a block with nothing true left to print is omitted. The one
          // that can be: What it means for you, where its only line rests on
          // a provisional subject (production's Waterproofing).
          if (node == null) {
            expect(block.key, `${block.key}/${mode}`).toBe('overview.foryou')
            continue
          }
          const markup = render(node)
          expect(markup.length).toBeGreaterThan(0)
          // No unsubstituted figure token ever reaches a reader — the defect
          // production found on an object id that begins with a digit.
          expect(markup, `${block.key}/${mode}`).not.toContain('[[')
          assertCopyContract(markup)
        }
      }
    }
  })

  it('every one either says something or says why it has nothing', () => {
    for (const data of [overviewFixture(), refusedFixture(), marketFrontFixture(), ossurFrontFixture()]) {
      for (const block of OVERVIEW_BLOCKS) {
        const empty = block.emptyState(data)
        if (empty != null) expect(empty.length).toBeGreaterThan(20)
      }
    }
  })

  it('links onward from every block that carries a shortcut', () => {
    const data = overviewFixture()
    const shortcuts = ['overview.sentence', 'overview.subjects', 'overview.category', 'overview.rivals', 'overview.moves']
    for (const block of OVERVIEW_BLOCKS.filter((b) => shortcuts.includes(b.key))) {
      expect(render(block.render(data, 'app', ctx))).toContain('href=')
    }
  })
})

describe('the 30-number budget', () => {
  it('holds on a month that read', () => {
    expect(figureCount(tablesOf(overviewFixture()))).toBeLessThanOrEqual(NUMBER_BUDGET)
  })

  it('holds on the busiest page a tenant can have', () => {
    const house = fullHouse()
    expect(house.rivals.rows.length).toBe(12)
    const count = figureCount(tablesOf(house))
    expect(count).toBeLessThanOrEqual(NUMBER_BUDGET)
    // Not trivially under it either — the budget is meant to bind.
    expect(count).toBeGreaterThan(20)
  })

  it('binds however many rivals a tenant tracks — nothing caps that list', () => {
    const house = fullHouse()
    const wider = {
      ...house,
      rivals: {
        ...house.rivals,
        rows: [
          ...house.rivals.rows,
          ...Array.from({ length: 20 }, (_, i) => ({
            ...house.rivals.rows[0],
            audience: `competitor:More ${i}`,
            label: `More ${i}`,
            attention: { k: 10 + i, n: 41200, pct: 0.1 * (i + 1) },
          })),
        ],
      },
    }
    expect(figureCount(tablesOf(wider))).toBeLessThanOrEqual(NUMBER_BUDGET)
    // Every rival keeps its ROW; only the declaration is capped.
    const markup = render(<OverviewPage data={wider} />)
    expect(markup).toContain('More 19')
    const rivals = OVERVIEW_BLOCKS.find((b) => b.key === 'overview.rivals')!
    expect(Object.keys(blockAnswers(rivals, wider).figures).filter((k) => k.startsWith('rival_')).length)
      .toBe(RIVAL_FIGURES_MAX)
  })

  it('holds when five of the six blocks are refusing', () => {
    expect(figureCount(tablesOf(refusedFixture()))).toBeLessThanOrEqual(NUMBER_BUDGET)
  })

  it('never states one figure twice with two values', () => {
    for (const data of [overviewFixture(), refusedFixture(), fullHouse()]) {
      expect(figureConflicts(tablesOf(data))).toEqual([])
    }
  })

  it('counts only readings — every token carries a unit', () => {
    const merged = mergeFigures(tablesOf(overviewFixture()))
    for (const [token, figure] of Object.entries(merged)) {
      expect(['videos', 'comments', 'pts', 'pct'], token).toContain(figure.unit)
      expect(figure.label.length, token).toBeGreaterThan(3)
    }
  })
})

describe('the Overview page', () => {
  // TEN TILES, YOUR MARKET'S (market-first WP1.6, deploy 2's column of §2.2,
  // and deploy 3's three): the month, the themes, "With this update" (block 3,
  // WP2.7) after the board, the kinds, the asks, the subjects beside what it
  // means for you (WP2.5), what you published beside the brands, and what
  // changed. OV0 is not a tile (Block D wave 3, M7); it keeps its place in
  // `OVERVIEW_BLOCKS` for the print slide and the email, which carry no bar.
  // OV5 comes back reworked as "What you published".
  // T0a: production's What it means for you has one line, on a provisional
  // subject, so it is omitted, tile and all, and the subjects span the row.
  it('draws the page bar, Your market’s ten tiles and nothing else, less a block with nothing true to print', () => {
    const markup = render(<OverviewPage data={marketFrontFixture()} />)
    expect(markup).toContain('Your market')
    expect((markup.match(/data-tile=""/g) ?? []).length).toBe(9)
    expect(frontTile('overview.subjects', false, new Set(['overview.foryou'])).col).toBe(12)
    expect(frontTile('overview.subjects', false).col).toBe(8)
    const ready = render(<OverviewPage data={marketFrontFixture({ subjectsCalibration: 'staging' })} />)
    expect((ready.match(/data-tile=""/g) ?? []).length).toBe(10)
    expect(TILE_BLOCKS.map((b) => b.key)).toEqual([
      'overview.sentence', 'overview.themes', 'overview.arrivals', 'overview.category', 'overview.asks',
      'overview.subjects', 'overview.foryou', 'overview.moves', 'overview.rivals', 'overview.change',
    ])
    expect(markup).not.toContain('This month so far')
    const text = renderText(<OverviewPage data={marketFrontFixture()} />)
    expect(text).toContain('What you published')
    expect(text).not.toContain('What it means for you')
    expect(renderText(<OverviewPage data={marketFrontFixture({ subjectsCalibration: 'staging' })} />)).toContain('What it means for you')
    assertCopyContract(markup)
  })

  // THE PREVIEW'S PAIRS, EACH ON ONE ROW, BOTH ONE HEIGHT (the lead's ruling
  // of 27 Sep, fast track; it withdrew "neither stretched"): `Main.dc.html`'s
  // order, the subjects beside what it means for you and what you published
  // beside the brands; above xl every tile spans one row and the grid
  // stretches both tiles of a pair to it, each block's section filling its
  // tile with its footer last.
  // Sealand with Waterproofing ready, as on staging, so all ten tiles draw;
  // on production What it means for you is omitted and the subjects span the
  // row (T0a).
  it('pairs the tiles as the preview does, one row a pair, both tiles of a pair stretched to one height', () => {
    const production = [...render(<OverviewPage data={marketFrontFixture()} />).matchAll(/<section data-tile="" data-col="(\d+)"/g)].map((m) => Number(m[1]))
    expect(production).toEqual([12, 12, 12, 12, 12, 12, 6, 6, 12])
    for (const [data, cols] of [
      [marketFrontFixture({ subjectsCalibration: 'staging' }), { 'overview.subjects': 8, 'overview.foryou': 4, 'overview.moves': 6, 'overview.rivals': 6 }],
      [ossurFrontFixture(), { 'overview.subjects': 6, 'overview.foryou': 6, 'overview.moves': 6, 'overview.rivals': 6 }],
    ] as const) {
      const markup = render(<OverviewPage data={data} />)
      const tiles = [...markup.matchAll(/<section data-tile="" data-col="(\d+)" data-row="\d+"[^>]*class="([^"]*)"/g)]
      expect(tiles.map((m) => Number(m[1]))).toEqual(TILE_BLOCKS.map((b) => (cols as Record<string, number>)[b.key] ?? 12))
      for (const [i, m] of tiles.entries()) {
        const key = TILE_BLOCKS[i].key
        expect(m[2], key).toContain('xl:row-span-1')
        expect(m[2], key).not.toMatch(/xl:row-span-[2-9]/)
        // No tile opts out of the row's height (the grid's default stretch).
        expect(m[2], key).not.toMatch(/self-(start|center|end)|xl:h-fit/)
      }
      // Each block's section fills its tile, its body flex-1 and its footer
      // last, so a stretched tile's white sits above its footer.
      expect(markup).toContain('[&amp;&gt;section]:flex-1')
    }
    expect(frontTile('overview.moves', false)).toMatchObject({ col: 6, className: 'xl:row-span-1' })
    expect(frontTile('overview.subjects', false)).toMatchObject({ col: 8, className: 'xl:row-span-1' })
    // Below xl a floor, not a size: "What you published" at two rows
    // (248px), so a short one holds no white above its footer.
    expect(frontTile('overview.moves', false).row).toBe(2)
    expect(frontTile('overview.foryou', true).row).toBe(2)
    expect(frontTile('overview.change', false)).toMatchObject({ col: 12, className: 'xl:row-span-1' })
  })

  // THE SKELETON IS THE PAGE'S OWN TILES (the deploy-3 design review): it
  // drew deploy 2's page (the subjects full width, the brands one line, no
  // pairs), and the page takes about 5s on staging, so it visibly jumped into
  // another layout. Both read ./tiles.ts now.
  it('has a loading skeleton with the page’s tiles, in its order, widths, floors and pairs', () => {
    expect(TILE_BLOCKS.map((b) => b.key)).toEqual([...FRONT_TILE_KEYS])
    const tiles = (markup: string) => [...markup.matchAll(/<section data-tile="" data-col="(\d+)" data-row="(\d+)"[^>]*class="([^"]*)"/g)]
      .map((m) => [m[1], m[2], /self-(start|center|end)/.test(m[3]), m[3].includes('xl:row-span-1')])
    // The page as drawn when every block has something to print (a block
    // omitted on the data, T0a, is known only once the page has loaded).
    const page = tiles(render(<OverviewPage data={marketFrontFixture({ subjectsCalibration: 'staging' })} />))
    const skeleton = tiles(render(<DashboardLoading />))
    expect(skeleton).toEqual(page)
    expect(skeleton.map((t) => t[0])).toEqual(['12', '12', '12', '12', '12', '8', '4', '6', '6', '12'])
  })

  // ONE QUESTION, IN THE PAGE BAR (Block D wave 3, M8). Parsed from
  // `Main.dc.html`: all six blocks go straight from `</header>` into their
  // content grid, and the artboard's only question is the bar's. Six sub-lines
  // under six eyebrows cost about 156px and put a second narrator over every
  // tile. The blocks keep their `question` field — it is their contract with
  // the reader, and the nav and the legend read it — and stop drawing it.
  it('prints one question, and it is the page bar\u2019s', () => {
    const text = renderText(<OverviewPage data={overviewFixture()} />)
    expect(text).not.toContain('What is this month\u2019s reading?') // the bar prints its title only (2026-09-24)
    for (const block of TILE_BLOCKS) {
      expect(block.question, block.key).toBeTruthy()
      expect(text, block.key).not.toContain(block.question as string)
    }
  })

  it('keeps OV0 in the registry, because a PDF and an email have no band', () => {
    expect(OVERVIEW_BLOCKS.map((b) => b.key)).toContain('overview.bar')
    expect(TILE_BLOCKS.map((b) => b.key)).not.toContain('overview.bar')
  })

  it('links inside the app relatively, so a page change is not a page load', () => {
    const markup = render(<OverviewPage data={marketFrontFixture()} />)
    expect(markup).toContain('href="/dashboard/voice"')
    expect(markup).not.toContain('href="https://app.verbatimintel.com/dashboard/voice"')
  })

  it('says so plainly when the workspace has never been read', () => {
    const text = renderText(<OverviewPage data={null} />)
    expect(text).toContain('Nothing has been read for this workspace yet')
  })

  it('prints the reading’s caveats once for the page, not once per bar', () => {
    const data = overviewFixture()
    const notes = [{ kind: 'read_back_at_setup' as const, text: 'Read back at setup: 61 months.', months: ['2026-01-01', '2026-02-01'] }]
    const text = renderText(<OverviewPage data={{ ...data, notes }} />)
    expect((text.match(/Read back at setup/g) ?? []).length).toBe(1)
  })
})

// ---- Block D wave 2 · the shell the artboard draws -------------------------

describe('the page bar, ported', () => {
  it('offers no horizon on Your market, whose every block reads the reading month (WP1.6)', () => {
    const text = renderText(<OverviewPage data={marketFrontFixture()} />)
    expect(text).not.toContain('Last 3 months')
    expect(text).not.toContain('Since we started')
  })

  it('states what the selected horizon pill actually resolves to', () => {
    // "This month" names no days. The range does, off the run count and the
    // window the page was opened at — and the window is half-open, so the last
    // day printed is the day before `to` rather than the first day of October.
    expect(horizonRange(overviewFixture())).toBe('3 updates · 1 Sep → 30 Sep')
  })

  it('draws Export alone at the end of the bar, as the preview does: How to read stays in Settings', () => {
    for (const data of [overviewFixture(), marketFrontFixture()]) {
      const text = renderText(<OverviewPage data={data} />)
      expect(text).toContain('Export')
      expect(text).not.toContain('How to read')
    }
  })

  it('draws Export as the preview\'s 40px button, not the bar\'s pill (WP1.6 design check)', () => {
    const markup = render(<OverviewPage data={marketFrontFixture()} />)
    const at = markup.indexOf('Export</button>')
    expect(at).toBeGreaterThan(0)
    const open = markup.lastIndexOf('<button', at)
    const tag = markup.slice(open, markup.indexOf('>', open) + 1)
    expect(tag).toContain('h-10')
    expect(tag).toContain('rounded-lg')
    expect(tag).toContain('ring-1 ring-border')
    expect(markup.slice(open, at)).not.toContain('rounded-full')
  })

  it('carries the month selector and the one line, and no "How sound is this" band (25 Sep rulings)', () => {
    const markup = render(<OverviewPage data={overviewFixture()} />)
    const text = renderText(<OverviewPage data={overviewFixture()} />)
    expect(text).toContain('Sealand · September 2026 as at the 10 Sep update · next update Sun 20 Sep')
    // The selector is a menu of months (default M-d): its chip, with the
    // month's state in its tooltip; the months are the menu's.
    expect(markup).toMatch(/<button [^>]*aria-haspopup="menu"[^>]*title="September so far[^"]*"[^>]*>September 2026<svg/)
    expect(text.toLowerCase()).not.toContain('how sound')
    expect(text).not.toContain('your 3rd monthly reading')
  })
})

describe('the sidebar footer', () => {
  it('prints the workspace and the member’s REAL role, never a job title', () => {
    // D14: the artboard's "digital director" is a field the product does not
    // hold. `users.role` is one of three words and is what prints.
    const text = renderText(<SidebarTenant brand="Sealand" role="admin" />)
    expect(text).toBe('Sealand admin')
  })

  it('prints the brand alone where no role resolves, and nothing where neither does', () => {
    expect(renderText(<SidebarTenant brand="Sealand" role={null} />)).toBe('Sealand')
    expect(render(<SidebarTenant brand={null} role={null} />)).toBe('')
  })
})

describe('Overview as an exportable page', () => {
  it('is registered, so the bar’s Export control is not a dead button', () => {
    expect(PAGES.overview).toBe(overviewPage)
  })

  it('exposes every block as a renderable under its own stable key, titled as the front page titles it', () => {
    expect(Object.keys(overviewPage.renderables)).toEqual(OVERVIEW_BLOCKS.map((b) => b.key))
    for (const block of OVERVIEW_BLOCKS) {
      expect(overviewPage.renderables[block.key].title).toBe(MARKET_TITLES[block.key] ?? block.title)
    }
    expect(overviewPage.renderables['overview.sentence'].title).toBe('The month')
  })

  it('places every front-page block, and OV0, on exactly one slide of Your market', () => {
    const keys = overviewPage.slides(marketFrontFixture(), 'default').flatMap((s) => s.keys)
    expect([...keys].sort()).toEqual(['overview.bar', ...FRONT_PAGE_BLOCKS.map((b) => b.key)].sort())
  })

  it('places a stored Phase 1 copy on the slides it was built with', () => {
    const keys = overviewPage.slides(overviewFixture(), 'default').flatMap((s) => s.keys)
    expect([...keys].sort()).toEqual(['overview.bar', 'overview.category', 'overview.moves', 'overview.rivals', 'overview.sentence', 'overview.subjects'])
  })

  it('renders a renderable in every mode without a page around it', () => {
    for (const mode of MODES) {
      for (const block of OVERVIEW_BLOCKS) {
        assertCopyContract(render(overviewPage.renderables[block.key].render(overviewFixture(), mode)))
      }
    }
  })
})

describe('the exported slide header (market-first WP1.2)', () => {
  it('says "as at" the last update, never the clock', () => {
    const data = overviewFixture()
    expect(overviewPage.printContext?.(data)).toBe('Sealand · September · as at the 10 Sep update')
    expect(overviewPage.printContext?.(data)).not.toContain('18 Sep')
  })

  it('a snapshot stored before the reading month keeps the words it was built with', () => {
    const { reading: _reading, ...stored } = overviewFixture()
    expect(overviewPage.printContext?.(stored as OverviewData)).toBe('Sealand · September · as at Fri 18 Sep')
  })
})

describe('no "how sound" on the interim front page (25 Sep rulings, §5.12)', () => {
  it('in any block, any mode, any case, or in a slide title', () => {
    for (const data of [overviewFixture(), refusedFixture()]) {
      expect(renderText(<OverviewPage data={data} />).toLowerCase()).not.toContain('how sound')
      for (const block of OVERVIEW_BLOCKS) {
        for (const mode of MODES) {
          expect(renderText(block.render(data, mode, ctx)).toLowerCase(), `${block.key}/${mode}`).not.toContain('how sound')
        }
      }
    }
    for (const slide of overviewPage.slides?.(overviewFixture(), 'default') ?? []) {
      expect(slide.title.toLowerCase()).not.toContain('how sound')
      expect(slide.keys).not.toContain('overview.record')
    }
  })
})
