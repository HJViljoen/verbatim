import type { RenderMode } from '@/lib/blocks/types'
import type { Good } from '@/components/charts/stat'
import { CountBadge, MovementBadge, MOVEMENT_WORDS } from '@/components/delta-badge'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { DeltaVerdict } from '@/lib/report-bands'
import type { Verdict } from '@/lib/reading/verdicts'

// The one badge, in three modes (Phase 1 WP10). See components/blocks/frame.tsx.

/**
 * FOUR TONES, NOT THREE. `neutral` is the NON-ANSWER's grey — "no clear
 * change", "too few to compare" — and a movement that really did move but
 * whose direction is not a judgement cannot borrow it, or a measured change
 * would look like a refusal. `noted` is the artboards' own attention tint
 * (`EMAIL.mixedTint`): it moved, it cleared its band, and we are not saying
 * whether that is good news.
 */
const chip = (tone: 'up' | 'down' | 'neutral' | 'noted') => ({
  display: 'inline-block' as const,
  fontFamily: FONT.sans,
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 10,
  whiteSpace: 'nowrap' as const,
  ...(tone === 'neutral'
    ? { background: EMAIL.inner, color: EMAIL.muted, fontWeight: 600 }
    : tone === 'noted'
      ? { background: EMAIL.mixedTint, color: EMAIL.ink, fontWeight: 700 }
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
 *
 * `good` IS THE FAVOURABILITY AXIS, AND IT IS THE CALLER'S TO STATE (block D
 * wave 2). `MovementBadge` has taken it since WP10 — "THE ARROW IS THE SIGN;
 * THE COLOUR IS THE JUDGEMENT", components/delta-badge.tsx — and this wrapper
 * did not forward it, so both arms coloured strictly by sign. The weekly
 * report's flag card is headed "Unusual this week · Objections" and rendered
 * "+10.7 pts · band 5" GREEN ON MINT, and WR2 painted a fall in price
 * complaints red; the artboard puts that slot in amber precisely because amber
 * is valence-free, and DESIGN.md reserves green for "you, gaining, supported
 * claims". `neutral` is the honest axis wherever a rise is not self-evidently
 * good news. The default stays `up`, which is what every call site meant
 * before the axis reached here.
 */
export function BlockMovement({
  verdict, unit, mode = 'app', good = 'up',
}: {
  verdict: Verdict | DeltaVerdict | null | undefined
  unit?: string
  mode?: RenderMode
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
  return (
    <span data-copy="verdict" style={chip(good === 'neutral' ? 'noted' : (change > 0) === (good === 'up') ? 'up' : 'down')}>
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
