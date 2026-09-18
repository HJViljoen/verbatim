import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { appBaseUrl } from '@/lib/site'
import { weekdayDate } from '@/lib/format'
import { loadOverview, longMonth, type OverviewData } from '@/lib/pages/overview'
import type { PageModule, PrintVariant, Renderable, Slide } from '@/lib/renderables/types'
import { OVERVIEW_BLOCKS } from './index'

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
 * IT COMPOSES NOTHING. The seven blocks already render three modes and already
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
      title: block.title,
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
 * who else is in it, and what the reading is made of. `full` adds nothing —
 * Overview has no per-item detail pane to append, which is what that variant is
 * for on Competitive and Market.
 */
function overviewSlides(_data: OverviewData, _variant: PrintVariant): Slide[] {
  return [
    { title: 'This month’s reading', keys: ['overview.bar', 'overview.sentence', 'overview.subjects'], layout: 'grid' },
    { title: 'The category and the rivals', keys: ['overview.category', 'overview.rivals'], layout: 'grid' },
    { title: 'What we are doing, and how sound this is', keys: ['overview.moves', 'overview.record'], layout: 'grid' },
  ]
}

export const overviewPage: PageModule<OverviewData> = {
  key: 'overview',
  title: 'Overview',
  load: loadOverview,
  slides: overviewSlides,
  renderables,
  snapshotTitle: (d) => `Overview · ${d.brand} · ${longMonth(d.month)}`,
  printContext: (d) => `${d.brand} · ${longMonth(d.month)} · as at ${weekdayDate(d.readingAt)}`,
}
