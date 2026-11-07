import { describe, expect, it } from 'vitest'

import { dashboardFixture, fixtureContentTop, fixtureMovesTop, fixtureProductsTop, fixtureVoicesTop } from '@/lib/pages/v2/home-fixture'
import type { DashboardData, TileRead } from '@/lib/pages/v2/home'
import { topProductsOf } from '@/lib/pages/v2/products'
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
// SCREEN, not to one tile's string: its item's name, its link and every
// figure it prints appear on the Dashboard (the figures row and the tiles),
// from the same fixture, for every page. The email builders are untouched.

const ok = <T,>(top: T): TileRead<T> => ({ state: 'ok', top })
const words = (s: string) => s.replace(/\s+/g, ' ').trim()
/** The words as a reader sees them: no space the markup's tags leave before
 *  a comma, a stop or a bracket. */
const tight = (s: string) => words(s).replace(/\s+([,.)])/g, '$1').replace(/\(\s+/g, '(')

/** The screen's links, decoded. */
const hrefs = (markup: string): string[] => [...markup.matchAll(/href="([^"]*)"/g)].map((m) => decodeEntities(m[1]))

/** The Dashboard (its figures row and every tile) with one page's top. */
const dashboard = (patch: Partial<DashboardData>): string => render(<DashboardPage data={{ ...dashboardFixture(), ...patch }} />)

function expectLineOnDashboard(line: WeeklyReadLine | null, markup: string) {
  expect(line).not.toBeNull()
  const text = tight(markupText(markup))
  // The same item, into the same page.
  expect(text).toContain(words(line!.name))
  expect(hrefs(markup)).toContain(line!.href)
  // Every figure the line prints is one the screen prints.
  for (const n of line!.figure?.match(/\d[\d,]*/g) ?? []) expect(text, `${line!.page}: ${n}`).toMatch(new RegExp(`(^|\\D)${n}(\\D|$)`))
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
