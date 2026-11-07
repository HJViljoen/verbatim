import { describe, expect, it } from 'vitest'

import { dashboardFixture, fixtureContentTop, fixtureMovesTop, fixtureProductsTop, fixtureVoicesTop } from '@/lib/pages/v2/home-fixture'
import type { DashboardData, TileRead } from '@/lib/pages/v2/home'
import { TOP_LABELS, topProductsOf } from '@/lib/pages/v2/products'
import { ossurProductsFixture } from '@/lib/pages/v2/products-fixture'
import { contentLine, movesLine, productsLine, voicesLine, type WeeklyReadLine } from '@/lib/reports/weekly-read-lines'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import { inlineMonth } from '@/lib/reading/month-label'
import { decodeEntities, markupText, render } from '@/lib/test/render'
import { DashboardPage } from '.'
import { ContentTileView } from './content-tile'

// THE WEEKLY EMAIL'S PAGE LINES AND THE DASHBOARD (Phase 4 fix round; the
// audit design's decision 2, 7 Nov): each line is built from the same
// `top<Page>()` the tile draws. The email keeps its exact words (it is frozen
// and checked byte for byte), while the Dashboard says each base once, in its
// figures row, and prints bare counts under it. So the line is held to the
// SCREEN, not to one tile's string: its item's name and its link are on the
// line's own tile, the item's own count sits IN OR BESIDE the element that
// names the item (its row, or the block right after its heading), and each
// base the line prints is on that tile or in the figures row, where the
// screen says a base once. So a tile that names an item and drops its count
// fails, even where the digit happens to print elsewhere on the screen. The
// email builders are untouched.

const ok = <T,>(top: T): TileRead<T> => ({ state: 'ok', top })
const words = (s: string) => s.replace(/\s+/g, ' ').trim()
/** The words as a reader sees them: no space the markup's tags leave before
 *  a comma, a stop or a bracket. */
