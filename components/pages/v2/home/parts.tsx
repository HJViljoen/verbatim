import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { CARD } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

// The Dashboard's furniture (Design v2, depth plan T8; boards E1-Dashboard and
// E1-Dashboard-Phone), written out whole so Tailwind's scanner sees them, in
// the app's tokens (palette A; no literal colour and no shadow of our own:
// every tile is the kit's `CARD`).

/** A tile: the kit's card, and the phone board's tighter one (18px, 14px
 *  radius, 12px between rows) under 640px. */
export const TILE = cn(CARD, 'max-sm:gap-3 max-sm:rounded-[14px] max-sm:p-[18px]')

/** The board's `.tt`: a tile's title (an h3 under the tile's h2), 19px
 *  (17px on a phone). */
export const TT = 'm-0 text-[19px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground max-sm:text-[17px]'

/** The board's `.big` (44px; 36px on a phone) and `.mid` (30px; 24px). */
export const BIG = 'font-mono text-[44px] leading-none font-medium tracking-[-0.02em] tabular-nums text-foreground max-sm:text-[36px]'
export const MID = 'font-mono text-[30px] leading-none font-medium tracking-[-0.02em] tabular-nums text-foreground max-sm:text-[24px]'

/** The board's `.mono.muted` line under a figure. */
export const MONO_MUTED = 'font-mono text-[12.5px] leading-[1.5] tabular-nums text-muted-foreground max-sm:text-[12px]'

/** The board's `.csub`: a quiet line of the page's own words. */
export const CSUB = 'm-0 text-[13px] leading-[1.4] text-muted-foreground'

/** The board's `.olink`: the orange-text action link. */
export const OLINK = 'rounded-[2px] text-[13.5px] font-semibold text-orange-text no-underline underline-offset-[3px] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** The board's `.mrow`: a row under a tile's lead, a hairline over it. */
export const MROW = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-track py-2.5 text-[14px] leading-[1.35] max-sm:py-2 max-sm:text-[13.5px]'

/** A count code computed, marked for the copy contract. */
export function Fig({ n, className }: { n: number | null | undefined; className?: string }) {
  if (n == null) return null
  return <span data-copy="figure" className={className}>{fmtInt(n)}</span>
}

/**
 * The board's `.tilehead`: the page's name in small grey caps with its glyph
 * (`.pg`; the phone's `.lab` drops the glyph), and the tile's link at the
 * right-hand end. The link opens the page's panel in place where the tile has
 * an item, else the page.
 */
export function TileHead({ icon: Icon, name, href, open = 'Open', id }: {
  icon: LucideIcon | null
  name: string
  /** Null: the tile has nothing to open (the board's "Your market this week"). */
  href: string | null
  /** The link's words before its arrow ("Open Market"). */
  open?: string
  id?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="m-0 flex items-center gap-2 text-[12px] leading-[1.3] font-semibold uppercase tracking-[0.06em] text-muted-foreground max-sm:text-[11.5px]">
        {Icon ? <Icon aria-hidden className="size-[15px] shrink-0 text-orange-text max-sm:hidden" strokeWidth={2} /> : null}
        {name}
      </h2>
      {href ? (
        <Link href={href} className={cn(OLINK, 'shrink-0')} aria-label={open.includes(name) ? undefined : `${open} ${name}`}>
          {open} →
        </Link>
      ) : null}
    </div>
  )
}

/** A tile's one quiet line where its page has nothing to show, or where its
 *  read failed. */
export function TileLine({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('m-0 text-[14px] leading-[1.5] text-muted-foreground', className)}>{children}</p>
}

/** The words a tile prints where its read failed (it loses only itself). */
export const TILE_FAILED = 'This could not be read just now.'
