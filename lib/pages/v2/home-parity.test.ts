import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ASKED_ID, CONTENT_PATH, topAskedOf, type AskedBlock, type TopContent } from './content'
import { weekSubjectsGap, withAsked } from './home'
import { fixtureAsked } from './home-fixture'
import { MOVE_CARDS } from './moves-fixture'
import { MOVES_PATH, newestMove, type MoveCard } from './moves'
import { withCatalogueShelf, type TopProducts } from './products'
import { topVoicesOf } from './voices'
import { VOICES_FIXTURES } from './voices-fixture'
import type { CatalogueRead, ProductCatalogue } from '../../products/types'

// THE PARITY PASS (13 Oct): what the Dashboard's loader adds so each tile
// keeps the board's shape when its data is thin. Each addition is optional on
// its page's `top*()` type and read by that page's own rule.

const CATALOGUE: CatalogueRead = {
  state: 'ready',
  catalogue: {
    version: 'pc1_test',
    groups: [{ id: 'g-liners', name: 'Liners', sort: 1 }, { id: 'g-feet', name: 'Feet', sort: 2 }, { id: 'g-empty', name: 'Empty', sort: 3 }],
    products: [
      { id: 'p1', group_id: 'g-liners', name: 'Seal-In', sort: 1 },
      { id: 'p2', group_id: 'g-liners', name: 'Iceross', sort: 2 },
      { id: 'p3', group_id: 'g-feet', name: 'Pro-Flex', sort: 1 },
    ],
    aliases: [],
  },
}
const base = (o: Partial<TopProducts>): TopProducts => ({ state: 'not_on', monthWords: 'September', standout: null, href: '/dashboard/products', ...o })

describe('Your products: the unshaded shelf where the month was not read', () => {
  it('not switched on, or the month not read: every category in the page\'s order (sort, then name) with how many products it holds, an empty one kept', () => {
    const want = [{ id: 'g-liners', name: 'Liners', products: 2 }, { id: 'g-feet', name: 'Feet', products: 1 }, { id: 'g-empty', name: 'Empty', products: 0 }]
    expect(withCatalogueShelf(base({ state: 'not_on' }), CATALOGUE).catalogue).toEqual(want)
    expect(withCatalogueShelf(base({ state: 'quiet', note: 'unread' }), CATALOGUE).catalogue).toEqual(want)
  })

  it('orders by sort, then name, whatever order the catalogue arrives in', () => {
    const read: CatalogueRead = { state: 'ready', catalogue: { ...(CATALOGUE as { catalogue: ProductCatalogue }).catalogue, groups: [
      { id: 'b', name: 'Bracing', sort: 2 }, { id: 'k', name: 'Knees', sort: 1 }, { id: 'a', name: 'Arms', sort: 2 },
    ], products: [] } }
    expect(withCatalogueShelf(base({ state: 'not_on' }), read).catalogue!.map((c) => c.name)).toEqual(['Knees', 'Arms', 'Bracing'])
  })

  it('leaves alone a tile that read its month, failed, or has no catalogue', () => {
    for (const t of [
      base({ state: 'ready', columns: [] }),
      base({ state: 'quiet' }),
      base({ state: 'quiet', note: 'failed' }),
      base({ state: 'no_catalogue' }),
      base({ state: 'not_applied' }),
    ]) expect(withCatalogueShelf(t, CATALOGUE)).toBe(t)
    for (const read of [null, { state: 'empty' } as const, { state: 'missing' } as const]) {
      const t = base({ state: 'not_on' })
      expect(withCatalogueShelf(t, read)).toBe(t)
    }
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
  const row = { registryId: 'r1', label: 'How the prosthesis works', groups: [], subject: null, week: 13, month: 22, weeks: null }

  it('is the table\'s first row, its week and its month each out of the market\'s', () => {
    const own = { state: 'none' as const, touched: 0, posts: 25, since: '2026-08-01' }
    const groups = [{ key: 'first-time-buyer', name: 'First-time buyer' }]
    expect(topAskedOf(block([{ ...row, groups }, { ...row, registryId: 'r2', week: 5 }]), { week: 153, month: 288 }, { month: '2026-10-01', complete: false }, own)).toEqual({
      registryId: 'r1', label: 'How the prosthesis works', week: { k: 13, n: 153 }, month: { k: 22, n: 288 },
      weekWords: 'this week', monthWords: 'in October so far', groups, own, href: `${CONTENT_PATH}#${ASKED_ID}`,
      // The table's next row, under it.
      next: [{ registryId: 'r2', label: 'How the prosthesis works', week: 5, month: 22 }],
    })
    // A window that is not seven days is never called a week (Content's rule).
    const days = topAskedOf(block([row]), { week: 153, month: 288 }, { month: '2026-10-01', complete: false }, own, { isWeek: false, first: '2026-09-28', last: '2026-10-11' })!
    expect(days.weekWords).toBe('between 28 Sep and 11 Oct')
  })

  it('prints no level whose side was not read, and nothing with no row', () => {
    const t = topAskedOf(block([row]), { week: null, month: 288 }, { month: '2026-09-01', complete: true }, null)!
    expect(t.week).toBeNull()
    expect(t.month).toEqual({ k: 22, n: 288 })
    expect(t.monthWords).toBe('in September')
    expect(topAskedOf(block([]), { week: 153, month: 288 }, { month: '2026-10-01', complete: false }, null)).toBeNull()
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
