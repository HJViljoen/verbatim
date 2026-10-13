import Link from 'next/link'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * THE IN-PLACE PANEL (depth v2, T2; the boards' `.panel`).
 *
 * Clicking an item on a v2 page opens its detail as a full-width white card
 * directly under the row it was clicked in, with a notch pointing up at the
 * item. It is pure server code, the pattern the advice ledger already uses
 * (research A §2, "server-rendered expansion row"): the item's link carries
 * the selection in the URL (`?conv=`, `?group=`, `?product=` and a `#id`), the
 * loader resolves it, and the page renders this panel after the item's row.
 * Close is a link back to the page without the selection, `scroll={false}`
 * so the reader stays where they were.
 *
 * `scroll-mt-6` is the anchor margin every scroll target on the pages uses,
 * because the scroll container is the shell's `<main>`, not the document.
 *
 * The shadow is the panel's own token (`shadow-panel`), a step above the
 * cards around it, never a literal (drift guard (g)). The notch is a rotated
 * square in the card's own white with a hairline on its two upper edges; it is
 * kept clear of the panel's rounded corners.
 *
 * The clicked item wears `SELECTED_CARD_RING` while its panel is open.
 */

/** The selected source card's ring: 2px of ink outside the card, alongside its
 *  `shadow-card` (Tailwind composes the ring and the shadow in one
 *  box-shadow). The boards' `.hero.sel` and `.colhead.sel`. */
export const SELECTED_CARD_RING = 'ring-2 ring-foreground'

export interface InPlacePanelProps {
  /** The panel's id: the `#hash` the item links to, and its anchor. */
  id: string
  /** Where the notch points, 0 to 1 of the panel's width: the centre of the
   *  clicked item. Clamped clear of the corners. */
  notchAt: number
  /** The page without the selection. */
  closeHref: string
  children: ReactNode
  /** The id of the panel's title (`PanelTitle`), for `aria-labelledby`. */
  labelledBy?: string
  /** Beside Close, on the left of the head row: the tags and the title. */
  head?: ReactNode
  /** Close's accessible name ("Close this conversation"). */
  closeLabel?: string
  className?: string
}

export function InPlacePanel({ id, notchAt, closeHref, children, labelledBy, head, closeLabel, className }: InPlacePanelProps) {
  const at = Math.min(1, Math.max(0, Number.isFinite(notchAt) ? notchAt : 0.5))
  const pct = `${Math.round(at * 10000) / 100}%`
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      data-panel=""
      className={cn(
        'relative flex min-w-0 scroll-mt-6 flex-col gap-7 rounded-[16px] bg-card px-5 pt-6 pb-6 shadow-panel sm:px-[34px] sm:pt-[30px] sm:pb-8',
        className,
      )}
    >
      <span
        aria-hidden
        data-notch=""
        className="absolute -top-[9px] size-[18px] rotate-45 rounded-tl-[3px] border-t border-l border-foreground/5 bg-card"
        style={{ left: `clamp(20px, calc(${pct} - 9px), calc(100% - 38px))` }}
      />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">{head}</div>
        <Link
          href={closeHref}
          scroll={false}
          aria-label={closeLabel}
          className="inline-flex min-h-[38px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-inner px-3 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-track focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden className="size-3.5" strokeWidth={2} />
          Close
        </Link>
      </div>
      {children}
    </section>
  )
}

/** The panel's title: 26px bold under its tags (the boards' `.ptitle`). An
 *  h2, so the page bar's h1 stays the page's only title. */
export function PanelTitle({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={cn('m-0 mt-2 text-[26px] leading-[1.2] font-bold tracking-[-0.015em] text-foreground', className)}>
      {children}
    </h2>
  )
}

/** One section inside a panel: its small grey caps label, then its content
 *  (the boards' `.dsec` and `.dlabel`). Numbers in the label are the
 *  caller's to mark. */
export function PanelSection({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2.5', className)}>
      <p className="m-0 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}
