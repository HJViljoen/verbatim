import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { appBaseUrl } from '@/lib/site'
import { shortDate, weekdayDate } from '@/lib/format'
import { loadOverview, longMonth, type OverviewData } from '@/lib/pages/overview'
import type { PageModule, PrintVariant, Renderable, Slide } from '@/lib/renderables/types'
import { MARKET_TITLES, OVERVIEW_BLOCKS } from './index'
import { isMarketPage } from './market'

/**
 * Overview as an EXPORTABLE page (Block D wave 2, `main.bar.export`).
 *
 * WHY THE CONTROL NEEDED THIS FILE. The artboard draws an Export button in the
 * page bar; mounting one without a module registered in
 * `components/pages/registry.ts` would give a paying reader a control whose
 * every job answers "That page cannot be exported yet" — a copy claim about
 * behaviour that does not match the code, which is the one thing AGENTS.md
 * names outright. `overview` has been a `PageKey` since WP9 with no module
 * behind it; this is the module, and it is thin on purpose.
 *
 * IT COMPOSES NOTHING. The six blocks already render three modes and already
 * declare their own figures, verdicts and quotes (`lib/blocks/types.ts`), so a
 * renderable here is the block with a `RenderMode` and a context — not a second
 * rendering of the same reading. That is the whole reason the block spine
 * exists: the page, the PDF, the PNG and the email are one reading rather than
 * four chances to answer one question four ways.
 *
 * THE CONTEXT IS ABSOLUTE HERE AND EMPTY IN THE APP. A `Renderable.render` has
 * no `BlockContext` parameter, so it builds one — and everything this module
 * renders leaves the app (a PDF, a PNG, a share page), where a relative
 * `/dashboard/market` resolves against the wrong origin or against none.
 * `components/pages/overview/index.tsx` passes the empty string for the same
 * reason in reverse.
 */

const ctx = () => blockContext(appBaseUrl(), EMAIL)

const renderables: Record<string, Renderable<OverviewData>> = Object.fromEntries(
  OVERVIEW_BLOCKS.map((block) => [
    block.key,
    {
      key: block.key,
      // The front page's name for a reworked block (market-first WP1.6).
      title: MARKET_TITLES[block.key] ?? block.title,
      render: (data: OverviewData, mode) => block.render(data, mode, ctx()),
      email: (data: OverviewData) => block.render(data, 'email', ctx()),
    } satisfies Renderable<OverviewData>,
  ]),
)

/**
 * Three slides, in the page's own order.
 *
 * PAGINATION IS DECIDED HERE, not by the browser (`PageModule.slides`). The
 * split follows the reading rather than the pixel count: what the month says,
 * who else is in it, and what is being done about it. (The third slide also
 * carried OV6 until the 25 Sep rulings took it off the page.) `full` adds
 * nothing — Overview has no per-item detail pane to append, which is what that
 * variant is for on Competitive and Market.
 */
function overviewSlides(data: OverviewData, _variant: PrintVariant): Slide[] {
  // YOUR MARKET, IN THE PAGE'S ORDER (market-first WP1.6): the month and what
  // it talked about; what people did and asked; subjects, brands and what
  // changed. `overview.moves` is not on the page and not on a sheet.
  if (isMarketPage(data)) {
    return [
      { title: `The ${longMonth(data.month)} reading`, keys: ['overview.bar', 'overview.sentence', 'overview.themes'], layout: 'grid' },
      // "With this update" and its weekly bars (WP2.7, WP2.9), on a sheet of
      // their own: the bars need the sheet's width.
      { title: 'With this update', keys: ['overview.arrivals'], layout: 'grid' },
      { title: 'What your market did and asked', keys: ['overview.category', 'overview.asks'], layout: 'grid' },
      { title: 'Subjects, brands and what changed', keys: ['overview.subjects', 'overview.rivals', 'overview.change'], layout: 'grid' },
    ]
  }
  return [
    // THE MONTH BY NAME, NOT "THIS MONTH" (market-first WP1.2): on 1 to 15
    // October the sheet is September's, printed in October.
    { title: `The ${longMonth(data.month)} reading`, keys: ['overview.bar', 'overview.sentence', 'overview.subjects'], layout: 'grid' },
    { title: 'The category and the rivals', keys: ['overview.category', 'overview.rivals'], layout: 'grid' },
    { title: 'What we are doing', keys: ['overview.moves'], layout: 'grid' },
  ]
}

export const overviewPage: PageModule<OverviewData> = {
  key: 'overview',
  // The sidebar's name for the page since deploy 2 (decision K, lib/nav.ts).
  title: 'Your market',
  // The export route, a report's page sections and `render-page.ts` draw the
  // front page, so they build it as "Your market" (WP1.6).
  load: (scope) => loadOverview(scope, { marketFront: true }),
  slides: overviewSlides,
  renderables,
  snapshotTitle: (d) => `Your market · ${d.brand} · ${longMonth(d.month)}`,
  // "AS AT" IS THE LAST UPDATE, NEVER THE CLOCK (market-first WP1.2). A
  // snapshot taken before the reading month existed carries no `reading`, and
  // keeps the words it was built with.
  printContext: (d) => d.reading?.asAt
    ? `${d.brand} · ${longMonth(d.month)} · as at the ${shortDate(d.reading.asAt)} update`
    : `${d.brand} · ${longMonth(d.month)} · as at ${weekdayDate(d.readingAt)}`,
}
