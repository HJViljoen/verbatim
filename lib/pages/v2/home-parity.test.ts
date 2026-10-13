import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ASKED_ID, CONTENT_PATH, IDEA_SLOTS, questionSlotId, topAskedOf, type AskedBlock, type AskedRow, type TopContent } from './content'
import { askedSplit } from './content-fixture'
import { weekSubjectsGap, withAsked } from './home'
import { fixtureAsked } from './home-fixture'
import { MOVE_CARDS } from './moves-fixture'
import { MOVES_PATH, newestMove, type MoveCard } from './moves'
import { SHELF_TILES, shelfCut, topProductsOf, type ProductsData, type TopProducts } from './products'
import { PRODUCTS_FIXTURES } from './products-fixture'
import { brandTable, NAMED_MOST, topVoicesOf } from './voices'
import { VOICES_FIXTURES } from './voices-fixture'

// THE PARITY PASS (13 Oct): what the Dashboard's loader adds so each tile
// keeps the board's shape when its data is thin. Each addition is optional on
// its page's `top*()` type and read by that page's own rule.

describe('Your products: the tile draws the page\'s own shelf, cut as the page cuts it', () => {
  // Every state with a catalogue: the page's columns in the page's order, the
  // first SHELF_TILES products of each, and the page's "+N more".
  const same = (d: ProductsData, cols: NonNullable<TopProducts['columns']>) => {
    expect(cols.map((c) => c.id)).toEqual(d.shelf.map((c) => c.id))
    for (const [i, c] of cols.entries()) {
      const page = d.shelf[i]
      expect(c.products.map((p) => p.id)).toEqual(page.products.slice(0, SHELF_TILES).map((p) => p.id))
      expect(c.more).toBe(Math.max(0, page.products.length - SHELF_TILES))
      expect(c.products.length + (c.more ?? 0)).toBe(page.products.length)
    }
  }

  it('read: shaded by the month\'s videos, at most SHELF_TILES a column, then "+N more" (Össur\'s Feet hold 20)', () => {
    const d = PRODUCTS_FIXTURES['ossur-today']()
    const top = topProductsOf(d)
    same(d, top.columns!)
    expect(top.columns!.some((c) => (c.more ?? 0) > 0)).toBe(true)
    expect(Math.max(...top.columns!.map((c) => c.products.length))).toBeLessThanOrEqual(SHELF_TILES)
    // Its words count past the cut: every product that came up, of the whole column.
    for (const [i, c] of top.columns!.entries()) expect(c.named).toBe(d.shelf[i].products.filter((p) => (p.videos ?? 0) > 0).length)
  })

  it('not switched on, or the month not read: the page\'s shelf unshaded (every count null), never a list the tile orders itself', () => {
    for (const d of [PRODUCTS_FIXTURES['not-on'](), PRODUCTS_FIXTURES.unread()]) {
      const top = topProductsOf(d)
      expect(d.shelf.length).toBeGreaterThan(0)
      same(d, top.columns!)
      for (const c of top.columns!) {
        expect(c.named).toBeNull()
        for (const p of c.products) expect(p.videos).toBeNull()
      }
    }
    expect(topProductsOf(PRODUCTS_FIXTURES['not-on']()).state).toBe('not_on')
    expect(topProductsOf(PRODUCTS_FIXTURES.unread())).toMatchObject({ state: 'quiet', note: 'unread' })
  })

  it('no catalogue, the migration not applied, or a read that failed: no shelf', () => {
    expect(topProductsOf(PRODUCTS_FIXTURES.sealand()).columns).toBeUndefined()
    expect(topProductsOf(PRODUCTS_FIXTURES['not-applied']()).columns).toBeUndefined()
    const failed = { ...PRODUCTS_FIXTURES['not-on'](), state: 'failed' as const }
    expect(topProductsOf(failed).columns).toBeUndefined()
  })

  it('the page\'s shelf and the tile cut by one rule (`shelfCut`)', () => {
    expect(shelfCut([1, 2, 3])).toEqual({ shown: [1, 2, 3], more: 0 })
    const twenty = Array.from({ length: 20 }, (_, i) => i)
    expect(shelfCut(twenty)).toEqual({ shown: twenty.slice(0, SHELF_TILES), more: 20 - SHELF_TILES })
    expect(shelfCut(twenty.slice(0, SHELF_TILES))).toEqual({ shown: twenty.slice(0, SHELF_TILES), more: 0 })
  })
})

