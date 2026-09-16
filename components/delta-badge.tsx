import { favourability, type Good } from '@/components/charts/stat'
import type { DeltaVerdict } from '@/lib/report-bands'
import { REFUSAL_WHY } from '@/lib/reading/record'
import type { Verdict, VerdictState } from '@/lib/reading/verdicts'

/**
 * THE badge. One component, one vocabulary, three visual states (Phase 1 WP10,
 * decision O).
 *
 * WHAT IT REPLACED. Until now the product had two badges and five movement
 * vocabularies. `DeltaBadge` printed counts ("unchanged" on an exact zero, else
 * `▲ N`); `MovementBadge` printed band-gated proportions but had NO JSX call
 * site anywhere — every page reached for `<Delta>` or the email's `verdictChip`
 * instead. So the one badge that knew about a band was the one nothing used,
 * and the badge that shipped decided "no change" with `delta === 0` on a count
 * and, through `favourability()`, with a 0.5 / 0.05 epsilon invented inside a
 * presentation component. Both of those ad-hoc conventions retire here: the
 * epsilon is gone from `favourability` (components/charts/stat.tsx colours the
 * value it actually prints), and DeltaBadge's two wordings moved into the
 * shared table below and its component went.
 *
 * THE THREE STATES, AND THE RULE FOR EACH.
 *   moved         — it cleared its band (or, for a count, it is not zero).
 *                   Arrowed, coloured, `title` naming the band.
 *   a non-answer  — the product declining to answer, for one of five reasons.
 *                   Sans, weight 500, muted — NEVER coloured, NEVER arrowed
 *                   (mock spec §3.5). A flat week must read as flat, not as
 *                   noise, and a refused comparison must not read as flat.
 *   nothing       — no verdict at all. A first update simply shows no
 *                   comparison rather than showing a zero.
 *
 * COUNTS AND PROPORTIONS ARE STILL TWO THINGS, and that distinction survives as
 * two ARMS of one badge rather than as two components. A count that changed,
 * changed — there is no band to clear, and asking for one would silence "6
 * themes confirmed → 5". A proportion needs its band or it is noise: on Sealand
 * one conversation is 5.26 share points, which is how "Up 5.3 points" was once
 * printed on n = 1. The arms differ in what they test; they do not differ in
 * what they say.
 */

/** Every word this badge is allowed for a non-answer, stated once.
 *
 *  `too_little_data` is about THIS reading's thinness and can resolve next
 *  week; `baseline_forming` resolves on the calendar; `refused` is a break in
 *  our own bookkeeping, not a property of the conversation (lib/reading/
 *  verdicts.ts). `unchanged` is the count arm's non-answer and is the one
 *  wording DeltaBadge brought with it. */
export const MOVEMENT_WORDS: Record<Exclude<VerdictState, 'moved'> | 'unchanged', string> = {
  no_clear_change: 'no clear change',
  too_little_data: 'too little data',
  baseline_forming: 'not enough months yet',
  refused: 'comparison refused',
  unchanged: 'unchanged',
}

/** Why a refused comparison was refused, in the reader's words — printed as the
 *  badge's `title`, because the word alone ("comparison refused") tells a
 *  reader that something is wrong without telling them what. The SAME words
 *  the record prints in the open (lib/reading/record.ts refusedSentence): a
 *  tooltip and a paragraph about one refusal may not differ. */
const REFUSED_WHY = REFUSAL_WHY

const NON_ANSWER = 'whitespace-nowrap text-xs font-medium text-muted-foreground'
const MOVED = 'whitespace-nowrap text-xs font-semibold'

/** A muted non-answer. Never coloured, never arrowed. */
function NonAnswer({ word, title }: { word: string; title: string }) {
  return <span className={NON_ANSWER} title={title}>{word}</span>
}

