import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { BillStatus, Stage } from '@/lib/costs/types'

// The Costs page's small parts (operator only). Tokens, not literals, so they
// hold in both themes; class strings written out whole for Tailwind's scanner.

/** A text, number, date or select field. 16px text below `sm` so a phone
 *  does not zoom into the field on focus. */
export const INPUT =
  'h-9 w-full min-w-0 rounded-[8px] border border-border bg-card px-2.5 text-[16px] text-foreground outline-none transition-colors sm:text-[13px] ' +
  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50'

export const TEXTAREA =
  'min-h-[84px] w-full min-w-0 rounded-[8px] border border-border bg-card px-2.5 py-2 text-[16px] leading-[1.45] text-foreground outline-none transition-colors sm:text-[13px] ' +
  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50'

/** A labelled field. */
export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[12px] font-semibold text-secondary-foreground">{label}</span>
      {children}
      {hint ? <span className="text-[11.5px] leading-[1.4] text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

/** A checkbox with its words. */
export function Check({ name, label, defaultChecked }: { name: string; label: ReactNode; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px]">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 cursor-pointer accent-[#26292C]" />
      <span>{label}</span>
    </label>
  )
}

const STATUS_CHIP: Record<BillStatus, string> = {
  active: 'bg-inner text-secondary-foreground',
  watch: 'bg-accent text-accent-foreground',
  failing: 'bg-negative/12 text-negative',
  paused: 'bg-track text-muted-foreground',
  ended: 'bg-track text-muted-foreground',
}

const STAGE_CHIP: Record<Stage, string> = {
  paying: 'bg-inner text-secondary-foreground',
  trial: 'bg-accent text-accent-foreground',
  prospect: 'bg-track text-muted-foreground',
}

/** A single-line pill (MASTER: rounding follows the content). */
export function Pill({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'soft' | 'bad' | 'faint' }) {
  const cls = tone === 'soft' ? 'bg-accent text-accent-foreground'
    : tone === 'bad' ? 'bg-negative/12 text-negative'
    : tone === 'faint' ? 'bg-track text-muted-foreground'
    : 'bg-inner text-secondary-foreground'
  return <span className={cn('inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium', cls)}>{children}</span>
}

export function StatusPill({ status, label }: { status: BillStatus; label: string }) {
  return <span className={cn('inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium', STATUS_CHIP[status])}>{label}</span>
}

export function StagePill({ stage, label }: { stage: Stage; label: string }) {
  return <span className={cn('inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium', STAGE_CHIP[stage])}>{label}</span>
}

/** A form's one-line answer. */
export function Said({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null
  return <p role="status" className={cn('m-0 text-[12.5px]', ok ? 'text-muted-foreground' : 'text-negative')}>{message}</p>
}

/** Rand first, dollars beside it in the muted ink. */
export function ZarUsd({ zar, usd, className }: { zar: string; usd: string; className?: string }) {
  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      {zar}
      <span className="ml-1.5 text-muted-foreground">{usd}</span>
    </span>
  )
}
