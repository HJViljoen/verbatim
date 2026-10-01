import { Fragment } from 'react'
import { BrandChip, ChipSep } from '@/components/colour-roles'
import { aboutName, type AboutPart } from '@/lib/brands/labels'
import { cn } from '@/lib/utils'

/**
 * Who an item of talk is about (the design's brand label, one component on
 * every page; lib/brands/attribution.ts reads the split).
 *
 * ONE PART: the name alone ("Other bags in your market", "Cotopaxi"). TWO OR
 * MORE: each name with its videos, the market last and short ("Cotopaxi 2 ·
 * Patagonia 2 · other bags 16"). The client is a gold chip and a rival a
 * chip with the rival grey's dot, each with its videos inside it; the market
 * stays muted words (the colour roles, components/colour-roles.tsx). Nothing
 * is guessed: no part, no line.
 */

export const WHO_GOLD = 'text-[#9A6B00]'
export const WHO_MUTED = 'text-[#5F656B]'

export interface WhoNames {
  /** The client's own name ("Sealand"). */
  client: string
  /** The market's label, long (a lone part) and short (inside a split). */
  market: { long: string; short: string }
}

/** One part: a brand as its chip (its videos inside it when `count`), the
 *  market as muted words (its videos after them). */
function Name({ part, names, short, count }: { part: AboutPart; names: WhoNames; short: boolean; count: boolean }) {
  const n = count ? <>{' '}<span data-copy="figure" className="font-mono font-normal">{part.videos}</span></> : null
  if (part.about === 'market') {
    return (
      <>
        <span className={WHO_MUTED}>{short ? names.market.short : names.market.long}</span>
        {count ? <>{' '}<span data-copy="figure" className={cn('font-mono', WHO_MUTED)}>{part.videos}</span></> : null}
      </>
    )
  }
  if (part.about === 'client') return <BrandChip who="you">{names.client}{n}</BrandChip>
  return <BrandChip who="rival">{aboutName(part.about, names)}{n}</BrandChip>
}

/** The label's words inline (no wrapper), for a line that carries more. */
export function WhoInline({ parts, names, prefix }: { parts: readonly AboutPart[]; names: WhoNames; prefix?: string }) {
  const shown = parts.filter((p) => p.videos > 0)
  if (shown.length === 0) return null
  return (
    <>
      {prefix ? <span className={WHO_MUTED}>{prefix}</span> : null}
      {shown.length === 1 ? (
        <Name part={shown[0]} names={names} short={false} count={false} />
      ) : (
        shown.map((p, i) => (
          <Fragment key={p.about}>
            {i > 0 ? <ChipSep /> : null}
            <Name part={p} names={names} short count />
          </Fragment>
        ))
      )}
    </>
  )
}

/** The label on its own line (12px by default, 13px under a finding). */
export function BrandWho({
  parts, names, prefix, className,
}: { parts: readonly AboutPart[]; names: WhoNames; prefix?: string; className?: string }) {
  if (!parts.some((p) => p.videos > 0)) return null
  return (
    // The leading LAST: tailwind-merge drops a leading when a later font size
    // arrives (a caller's 13px), and the artboard draws every brand line at 1.45.
    <div data-who="" className={cn('text-[12px]', className, 'leading-[1.45]')}>
      <WhoInline parts={parts} names={names} prefix={prefix} />
    </div>
  )
}
