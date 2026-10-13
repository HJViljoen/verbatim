import { Suspense } from 'react'
import { renderToReadableStream } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { homeWeekDetail, homeWeeks, WEEKS_FAILED, type HomeWeeks } from '@/lib/pages/home'
import { weekTileOf, type DashboardData, type DashboardReads } from '@/lib/pages/v2/home'
import { DASHBOARD_NOW, dashboardEmptyFixture, dashboardFixture, dashboardThinFixture, fixtureMovesTop, fixturePublished } from '@/lib/pages/v2/home-fixture'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import { CONTENT_PATH, IDEAS_EMPTY, topAskedOf } from '@/lib/pages/v2/content'
import { NEXT_MOVE, NO_MOVE_YET } from '@/lib/pages/v2/moves'
import { contentThinFixture } from '@/lib/pages/v2/content-fixture'
import { ContentPage } from '@/components/pages/v2/content'
import type { MarketWeekRowRaw } from '@/lib/reading/weeks'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { decodeEntities, markupText, render, renderText } from '@/lib/test/render'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { GROUPS_NOT_RUN } from '@/lib/pages/v2/voices'
import { SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { DashboardPage, DashboardStream, FAILED_TILE } from '.'
import { TileBoundary } from './tile-boundary'
import { AGENT_LINE } from './agent-box'
import { MARKET_LEADS, MARKET_NONE, MARKET_NOTHING_ELSE_NEW, MARKET_NOTHING_NEW } from './market-tile'
import { ASKED_TITLE } from './content-tile'
import { MOVES_FIRST_RUN, MOVES_NO_MOVE, MOVES_NO_MOVE_MEMBER, MOVES_NONE_WAITING } from './moves-tile'
import { MOVE_UNREAD } from '@/lib/pages/v2/moves'
import { PRODUCTS_LINES, PRODUCTS_SETTINGS, PRODUCTS_UNREAD } from './products-tile'
import { TILE_FAILED } from './parts'
import { HomeSkeleton } from './skeleton'
import { VOICES_BRANDS_FAILED, VOICES_NONE } from './voices-tile'
import { HomeWeeksPlot } from './weeks-plot'

// The Dashboard's render tier (Design v2, T8): what the page PRINTS, against
// the boards E1-Dashboard and E1-Dashboard-Phone, decision 1, the copy
// contract and the design bans, in every state each tile can be in.

/** A left-stripe accent or a marker highlight (Heinrich's two bans, 30 Sep). */
const STRIPE = /border-l-(?:[2-9]|\[)|border-left:\s*[2-9]|<mark\b|\bw-\[3px\]/

/** The words between a tile's name and the next tile's. */
const tileText = (markup: string, tile: string): string => {
  const i = markup.indexOf(`data-tile="${tile}"`)
  const start = markup.lastIndexOf('<article', i)
  const end = markup.indexOf('</article>', i)
  return markupText(markup.slice(start, end))
}
const tileMarkup = (markup: string, tile: string): string => {
  const i = markup.indexOf(`data-tile="${tile}"`)
  return markup.slice(markup.lastIndexOf('<article', i), markup.indexOf('</article>', i))
}
const page = (data: DashboardData) => <DashboardPage data={data} />

// Decision 3 (13 Oct): both clocks on one Dashboard. Market and the week
// tile read the week's own month (October so far); Voices, Your products and
// Your moves read the reading month, which on 13 October is still September,
// and each says it is the last full month. Where the whole-month tiles read
// the current month they print nothing extra.
describe('the Dashboard\'s two clocks, labelled (decision 3)', () => {
  const markup = render(page(dashboardFixture({ twoClocks: true })))

  it('Market and the week stay on October so far, with no label', () => {
    expect(tileText(markup, 'market')).toMatch(/in October so far/)
    expect(tileText(markup, 'week')).toMatch(/in October so far/)
    for (const t of ['market', 'week', 'content']) expect(tileText(markup, t), t).not.toMatch(/last full month|earlier month/)
  })

  it('Voices and Your products say September, the last full month, under their heads', () => {
    const voices = tileText(markup, 'voices')
    expect(voices).toMatch(/^Voices Open → September · the last full month In the most videos in September Long-time users upgrading/)
    const products = tileText(markup, 'products')
    expect(products).toMatch(/^Your products Open → September · the last full month Named in the most videos Pro-Flex Pivot/)
    expect(products).toContain('came up in September')
  })

  it('Your moves says it in the move\'s sentence, where the month is named', () => {
    expect(tileText(markup, 'moves')).toMatch(/against \d+ of \d+ in September, the last full month/)
  })

  it('the current month prints no label on any tile', () => {
    const t = markupText(render(page(dashboardFixture())))
    expect(t).not.toMatch(/last full month|earlier month/)
    expect(render(page(dashboardFixture()))).not.toContain('data-tile-month')
  })

  it('a failed tile or a state that reads no month carries no label', () => {
    const failed = render(page(dashboardFixture({ twoClocks: true, failed: ['voices', 'products'] })))
    expect(tileText(failed, 'voices')).not.toMatch(/last full month/)
    expect(tileText(failed, 'products')).not.toMatch(/last full month/)
    for (const state of ['not_applied', 'not_on', 'no_catalogue'] as const) {
      expect(tileText(render(page(dashboardFixture({ twoClocks: true, products: state }))), 'products'), state).not.toMatch(/September|last full month/)
    }
    expect(tileText(render(page(dashboardFixture({ twoClocks: true, products: 'quiet' }))), 'products')).toMatch(/September · the last full month None of your products came up in September/)
  })

  it('keeps the copy contract', () => {
    assertCopyContract(page(dashboardFixture({ twoClocks: true })))
  })
})

describe('the Dashboard, as the board draws it (E1-Dashboard)', () => {
  const data = dashboardFixture()
  const markup = render(page(data))
  const text = renderText(page(data))

  it('keeps the copy contract', () => {
    assertCopyContract(page(data))
  })

  it('prints the board\'s tiles in its order, three rows on a twelve-column grid', () => {
    const order = ['Dashboard', 'Week of 5 to 11 October', 'updated Sun 11 Oct', 'next update Sun 18 Oct',
      'Market', 'Open Market', 'Your market this week', 'Voices', 'Your products', 'Content', 'Your moves', 'Agent']
    let at = -1
    for (const words of order) {
      const i = text.indexOf(words, at + 1)
      expect(i, `"${words}" after position ${at}`).toBeGreaterThan(at)
      at = i
    }
    const spans = [...markup.matchAll(/data-tile="([a-z]+)"(?: data-state="[^"]*")? class="[^"]*min-\[1180px\]:col-span-(\d+)/g)].map((m) => `${m[1]}:${m[2]}`)
    expect(spans).toEqual(['market:8', 'week:4', 'voices:4', 'products:4', 'content:4', 'moves:8', 'agent:4'])
    expect(markup.match(/<section aria-label="[^"]*" class="grid grid-cols-12 gap-5">/g)).toHaveLength(3)
  })

  it('Market: the check\'s flag as its chip, the week beside its month and the months before, then three bare weekly counts and one new conversation', () => {
    const t = tileText(markup, 'market')
    expect(t).toContain('Unusual this week')
    expect(t).toContain('Insurance refusals for powered knees')
    expect(t).toMatch(/19 of 252 videos this week, every audience together/)
    expect(t).toMatch(/39 of 1,906 in July to September, the same base/)
    expect(t).toMatch(/31 of 300 category videos in October so far/)
    // Decision 1: no weekly direction word, no "usual" multiple.
    expect(t).not.toMatch(/Rising|usual level|usually|×/)
    expect(t).toMatch(/How long a liner lasts 9 · 14 · 23 videos/)
    expect(t).toMatch(/Waterproof knees New 8 this week · 8 of 300 in October so far/)
    // The chip is a verdict, never a free word.
    expect(tileMarkup(markup, 'market')).toMatch(/data-copy="verdict"[^>]*>Unusual this week</)
  })

  it('Your market this week: the week\'s videos and comments, the month beside them, the weekly volume, the subjects against last month', () => {
    const t = tileText(markup, 'week')
    expect(t).toMatch(/241 videos this week .*3,912 comments · 318 videos and 5,840 comments in October so far/)
    expect(t).toContain('Week by week')
    expect(t).toMatch(/Biggest subject Fit & comfort 34% · 108 of 318/)
    expect(t).toMatch(/Moved most Cost & access ▲ [\d.]+ pts against September/)
    // A subject moving is neither good nor bad news: the badge is neutral, as Market draws it.
    expect(tileMarkup(markup, 'week')).not.toMatch(/data-copy="verdict"><span[^>]*class="[^"]*text-(?:positive|negative|you|good|bad)/)
    expect(t).not.toMatch(/a usual week/)
    // The change is the badge's, in a verdict node.
    expect(tileMarkup(markup, 'week')).toMatch(/<span data-copy="verdict"><span title="moved beyond[^"]*" class="text-xs font-semibold text-muted-foreground">/)
  })

  it('Voices: the group in the most videos as a count of the month\'s, every group a bar of its own, the two brands named most', () => {
    const t = tileText(markup, 'voices')
    expect(t).toMatch(/In the most videos in October so far Long-time users upgrading 86 of 318 videos/)
    expect(t).toMatch(/Named most Össur 41 Ottobock 37/)
    // Decision 2: no share of the mix, no change of it, never one stacked bar.
    expect(t).not.toMatch(/%|\d\s*→|bigger part/)
    expect(tileMarkup(markup, 'voices').match(/role="img"/g)).toHaveLength(4)
  })

  it('Your products: the standout, how many of yours came up, the mini shelf, and the standout\'s count of the month\'s videos', () => {
    const t = tileText(markup, 'products')
    expect(t).toMatch(/Named in the most videos Pro-Flex Pivot 9 of your 38 products came up in October so far .*Pro-Flex Pivot: 9 of 318 videos in October so far\./)
    const shelf = tileMarkup(markup, 'products')
    expect(shelf).toContain('aria-label="Your catalogue: Liners 3 of 8 named, Feet 2 of 9 named, Knees 3 of 6 named, Bracing 1 of 9 named, Sockets 0 of 6 named"')
    // The page's cut (`shelfCut`): never "+1 more" (the lead, 14 Oct). Feet
    // and Bracing hold nine, so the board draws all nine bars of each.
    expect(shelf.match(/data-tone="/g)).toHaveLength(38)
    expect(shelf).not.toContain('data-more=""')
    expect(shelf).toMatch(/role="img"[^>]*class="grid gap-1\.5 max-sm:hidden"/)
  })

  it('Content: the first idea, its four weeks of questions beside its month, its format and opening, your posts, and the medical team line', () => {
    const t = tileText(markup, 'content')
    expect(t).toMatch(/Post next: How long a liner lasts, and when it is time to replace one/)
    // The ideas read the four weeks to their update (Heinrich, 13 Oct), named.
    expect(t).toMatch(/48 of 640 videos, 14 Sep to 11 Oct 35 of 318 in October so far/)
    expect(t).not.toMatch(/videos this week/)
    expect(t).toMatch(/Tutorial 2\.1× Open with a question 1\.8×/)
    expect(t).toContain('None of your 25 posts since August touched on it')
    expect(t).toContain(MEDICAL_LINE)
    // No reply count: nothing can see whether you replied (decision 5).
    expect(t).not.toMatch(/waiting for a reply/)
  })

  it('Your moves: the advice waiting, Accept and Not for us, and the move whose market moved', () => {
    const t = tileText(markup, 'moves')
    expect(t).toMatch(/High priority 3 pieces of advice waiting Set up a reimbursement help desk for powered knees/)
    expect(t).toMatch(/63 videos it rests on, all time · 9 updates in a row, since 27 Jul/)
    expect(t).toMatch(/Accept Not for us/)
    expect(t).toMatch(/After your move/)
    expect(t).toMatch(/Share of market videos on .*: \d+ of \d+ in \w+, the month before, against \d+ of \d+ in/)
  })

  it('the Agent: a question box that opens the Agent with it, and two questions to try', () => {
    const t = tileText(markup, 'agent')
    expect(t).toContain(AGENT_LINE)
    expect(markup).toMatch(/<form[^>]*action="\/dashboard\/agent" method="get"/)
    expect(markup).toContain('name="ask"')
    expect(t).toMatch(/Try asking about How long a liner lasts → Insurance refusals for powered knees →/)
    expect(markup).toContain(`href="/dashboard/agent?ask=${encodeURIComponent('What does my market say about "How long a liner lasts"?')}"`)
  })

  it('every tile links into its page\'s panel', () => {
    expect(markup).toMatch(/href="\/dashboard\/market\?conv=[^"]+&amp;at=top#conv-panel"[^>]*>Open Market →/)
    expect(markup).toContain('href="/dashboard/voices?group=long-time-users#group-panel"')
    expect(markup).toContain('href="/dashboard/products?product=p-pivot#product-panel"')
    expect(markup).toContain('href="/dashboard/content?idea=1#idea-panel"')
    expect(markup).toMatch(/href="\/dashboard\/moves\?advice=[^"]+#advice-panel"/)
  })

  it('prints no comment\'s words, no em dash, no left stripe and no highlight', () => {
    // The one quote node is the move's title: the client's own words, as Your
    // moves marks them. No commenter is quoted at level 1.
    // The quote nodes are the client's own words, as Your moves marks them:
    // the move's title and the subject it is on. No commenter is quoted.
    const quotes = [...markup.matchAll(/data-copy="quote"[^>]*>([^<]*)</g)].map((m) => decodeEntities(m[1]))
    const move = fixtureMovesTop().move!
    expect(quotes).toEqual([move.title, move.label])
    expect(move.kind).toBe('subject')
    expect(text).not.toMatch(/[“”]/)
    expect(text).not.toContain('—')
    expect(markup).not.toMatch(STRIPE)
  })
})

describe('every tile\'s honest state when its page has nothing', () => {
  it('a workspace before its first update: each tile says so, and the page keeps its shape', () => {
    const data = dashboardEmptyFixture()
    const markup = render(page(data))
    assertCopyContract(page(data))
    expect(tileText(markup, 'market')).toContain('first week will appear here after the first update')
    expect(tileText(markup, 'week')).toContain('Insufficient data')
    expect(tileText(markup, 'voices')).toContain(VOICES_NONE)
    expect(tileText(markup, 'products')).toContain(PRODUCTS_LINES.no_catalogue)
    expect(markup).toContain(`href="${PRODUCTS_SETTINGS}"`)
    expect(tileText(markup, 'content')).toContain(IDEAS_EMPTY.not_on)
    expect(tileText(markup, 'moves')).toContain(MOVES_FIRST_RUN)
    expect(tileText(markup, 'agent')).not.toContain('Try')
    expect(renderText(page(data))).not.toContain('Week of')
    expect(markup.match(/data-tile="/g)).toHaveLength(7)
  })

  it.each([
    ['not_applied', PRODUCTS_LINES.not_applied],
    ['not_on', PRODUCTS_LINES.not_on],
    ['no_catalogue', PRODUCTS_LINES.no_catalogue],
    ['quiet', 'None of your products came up in October so far 38 products across 5 categories'],
  ] as const)('Your products, %s', (state, line) => {
    const data = dashboardFixture({ products: state })
    assertCopyContract(page(data))
    expect(tileText(render(page(data)), 'products')).toContain(line)
  })

  it.each(['not_on', 'none', 'stale', 'unread'] as const)('Content, %s: why there is no idea, and where the questions are', (state) => {
    const data = dashboardFixture({ content: state })
    assertCopyContract(page(data))
    const t = tileText(render(page(data)), 'content')
    expect(t).toContain(IDEAS_EMPTY[state])
    expect(t).not.toContain('Post next')
  })

  it('Content, an idea from an older week: says so above it, and still prints the medical team line', () => {
    const data = dashboardFixture({ content: 'older' })
    assertCopyContract(page(data))
    const t = tileText(render(page(data)), 'content')
    expect(t).toMatch(/No new ideas this week\. These are from the week of 28 Sep\. Post next:/)
    expect(t).toContain(MEDICAL_LINE)
  })

  it('Market, no flag: the week\'s biggest new conversation leads, its three weeks as bars', () => {
    const data = dashboardFixture({ flagged: false })
    assertCopyContract(page(data))
    const t = tileText(render(page(data)), 'market')
    // The category's count is named inside the market's (the week tile's 241).
    // The reader flag's chip beside the name, where the board draws its chip.
    expect(t).toMatch(/^Market Open Market → New Waterproof knees 8 of 226 category videos this week \( ?241 in your market\) · 8 of 300 in October so far/)
    expect(tileMarkup(render(page(data)), 'market')).toMatch(/data-copy="verdict"[^>]*>New</)
    expect(t).not.toContain('Unusual this week')
  })

  it('Market, nothing to lead with', () => {
    const data = dashboardFixture()
    const empty: DashboardData = { ...data, market: { state: 'ok', top: { top: { ...(data.market.state === 'ok' ? data.market.top.top! : null!), hero: null, rows: [] }, month: '2026-10-01', marketWeek: 241 } } }
    expect(tileText(render(page(empty)), 'market')).toContain(MARKET_NONE)
    assertCopyContract(page(empty))
  })

  it('Voices, no brand counted yet (Össur before its back-read): the row keeps its chips as the brands tracked, says "not counted yet" once, prints no count and no ranking', () => {
    const data = dashboardFixture({ named: false })
    assertCopyContract(page(data))
    const v = tileMarkup(render(page(data)), 'voices')
    expect(markupText(v)).toMatch(/Tracked not counted yet Össur Ottobock$/)
    expect(markupText(v)).not.toContain('Named most')
    expect(markupText(v).match(/not counted yet/g)).toHaveLength(1)
    const row = v.slice(v.indexOf('data-named='))
    expect(row.match(/data-who-chip/g)).toHaveLength(2)
    expect(row).not.toContain('data-copy="figure"')
  })

  it('Your moves, a member: no Accept and no Not for us', () => {
    const data = dashboardFixture({ moves: 'member' })
    assertCopyContract(page(data))
    const t = tileText(render(page(data)), 'moves')
    expect(t).toContain('Set up a reimbursement help desk for powered knees')
    expect(t).not.toMatch(/Accept|Not for us/)
  })

  it('Your moves, nothing waiting: says so and opens the record; a move with no comparison leaves the column to the advice', () => {
    const none = dashboardFixture({ moves: 'no_advice' })
    assertCopyContract(page(none))
    const t = tileText(render(page(none)), 'moves')
    expect(t).toContain(MOVES_NONE_WAITING)
    expect(render(page(none))).toContain('href="/dashboard/moves?advice=all#advice-record"')
    // No move at all: the board's panel stays, and says so (parity pass).
    const noMove = render(page(dashboardFixture({ moves: 'no_move' })))
    expect(tileText(noMove, 'moves')).toContain(`After your move ${MOVES_NO_MOVE}`)
    expect(tileMarkup(noMove, 'moves')).toContain('md:grid-cols-')
  })

  it('a tile whose read failed loses only itself', () => {
    const data = dashboardFixture({ failed: ['market', 'week', 'voices', 'products', 'content', 'moves'] })
    assertCopyContract(page(data))
    const markup = render(page(data))
    for (const t of ['market', 'week', 'voices', 'products', 'content', 'moves']) expect(tileText(markup, t), t).toContain(TILE_FAILED)
    // The Agent and the bar stand.
    expect(tileText(markup, 'agent')).toContain(AGENT_LINE)
    expect(renderText(page(data))).toContain('Week of 5 to 11 October')
    // One failed tile, the rest drawn.
    const one = render(page(dashboardFixture({ failed: ['voices'] })))
    expect(tileText(one, 'voices')).toContain(TILE_FAILED)
    expect(tileText(one, 'market')).toContain('Unusual this week')
  })
})

describe('the phone board (E1-Dashboard-Phone)', () => {
  const markup = render(page(dashboardFixture()))
  it('drops what the phone board drops, under 640px', () => {
    // The weekly chart, Voices' bars and its brands, the recipe chips, the
    // move beside the advice, the questions to try.
    expect(tileMarkup(markup, 'week')).toMatch(/class="flex flex-col gap-2 max-sm:hidden" data-weeks=""/)
    expect(tileMarkup(markup, 'voices')).toMatch(/role="list"[^>]*class="[^"]*max-sm:hidden/)
    expect(tileMarkup(markup, 'content')).toMatch(/class="flex flex-wrap gap-2 max-sm:hidden"/)
    expect(tileMarkup(markup, 'moves')).toMatch(/bg-inner[^"]*max-sm:hidden/)
    expect(tileMarkup(markup, 'agent')).toMatch(/max-sm:hidden"><span class="text-muted-foreground">Try asking about/)
  })
  it('keeps the week beside its month, and the medical team line, on a phone too', () => {
    expect(tileMarkup(markup, 'market')).not.toMatch(/data-copy="level"[^>]*max-sm:hidden/)
    expect(tileMarkup(markup, 'content')).toMatch(/<p class="m-0 text-\[12px\] leading-\[1\.4\] text-muted-foreground">Check any clinical claim/)
  })
})

describe('the route streams each tile on its own', () => {
  const html = async (reads: DashboardReads): Promise<string> => {
    const stream = await renderToReadableStream(<Suspense fallback={null}><DashboardStream reads={reads} /></Suspense>)
    await stream.allReady
    return new Response(stream).text()
  }
  const settled = (d: DashboardData): DashboardReads => ({
    bar: Promise.resolve(d.bar), market: Promise.resolve(d.market), week: Promise.resolve(d.week), voices: Promise.resolve(d.voices),
    products: Promise.resolve(d.products), content: Promise.resolve(d.content), moves: Promise.resolve(d.moves), agent: Promise.resolve(d.agent),
  })

  it('draws the same tiles as the settled page', async () => {
    const out = await html(settled(dashboardFixture()))
    for (const t of ['market', 'week', 'voices', 'products', 'content', 'moves', 'agent']) expect(out).toContain(`data-tile="${t}"`)
    expect(out).toContain('Unusual this week')
    expect(out).toContain('Week of 5 to 11 October')
  })

  it('paints the shell and every other tile while one tile\'s read is still out', async () => {
    const reads = settled(dashboardFixture())
    let release: (() => void) | null = null
    const slow = new Promise<DashboardData['moves']>((r) => { release = () => r({ state: 'ok', top: null }) })
    const stream = await renderToReadableStream(<DashboardStream reads={{ ...reads, moves: slow }} />)
    const reader = stream.getReader()
    let first = ''
    // Read what is ready before the slow tile settles: the shell with every
    // tile's bones (the Agent's question box drawn at once), then each tile
    // whose read has settled.
    for (let i = 0; i < 20 && !first.includes('data-tile="content"'); i++) {
      const { value, done } = await reader.read()
      if (done) break
      first += new TextDecoder().decode(value)
    }
    expect(first).toContain('aria-label="Loading Your moves"')
    expect(first).toContain('data-tile="agent"')
    expect(first).toContain('data-tile="market"')
    expect(first).not.toContain('data-tile="moves"')
    release!()
    let rest = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      rest += new TextDecoder().decode(value)
    }
    expect(rest).toContain('data-tile="moves"')
  })
})

describe('the Dashboard skeleton', () => {
  it('names the page, says it is loading, and draws a tile\'s bones in each tile\'s place', () => {
    const markup = render(<HomeSkeleton />)
    expect(renderText(<HomeSkeleton />)).toContain('Dashboard')
    expect(markup).toMatch(/role="status"/)
    expect(markup.match(/min-\[1180px\]:col-span-8/g)).toHaveLength(2)
    expect(markup.match(/min-\[1180px\]:col-span-4/g)).toHaveLength(5)
    expect(markup).not.toMatch(STRIPE)
  })
})

// ---- Week by week's numbers on hover, focus or a tap (Heinrich, 5 Oct), kept ----------

const tooltipOf = (markup: string): string | null => {
  const i = markup.indexOf('role="tooltip"')
  return i < 0 ? null : markup.slice(markup.lastIndexOf('<div', i))
}
const figuresOf = (markup: string): string[] => [...markup.matchAll(/data-copy="figure"[^>]*>([^<]*)</g)].map((m) => m[1])
const buttonsOf = (markup: string): [string, string][] =>
  [...markup.matchAll(/<button type="button" aria-label="([^"]*)" data-week="([^"]*)"/g)].map((m) => [m[2], m[1]])

describe('Week by week shows a week\'s numbers on hover, focus or a tap (Heinrich, 5 Oct), in the tile', () => {
  it('makes every drawn week a button named with its numbers, the faint one "still filling"', () => {
    const markup = render(page(dashboardFixture()))
    const buttons = buttonsOf(markup)
    expect(buttons).toHaveLength(8)
    expect(buttons[0]).toEqual(['2026-08-17', 'Week of 17 Aug, 198 videos, 3,110 comments'])
    expect(buttons[7]).toEqual(['2026-10-05', 'Week of 5 Oct, 241 videos, 3,912 comments, still filling'])
    expect(markup).not.toContain('role="tooltip"')
    expect(buttonsOf(render(page(dashboardEmptyFixture())))).toEqual([])
  })

  it('opens on a week: its videos and comments as figures, in palette A and the copy contract, at the tile\'s size', () => {
    const weeks = dashboardFixture().week.state === 'ok' ? (dashboardFixture().week as { state: 'ok'; top: { weeks: HomeWeeks } }).top.weeks : null!
    const details = weeks.columns.map(homeWeekDetail)
    const settled = render(<HomeWeeksPlot size="sm" weeks={weeks} details={details} label="Week by week" open={6} />)
    expect(settled).toContain('h-[112px]')
    const tip = tooltipOf(settled)!
    expect(figuresOf(tip)).toEqual(['219', '3,480'])
    expect(markupText(tip)).toBe('Week of 28 Sep 219 videos 3,480 comments')
    const faint = tooltipOf(render(<HomeWeeksPlot size="sm" weeks={weeks} details={details} label="Week by week" open={7} />))!
    expect(markupText(faint)).toBe('Week of 5 Oct still filling 241 videos 3,912 comments')
    for (const t of [tip, faint]) {
      expect(t).toContain('bg-tile')
      expect(t).not.toMatch(/#[0-9A-Fa-f]{6}/)
      expect(t).not.toMatch(STRIPE)
    }
    assertCopyContract(<HomeWeeksPlot size="sm" weeks={weeks} details={details} label="Week by week" open={7} />)
  })

  it('prints the numbers of the rows the bars draw, never counted again: Sealand, 5 Oct, with the unchecked video left out', () => {
    const row = (week: string, videos: number, comments: number, unchecked: number, uc: number): MarketWeekRowRaw => ({
      week, audience: 'industry-other', videos, comments, comments_next_month: 0, under_5: 0, median_dated: 6, mean_dated: 9,
      older_videos: 0, unchecked, unchecked_comments: uc, unchecked_comments_next_month: 0, unchecked_under_5: 0, unchecked_older_videos: 0,
    })
    const weeks: HomeWeeks = homeWeeks({
      rows: [row('2026-09-21', 301, 4990, 0, 0), row('2026-09-28', 266, 5029, 1, 1)],
      rivalAudiences: [], changes: [], updates: ['2026-09-27T07:28:35Z', '2026-10-04T12:13:08Z'], now: '2026-10-05T07:00:00Z',
    })!
    const details = weeks.columns.map(homeWeekDetail)
    const drawn = weeks.columns.filter((c) => c.videos != null)
    expect(drawn.map((c) => [c.label, c.videos, c.comments])).toEqual([['21 Sep', 301, 4990], ['28 Sep', 265, 5028]])
    for (const [i, c] of weeks.columns.entries()) {
      if (c.videos == null || c.comments == null) {
        expect(details[i]).toBeNull()
        continue
      }
      const markup = render(<HomeWeeksPlot size="sm" weeks={weeks} details={details} label="Week by week" open={i} />)
      const bar = markup.match(new RegExp(`data-week-state="[a-z]+" data-week="${c.week}" style="height:([0-9.]+)%"`))
      expect(Number(bar![1])).toBeCloseTo((c.videos / weeks.maxVideos) * 88, 6)
      const tip = tooltipOf(markup)!
      expect(figuresOf(tip)).toEqual([c.videos.toLocaleString('en-US'), c.comments.toLocaleString('en-US')])
      expect(buttonsOf(markup).find(([w]) => w === c.week)![1]).toBe(`Week of ${c.label}, ${c.videos.toLocaleString('en-US')} videos, ${c.comments.toLocaleString('en-US')} comments, still filling`)
    }
  })
})

// ---- The fresh check's fixes (T8) --------------------------------------------------------

describe('a tile that throws while it draws loses only itself', () => {
  it('the boundary draws the tile\'s own failed state in its place, and nothing else of its own', () => {
    expect(TileBoundary.getDerivedStateFromError()).toEqual({ failed: true })
    const b = new TileBoundary({ name: 'market', fallback: FAILED_TILE.market, children: <p>the tile</p> })
    expect(render(<>{b.render()}</>)).toBe('<p>the tile</p>')
    b.state = { failed: true }
    const failed = render(<>{b.render()}</>)
    expect(markupText(failed)).toContain(TILE_FAILED)
    expect(failed).toContain('data-tile="market"')
    // Every tile on the page sits inside its boundary (a static render draws the children).
    expect(render(page(dashboardFixture())).match(/data-tile="/g)).toHaveLength(7)
  })

  it('in the stream, a tile view that throws leaves every other tile and the Agent standing', async () => {
    const d = dashboardFixture()
    // A shape the Market view does not expect: a flag with no card.
    const broken = { state: 'ok', top: { top: { hero: { kind: 'flag' }, rows: [], category: { week: 1, month: 1 }, week: { dates: '', inMonth: '', labels: [] }, href: '/dashboard/market' }, month: null, marketWeek: null } } as unknown as DashboardData['market']
    const errors: unknown[] = []
    const stream = await renderToReadableStream(<DashboardStream reads={{
      bar: Promise.resolve(d.bar), market: Promise.resolve(broken), week: Promise.resolve(d.week), voices: Promise.resolve(d.voices),
      products: Promise.resolve(d.products), content: Promise.resolve(d.content), moves: Promise.resolve(d.moves), agent: Promise.resolve(d.agent),
    }} />, { onError: (e) => { errors.push(e) } })
    await stream.allReady
    const out = await new Response(stream).text()
    expect(errors).toHaveLength(1)
    for (const t of ['week', 'voices', 'products', 'content', 'moves', 'agent']) expect(out).toContain(`data-tile="${t}"`)
  })
})

describe('a failed read says so, never "nothing yet"', () => {
  it('Voices: a failed groups read is the failure line; groups not switched on are Voices\' own words; failed brands say so in their row', () => {
    const d = dashboardFixture()
    const voices = d.voices.state === 'ok' ? d.voices.top! : null!
    const failed = { ...d, voices: { state: 'ok' as const, top: { ...voices, group: null, groups: [], groupsState: 'unread' as const, groupsEmpty: 'Who is talking could not be read just now.' } } }
    expect(tileText(render(page(failed)), 'voices')).toContain(TILE_FAILED)
    const off = { ...d, voices: { state: 'ok' as const, top: { ...voices, group: null, groups: [], groupsState: 'not_run' as const, groupsEmpty: GROUPS_NOT_RUN } } }
    expect(tileText(render(page(off)), 'voices')).toContain(GROUPS_NOT_RUN)
    const brands = { ...d, voices: { state: 'ok' as const, top: { ...voices, named: [], brandsState: 'unread' as const } } }
    expect(tileText(render(page(brands)), 'voices')).toContain(`Named most ${VOICES_BRANDS_FAILED}`)
    for (const x of [failed, off, brands]) assertCopyContract(page(x))
  })

  it('Your products: a month not read yet, or a failed read, is not "none named"', () => {
    const unread = dashboardFixture({ products: 'quiet', productsNote: 'unread' })
    expect(tileText(render(page(unread)), 'products')).toContain(PRODUCTS_UNREAD)
    expect(tileText(render(page(unread)), 'products')).not.toContain(PRODUCTS_LINES.quiet)
    const failed = dashboardFixture({ products: 'quiet', productsNote: 'failed' })
    expect(tileText(render(page(failed)), 'products')).toContain(TILE_FAILED)
    for (const x of [unread, failed]) assertCopyContract(page(x))
  })
})

describe('the board\'s details (the fresh check)', () => {
  const markup = render(page(dashboardFixture()))

  it('Content\'s own-posts line is grey: the tile\'s only orange words are its link', () => {
    const c = tileMarkup(markup, 'content')
    expect(c).toMatch(/<p class="m-0 text-\[13px\] leading-\[1\.4\] text-muted-foreground">None of your/)
    // Past the head (its glyph and its link), no orange words.
    const body = c.slice(c.indexOf('</h2>'))
    expect(body.slice(body.indexOf('</a>'))).not.toContain('text-orange-text')
  })

  it('a link to another page lets the browser land on its panel: no tile link holds the scroll', () => {
    const dir = join(__dirname)
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsx') && !x.endsWith('.test.tsx'))) {
      expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(/scroll=\{false\}/)
    }
  })

  it('a tile with nothing to open links to its page, by `TILE_NAV`', () => {
    const failed = render(page(dashboardFixture({ failed: ['market', 'voices', 'products', 'content', 'moves'] })))
    expect(tileMarkup(failed, 'market')).toContain('href="/dashboard/market"')
    expect(tileMarkup(failed, 'voices')).toContain('href="/dashboard/voices"')
    expect(tileMarkup(failed, 'products')).toContain('href="/dashboard/products"')
    expect(tileMarkup(failed, 'content')).toContain('href="/dashboard/content"')
    expect(tileMarkup(failed, 'moves')).toContain('href="/dashboard/moves"')
  })

  it('the empty week tile says "Insufficient data" once at each width', () => {
    const w = tileMarkup(render(page(dashboardEmptyFixture())), 'week')
    expect(w.match(/Insufficient data/g)).toHaveLength(2)
    expect(w).toMatch(/<p class="m-0 text-\[14px\] leading-\[1\.5\] text-muted-foreground sm:hidden">Insufficient data/)
    expect(w).toMatch(/data-weeks=""[\s\S]*Insufficient data/)
  })

  // Phase 4 fix round: a weekly volume read that THREW printed "Insufficient
  // data", the words for too few clean weeks. Now it says it failed.
  it('a weekly volume read that failed says so, never "Insufficient data"', () => {
    const base = dashboardFixture()
    const read = base.week.state === 'ok' ? base.week.top : null
    const failed = { ...base, week: { state: 'ok' as const, top: { ...weekTileOf({ read: fixturePublished(), weeks: WEEKS_FAILED, subjects: read?.subjects ?? null, now: DASHBOARD_NOW }) } } }
    const w = tileMarkup(render(page(failed)), 'week')
    const chart = w.slice(w.indexOf('data-weeks=""'))
    expect(chart).toContain(TILE_FAILED)
    expect(chart).not.toContain('Insufficient data')
    // The week's own figures still print: only the chart failed.
    expect(markupText(w)).toContain('241 videos this week')
    // Too few clean weeks keeps its words.
    const thin = { ...base, week: { state: 'ok' as const, top: weekTileOf({ read: fixturePublished(), weeks: null, subjects: null, now: DASHBOARD_NOW }) } }
    const t = tileMarkup(render(page(thin)), 'week')
    expect(t.slice(t.indexOf('data-weeks=""'))).toContain('Insufficient data')
    expect(t).not.toContain(TILE_FAILED)
  })
})

describe('the phone board (E1-Dashboard-Phone), after the check', () => {
  const markup = render(page(dashboardFixture()))

  it('the bar is the short line', () => {
    expect(markup).toContain('<span class="sm:hidden">5 to 11 Oct · next update Sun 18 Oct</span>')
    expect(markup).toContain('<span class="max-sm:hidden">Week of 5 to 11 October · updated Sun 11 Oct · next update Sun 18 Oct</span>')
  })

  it('Your market this week is one line of figures, the month still beside the week, and no chart', () => {
    const w = tileMarkup(markup, 'week')
    expect(markupText(w.match(/<span class="[^"]* sm:hidden">videos ·[\s\S]*?in October so far<\/span>/)![0])).toBe('videos · 3,912 comments this week · 318 in October so far')
    expect(w).toMatch(/data-weeks=""/)
  })

  it('the phone board\'s one "Moved most" row, in every state, with no hairline over it; the biggest subject is the wide board\'s', () => {
    const d = dashboardFixture()
    const week = d.week.state === 'ok' ? d.week.top : null!
    const only = { ...d, week: { state: 'ok' as const, top: { ...week, subjects: { ...week.subjects!, moved: null, noneMoved: false } } } }
    for (const m of [tileMarkup(render(page(only)), 'week'), tileMarkup(markup, 'week')]) {
      expect(m).toMatch(/<div data-subjects="ready" class="flex flex-col gap-1\.5 border-t border-track pt-3 text-\[13\.5px\] leading-\[1\.4\] max-sm:border-t-0 max-sm:pt-0">/)
      expect(m).toMatch(/max-sm:hidden"><span class="whitespace-nowrap text-muted-foreground">Biggest subject/)
      expect(m).toMatch(/<div class="grid grid-cols-\[auto_minmax\(0,1fr\)\] items-baseline gap-3"><span class="whitespace-nowrap text-muted-foreground">Moved most/)
    }
    expect(markupText(tileMarkup(render(page(only)), 'week'))).toMatch(/Moved most no comparison with September yet$/)
  })
})

// THE PARITY PASS (13 Oct; Heinrich: "the page shouldn't look too different
// if everything isn't as populated as the design"). The board's tiles keep
// their parts in every data state: the thin states as Össur and Sealand read
// today draw the same parts as the board's full one, each gap said inside its
// part in one quiet line.
describe('the board\'s shape holds when the data is thin (parity pass)', () => {
  /** The parts the board draws in each tile, as the markup holds them. */
  const shapeOf = (markup: string) => {
    const t = (k: string) => tileMarkup(markup, k)
    return {
      market: {
        chip: /data-chip="leads"|data-copy="verdict"/.test(t('market')),
        title: t('market').includes('<h3'),
        chart: /<svg[^>]*role="img"/.test(t('market')),
        rows: (t('market').match(/border-t border-track py-2\.5/g) ?? []).length,
      },
      week: {
        figure: t('week').includes('text-[40px]'),
        weeks: (t('week').match(/data-week-state="/g) ?? []).length,
        subjects: (markupText(t('week')).match(/Biggest subject|Moved most/g) ?? []).length,
      },
      voices: { title: t('voices').includes('<h3'), bars: t('voices').includes('role="list"'), named: t('voices').includes('data-named=') },
      products: { title: t('products').includes('<h3'), shelf: /role="img"|data-shelf="ghost"/.test(t('products')) },
      content: { title: t('content').includes('<h3'), figure: t('content').includes('text-[30px]') },
      moves: { title: t('moves').includes('<h3'), panel: markupText(t('moves')).includes('After your move') },
    }
  }
  const board = shapeOf(render(page(dashboardFixture())))
  const thin = dashboardThinFixture()
  const sealand = dashboardThinFixture({ tenant: 'sealand' })

  it('the full fixture draws every part the board draws', () => {
    expect(board).toEqual({
      market: { chip: true, title: true, chart: true, rows: 2 },
      week: { figure: true, weeks: 8, subjects: 2 },
      voices: { title: true, bars: true, named: true },
      products: { title: true, shelf: true },
      content: { title: true, figure: true },
      moves: { title: true, panel: true },
    })
  })

  it.each([['Össur today', thin], ['Sealand today', sealand]] as const)('%s: the same parts, in the same places, and the copy contract', (_name, data) => {
    expect(shapeOf(render(page(data)))).toEqual(board)
    assertCopyContract(page(data))
    expect(render(page(data)).match(/data-tile="/g)).toHaveLength(7)
  })

  const markup = render(page(thin))

  it('Market: the lead with its chip beside its name, the week\'s biggest, and the new row saying nothing was', () => {
    const t = tileText(markup, 'market')
    expect(t).toMatch(new RegExp(`^Market Open Market → ${MARKET_LEADS} How long a liner lasts 23 of 226 category videos this week`))
    // Where nothing more is new, the week's next conversation keeps the
    // board's second row, and one quiet line says nothing is new.
    expect(t).toMatch(new RegExp(`Sweat under the liner 12 · 15 · 21 videos Insurance refusals for powered knees 6 · 5 · 19 videos ${MARKET_NOTHING_NEW}$`))
    expect(tileMarkup(markup, 'market')).toMatch(/data-chip="leads" class="bg-accent text-accent-foreground/)
  })

  it('Your market this week: every week a faint slot on the board\'s axis, the gap said once in the chart\'s key, both subject rows', () => {
    const w = tileMarkup(markup, 'week')
    expect(w.match(/data-week-state="empty"/g)).toHaveLength(8)
    expect(markupText(w.slice(w.indexOf('data-weeks=""'))).match(/Insufficient data/g)).toHaveLength(1)
    expect(markupText(w)).toMatch(new RegExp(`Biggest subject ${SUBJECT_NOT_MEASURED} Moved most ${SUBJECT_NOT_MEASURED}$`))
    expect(SUBJECT_NOT_MEASURED).toBe('Not measured yet')
    const s = tileText(render(page(sealand)), 'week')
    expect(s).toMatch(/Biggest subject Fit & comfort 34% · 108 of 318 Moved most no comparison with September yet$/)
  })

  it('Your products, not switched on: the catalogue as the mini shelf, unshaded, its size, and why in one line', () => {
    const p = tileMarkup(markup, 'products')
    expect(markupText(p)).toMatch(/Your catalogue 38 products across 5 categories .*Product readings are not switched on for this workspace yet\.$/)
    expect(p.match(/data-tone="unread"/g)).toHaveLength(38)
    expect(p).not.toContain('data-more=""')
    expect(p).not.toMatch(/data-tone="[0-3]"/)
    const none = tileMarkup(render(page(sealand)), 'products')
    expect(none).toContain('data-shelf="ghost"')
    expect(markupText(none)).toContain(PRODUCTS_LINES.no_catalogue)
    expect(none).toContain(`href="${PRODUCTS_SETTINGS}"`)
  })

  it('Content, no post ideas: the week\'s most-asked question your posts have not touched, beside its month, then why there is no idea', () => {
    const t = tileText(markup, 'content')
    expect(t).toBe(`Content Open → ${ASKED_TITLE}: How long a liner lasts 23 of 226 videos this week 35 of 300 in October so far Who asks New amputees in their first year None of your 25 posts since August touched on it Sweat under the liner 21 this week · 30 of 300 in October so far ${IDEAS_EMPTY.not_on}`)
    // Nothing pins the why line to the tile's foot (it flows).
    expect(tileMarkup(markup, 'content')).not.toContain('mt-auto')
    // It opens Content's first question card, which holds its question (the
    // cards hold the top questions; Also asked goes on after them), and the
    // next question opens the next card.
    expect(tileMarkup(markup, 'content')).toContain('href="/dashboard/content#idea-slot-1"')
    expect(tileMarkup(markup, 'content')).toContain('href="/dashboard/content#idea-slot-2"')
    expect(tileMarkup(markup, 'content')).not.toContain('#also-asked')
  })

  it('Your moves: the newest move keeps the panel, its month before printed and its own month left open', () => {
    const t = tileText(markup, 'moves')
    expect(t).toMatch(/After your move Create a guided access path, not a standalone price answer 4% → Share of market videos on Cost and affordability frustration ?: 19 of 521 in September, before the move\. October reads once the month has been read\.$/)
    expect(tileMarkup(markup, 'moves')).toContain('href="/dashboard/moves#move-m-access"')
  })

  it('a dump from before the parity pass (no `tracked`, `asked`, unread shelf or `newest`) still draws, each part saying why', () => {
    const old = dashboardThinFixture()
    const strip = <T,>(r: { state: string; top?: T }, f: (t: T) => T) => (r.state === 'ok' ? { ...r, top: f(r.top as T) } : r)
    const data = {
      ...old,
      voices: strip(old.voices, (v) => (v ? { ...v, tracked: undefined } : v)),
      products: strip(old.products, (p) => ({ ...p, columns: undefined })),
      content: strip(old.content, (c) => ({ ...c, asked: undefined })),
      moves: strip(old.moves, (m) => (m ? { ...m, newest: undefined } : m)),
    } as DashboardData
    assertCopyContract(page(data))
    const m = render(page(data))
    expect(tileText(m, 'voices')).toMatch(/Named most not counted yet$/)
    expect(tileMarkup(m, 'products')).toContain('data-shelf="ghost"')
    expect(tileText(m, 'content')).toContain(IDEAS_EMPTY.not_on)
    expect(tileText(m, 'moves')).toContain(`After your move ${MOVES_NO_MOVE}`)
  })
})

// Ruling U6: "calibration" is the operator's word, never a client's. No tile
// prints it, in any state (Market's thin subjects say "Not measured yet").
describe('no tile says "calibration" (ruling U6)', () => {
  it.each([
    ['the full fixture', dashboardFixture()],
    ['Össur today', dashboardThinFixture()],
    ['Sealand today', dashboardThinFixture({ tenant: 'sealand' })],
    ['before the first update', dashboardEmptyFixture()],
    ['every tile failed', dashboardFixture({ failed: ['market', 'week', 'voices', 'products', 'content', 'moves'] })],
    ['two clocks', dashboardFixture({ twoClocks: true })],
  ] as const)('%s', (_name, data) => {
    const markup = render(page(data))
    for (const t of ['market', 'week', 'voices', 'products', 'content', 'moves', 'agent']) expect(tileText(markup, t), t).not.toMatch(/calibrat/i)
    expect(markupText(markup)).not.toMatch(/calibrat/i)
  })
})

// The fresh check on the parity pass (13 Oct).
describe('the thin states, after the fresh check', () => {
  const mixed = dashboardThinFixture({ weeks: 'partial', market: 'flag_new_biggest', moves: 'refused' })
  const markup = render(page(mixed))

  it('keeps the copy contract and the board\'s parts', () => {
    assertCopyContract(page(mixed))
    expect(markup.match(/data-tile="/g)).toHaveLength(7)
  })

  it('Market: a row first heard this week carries its chip, and the line never says "Nothing new" beside it', () => {
    const t = tileText(markup, 'market')
    expect(t).toMatch(/How long a liner lasts New 9 · 14 · 23 videos/)
    expect(t).toMatch(new RegExp(`${MARKET_NOTHING_ELSE_NEW}$`))
    expect(t).not.toContain(MARKET_NOTHING_NEW)
    // Wherever any conversation on the tile is new, the line says "else".
    for (const d of [dashboardFixture({ flagged: false }), mixed, dashboardThinFixture()]) {
      const m = tileText(render(page(d)), 'market')
      if (/\bNew\b/.test(m.replace(MARKET_NOTHING_ELSE_NEW, ''))) expect(m).not.toContain(MARKET_NOTHING_NEW)
    }
  })

  it('Your market this week: some weeks drawn, the rest low faint wells on the baseline, never as tall as a week', () => {
    const w = tileMarkup(markup, 'week')
    expect(w.match(/data-week-state="(?:settled|filling)"/g)).toHaveLength(3)
    const wells = w.match(/<div aria-hidden="true" class="[^"]*" data-week-state="empty"/g) ?? []
    expect(wells).toHaveLength(5)
    for (const x of wells) {
      expect(x).toContain('h-2')
      expect(x).not.toMatch(/h-\[\d+%\]/)
    }
    // Weeks drawn: the key names the two series, and no gap line.
    expect(markupText(w)).toContain('Videos Comments')
    expect(markupText(w)).not.toContain('Insufficient data')
  })

  it('Your moves: a comparison that may not print shows its latest month alone, with no arrow and no open after side', () => {
    const m = tileMarkup(markup, 'moves')
    const panel = m.slice(m.indexOf('data-move="newest"'))
    expect(markupText(panel)).toMatch(/4% Share of market videos on Cost and affordability frustration ?: 23 of 521 in September, the last full month\.$/)
    expect(panel).not.toContain('→')
    expect(panel).not.toContain('border-dashed')
  })

  it('Your moves: a move no line can be drawn for says why, and prints no level', () => {
    const t = tileText(render(page(dashboardThinFixture({ moves: 'unread_move' }))), 'moves')
    expect(t).toMatch(new RegExp(`After your move Create a guided access path, not a standalone price answer ${MOVE_UNREAD.several}$`))
    expect(t).not.toMatch(/\d+%/)
  })

  it('Your moves, no move: an owner is told what makes one; a member, who cannot, is not told to accept advice', () => {
    expect(tileText(render(page(dashboardThinFixture({ moves: 'no_move' }))), 'moves')).toContain(MOVES_NO_MOVE)
    const member = tileText(render(page(dashboardThinFixture({ moves: 'no_move_member' }))), 'moves')
    expect(member).toContain(MOVES_NO_MOVE_MEMBER)
    expect(member).not.toMatch(/accept|date a change/i)
  })

  it('Your moves, no move: the tile says what Your moves says (the merge, 13 Oct)', () => {
    // The page's card title, and its invitation only where the page gives it.
    expect(MOVES_NO_MOVE).toBe(`${NO_MOVE_YET.title}. ${NEXT_MOVE.line}`)
    expect(MOVES_NO_MOVE_MEMBER).toBe(`${NO_MOVE_YET.title}.`)
    for (const w of [MOVES_NO_MOVE, MOVES_NO_MOVE_MEMBER]) expect(w).not.toMatch(/accept/i)
    // A dump from before `invite`: no invitation, whoever reads it.
    const old = dashboardThinFixture({ moves: 'no_move' })
    const top = old.moves.state === 'ok' ? old.moves.top! : null
    const stripped = { ...old, moves: { state: 'ok' as const, top: { ...top!, invite: undefined } } }
    expect(tileText(render(page(stripped)), 'moves')).toContain(MOVES_NO_MOVE_MEMBER)
  })

  it('Content: where your posts could not be read, a neutral title (nothing was left out), the week named by Content\'s rule', () => {
    const base = dashboardThinFixture()
    const c = base.content.state === 'ok' ? base.content.top : null!
    for (const own of [null, { state: 'unread' as const, touched: 0, posts: 0, since: '2026-08-01' }]) {
      const d = { ...base, content: { state: 'ok' as const, top: { ...c, asked: { ...c.asked!, own } } } }
      assertCopyContract(page(d))
      const t = tileText(render(page(d)), 'content')
      expect(t).toMatch(/^Content Open → Asked this week: How long a liner lasts 23 of 226 videos this week/)
      expect(t).not.toContain(ASKED_TITLE)
    }
    const days = { ...base, content: { state: 'ok' as const, top: { ...c, asked: { ...c.asked!, own: null, weekWords: 'between 28 Sep and 11 Oct' } } } }
    expect(tileText(render(page(days)), 'content')).toMatch(/Asked between 28 Sep and 11 Oct: How long a liner lasts 23 of 226 videos between 28 Sep and 11 Oct/)
  })
})

describe('the Content tile lands where it says (merge, 13 Oct)', () => {
  it('its question opens the page\'s first question card, and that card holds the same question', () => {
    const data = contentThinFixture()
    const t = topAskedOf({ asked: data.asked, lead: data.ideas.questions }, data.market, data.month, null)!
    const tile = tileMarkup(render(page({ ...dashboardFixture(), content: { state: 'ok', top: { state: 'not_on', idea: null, href: CONTENT_PATH, line: IDEAS_EMPTY.not_on, asked: t } } })), 'content')
    expect(tile).toContain(`href="${t.href}"`)
    const markup = render(<ContentPage data={data} />)
    const id = t.href.split('#')[1]
    const at = markup.indexOf(`<article id="${id}"`)
    expect(at).toBeGreaterThan(-1)
    const card = markup.slice(at, markup.indexOf('</article>', at))
    expect(card).toContain('data-idea-slot="question"')
    expect(decodeEntities(card)).toContain(t.label)
    // The row's first card: no idea card and no question card before it.
    expect(markup.slice(0, at)).not.toMatch(/<article id="idea-(slot-)?\d/)
    // Not the Also asked table's first row, which goes on after the cards.
    expect(data.asked.rows[0]?.registryId).not.toBe(t.registryId)
  })
})
