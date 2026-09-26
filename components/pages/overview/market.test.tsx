import { describe, it, expect } from 'vitest'
import { isValidElement, type ReactElement } from 'react'

import { blockAnswers, blockContext, figureCount, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { BlockFrame } from '@/components/blocks/frame'
import { NUMBER_BUDGET, type OverviewData } from '@/lib/pages/overview'
import { LEAD_MAX_MAKER_SHARE, segmentOf, themeFigures } from '@/lib/pages/overview-market'
import { septemberThemes } from '@/lib/test/market-fixture'
import { FRONT_PAGE_BLOCKS, MARKET_TITLES, OverviewPage } from './index'
import { overviewSentence } from './sentence'
import { overviewThemes } from './themes'
import { WHAT_WE_CHANGED_HREF } from './change'
import { marketBeforeMakersFixture, marketFrontFixture, ossurFrontFixture, overviewFixture } from './fixture'

// Your market (market-first WP1.6): the done-when checks that a render can
// make, on plan §2.2's print (production's figures as at the 24 Sep update).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
/** Rendered text as a reader reads it: `renderText` spaces every node apart,
 *  so a quotation mark, a comma and a parenthesis are closed back up. */
const read = (node: Parameters<typeof renderText>[0]): string =>
  renderText(node).replace(/\s+([,.)”’:])/g, '$1').replace(/([“(])\s+/g, '$1')

const STATES: [string, () => OverviewData][] = [
  ['Sealand', marketFrontFixture],
  ['Sealand before MF1', marketBeforeMakersFixture],
  ['Sealand, staging calibration', () => marketFrontFixture({ subjectsCalibration: 'staging' })],
  ['Össur', ossurFrontFixture],
]

describe('Your market prints §2.2’s blocks on the 24 Sep figures', () => {
  const text = read(<OverviewPage data={marketFrontFixture()} />)

  it('the bar: the month selector and one line, and nothing else', () => {
    expect(text).toContain('Sealand · September 2026 as at the 24 Sep update · next update Sun 27 Sep')
    expect(text).not.toContain('so far, ')
    expect(text).not.toContain('still filling')
  })

  it('"The month": the size, then the three biggest conversations with one denominator, then August as levels and the chip', () => {
    expect(text).toContain('Your market in September so far: 655 videos and 16,233 comments.')
    expect(text).toContain(
      'Its three biggest conversations not led by makers, of the 626 category videos: “Ready to buy handmade bags” 69, “Love for stylish bag design” 60 and “Confusion over airline bag sizes” 21. About a third of each of the first two sits under makers’ own posts.',
    )
    expect(text).toContain('August: 7%, 7% and 3% of 351')
    expect(text).toContain('not read as a change: we changed our searches in September')
  })

  it('the voice is the lead theme’s own, and the lead is a quarter makers or fewer', () => {
    expect(text).toContain('One voice on “Confusion over airline bag sizes”')
    expect(text).toContain('from that theme’s own comments')
    const data = marketFrontFixture()
    expect(data.hero?.kind === 'themes' && data.hero.lead?.makerShare).toBeLessThanOrEqual(LEAD_MAX_MAKER_SHARE)
  })

  it('the board: ten rows not led by makers, the makers line, August as a share in its column', () => {
    expect(text).toContain('What your market talked about')
    expect(text).toContain('Sep of 626')
    expect(text).toContain('Aug of 351')
    expect(text).toContain('Makers and DIY, grouped: 7 themes at 10+, led by Admiration for upcycled bag creativity (71) and Respect for handmade craftsmanship (64)')
    expect(text).toContain('about a third makers')
    expect(text).toContain('a fifth makers')
  })

  it('the kinds and the mood as levels, "Praising it" for praise, one chip', () => {
    expect(text).toContain('What people did in the comments')
    expect(text).toContain('Praising it')
    expect(text).not.toContain('Saying it worked')
    expect(text).toContain('under 10, a count only')
  })

  it('the asks, each list counting its own themes, with a real quote of its kind', () => {
    expect(text).toContain('What your market asked, complained about and wished for')
    expect(text).toContain('Confusion over airline bag sizes 21')
    expect(text).toContain('Interest in specific colors 11')
    expect(text).toContain('If you made it in pink and a bigger size I would buy it immediately')
  })

  it('the subjects on the market, each with its calibration word, and a subject never read says when it is', () => {
    expect(text).toContain('The market by subject')
    expect(text).toContain('Looks & style provisional')
    expect(text).toContain('Buying & delivery first reading with the 27 Sep update')
  })

  it('brands in one line, naming Competitive by its current label', () => {
    expect(text).toContain('Brands in your market, counted in every video they come up in, arrive with the 11 Oct update. Until then, Competitive lists what was filed under each brand you track.')
  })

  it('what changed: the refusal, the first pair read the same way, and the link to the dated list', () => {
    expect(text).toContain('Not read as a change: we changed our searches in September.')
    expect(text).toContain('The first comparison read the same way: October against November, from the 6 Dec update, if nothing we search changes.')
    expect(render(<OverviewPage data={marketFrontFixture()} />)).toContain(`href="${WHAT_WE_CHANGED_HREF}"`)
  })

  it('prints no "moved", no arrow and no direction word anywhere on the page', () => {
    expect(text).not.toMatch(/\bmoved\b/)
    expect(text).not.toMatch(/[▲▼]/)
  })
})

describe('the makers rule and the lead (decision F; §7.11)', () => {
  it('never puts a maker-led theme first on the board', () => {
    const board = marketFrontFixture().themes!
    expect(segmentOf(board.rows[0])).toBeNull()
  })

  it('never leads or quotes with a theme over a quarter makers: not "Ready to buy handmade bags" (its staging twin measured 36%)', () => {
    const data = marketFrontFixture()
    const lead = data.hero?.kind === 'themes' ? data.hero.lead : null
    expect(lead?.registryId).not.toBe('th-ready-to-buy')
    expect(renderText(overviewSentence.render(data, 'app', ctx))).not.toContain('voice on “Ready to buy')
  })

  it('before MF1 is applied groups nothing, names no lead, prints no voice and says makers are not marked yet', () => {
    const data = marketBeforeMakersFixture()
    const t = read(<OverviewPage data={data} />)
    expect(t).toContain('Makers’ videos are not marked yet; this list groups them once they are.')
    expect(t).not.toContain('voice on')
    expect(t).toContain('Its biggest conversations, of the 626 category videos:')
  })
})

describe('nothing skipped (§5.9)', () => {
  it('every theme at 10+ is a board row, grouped, or counted; the top ten not led by makers are all rows', () => {
    const board = marketFrontFixture().themes!
    const atTen = septemberThemes().filter((t) => t.k >= 10)
    expect(board.atTen).toBe(atTen.length)
    const onBoard = new Set(board.rows.map((r) => r.registryId))
    const notLed = atTen.filter((t) => segmentOf(t) == null).sort((a, b) => b.k - a.k || (b.prev?.k ?? 0) - (a.prev?.k ?? 0))
    for (const t of notLed.slice(0, 10)) expect(onBoard.has(t.registryId), t.label).toBe(true)
    for (const t of atTen) {
      const accounted = onBoard.has(t.registryId) || segmentOf(t) === 'makers' || segmentOf(t) === 'noise'
      expect(accounted || notLed.indexOf(t) >= 10, t.label).toBe(true)
    }
  })
})

describe('the first screen holds at most 30 numbers (decision B)', () => {
  it('the bar, "The month" and the board’s first five rows', () => {
    const data = marketFrontFixture()
    const board = data.themes!
    const firstScreen = [
      blockAnswers(overviewSentence, data).figures,
      themeFigures(board, board.rows.slice(0, 5)),
    ]
    const count = figureCount(firstScreen)
    expect(count).toBeLessThanOrEqual(NUMBER_BUDGET)
    // It is a real page's worth, not trivially under.
    expect(count).toBeGreaterThan(15)
  })

  it('no block prints more than 12 rows (decision B)', () => {
    const data = marketFrontFixture()
    expect(data.themes!.rows.length).toBeLessThanOrEqual(12)
    expect(data.category.market!.kinds.length).toBeLessThanOrEqual(12)
    expect(data.subjects.rows.length).toBeLessThanOrEqual(12)
  })
})

describe('the 25 Sep rulings on Your market (§5.12)', () => {
  const rootOf = (node: unknown): ReactElement<Record<string, unknown>> | null =>
    isValidElement(node) ? (node as ReactElement<Record<string, unknown>>) : null

  it('every block header is its title alone and every footer holds a link alone, in every mode and state', () => {
    for (const [name, make] of STATES) {
      const data = make()
      for (const block of FRONT_PAGE_BLOCKS) {
        for (const mode of MODES) {
          const root = rootOf(block.render(data, mode, ctx))
          expect(root?.type, `${name} ${block.key} ${mode}`).toBe(BlockFrame)
          expect(root?.props.meta, `${name} ${block.key} ${mode} meta`).toBeUndefined()
          expect(root?.props.footerNote, `${name} ${block.key} ${mode} footerNote`).toBeUndefined()
          expect(root?.props.title, `${name} ${block.key} title`).toBe(MARKET_TITLES[block.key])
          const footer = root?.props.footer
          if (mode === 'print') expect(footer, `${name} ${block.key} print footer`).toBeNull()
          else expect(render(<>{footer as never}</>), `${name} ${block.key} footer`).toMatch(/^<a [^>]*href="[^"]+"[^>]*>[^<]+<\/a>$/)
        }
      }
    }
  })

  it('titles the first block "The month"', () => {
    expect(MARKET_TITLES['overview.sentence']).toBe('The month')
  })

  it('prints no "how sound" string, and keeps the copy contract, in every block, mode and state', () => {
    for (const [name, make] of STATES) {
      const data = make()
      expect(renderText(<OverviewPage data={data} />).toLowerCase(), name).not.toContain('how sound')
      for (const block of FRONT_PAGE_BLOCKS) {
        for (const mode of MODES) {
          const markup = render(block.render(data, mode, ctx))
          expect(markup.toLowerCase(), `${name} ${block.key} ${mode}`).not.toContain('how sound')
          expect(markup, `${name} ${block.key} ${mode}`).not.toContain('[[')
          assertCopyContract(markup)
        }
      }
    }
  })
})

describe('Össur, paused, with no maker rule and no subjects (§2.13, §5.2)', () => {
  const text = read(<OverviewPage data={ossurFrontFixture()} />)

  it('reads September as at the 13 Sep update, updates paused', () => {
    expect(text).toContain('as at the 13 Sep update · updates paused')
  })

  it('states its biggest conversations as levels, with no makers line and no "buyer"', () => {
    expect(text).toContain('Its biggest conversations, of the 338 category videos:')
    expect(text).not.toContain('Makers and DIY')
    expect(text.toLowerCase()).not.toContain('buyer')
  })

  it('lists "Brand boycott over politics" at 16 on the board', () => {
    expect(read(overviewThemes.render(ossurFrontFixture(), 'app', ctx))).toContain('Brand boycott over politics 16')
  })

  it('says "No subjects named yet" in one line, and promises no update', () => {
    expect(text).toContain('No subjects named yet')
    expect(text).not.toContain('from the 6 Dec update')
    expect(text).toContain('are not read for this workspace yet')
  })
})

describe('a stored copy from before WP1.6 renders as it was sent', () => {
  it('prints the Phase 1 blocks, under their Phase 1 titles', () => {
    const t = renderText(overviewSentence.render(overviewFixture(), 'app', ctx))
    expect(t).toContain('In one sentence')
    expect(t).not.toContain('The month')
  })
})
