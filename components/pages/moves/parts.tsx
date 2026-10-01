import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { BAR_FILL, IconTile, type BarWho } from '@/components/colour-roles'

// The artboard's furniture for Your moves: the white card, the section head
// and the bar. Palette A values are local (see `PALETTE` in ./words); class
// strings are written out whole so Tailwind's scanner sees them. The colour
// roles (components/colour-roles.tsx, colour pass 1 Oct): the card shadow, a
// title's icon tile, a bar filled by whose videos it counts.

/** A white card on the ground: radius 16, no border, on the card shadow. */
export function Card({ pad, gap, children, className }: { pad: string; gap: string; children: ReactNode; className?: string }) {
  return <section className={`flex min-w-0 flex-col rounded-[16px] bg-white shadow-card ${pad} ${gap} ${className ?? ''}`}>{children}</section>
}

/** A section title behind its icon tile, its base or hint at the right. */
export function SectionHead({ title, sub, icon }: { title: string; sub?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="flex items-baseline gap-2.5">
        {icon ? <IconTile icon={icon} /> : null}
        <h2 className="m-0 text-[20px] font-bold text-[#26292C]">{title}</h2>
      </div>
      {sub ? <div className="text-[13px] text-[#5F656B]">{sub}</div> : null}
    </div>
  )
}

/** A bar drawn against 100%: an 8px track, filled by whose videos it counts
 *  (the market's yellow; your own posts' gold). */
export function Bar({ width, who = 'market' }: { width: number; who?: BarWho }) {
  const w = Math.max(0, Math.min(100, width))
  return (
    <div className="h-2 min-w-0 flex-grow overflow-hidden rounded-[4px] bg-[#ECEAE4]" aria-hidden>
      <div className={`h-2 ${BAR_FILL[who]}`} style={{ width: `${Number(w.toFixed(1))}%` }} />
    </div>
  )
}

/** The artboard's buttons: 40px (page head, the add form) and 34px (a row). */
export const BTN_BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26292C]/30 disabled:cursor-default disabled:opacity-60'
export const BTN_SECONDARY = `${BTN_BASE} h-10 border-[#E4E2DC] bg-white px-4 text-[14px] text-[#26292C] hover:bg-[#F7F6F2]`
export const BTN_PRIMARY = `${BTN_BASE} h-10 border-[#26292C] bg-[#26292C] px-4 text-[14px] text-white hover:bg-black`
export const BTN_PRIMARY_SMALL = `${BTN_BASE} h-[34px] border-[#26292C] bg-[#26292C] px-3 text-[13px] text-white hover:bg-black`
export const BTN_SECONDARY_SMALL = `${BTN_BASE} h-[34px] border-[#E4E2DC] bg-white px-3 text-[13px] text-[#26292C] hover:bg-[#F7F6F2]`
