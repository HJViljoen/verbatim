/**
 * WHETHER AN OPENED PANEL SCROLLS INTO VIEW (depth v2, T9).
 *
 * A panel opens through a link with `scroll={false}`, so Next neither jumps to
 * the top of the page nor scrolls to the `#…-panel` hash: the reader stays
 * where they were. On a desk the panel lands right under the card they
 * clicked; on a phone the panel can start below the fold, under a tall card,
 * and the page looks as if nothing happened. So the panel checks itself once
 * it is drawn, and scrolls only where its head is out of sight:
 *
 *   - its top is above the visible area (a panel opened higher up the page);
 *   - or the first `head` pixels of it (its tags, title and Close) do not fit
 *     above the visible area's foot.
 *
 * Otherwise it does nothing, so a panel already in view never moves the page.
 * The scroll is `block: 'nearest'`: the least movement that brings it in (a
 * panel taller than the screen lines its top up with the screen's top, its
 * `scroll-mt-6` margin above it). With reduced motion it jumps; otherwise it
 * glides.
 *
 * Pure, so the decision is tested without a browser; `PanelScrollIn` measures
 * and calls it.
 */

/** A vertical extent on screen, in CSS pixels from the viewport's top. */
export interface Span {
  top: number
  bottom: number
}

/** How much of the panel has to show for it to count as in view: its head row
 *  (tags, title, Close), about two lines of a 26px title under the tags. */
export const PANEL_HEAD_PX = 120

export function panelScrollPlan(
  panel: Span,
  view: Span,
  opts: { reducedMotion: boolean; head?: number },
): ScrollIntoViewOptions | null {
  if (!(view.bottom > view.top)) return null
  if (!(panel.bottom >= panel.top)) return null
  const head = Math.min(opts.head ?? PANEL_HEAD_PX, Math.max(0, panel.bottom - panel.top))
  const above = panel.top < view.top
  const below = panel.top + head > view.bottom
  if (!above && !below) return null
  return { block: 'nearest', behavior: opts.reducedMotion ? 'auto' : 'smooth' }
}
