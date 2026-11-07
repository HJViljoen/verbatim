import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { PageBar } from '@/components/shell/page-grid'
import { BTN_PRIMARY, BTN_SM } from '@/components/v2/look'
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
// shadow. (The term chip coloured by whose words it is went with Settings'
// audit design, 7 Nov: every term is the kit's one `TERM` look.)
//
// SINCE THE AUDIT DESIGN (7 Nov, Studio.dc.html): the card at radius 12, its
// title a 21px heading with no icon tile (the `icon` prop is accepted and
// drawn no more), and the primary button the brand yellow (`BTN_PRIMARY`,
// decision 8), which restyles Settings' and the ops pages' too.

/** The page's own title row: the shared bar (26px on 40px, the artboards'),
 *  and the page's actions at the right. One component for every page's title
 *  (integration, 1 Oct), so this only names it for the Studio and Settings. */
export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return <PageBar title={title}>{children}</PageBar>
}

/** A white card on the ground, radius 12, no border, no stripe, on the card
 *  shadow. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  // The artboard sets no line-height, so its text runs at the font's own
  // `normal`, not the app's 1.5.
  return <section className={cn('flex flex-col rounded-[12px] bg-white leading-[normal] text-[#26292C] shadow-card', className)}>{children}</section>
}

/** A card's title: 21px at 600, with no icon tile (the audit design; `icon`
 *  is accepted and not drawn until the tidy-up deletes it). */
export function CardTitle({ children, as = 'h2' }: { children: ReactNode; as?: 'h2' | 'h3'; icon?: LucideIcon }) {
  const Tag = as
  return <Tag className="m-0 text-[21px] font-semibold leading-[1.3]">{children}</Tag>
}

const BTN_BASE = 'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26292C]/40 disabled:opacity-50'
const BTN_SIZE = { small: 'h-[34px] px-3 text-[13px]', normal: 'h-10 px-4 text-[14px]' } as const
const BTN_KIND = {
  secondary: 'border border-[#E4E2DC] bg-white text-[#26292C] hover:bg-[#F7F6F2]',
  ghost: 'border border-transparent bg-transparent text-[#26292C] hover:bg-[#F7F6F2]',
  // Drawn by `BTN_PRIMARY` since the audit design (see `buttonClass`).
  primary: '',
} as const

/** The artboard's button classes, for a <button>, a <Link> or an <a>. The
 *  primary is the kit's yellow button (`BTN_PRIMARY`, decision 8). */
export function buttonClass(kind: keyof typeof BTN_KIND = 'secondary', size: keyof typeof BTN_SIZE = 'normal'): string {
  if (kind === 'primary') return cn(BTN_PRIMARY, size === 'small' && BTN_SM)
  return cn(BTN_BASE, BTN_SIZE[size], BTN_KIND[kind])
}
