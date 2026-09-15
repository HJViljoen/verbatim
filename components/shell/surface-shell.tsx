import { SurfacePageBar } from '@/components/shell/page-bar'
import { PageFrame, PageGrid } from '@/components/shell/page-grid'
import { Tile, TileEmpty } from '@/components/shell/tile'
import { surface, type NavKey } from '@/lib/nav'

/**
 * A surface that routes and has not been built yet (Phase 1 WP9).
 *
 * The shell WP's job is that all nine items route and every page is one click
 * from every other — Subjects, This week, the new Market and the new
 * Competitive all have addresses before they have readings, and an address
 * that 404s is worse than one that says what is coming. WP11–WP15 replace each
 * of these with the page's own loader and blocks.
 *
 * It says "not built" and not "no data": those are different facts, and this
 * product's whole discipline is not confusing them. A page with nothing to
 * show because the tenant has no conversation yet is the loader's own empty
 * state, and it belongs to the page that is written, not to this one.
 */
export function SurfaceShell({ nav }: { nav: NavKey }) {
  const s = surface(nav)
  return (
    <PageFrame>
      <SurfacePageBar nav={nav} />
      <PageGrid>
        <Tile col={12} row={2} eyebrow={s.label}>
          <TileEmpty>This page is still being built — nothing here is a reading yet.</TileEmpty>
        </Tile>
      </PageGrid>
    </PageFrame>
  )
}