const tight = (s: string) => words(s).replace(/\s+([,.)])/g, '$1').replace(/\(\s+/g, '(')

/** The screen's links, decoded. */
const hrefs = (markup: string): string[] => [...markup.matchAll(/href="([^"]*)"/g)].map((m) => decodeEntities(m[1]))

/** The Dashboard (its figures row and every tile) with one page's top. */
const dashboard = (patch: Partial<DashboardData>): string => render(<DashboardPage data={{ ...dashboardFixture(), ...patch }} />)

/** The static markup as a tree of elements, each with its span in the
 *  string (renderToStaticMarkup's output is well formed, and React escapes
 *  every "<" and ">" inside an attribute). */
type El = { tag: string; open: string; start: number; end: number; children: El[]; parent: El | null }
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
function tree(markup: string): El {
  const root: El = { tag: '#root', open: '', start: 0, end: markup.length, children: [], parent: null }
  let cur = root
  for (const m of markup.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)) {
    const at = m.index!
    if (m[1]) { cur.end = at + m[0].length; cur = cur.parent ?? root; continue }
    const el: El = { tag: m[2].toLowerCase(), open: m[0], start: at, end: at + m[0].length, children: [], parent: cur }
    cur.children.push(el)
    if (!m[3] && !VOID.has(el.tag)) cur = el
  }
  return root
}
const all = (el: El): El[] => [el, ...el.children.flatMap(all)]
const BLOCK = new Set(['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'td', 'th', 'dd', 'dt', 'dl', 'section', 'article'])
const hasNumber = (text: string, n: string) => new RegExp(`(^|\\D)${n}(\\D|$)`).test(text)

function expectLineOnDashboard(line: WeeklyReadLine | null, markup: string) {
  expect(line).not.toBeNull()
  const text = tight(markupText(markup))
  const textOf = (el: El) => tight(markupText(markup.slice(el.start, el.end)))
  const root = tree(markup)
  // The line's own tile: the same item, into the same page.
  const tile = all(root).find((el) => el.open.includes(`data-tile="${line!.page}"`))
  expect(tile, `${line!.page}: its tile`).toBeDefined()
  const name = words(line!.name)
  expect(textOf(tile!)).toContain(name)
  expect(hrefs(markup.slice(tile!.start, tile!.end))).toContain(line!.href)
  // The elements that name the item, each at its block (a row, a heading),
  // and the block right after it: the line's own element and what is beside it.
  const naming = all(tile!).filter((el) => el.tag !== '#root' && textOf(el).includes(name) && !el.children.some((c) => textOf(c).includes(name)))
  const beside = naming.flatMap((el) => {
    let b: El | null = el
    while (b && !BLOCK.has(b.tag)) b = b.parent
    if (!b) return []
    const sibs = b.parent?.children ?? []
    const next = sibs[sibs.indexOf(b) + 1]
    return next ? [b, next] : [b]
  })
  const figures = line!.figure?.match(/\d[\d,]*/g) ?? []
  // The item's own count: in or beside the element that names it.
  const own = figures[0]
  if (own) expect(beside.some((el) => hasNumber(textOf(el), own)), `${line!.page}: ${own} beside ${name}`).toBe(true)
  // Each base it prints: beside it, on its tile, or in the figures row.
  const strip = all(root).find((el) => el.open.includes('data-stat-strip'))
  for (const n of figures.slice(1)) {
    const where = [...beside, tile!, ...(strip ? [strip] : [])]
    expect(where.some((el) => hasNumber(textOf(el), n)), `${line!.page}: ${n}`).toBe(true)
  }
  return text
}

describe('each page line equals its Dashboard tile', () => {
  it('Voices: the group, its videos of the month\'s, in the tile\'s month words', () => {
    const top = fixtureVoicesTop()
    const line = voicesLine(top)
    const text = expectLineOnDashboard(line, dashboard({ voices: ok(top) }))
    // The tile names the month in its label; the line, in its lead.
    expect(text).toContain(`Voices in ${top.monthWords}`)
    expect(line!.lead).toBe(`In the most videos in ${top.monthWords}:`)
    // "86 of 318 videos": the group's count on the tile, the month's on the
    // figures row.
    expect(text).toContain('Long-time users upgrading 86')
    expect(text).toContain('318 videos, 5,840 comments')
  })

  it('Your products: the tile\'s standout, under its label, on the page\'s own basis', () => {
    for (const top of [fixtureProductsTop(), topProductsOf(ossurProductsFixture()), fixtureProductsTop('ready', { september: true })]) {
      const line = productsLine(top)
      const text = expectLineOnDashboard(line, dashboard({ products: ok(top) }))
      expect(line!.lead).toBe(`${top.standout!.label}:`)
      // The tile says the month in its label, in the line's own words
      // (decision 3), where it is not the current one.
      expect(text).toContain(`Your products in ${inlineMonth(top.monthWords, top.monthLabel)}`)
      if (top.monthLabel) expect(line!.figure).toContain(`in ${top.monthWords}, ${top.monthLabel}`)
    }
  })

  it('Your products: a first-time standout ranked below the four listed keeps its count beside its name', () => {
    const base = topProductsOf(ossurProductsFixture())
    const low = base.cameUpProducts!.find((p, i) => i >= 4 && p.videos > 0)!
    const top = { ...base, standout: { label: TOP_LABELS.first, name: low.name, k: low.videos, n: null, href: low.href } }
    const line = productsLine(top)
    const markup = dashboard({ products: ok(top) })
    expectLineOnDashboard(line, markup)
    expect(markupText(markup)).toContain(`${low.name}: ${low.videos} videos.`)
  })

  it('Voices: a whole-month line carries the tile\'s label where its month is not the current one (decision 3)', () => {
    const top = fixtureVoicesTop({ september: true })
    const line = voicesLine(top)
    const text = expectLineOnDashboard(line, dashboard({ voices: ok(top) }))
    expect(line!.lead).toBe('In the most videos in September, the last full month:')
    expect(text).toContain('Voices in September, the last full month')
    // September's base is not the figures row's (October's): the tile says it.
    expect(text).toContain('Videos per group, of 318 in September.')
  })

  it('Content: the first post idea, its four weeks of questions beside its month', () => {
    const top = fixtureContentTop()
    const line = contentLine(top)
    const text = expectLineOnDashboard(line, dashboard({ content: ok(top) }))
    expect(text).toContain('48 of 640 videos, 14 Sep to 11 Oct')
    expect(text).toContain('35 of 318 in October so far')
    expect(line!.figure).toContain('14 Sep to 11 Oct')
  })

  it('Content: the medical team line under the idea in a medical market, on the tile and in the line alike', () => {
    for (const medical of [true, false]) {
      const top = fixtureContentTop('ready', { medical })
      const line = contentLine(top)
      const text = expectLineOnDashboard(line, dashboard({ content: ok(top) }))
      expect(text.includes(MEDICAL_LINE), `medical ${medical}`).toBe(medical)
      expect(line!.note ?? null).toBe(medical ? MEDICAL_LINE : null)
    }
  })

  it('Content: the four weeks only with their month, on the tile and in the line alike; an older set\'s beside its own month', () => {
    const top = fixtureContentTop()
    const noMonth = { ...top, idea: { ...top.idea!, month: null } }
    expect(render(<ContentTileView read={ok(noMonth)} />)).not.toContain('of 640 videos')
    expect(contentLine(noMonth)?.figure ?? null).toBeNull()
    const older = fixtureContentTop('older')
    const text = tight(markupText(render(<ContentTileView read={ok(older)} />)))
    expect(text).toContain('48 of 640 videos, 7 Sep to 4 Oct')
    expect(text).toContain('64 of 839 in September')
  })

  it('Your moves: the first advice waiting, and the updates that raised it', () => {
    const top = fixtureMovesTop('member')
    const line = movesLine(top)
    const text = expectLineOnDashboard(line, dashboard({ moves: ok(top) }))
    expect(text).toContain(words(line!.figure!))
  })

  it('a tile with nothing to lead with gives no line', () => {
    expect(voicesLine(fixtureVoicesTop() && { ...fixtureVoicesTop(), group: null })).toBeNull()
    expect(productsLine(fixtureProductsTop('not_on'))).toBeNull()
    expect(contentLine(fixtureContentTop('not_on'))).toBeNull()
    expect(movesLine(fixtureMovesTop('no_advice'))).toBeNull()
  })
})
