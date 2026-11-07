import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Label } from './ui'

/**
 * A board's card and its head (depth v2, T2; the audit design, 7 Nov).
 *
 * `CARD` is the boards' `.tile`: white, radius 12, the one card shadow
 * (`shadow-card`; MASTER §Shape & Elevation: the boards' own shadow differs by
 * a hair and the token is unchanged), 26px of padding and 16px between its
 * rows. Written out once so every v2 page draws the same card and
 * `components/colour-roles.test.tsx`'s "every card on the card shadow" holds
 * by construction. Pages add their grid span.
 *
 * On a phone (below 640) 18px of padding all round and 12px between its rows
 * (T9, the phone pass), so a card's content keeps 322 of a 390 screen's
 * pixels rather than 290.
 *
 * `CardHead` is the boards' card head: the title at 18px (21px at lg) and an
 * optional muted line under it at the boards' 14px, and an optional action at the right-hand end
 * (a key, a link). A hero card's head carries a label and a flag over a 21px
 * title (`size="lg"`). Since the audit design it draws NO icon tile: `icon` is
 * accepted and ignored until the last caller drops it (T12.1), and the label
 * over the title is the kit's sentence-case `Label`, never an orange or
 * uppercase eyebrow.
 */
export const CARD = 'flex min-w-0 flex-col gap-4 rounded-[12px] bg-card p-[26px] shadow-card max-sm:gap-3 max-sm:p-[18px]'

export interface CardHeadProps {
  /** Accepted and ignored since the audit design (no icon tiles); removed
   *  with its callers in T12.1. */
  icon?: LucideIcon
  title: ReactNode
  /** The muted line under the title. Numbers in it are the caller's to mark. */
  sub?: ReactNode
  /** The sentence-case label over the title ("Unusual this week"). */
  eyebrow?: ReactNode
  /** Beside the eyebrow: a `FlagChip`, which brings its own verdict node. */
  flag?: ReactNode
  /** At the right-hand end of the head: a key, a legend or a link. */
  action?: ReactNode
  /** `md` is 18px; `lg` is the hero card's 21px title. */
  size?: 'md' | 'lg'
  as?: 'h2' | 'h3'
  /** The title's id, for a section's `aria-labelledby`. */
  id?: string
}

export function CardHead({ title, sub, eyebrow, flag, action, size = 'md', as: Title = 'h2', id }: CardHeadProps) {
  return (
    <div className={cn('flex gap-3', action ? 'items-center' : 'items-start')}>
      <div className="min-w-0 flex-1">
        {eyebrow || flag ? (
          <div className="flex flex-wrap items-center gap-2.5">
            {eyebrow ? <Label>{eyebrow}</Label> : null}
            {flag}
          </div>
        ) : null}
        <Title
          id={id}
          className={cn(
            'm-0 font-semibold tracking-[-0.005em] text-foreground',
            size === 'lg' ? 'text-[21px] leading-[1.3]' : 'text-[18px] leading-[1.3]',
            eyebrow || flag ? (size === 'lg' ? 'mt-1.5' : 'mt-1') : null,
          )}
        >
          {title}
        </Title>
        {sub ? <p className="m-0 mt-1.5 text-[14px] leading-[1.45] text-muted-foreground">{sub}</p> : null}
      </div>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  )
}
