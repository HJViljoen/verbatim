import type { ReactNode } from 'react'
import { marketLabelsOf } from '@/lib/brands/labels'
import type { WhoAbout, WhoPart } from '@/lib/written/types'

// The pieces Your market's blocks share, drawn to the approved artboard
// (`Page-Your-market.dc.html`, pages build 1 Oct). Palette A, written out
// here because the app's tokens are still the green brand (the app-wide
// colour swap is a separate task): yellow #FFD43B, orange text #C2410C, gold
// "you" #9A6B00, ink #26292C, muted #5F656B, hair #E4E2DC, track #ECEAE4,
// ground #F7F6F2, paper #FFFFFF. No left stripes, no highlighted phrases, no
// gradients.

export const INK = 'text-[#26292C]'
export const MUTED = 'text-[#5F656B]'
export const HAIR = 'border-[#E4E2DC]'

/** A white card on the page's ground, radius 16. */
export function Card({ children, className, label }: { children: ReactNode; className: string; label?: string }) {
  return (
    <section aria-label={label} className={`flex flex-col rounded-[16px] bg-white ${className}`}>
      {children}
    </section>
  )
}

/** A title with its base on the right (the design's `h2`). */
export function TitleRow({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="m-0 text-[20px] font-bold">{title}</h2>
      {sub ? <div className={`text-[13px] ${MUTED}`}>{sub}</div> : null}
    </div>
  )
}

/** A title with its base on a line below (the design's `h2sub`). */
export function TitleStack({ title, sub }: { title: string; sub: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="m-0 text-[20px] font-bold">{title}</h2>
      <div className={`text-[13px] ${MUTED}`}>{sub}</div>
    </div>
  )
}

/** A bar drawn against 100%, never against the top row. */
export function Bar({ pct, height = 8, className = 'flex-grow' }: { pct: number; height?: 8 | 10; className?: string }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div aria-hidden className={`${className} overflow-hidden bg-[#ECEAE4] ${height === 10 ? 'h-[10px] rounded-[5px]' : 'h-[8px] rounded-[4px]'}`}>
      <div className={`bg-[#FFD43B] ${height === 10 ? 'h-[10px]' : 'h-[8px]'}`} style={{ width: `${w}%` }} />
    </div>
  )
}

/** A brand's name as a split prints it: the client gold, a rival in ink,
 *  the rest of the market quiet ("Other bags in your market", or "other
 *  bags" in a running line: `marketLabelsOf`, the one wording). */
export function WhoName({ about, brand, noun, short = false }: { about: WhoAbout; brand: string; noun: string | null; short?: boolean }) {
  if (about === 'client') return <span className="font-semibold text-[#9A6B00]">{brand}</span>
  if (about === 'market') {
    const words = marketLabelsOf(noun)
    return <span className={MUTED}>{short ? words.short : words.long}</span>
  }
  return <span className={`font-semibold ${INK}`}>{about.slice('rival:'.length)}</span>
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
          {i > 0 ? <span className={MUTED}> · </span> : null}
          <WhoName about={p.about} brand={brand} noun={noun} short />{' '}
          <span data-copy="figure" className={`font-mono ${MUTED}`}>{p.videos}</span>
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
