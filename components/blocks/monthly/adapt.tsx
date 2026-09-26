import type { ReactNode } from 'react'
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
 * one month. All five go through the same `phaseOneOverview` view (below), so
 * what the record declares is what the section prints.
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
  /**
   * THE EMAIL ARM, WHERE THE ARTEFACT HAS TO DRAW IT ITSELF (Block D wave 2,
   * E-monthly).
   *
   * A page's email arm and an artefact's email arm are not the same job, and
   * on three of these five sections they had drifted apart badly enough to be
   * the package's largest single gap. Overview's own email arm stacks each
   * subject and each rival into two or three full-width lines, because on the
   * PAGE the email arm is a courtesy: the table it is a fallback for is three
   * feet away. On this artefact the email IS the artefact — six subjects × four
   * aligned columns is the whole argument of section 2, and stacked lines
   * lose the alignment that makes six subjects comparable at a glance.
   *
   * WHAT IT IS NOT IS A SECOND READING. The override takes the SAME projected
   * `OverviewData`, prints the same fields, the same verdicts and the same
   * words; `figures`, `verdicts`, `quotes` and `emptyState` still come from the
   * page's block, untouched, so the record cannot disagree with the render. It
   * changes markup and nothing else — which is exactly what `project` is for
   * words, one rung down.
   *
   * AND IT IS OPTIONAL. Sections with nothing to gain by it (the record) keep
   * the page's arm and inherit every improvement the page makes to it.
   */
  email?: (data: OverviewData, ctx: Parameters<Block<OverviewData>['render']>[2], monthly: MonthlyData) => ReactNode,
): Block<MonthlyData> {
  return {
    key,
    title: block.title,
    ...(block.question ? { question: block.question } : {}),
    render(data, mode, ctx) {
      const projected = project(phaseOneOverview(data.overview))
      if (mode === 'email' && email) return email(projected, ctx, data)
      return block.render(projected, mode, ctx)
    },
    // THE RECORD READS WHAT THE RENDER READS (WP1.6 review): the same Phase 1
    // view of the Overview, so a monthly built on a "Your market" overview
    // never declares the front page's figures under a section that prints
    // the Phase 1 ones.
    figures(data) {
      return block.figures?.(phaseOneOverview(data.overview)) ?? {}
    },
    verdicts(data) {
      return block.verdicts?.(phaseOneOverview(data.overview)) ?? []
    },
    quotes(data) {
      return block.quotes?.(phaseOneOverview(data.overview)) ?? []
    },
    emptyState(data) {
      return block.emptyState(project(phaseOneOverview(data.overview)))
    },
  }
}

/**
 * The Overview as the monthly reads it until WP2.1 rebuilds the monthly
 * (market-first WP1.6; plan §4.0: the monthly keeps its Phase 1 sections until
 * deploy 3, and none is built before it).
 *
 * The front page's own fields (`market`, the board, the hero, the asks, the
 * change block, the brands line) are what switch the reworked Overview blocks
 * to their "Your market" form (`isMarketPage`). The monthly borrows three of
 * those blocks, and a monthly built after deploy 2 would otherwise print the
 * front page's market rows under its own Phase 1 sections, beside email arms
 * that print the Phase 1 ones. Taking the fields off here keeps each borrowed
 * section what it was; everything the Phase 1 blocks read is left alone.
 */
export function phaseOneOverview(overview: OverviewData): OverviewData {
  if (overview.market == null) return overview
  const { market: _market, themes: _themes, hero: _hero, heroVoices: _voices, asks: _asks, change: _change, brands: _brands, ...rest } = overview
  return rest
}
