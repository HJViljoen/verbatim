import type { ReactNode } from 'react'
import { CARD, EmptyBox, GoLink } from '@/components/v2'
import { LBL } from '@/components/v2/look'
import { fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

// The Dashboard's furniture, drawn to the audit design's board
// (Dashboard.dc.html, 7 Nov): every tile is the kit's `CARD`, its head a
// sentence-case label with a link that says where it goes, its heading a
// sentence, its figures tabular sans. Written out whole so Tailwind's scanner
// sees them, in the app's tokens (palette A; no literal colour and no shadow
// of our own).

/** The tiles' grid: three columns from 1180px, one below (the board's
 *  `.grid3`, 20px between tiles; the app's own point, small call 14). */
export const DASHBOARD_GRID = 'grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3'

/** A tile: the kit's card, its rows 14px apart (the board's `.tile`). */
export const TILE = cn(CARD, 'gap-3.5')

/** A tile's heading (the board's h2 under the label): 20px, the wide tiles'
 *  22px (`TT_WIDE`). */
export const TT = 'm-0 text-[20px] leading-[1.3] font-semibold text-foreground max-sm:text-[18px]'
export const TT_WIDE = 'm-0 text-[22px] leading-[1.3] font-semibold text-foreground max-sm:text-[19px]'

/** The board's big figure (40px) and its middle one (32px), tabular sans. */
export const BIG = 'text-[40px] leading-none font-bold tabular-nums text-foreground max-sm:text-[34px]'
export const MID = 'text-[32px] leading-none font-bold tabular-nums text-foreground max-sm:text-[28px]'

/** A quiet line of the page's own words. */
export const CSUB = 'm-0 text-[13.5px] leading-[1.5] text-muted-foreground'

/** A row of a tile's bar list (the board's): the name, a 96px bar, the
 *  count; fixed columns, so the rows line up. */
export const BAR_ROW = 'grid grid-cols-[minmax(0,1fr)_96px_34px] items-center gap-3'

/** A list's bar (the board's 8px track and the market's yellow), its length
 *  given 0 to 100 (`toMax`, decision 5). Drawn for the eye: the row's count
 *  says it in words. */
export function Bar({ pct }: { pct: number }) {
  return (
    <div aria-hidden className="h-2 rounded-[4px] bg-track">
      <div className="h-2 rounded-[4px] bg-brand" style={{ width: `${pct}%` }} />
    </div>
  )
}

/** A count code computed, marked for the copy contract. */
export function Fig({ n, className }: { n: number | null | undefined; className?: string }) {
  if (n == null) return null
  return <span data-copy="figure" className={className}>{fmtInt(n)}</span>
}

/**
 * A tile's head (the board's `.lbl` and `.go`): the tile's name in sentence
 * case, and at the right-hand end a link that says where it goes ("Open
 * Market", "See all 3 waiting"), with no arrow and no icon. The head opens
 * the tile's section; the items inside are links of their own.
 */
export function TileHead({ label, open, id }: {
  label: ReactNode
  /** Null or absent: the tile has nothing to open (Your market this week). */
  open?: { href: string; words: string } | null
  id?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span id={id} className={LBL}>{label}</span>
      {open ? <GoLink href={open.href} className="shrink-0 whitespace-nowrap">{open.words}</GoLink> : null}
    </div>
  )
}

/** A tile's one sentence where its page has nothing to show, or where its
 *  read failed: in the boards' dashed box, as Your products' (decision 4;
 *  the review of 7 Nov). */
export function TileLine({ children }: { children: ReactNode }) {
  return <EmptyBox>{children}</EmptyBox>
}

/** The words a tile prints where its read failed (it loses only itself). */
export const TILE_FAILED = 'This could not be read just now.'

/** A line the code holds in lower case, said as a sentence: its first letter
 *  a capital and a full stop at its end ("No comparison with September
 *  yet."). The words are the code's own; only their case and stop change. */
export const asSentence = (words: string): string => {
  const w = words.trim()
  if (!w) return w
  const s = w.charAt(0).toUpperCase() + w.slice(1)
  return /[.!?]$/.test(s) ? s : `${s}.`
}