/** An arrowed movement, coloured on the caller's favourability axis.
 *
 *  THE ARROW IS THE SIGN; THE COLOUR IS THE JUDGEMENT. Up is not always good —
 *  a rival's share, a negative-mood share and a standing all move the wrong way
 *  when they rise — so the axis is the caller's to state, exactly as `<Delta>`
 *  has always taken it (`good`, components/charts/stat.tsx). `neutral` prints
 *  the movement in muted ink: it moved, and we are not saying whether that is
 *  good. The default stays `up`, which is what every call site meant before
 *  the axis existed. */
function Moved({ change, unit, band, title, good = 'up' }: { change: number; unit?: string; band?: number | null; title: string; good?: Good }) {
  const fav = favourability(change, good)
  return (
    <span title={title} className={`${MOVED} ${fav === null ? 'text-muted-foreground' : fav ? 'text-positive' : 'text-negative'}`}>
      {change > 0 ? '▲' : '▼'} {Math.abs(change).toLocaleString('en-US')}{unit ? ` ${unit}` : ''}
      {/* THE BAND IS TEXT, NOT A TOOLTIP. lib/reports/weekly.ts's budget
          comment says "this product never prints a change without the band it
          cleared" — and on a printed page, in an email, and for anyone not
          using a mouse, a `title` attribute is not printed at all. */}
      {band != null ? <span className="font-normal text-muted-foreground"> · band {Math.abs(band).toLocaleString('en-US')}</span> : null}
    </span>
  )
}

/**
 * Movement, from a verdict.
 *
 * Takes the WP3 `Verdict` (five states, carries its own counts and the reason a
 * comparison was refused) or the band's `DeltaVerdict` (three states), so a
 * legacy tile and a Phase 1 block hand it the same component. `good` is the
 * favourability axis: a rival's share, a negative-mood share and a standing all
 * rise the wrong way, and this is the badge every Phase 1 block uses.
 *
 * A `Verdict` whose
 * `direction` is set is still NOT a direction word here — this badge prints a
 * magnitude and a sign, and the words "growing" and "fading" are earned over
 * three readings and printed by the surface, not by a badge.
 */
export function MovementBadge({ verdict, unit, good = 'up' }: { verdict: Verdict | DeltaVerdict | null | undefined; unit?: string; good?: Good }) {
  if (!verdict) return null
  const change = 'changePts' in verdict ? verdict.changePts : verdict.change
  const band = 'bandPts' in verdict ? verdict.bandPts : verdict.band
  if (verdict.state === 'moved' && change != null) {
    return <Moved change={change} unit={unit} band={band} good={good} title={band != null ? `moved beyond the ${band} pt margin of this measurement` : 'moved'} />
  }
  const why = 'refusedReason' in verdict && verdict.refusedReason ? REFUSED_WHY[verdict.refusedReason] : null
  const inside = change != null && band != null
    ? `moved ${change > 0 ? '+' : ''}${change}${unit ? ` ${unit}` : ''}, inside the ${band} pt margin of this measurement`
    : 'not enough on both sides to compare yet'
  // `moved` with no change is incoherent — nothing in lib/reading/verdicts.ts
  // can produce it — so it reads as the thin answer rather than as a movement
  // with no number, which is the only safe way for it to be wrong.
  const word = verdict.state === 'moved' ? MOVEMENT_WORDS.too_little_data : MOVEMENT_WORDS[verdict.state]
  return <NonAnswer word={word} title={why ?? inside} />
}

/**
 * Movement, from a count.
 *
 * A COUNT HAS NO BAND, and pretending otherwise silences a real change: themes
 * confirmed, recommendations, comments read. `null` is "there is nothing to
 * compare with yet" and renders nothing; an exact zero is the count's honest
 * non-answer and gets the muted word.
 */
export function CountBadge({ delta, unit, good = 'up' }: { delta: number | null | undefined; unit?: string; good?: Good }) {
  if (delta == null) return null
  if (delta === 0) return <NonAnswer word={MOVEMENT_WORDS.unchanged} title="no change since your last update" />
  return <Moved change={delta} unit={unit} good={good} title="movement since your last update" />
}
