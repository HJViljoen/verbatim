import { PAGES } from '../../components/pages/registry'
import { isStaticKey } from './compose'
import { ALL_SECTION_PAGES, isPickablePage } from './types'
import { SURFACES } from '../nav'
import type { PageKey } from '../renderables/types'

/** The Studio's catalogue: every page a section MAY NAME and its STATIC tiles,
 *  from the registry — the same catalogue the export menu and the render route
 *  use. Computed per-item keys never appear (they index loaded data). Plain
 *  data, so it can cross to the client outline.
 *
 *  `ALL_SECTION_PAGES`, not `SECTION_PAGES`: the catalogue is what the editor
 *  LOOKS UP a stored section in, and three stored reports name `dashboard` —
 *  one of them the active Össur schedule's own report. Built from the picker's
 *  list, those three lost their title, their tile checkboxes and their tile
 *  count in the outline while still saving, so the report that goes out every
 *  Sunday could not have its contents changed. The picker narrows this list
 *  instead (`components/reports/outline.tsx`), which is where "what may be
 *  added today" belongs. */
export interface CataloguePage {
  page: PageKey
  title: string
  tiles: { key: string; title: string }[]
}

export function studioCatalogue(): CataloguePage[] {
  const out: CataloguePage[] = []
  for (const page of ALL_SECTION_PAGES) {
    const mod = PAGES[page]
    if (!mod) continue
    const tiles = Object.keys(mod.renderables)
      .filter(isStaticKey)
      .map((key) => ({ key, title: mod.renderables[key].title }))
    out.push({ page, title: mod.title, tiles })
  }
  return out
}

export const catalogueTitle = (page: string): string => PAGES[page as PageKey]?.title ?? page

/**
 * The catalogue narrowed to what a NEW section may name today — the picker's
 * own list, written once (Block D wave 2).
 *
 * `studioCatalogue()` is what a STORED section is looked up in, so it carries
 * `dashboard` (retired, three stored reports name it) and `agent` (joined only
 * through "add to report" from a thread). Two surfaces now advertise the
 * catalogue — the editor's picker and the Studio card on Reports — and a card
 * offering a page the picker does not is a promise the next screen breaks, so
 * the rule the picker was carrying inline lives here and both read it.
 *
 * It is deliberately computed from the REGISTRY rather than from
 * `SECTION_PAGES` alone: a page with no module cannot be rendered into a
 * report, and `overview` and `subjects` have none yet.
 *
 * The predicate itself is `isPickablePage` in `./types`, which imports a type
 * and nothing else — this module imports the page registry, and the editor's
 * picker is a CLIENT component that may not pull that into its bundle.
 */
export function pickableCatalogue(catalogue: CataloguePage[] = studioCatalogue()): CataloguePage[] {
  return catalogue.filter((c) => isPickablePage(c.page))
}


/**
 * The name a READER knows a catalogue page by (Block D wave 2, package
 * E-reports).
 *
 * A PAGE MODULE'S `title` IS THE RENDERER'S NAME FOR IT, not the reader's:
 * "Market Intelligence", "Voice of Customer", "Competitive Intelligence" are
 * the headings those pages print on paper, and the sidebar three inches to the
 * left of the Studio card calls the same three pages Market, Voice and
 * Competitive. Chips in a reader's vocabulary have to be in the reader's
 * vocabulary, or the card advertises a catalogue that exists nowhere else on
 * screen.
 *
 * `lib/nav.ts` is the one table that maps a surface to its page key, so this
 * reads it rather than keeping a second list. Where no surface names the page
 * — `profile` is parked and `content` is not in the Intelligence group — the
 * module's own title stands, because there is no reader's name to prefer.
 */
export function catalogueReaderTitle(page: PageKey, title?: string): string {
  return SURFACES.find((s) => s.page === page)?.label ?? title ?? PAGES[page]?.title ?? page
}

/** The chips the Studio card draws: what a new section may name, in the
 *  sidebar's words. */
export function catalogueChips(catalogue: CataloguePage[] = studioCatalogue()): string[] {
  return pickableCatalogue(catalogue).map((c) => catalogueReaderTitle(c.page, c.title))
}
