import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { fixtureContentTop, fixtureMovesTop, fixtureProductsTop, fixtureVoicesTop } from '@/lib/pages/v2/home-fixture'
import type { TileRead } from '@/lib/pages/v2/home'
import { topProductsOf } from '@/lib/pages/v2/products'
import { ossurProductsFixture } from '@/lib/pages/v2/products-fixture'
import { contentLine, movesLine, productsLine, voicesLine, type WeeklyReadLine } from '@/lib/reports/weekly-read-lines'
import { decodeEntities, markupText, render } from '@/lib/test/render'
import { ContentTileView } from './content-tile'
import { MovesTileView } from './moves-tile'
import { ProductsTileView } from './products-tile'
import { VoicesTileView } from './voices-tile'

// THE WEEKLY EMAIL'S PAGE LINES ARE THE DASHBOARD'S TILES (Phase 4 fix round):
// each line is built from the same `top<Page>()` the tile draws, so each must
// name the tile's item, open the tile's own link, and print only the tile's
// figures and month words. Checked here against what each tile PRINTS, from
// the same fixture, for every page.

const ok = <T,>(top: T): TileRead<T> => ({ state: 'ok', top })
const words = (s: string) => s.replace(/\s+/g, ' ').trim()

/** The tile's links, decoded. */
const hrefs = (markup: string): string[] => [...markup.matchAll(/href="([^"]*)"/g)].map((m) => decodeEntities(m[1]))

function expectLineIsTile(line: WeeklyReadLine | null, tile: ReactElement) {
  expect(line).not.toBeNull()
  const markup = render(tile)
  const text = words(markupText(markup))
  // The same item, into the same panel.
  expect(text).toContain(words(line!.name))
  expect(hrefs(markup)).toContain(line!.href)
  // Every figure the line prints is one the tile prints.
  for (const n of line!.figure?.match(/\d[\d,]*/g) ?? []) expect(text, `${line!.page}: ${n}`).toMatch(new RegExp(`(^|\\D)${n}(\\D|$)`))
  return text
}

describe('each page line equals its Dashboard tile', () => {
  it('Voices: the group, its videos of the month\'s, in the tile\'s month words', () => {
    const top = fixtureVoicesTop()
    const line = voicesLine(top)
    const text = expectLineIsTile(line, <VoicesTileView read={ok(top)} />)
    expect(text).toContain(`In the most videos in ${top.monthWords}`)
    expect(line!.lead).toBe(`In the most videos in ${top.monthWords}:`)
    expect(text).toContain('86 of 318 videos')
  })

  it('Your products: the tile\'s standout, under its label, on the page\'s own basis', () => {
    for (const top of [fixtureProductsTop(), topProductsOf(ossurProductsFixture())]) {
      const line = productsLine(top)
      const text = expectLineIsTile(line, <ProductsTileView read={ok(top)} />)
      expect(text).toContain(top.standout!.label)
      expect(line!.lead).toBe(`${top.standout!.label}:`)
      expect(text).toContain(words(line!.figure!))
    }
  })

  it('Content: the first post idea, its week beside its month', () => {
    const top = fixtureContentTop()
    const line = contentLine(top)
    const text = expectLineIsTile(line, <ContentTileView read={ok(top)} />)
    expect(text).toContain('23 of 241 videos this week')
    expect(text).toContain('35 of 318 in October so far')
  })

  it('Your moves: the first advice waiting, and the updates that raised it', () => {
    const top = fixtureMovesTop('member')
    const line = movesLine(top)
    const text = expectLineIsTile(line, <MovesTileView read={ok(top)} />)
    expect(text).toContain(words(line!.figure!))
  })

  it('a tile with nothing to lead with gives no line', () => {
    expect(voicesLine(fixtureVoicesTop() && { ...fixtureVoicesTop(), group: null })).toBeNull()
    expect(productsLine(fixtureProductsTop('not_on'))).toBeNull()
    expect(contentLine(fixtureContentTop('not_on'))).toBeNull()
    expect(movesLine(fixtureMovesTop('no_advice'))).toBeNull()
  })
})
