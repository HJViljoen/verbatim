import { cn } from '@/lib/utils'

/**
 * K OF N, ONE MARK EACH (depth v2, T2).
 *
 * For a small n a row of marks reads faster than a bar and cannot be misread
 * as a share of something bigger: "7 of its 9 videos" is seven gold squares
 * and two empty ones (E4-Products' standouts). Three shapes the boards use:
 * `square` (the standouts, nine to a row), `bar` (Content's "your 9 posts",
 * 9 by 14) and `dot` (Your moves' "updates in a row", 8px).
 *
 * The tones are colour roles, not choices: `you` is the client's gold (its
 * own products, its own posts), `ink` is a neutral count (the market's ink),
 * `market` the market yellow. The empty marks are the track.
 *
 * It prints no number: the figure beside it does, so the marks are one
 * `role="img"` with the k of n in its label. Meant for a small n (the boards
 * go to nine); past `MAX_UNITS` it would be a texture rather than a count, and
 * draws nothing.
 */

export const MAX_UNITS = 60

const ON: Record<'you' | 'ink' | 'market', string> = {
  you: 'bg-you',
  ink: 'bg-foreground',
  market: 'bg-brand',
}

export interface UnitSquaresProps {
  k: number
  n: number
  tone?: 'you' | 'ink' | 'market'
  shape?: 'square' | 'dot' | 'bar'
  /** Squares to a row; `min(n, 9)` by default, the board's. */
  columns?: number
  /** What the marks count, for a screen reader ("7 of 9 videos praise the
   *  Cheetah"). */
  label: string
  className?: string
}

export function UnitSquares({ k, n, tone = 'ink', shape = 'square', columns, label, className }: UnitSquaresProps) {
  const total = Math.max(0, Math.floor(n))
  if (total === 0 || total > MAX_UNITS) return null
  const on = Math.min(total, Math.max(0, Math.round(k)))
  const units = Array.from({ length: total }, (_, i) => i < on)

  if (shape === 'square') {
    const cols = Math.max(1, Math.min(columns ?? 9, total))
    return (
      <div
        role="img"
        aria-label={label}
        data-units={`${on}/${total}`}
        className={cn('grid gap-1', className)}
        // The board's square is about 21px: the row is sized to its columns,
        // so seven squares are as big as nine.
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: cols * 21 + (cols - 1) * 4 }}
      >
        {units.map((u, i) => <span key={i} className={cn('aspect-square rounded-[3px]', u ? ON[tone] : 'bg-track')} />)}
      </div>
    )
  }
  return (
    <div
      role="img"
      aria-label={label}
      data-units={`${on}/${total}`}
      className={cn('flex flex-wrap items-center', shape === 'dot' ? 'gap-1' : 'gap-[3px]', className)}
    >
      {units.map((u, i) => (
        <span
          key={i}
          className={cn(
            shape === 'dot' ? 'size-2 rounded-full' : 'h-3.5 w-[9px] rounded-[2px]',
            u ? ON[tone] : shape === 'dot' ? 'bg-border' : 'bg-track',
          )}
        />
      ))}
    </div>
  )
}
