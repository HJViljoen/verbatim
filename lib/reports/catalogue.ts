import { PAGES } from '../../components/pages/registry'
import { isStaticKey } from './compose'
import { ALL_SECTION_PAGES } from './types'
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