describe('Your moves: the newest move, where none has a comparison to print', () => {
  const pending: MoveCard = {
    ...MOVE_CARDS[0], id: 'newest', day: '2026-10-05', compare: null, unread: null, pending: '2026-10-01',
    points: [
      { month: '2026-08-01', role: 'before', k: 10, n: 400, soFar: false },
      { month: '2026-09-01', role: 'before', k: 19, n: 521, soFar: false },
    ],
  }

  it('the newest by its day; its own month not read: the latest month before it, as Your moves prints it', () => {
    const n = newestMove([{ ...MOVE_CARDS[0], id: 'older', day: '2026-09-14' }, pending])!
    expect(n).toMatchObject({ id: 'newest', pending: '2026-10-01', unread: null, point: { month: '2026-09-01', k: 19, n: 521 }, href: `${MOVES_PATH}#move-newest` })
    expect(newestMove([])).toBeNull()
    expect(newestMove([{ ...pending, points: [] }])!.point).toBeNull()
  })

  it('a refused comparison prints its later side alone; a move no line can be drawn for prints no level', () => {
    const refused = MOVE_CARDS.find((c) => c.compare)!
    const r = newestMove([{ ...refused, day: '2026-10-09', pending: null, unread: null }])!
    expect(r.point).toEqual(refused.compare!.after)
    const lineless = newestMove([{ ...pending, pending: null, unread: 'several' }])!
    expect(lineless).toMatchObject({ unread: 'several', point: null })
  })
})

