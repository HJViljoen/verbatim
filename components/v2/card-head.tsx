import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { EYEBROW, IconTile } from '@/components/colour-roles'
import { cn } from '@/lib/utils'

/**
 * A depth board's card and its head (depth v2, T2).
 *
 * `CARD` is the boards' `.card`: white, radius 16, the one card shadow
 * (`shadow-card`; MASTER §Shape & Elevation), 24px by 26px of padding and 16px
 * between its rows. Written out once so every v2 page draws the same card
 * and `components/colour-roles.test.tsx`'s "every card on the card shadow"
 * holds by construction. Pages add their grid span.
 *
 * `CardHead` is the boards' `.chead`: the 28px icon tile (`IconTile`, the
 * colour roles' own, reused), then the title at 17px and an optional muted
 * line under it, and an optional action at the right-hand end (a key, a
 * link). A hero card's head carries an eyebrow and a flag chip over a 21px
 * title instead (`size="lg"`).
 */
export const CARD = 'flex min-w-0 flex-col gap-4 rounded-[16px] bg-card px-[26px] py-6 shadow-card'

export interface CardHeadProps {
  /** The glyph in the pale-yellow tile. No icon, no tile. */
  icon?: LucideIcon
  title: ReactNode
  /** The muted line under the title. Numbers in it are the caller's to mark. */
  sub?: ReactNode
  /** The orange-text label over the title ("Unusual this week"). */
  eyebrow?: ReactNode
  /** Beside the eyebrow: a `FlagChip`, which brings its own verdict node. */
  flag?: ReactNode
  /** At the right-hand end of the head: a key, a legend or a link. */
  action?: ReactNode
  /** `lg` is the hero card's 21px title. */
  size?: 'md' | 'lg'
  as?: 'h2' | 'h3'
  /** The title's id, for a section's `aria-labelledby`. */
  id?: string
}

export function CardHead({ icon, title, sub, eyebrow, flag, action, size = 'md', as: Title = 'h2', id }: CardHeadProps) {
  return (
    <div className={cn('flex gap-3', action ? 'items-center' : 'items-start')}>
      {/* The boards set the 28px tile at the head's top edge, level with the
          first line (an eyebrow, or the title), so here it takes its full
          height; beside an action the head is centred and the tile keeps the
          colour roles' own 18px of layout. */}
      {icon ? <IconTile icon={icon} className={action ? undefined : 'my-0 self-start'} /> : null}
      <div className="min-w-0 flex-1">
        {eyebrow || flag ? (
          <div className="flex flex-wrap items-center gap-2.5">
            {eyebrow ? <p className={cn('m-0', EYEBROW)}>{eyebrow}</p> : null}
            {flag}
          </div>
        ) : null}
        <Title
          id={id}
          className={cn(
            'm-0 font-semibold tracking-[-0.005em] text-foreground',
            size === 'lg' ? 'text-[21px] leading-[1.3]' : 'text-[17px] leading-[1.3]',
            eyebrow || flag ? (size === 'lg' ? 'mt-1.5' : 'mt-1') : null,
          )}
        >
          {title}
        </Title>
        {sub ? <p className="m-0 mt-0.5 text-[13px] leading-[1.4] text-muted-foreground">{sub}</p> : null}
      </div>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  )
}
