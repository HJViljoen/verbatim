import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { IconTile } from '@/components/colour-roles'
import { PageBar } from '@/components/shell/page-grid'
import { cn } from '@/lib/utils'

// The atoms the Studio and Settings artboards are drawn with (design
// pages3_base.py: card, h2, btn, chip, the person chip). Palette A, written as
// literal values because the app's tokens are still the old brand (`--border`
// is #DCDFE3, `--muted-foreground` #6B7075, `--primary` green); the app-wide
// swap is a separate task. Class strings are written out in full so Tailwind's
// scanner sees them.
//
// ink #26292C · muted #5F656B · hair #E4E2DC · paper #FFFFFF · ground #F7F6F2
// · pale yellow #FFF4C7
//
// The colour roles (components/colour-roles.tsx, colour pass 1 Oct): the card
// shadow, a title's icon tile, and a term chip coloured by whose words it is
// (your name gold, the category's the pale yellow, a rival's on the track
// with the grey dot, a left-out word on the ground).

/** The page's own title row: the shared bar (26px on 40px, the artboards'),
 *  and the page's actions at the right. One component for every page's title
 *  (integration, 1 Oct), so this only names it for the Studio and Settings. */
export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return <PageBar title={title}>{children}</PageBar>
}

/** A white card on the ground, radius 16, no border, no stripe, on the card
 *  shadow. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  // The artboard sets no line-height, so its text runs at the font's own
  // `normal`, not the app's 1.5.
  return <section className={cn('flex flex-col rounded-[16px] bg-white leading-[normal] text-[#26292C] shadow-card', className)}>{children}</section>
}

/** A card's title: 20px, bold, behind its icon tile when given one. */
export function CardTitle({ children, as = 'h2', icon }: { children: ReactNode; as?: 'h2' | 'h3'; icon?: LucideIcon }) {
  const Tag = as
  const title = <Tag className="m-0 text-[20px] font-bold leading-[normal]">{children}</Tag>
  return icon ? <div className="flex min-w-0 items-baseline gap-2.5"><IconTile icon={icon} />{title}</div> : title
}

const BTN_BASE = 'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26292C]/40 disabled:opacity-50'
const BTN_SIZE = { small: 'h-[34px] px-3 text-[13px]', normal: 'h-10 px-4 text-[14px]' } as const
const BTN_KIND = {
  secondary: 'border border-[#E4E2DC] bg-white text-[#26292C] hover:bg-[#F7F6F2]',
  ghost: 'border border-transparent bg-transparent text-[#26292C] hover:bg-[#F7F6F2]',
  primary: 'border border-[#26292C] bg-[#26292C] text-white hover:bg-[#26292C]/90',
} as const

/** The artboard's button classes, for a <button>, a <Link> or an <a>. */
export function buttonClass(kind: keyof typeof BTN_KIND = 'secondary', size: keyof typeof BTN_SIZE = 'normal'): string {
  return cn(BTN_BASE, BTN_SIZE[size], BTN_KIND[kind])
}

/** Whose words a term chip holds. */
export type ChipTone = 'you' | 'market' | 'rival' | 'out'

const CHIP_TONE: Record<ChipTone, string> = {
  you: 'bg-you font-medium text-you-foreground',
  market: 'bg-accent text-accent-foreground',
  rival: 'bg-track text-[#26292C]',
  out: 'bg-[#F7F6F2] text-[#26292C]',
}

/** A chip: a term, coloured by whose words it is (on the ground when not
 *  said). A rival's carries the rival grey's dot. */
export function Chip({ children, tone = 'out' }: { children: ReactNode; tone?: ChipTone }) {
  return (
    <span data-chip={tone} className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[13px] leading-[1.3]', CHIP_TONE[tone])}>
      {tone === 'rival' ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-comp" /> : null}
      {children}
    </span>
  )
}

/** A person: their initials on pale yellow, then their name. */
export function PersonChip({ name, initials }: { name: string; initials: string }) {
  return (
    <span className="inline-flex h-[30px] max-w-full items-center gap-2 rounded-full bg-[#F7F6F2] pr-3 pl-1 text-[13px] font-medium">
      <span aria-hidden className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[#FFF4C7] text-[10px] font-bold tracking-[0.02em]">{initials}</span>
      <span className="min-w-0 truncate">{name}</span>
    </span>
  )
}
