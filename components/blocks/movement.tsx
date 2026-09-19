import type { RenderMode } from '@/lib/blocks/types'
import { CountBadge, MovementBadge, MOVEMENT_WORDS } from '@/components/delta-badge'
import { favourability, type Good } from '@/components/charts/stat'
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
/**
 * THE COLOUR IS IN THE TINT AND THE EDGE, NOT IN THE TEXT (Block D wave 3,
 * SH8) — the remedy `components/pages/agent/marks.tsx` already uses, in the
 * one form an email can carry (a border, since there are no rings in Word).
 *
 * `up` was `#0E8A5F` on `#DDF3E9` and `down` `#DB3B2E` on `#FBE3E1`, at
 * 11px/700: 3.75:1 and 3.81:1, about ten instances on one monthly render and
 * every email surface inherits them. `MonthlyReport.dc.html` contains none of
 * those three hexes — its verdict pill is grey both ways and the DIRECTION is
 * carried by a "▲/▼ n pts" glyph — so the artboard was also answering the
 * question of what may carry a claim, and it is not a hue at 3.8:1.
 *
 * The tone survives, because it is the caller's `good` axis and a wave-2 fix
 * put it here on purpose (a fall in price complaints printed red, a rise in
 * the category's attention printed red on the leadership one-pager). It moves
 * to the ground and a 1px edge; the WORDS go to `EMAIL.ink`, which reads at
 * over 12:1 on all three tints.
 *
 * THE ARTBOARD'S "▲/▼ n pts" IS NOT ADOPTED, and that is a decision rather
 * than an oversight. This arm is glyph-free on purpose — an arrow in a client
 * that has dropped the font is a box, which is the rule the chip exists for —
 * and the `+` / `−` sign it already prints carries exactly the same
 * information with no font to drop. What the artboard's glyph was BUYING,
 * which this arm did not have, is a direction that does not depend on the
 * colour; the sign is that, and now the colour no longer has to carry the
 * reading either.
 *
 * The neutral chip takes `ink2` rather than `muted`: muted on `inner` is the
 * 4.46:1 pair SH7 is about, and this arm cannot read the app's token.
 */
const chip = (tone: 'up' | 'down' | 'neutral' | 'noted') => ({
  display: 'inline-block' as const,
  fontFamily: FONT.sans,
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 10,
  whiteSpace: 'nowrap' as const,
  fontWeight: 600,
  color: tone === 'neutral' ? EMAIL.ink2 : EMAIL.ink,
  ...(tone === 'neutral'
    ? { background: EMAIL.inner, border: `1px solid ${EMAIL.border}` }
    : tone === 'noted'
      ? { background: EMAIL.mixedTint, border: `1px solid ${EMAIL.mixed}` }
      : tone === 'up'
        ? { background: EMAIL.greenTint, border: `1px solid ${EMAIL.up}` }
        : { background: EMAIL.downTint, border: `1px solid ${EMAIL.down}` }),
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
  /**
   * The favourability axis, forwarded to `MovementBadge` (Block D wave 2,
   * E-leadership and E-weekly, which asked for it a day apart). UP IS NOT ALWAYS GOOD — a rival's share, a negative-mood
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
  // A NEUTRAL AXIS IS `noted`, NOT `neutral` (merge, Block D wave 2).
  // `favourability` answers null for a neutral axis and both packages reached
  // for a chip; grey is the NON-ANSWER's tint ("no clear change", "too few to
  // compare"), so a movement that really did clear its band may not borrow it,
  // or a measured change would read as a refusal. `noted` is the artboards'
  // own attention tint.
  return (
    <span data-copy="verdict" style={chip(fav === null ? 'noted' : fav ? 'up' : 'down')}>
      {change > 0 ? '+' : '−'}{Math.abs(change).toLocaleString('en-US')}{unit ? ` ${unit}` : ''}
      {/* "band ±2.1 pts", the artboard's own wording and the screen arm's
          (SH18): the ± is the whole reason a band is not a threshold, and the
          band carries the unit the change carries. */}
      {band != null ? ` · band ±${Math.abs(band).toLocaleString('en-US')}${unit ? ` ${unit}` : ''}` : ''}
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
