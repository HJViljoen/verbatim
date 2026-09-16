import type { Block } from '@/lib/blocks/types'
import type { OverviewData } from '@/lib/pages/overview'
import type { MonthlyData } from '@/lib/pages/monthly'

/**
 * An Overview block, on the monthly report (Phase 1 WP18).
 *
 * FIVE OF THE EIGHT SECTIONS ARE OVERVIEW'S, and this is how they get there:
 * not by copying them, and not by writing a second block that draws the same
 * table from the same data. `MonthlyData.overview` IS `OverviewData`, so the
 * adapter is a projection and one line of render.
 *
 * WHY NOT JUST PUT THE OVERVIEW BLOCK IN THE ARRANGEMENT. Because `key` is a
 * stored contract. An artefact's stored arrangement names `monthly.subjects`,
 * and the day Overview re-keys or retires a block, an artefact that had stored
 * `overview.subjects` would silently lose a section it had been printing for a
 * year. The monthly report owns its own eight keys; what it does not own is the
 * code behind five of them.
 *
 * THE HEADING IS THE PAGE'S, AND IT HAS TO BE. The mock heads section 4
 * "Rivals' month" where the page heads it "Rivals", and an adapter could carry
 * a different `title` — but a Block renders its OWN heading inside its own
 * frame (`BlockFrame title={overviewRivals.title}`), so an override would reach
 * the deck's sheet heading and the artefact's contents list and NOT the words
 * printed over the table. A reader would see "Rivals' month" at the top of the
 * sheet and "Rivals" three lines under it. One heading is worth more than the
 * mock's adjective, so `title` is forwarded like everything else, and the month
 * is said once, in the masthead, where it belongs.
 *
 * `figures`, `verdicts`, `quotes` and `emptyState` are forwarded untouched for
 * a different reason: those are the READING, and a report that declared
 * different figures from the page it is made of would be a second reading of
 * one month.
 *
 * AND `project` IS FOR WORDS, NEVER FOR NUMBERS. A page may carry a sentence
 * that only makes sense on the page — a control the reader can press, a page
 * name they can click, the build state of something not shipped — and the same
 * block mailed to a client's staff carries it to people with no account. The
 * projection is where an artefact says that sentence its own way. It is handed
 * the page's data and must return the page's data with copy changed and nothing
 * else: a projection that moved a number would make the report a second reading
 * of one month, which is the thing this adapter exists to prevent.
 */
export function fromOverview(
  key: string,
  block: Block<OverviewData>,
  project: (data: OverviewData) => OverviewData = (d) => d,
): Block<MonthlyData> {
  return {
    key,
    title: block.title,
    ...(block.question ? { question: block.question } : {}),
    render(data, mode, ctx) {
      return block.render(project(data.overview), mode, ctx)
    },
    figures(data) {
      return block.figures?.(data.overview) ?? {}
    },
    verdicts(data) {
      return block.verdicts?.(data.overview) ?? []
    },
    quotes(data) {
      return block.quotes?.(data.overview) ?? []
    },
    emptyState(data) {
      return block.emptyState(project(data.overview))
    },
  }
}