describe('Content: the week\'s most-asked question your posts have not touched, where there is no idea', () => {
  const block = (rows: AskedBlock['rows']): AskedBlock => ({ period: 'week', rows, total: rows.length, touched: 1, since: '2026-08-01', expanded: false, unread: null })
  const row: AskedRow = { registryId: 'r1', label: 'How the prosthesis works', groups: [], subject: null, week: 13, month: 22, weeks: null }
  const split = (lead: AskedRow[], rest: AskedRow[] = []) => ({ asked: block(rest), lead })

  it('is the first question card, its week and its month each out of the market\'s; the next in line opens its own card', () => {
    const own = { state: 'none' as const, touched: 0, posts: 25, since: '2026-08-01' }
    const groups = [{ key: 'first-time-buyer', name: 'First-time buyer' }]
    expect(topAskedOf(split([{ ...row, groups }, { ...row, registryId: 'r2', week: 5 }]), { week: 153, month: 288 }, { month: '2026-10-01', complete: false }, own)).toEqual({
      registryId: 'r1', label: 'How the prosthesis works', week: { k: 13, n: 153 }, month: { k: 22, n: 288 },
      weekWords: 'this week', monthWords: 'in October so far', groups, own, href: `${CONTENT_PATH}#idea-slot-1`,
      // The next question card, under it.
      next: [{ registryId: 'r2', label: 'How the prosthesis works', week: 5, month: 22, href: `${CONTENT_PATH}#idea-slot-2` }],
    })
    // One card's question: the next in line is the Also asked table's first row.
    expect(topAskedOf(split([row], [{ ...row, registryId: 'r9' }]), { week: 153, month: 288 }, { month: '2026-10-01', complete: false }, own)!.next)
      .toEqual([{ registryId: 'r9', label: 'How the prosthesis works', week: 13, month: 22, href: `${CONTENT_PATH}#${ASKED_ID}` }])
    // A window that is not seven days is never called a week (Content's rule).
    const days = topAskedOf(split([row]), { week: 153, month: 288 }, { month: '2026-10-01', complete: false }, own, { isWeek: false, first: '2026-09-28', last: '2026-10-11' })!
    expect(days.weekWords).toBe('between 28 Sep and 11 Oct')
  })

  it('never the Also asked table\'s first row: the cards hold the top questions, and the table goes on after them', () => {
    const s = askedSplit('week', false, 0)
    const t = topAskedOf(s, { week: 153, month: 288 }, { month: '2026-10-01', complete: false }, null)!
    expect(s.lead).toHaveLength(IDEA_SLOTS)
    expect(t.registryId).toBe(s.lead[0].registryId)
    expect(t.registryId).not.toBe(s.asked.rows[0]?.registryId)
    expect(t.href).toBe(`${CONTENT_PATH}#${questionSlotId(1)}`)
  })

  it('the loader reads the page\'s split with no idea on the row, never the table alone', () => {
    const src = readFileSync(resolve(__dirname, 'content.ts'), 'utf8')
    const load = src.slice(src.indexOf('export async function topAsked('))
    expect(load).toMatch(/askedWithLead\(\{\n\s+lead: IDEA_SLOTS,/)
    expect(load).not.toMatch(/askedBlock\(/)
  })

  it('prints no level whose side was not read, and nothing with no row', () => {
    const t = topAskedOf(split([row]), { week: null, month: 288 }, { month: '2026-09-01', complete: true }, null)!
    expect(t.week).toBeNull()
    expect(t.month).toEqual({ k: 22, n: 288 })
    expect(t.monthWords).toBe('in September')
    expect(topAskedOf(split([], [row]), { week: 153, month: 288 }, { month: '2026-10-01', complete: false }, null)).toBeNull()
  })

  it('is read only where no idea prints, and a failed read costs the question, not the tile', async () => {
    const empty: TopContent = { state: 'not_on', idea: null, href: CONTENT_PATH, line: 'x' }
    let reads = 0
    const asked = fixtureAsked()
    expect(await withAsked(empty, async () => { reads += 1; return asked })).toEqual({ ...empty, asked })
    expect(await withAsked(empty, () => Promise.reject(new Error('boom')))).toEqual({ ...empty, asked: null })
    const ready = { ...empty, state: 'ready', idea: {} } as unknown as TopContent
    expect(await withAsked(ready, async () => { reads += 1; return asked })).toBe(ready)
    expect(reads).toBe(1)
  })
})

describe('Voices: the tracked brands, for a "Named most" row with no count yet', () => {
  it('you first, then the page\'s order, at most two, each opening its panel', () => {
    const d = VOICES_FIXTURES.ossur()
    const top = topVoicesOf({ month: d.month, soFar: d.soFar, videos: d.videos, groups: d.groups, brands: d.brands })
    expect(top.tracked!.length).toBeLessThanOrEqual(2)
    expect(top.tracked![0].you).toBe(true)
    for (const b of top.tracked!) expect(b.href).toMatch(/^\/dashboard\/voices\?brand=[^#]+#brand-panel$/)
  })

  it('brands not counted yet: the chips are the brands table\'s first rows, in its order (`brandTable`)', () => {
    const d = VOICES_FIXTURES['ossur-thin']()
    expect(d.brands.state).toBe('not_counted')
    const top = topVoicesOf({ month: d.month, soFar: d.soFar, videos: d.videos, groups: d.groups, brands: d.brands })
    expect(top.tracked!.map((b) => b.label)).toEqual(brandTable(d.brands).rows.slice(0, NAMED_MOST).map((r) => r.label))
    expect(top.tracked![0].you).toBe(true)
  })
})

describe('Your market this week: the subject rows say why they hold no subject', () => {
  it('names the month and the month before, and the reason', () => {
    expect(weekSubjectsGap('2026-10-01', true, 'calibrating')).toEqual({ monthText: 'October so far', prevText: 'September', biggest: null, moved: null, noneMoved: false, gap: 'calibrating' })
    expect(weekSubjectsGap('2026-09-01', false, null)).toEqual({ monthText: 'September', prevText: 'August', biggest: null, moved: null, noneMoved: false })
  })

  it('the loader keeps the rows in every state: no subjects table or none named, none calibrated, and a read that threw', () => {
    const src = readFileSync(resolve(__dirname, 'home.ts'), 'utf8')
    const load = src.slice(src.indexOf('async function loadWeekSubjects'), src.indexOf('export function startDashboard'))
    expect(load).toMatch(/isMissingSubjects\(error\)\) return weekSubjectsGap\(input\.month, input\.soFar, 'none_named'\)/)
    expect(load).toMatch(/subjects\.length === 0\) return weekSubjectsGap\(input\.month, input\.soFar, 'none_named'\)/)
    expect(load).toMatch(/objects\.length === 0\) return weekSubjectsGap\(input\.month, input\.soFar, 'calibrating'\)/)
    expect(src).toMatch(/\.catch\(\(error: unknown\) => \{ say\('subjects', error\); return weekSubjectsGap\(month, soFar, 'failed'\) \}\)/)
  })
})

describe('Market: the tile\'s "also" is Market\'s own third-card rule', () => {
  it('topMarket names its stand-in by `alsoTalkedOf`, as Market\'s third card does, and only where nothing more is new', () => {
    const src = readFileSync(resolve(__dirname, 'market.ts'), 'utf8')
    const top = src.slice(src.indexOf('export async function topMarket'))
    const page = src.slice(0, src.indexOf('export async function topMarket'))
    expect(top).toMatch(/const next = sides\.fresh\[0\] \? null : alsoTalkedOf\(convs, onRow, setApart\)/)
    expect(page).toMatch(/const next = earlier \? null : alsoTalkedOf\(convs, onRow, setApart\)/)
    // No second copy of the rule.
    expect(src.match(/c\.setApart == null && !setApart\.has\(c\.id\)/g)).toHaveLength(1)
  })
})
