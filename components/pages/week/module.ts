import { weekdayDate } from '@/lib/format'
import { loadWeek, type WeekData } from '@/lib/pages/week'
import type { PageModule, Renderable, Slide } from '@/lib/renderables/types'
import { WEEK_BLOCKS, weekContext } from '.'

/**
 * This week as a page module — what an export addresses (Block D wave 2,
 * E-week).
 *
 * WHY IT EXISTS. The artboard's page bar carries an Export control and this
 * port mounts it, which means the route behind it has to resolve: `/api/export`
 * looks the page up in `components/pages/registry.ts` and refuses a key it does
 * not know ("That page cannot be exported yet"). The module is here rather than
 * in the registry because the registry is another package's file this wave —
 * ONE LINE joins them:
 *
 *     import { weekPage } from './week/module'   // and `week: weekPage,` in PAGES
 *
 * until which the control answers the route's own refusal rather than a 500.
 * The rest of an export needs nothing new: a block already renders in `print`
 * mode, and its key is already `<page>.<tile>`.
 *
 * THE SLIDES ARE THE PAGE'S OWN ORDER. One block per slide keeps a tile whole
 * on paper, and `WEEK_BLOCKS` is the artboard's order, so a printed reading
 * and the page a reader printed it from are the same reading in the same
 * sequence. Pagination is decided here and never by the browser (the render
 * pipeline's own rule).
 */

const renderables: Record<string, Renderable<WeekData>> = Object.fromEntries(
  WEEK_BLOCKS.map((block) => [block.key, {
    key: block.key,
    title: block.title,
    // THE PAGE'S OWN CONTEXT, so a printed tile's links are the app's relative
    // ones rather than a second set composed here.
    render: (data: WeekData, mode) => block.render(data, mode, weekContext()),
  } satisfies Renderable<WeekData>]),
)

function weekSlides(data: WeekData): Slide[] {
  void data
  return WEEK_BLOCKS.map((block) => ({ title: block.title, keys: [block.key], layout: 'single' as const }))
}

export const weekPage: PageModule<WeekData> = {
  key: 'week',
  title: 'This week',
  load: loadWeek,
  slides: weekSlides,
  renderables,
  snapshotTitle: (d) => `This week · ${d.brand} · ${weekdayDate(d.update.date)}`,
}
