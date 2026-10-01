import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { BAR_FILL, BrandChip, ChipSep, IconTile, type BarWho } from '@/components/colour-roles'
import { marketLabelsOf } from '@/lib/brands/labels'
import type { WhoAbout, WhoPart } from '@/lib/written/types'

// The pieces Your market's blocks share, drawn to the approved artboard
// (`Page-Your-market.dc.html`, pages build 1 Oct): ink #26292C, muted
// #5F656B, hair #E4E2DC, track #ECEAE4, ground #F7F6F2, paper #FFFFFF. The
// colour roles (components/colour-roles.tsx) since the colour pass: cards on
// the one card shadow, a title's icon tile, bars by whose videos they count,
// brands as chips. No left stripes, no highlighted phrases, no gradients.

export const INK = 'text-[#26292C]'
export const MUTED = 'text-[#5F656B]'
export const HAIR = 'border-[#E4E2DC]'

/** A white card on the page's ground, radius 16, on the card shadow. */
export function Card({ children, className, label }: { children: ReactNode; className: string; label?: string }) {
  return (
    <section aria-label={label} className={`flex flex-col rounded-[16px] bg-white shadow-card ${className}`}>
      {children}
    </section>
  )
}

/** A title with its base on the right (the design's `h2`), its icon tile
 *  in front of it. */
export function TitleRow({ title, sub, icon }: { title: string; sub?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="flex items-baseline gap-2.5">
        {icon ? <IconTile icon={icon} /> : null}
        <h2 className="m-0 text-[20px] font-bold">{title}</h2>
      </div>
      {sub ? <div className={`text-[13px] ${MUTED}`}>{sub}</div> : null}
    </div>
  )
}

/** A title with its base on a line below (the design's `h2sub`), its icon
 *  tile in front of it. */
export function TitleStack({ title, sub, icon }: { title: string; sub: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2.5">
        {icon ? <IconTile icon={icon} /> : null}
        <h2 className="m-0 text-[20px] font-bold">{title}</h2>
      </div>
      <div className={`text-[13px] ${MUTED}`}>{sub}</div>
    </div>
  )
}

/** A bar drawn against 100%, never against the top row; its fill is whose
 *  videos it counts (every bar on this page counts the market's). */
export function Bar({ pct, height = 8, className = 'flex-grow', who = 'market' }: { pct: number; height?: 8 | 10; className?: string; who?: BarWho }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div aria-hidden className={`${className} overflow-hidden bg-[#ECEAE4] ${height === 10 ? 'h-[10px] rounded-[5px]' : 'h-[8px] rounded-[4px]'}`}>
      <div className={`${BAR_FILL[who]} ${height === 10 ? 'h-[10px]' : 'h-[8px]'}`} style={{ width: `${w}%` }} />
    </div>
  )
}

/** A brand's name as a split prints it: the client a gold chip, a rival a
 *  chip with the grey dot, the rest of the market quiet words ("Other bags in
 *  your market", or "other bags" in a running line: `marketLabelsOf`, the one
 *  wording). A count, when given, sits inside a brand's chip. */
export function WhoName({ about, brand, noun, short = false, count }: { about: WhoAbout; brand: string; noun: string | null; short?: boolean; count?: number }) {
  const n = count != null ? <>{' '}<span data-copy="figure" className="font-mono font-normal">{count}</span></> : null
  if (about === 'client') return <BrandChip who="you">{brand}{n}</BrandChip>
  if (about === 'market') {
    const words = marketLabelsOf(noun)
    return (
      <>
        <span className={MUTED}>{short ? words.short : words.long}</span>
        {count != null ? <>{' '}<span data-copy="figure" className={`font-mono ${MUTED}`}>{count}</span></> : null}
      </>
    )
  }
  return <BrandChip who="rival">{about.slice('rival:'.length)}{n}</BrandChip>
}

/** A split in one running line: a single name alone, or "Cotopaxi 2 · other
 *  bags 16", the counts as figures. */
export function WhoLine({ parts, brand, noun }: { parts: readonly WhoPart[]; brand: string; noun: string | null }) {
  if (parts.length === 0) return null
  if (parts.length === 1) return <WhoName about={parts[0].about} brand={brand} noun={noun} />
  return (
    <>
      {parts.map((p, i) => (
        <span key={p.about}>
          {i > 0 ? <ChipSep /> : null}
          <WhoName about={p.about} brand={brand} noun={noun} short count={p.videos} />
        </span>
      ))}
    </>
  )
}

/** Numbers as the design's small print says them ("three of the month's
 *  five largest threads"): words to ten, never a digit in a sentence. */
export function numberWord(n: number): string {
  return ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n)
}
