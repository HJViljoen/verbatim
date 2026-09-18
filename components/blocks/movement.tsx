import type { RenderMode } from '@/lib/blocks/types'
import { CountBadge, MovementBadge, MOVEMENT_WORDS } from '@/components/delta-badge'
import { favourability, type Good } from '@/components/charts/stat'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { DeltaVerdict } from '@/lib/report-bands'
import type { Verdict } from '@/lib/reading/verdicts'

// The one badge, in three modes (Phase 1 WP10). See components/blocks/frame.tsx.

const chip = (tone: 'up' | 'down' | 'neutral') => ({
  display: 'inline-block' as const,
  fontFamily: FONT.sans,
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 10,
  whiteSpace: 'nowrap' as const,
  ...(tone === 'neutral'
    ? { background: EMAIL.inner, color: EMAIL.muted, fontWeight: 600 }
    : tone === 'up'
      ? { background: EMAIL.greenTint, color: EMAIL.up, fontWeight: 700 }
      : { background: EMAIL.downTint, color: EMAIL.down, fontWeight: 700 }),
})

/**
 * Movement, marked as a verdict.
 *
 * `data-copy="verdict"` is the point of this wrapper as much as the email arm
 * is. Rule (c) of the copy contract says a direction word may appear ONLY
 * inside a verdict node, and this is where the product's movement vocabulary is
 * printed — so a block gets the marker by using the primitive rather than by
 * remembering to add it.
 *
 * The email arm is a chip rather than an arrow: an arrow glyph in a client that
 * has dropped the font is a box. The tone carries the sign and the word carries
 * the meaning, which is the same division the screen makes.
 */
export function BlockMovement({
  verdict, unit, mode = 'app', good = 'up',
}: {
  verdict: Verdict | DeltaVerdict | null | undefined
  unit?: string
  mode?: RenderMode
  /**
   * The favourability axis, forwarded to `MovementBadge` (Block D wave 2,
   * E-leadership). UP IS NOT ALWAYS GOOD — a rival's share, a negative-mood
   * share and a standing all move the wrong way when they rise, and the
   * CATEGORY's movement is not the client's news at all — so the axis is the
   * caller's to state, exactly as `<Delta>` and `MovementBadge` have always
   * taken it. `neutral` prints the movement in muted ink: it moved, and we are
   * not saying whether that is good.
   *
   * This wrapper did not forward it, so every Phase 1 block that reached for
   * the primitive got the default `up` whether it meant it or not, and the
   * leadership one-pager printed a rise in the category's attention to Price in
   * red. The default stays `up`, which is what every existing call site got.
   */
  good?: Good
}) {
  if (!verdict) return null
  if (mode !== 'email') return <span data-copy="verdict"><MovementBadge verdict={verdict} unit={unit} good={good} /></span>

  const change = 'changePts' in verdict ? verdict.changePts : verdict.change
  const band = 'bandPts' in verdict ? verdict.bandPts : verdict.band
  if (verdict.state !== 'moved' || change == null) {
    const word = verdict.state === 'moved' ? MOVEMENT_WORDS.too_little_data : MOVEMENT_WORDS[verdict.state]
    return <span data-copy="verdict" style={chip('neutral')}>{word}</span>
  }
  // AND THE BAND IN THE EMAIL TOO. The screen arm put it in a `title`, which an
  // email has no way to show and paper has none either; this arm dropped it
  // altogether. A change without the band it cleared is a number a reader
  // cannot weigh.
  // THE EMAIL ARM TAKES THE AXIS TOO. The screen's colour and the email's chip
  // tint are the same judgement in two media, so a caller that says "this
  // movement is not good or bad" must not have it tinted green in an inbox.
  // `favourability` returns null for a neutral axis, which is the muted chip.
  const fav = favourability(change, good)
  return (
    <span data-copy="verdict" style={chip(fav === null ? 'neutral' : fav ? 'up' : 'down')}>
      {change > 0 ? '+' : '−'}{Math.abs(change).toLocaleString('en-US')}{unit ? ` ${unit}` : ''}
      {band != null ? ` · band ${Math.abs(band).toLocaleString('en-US')}` : ''}
    </span>
  )
}

/** A count's movement — no band, because a count that changed, changed. */
export function BlockCount({
  delta, unit, mode = 'app',
}: {
  delta: number | null | undefined
  unit?: string
  mode?: RenderMode
}) {
  if (delta == null) return null
  if (mode !== 'email') return <span data-copy="verdict"><CountBadge delta={delta} unit={unit} /></span>
  if (delta === 0) return <span data-copy="verdict" style={chip('neutral')}>{MOVEMENT_WORDS.unchanged}</span>
  return (
    <span data-copy="verdict" style={chip(delta > 0 ? 'up' : 'down')}>
      {delta > 0 ? '+' : '−'}{Math.abs(delta).toLocaleString('en-US')}{unit ? ` ${unit}` : ''}
    </span>
  )
}
