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
 *  wording DeltaBadge brought with it.
 *
 *  `too_little_data` READS "too few to compare" (Block D wave 1, P0 item 6;
 *  mock-gap §6 D11, Heinrich's ruling of 2026-09-18 that the mock's word
 *  wins). It is not a re-wording for the mock's sake: the phrase was already
 *  the product's everywhere the rule is EXPLAINED rather than stamped —
 *  `GLOSSARY.change` ("under 100 videos a side, or 10 of the object's own,
 *  'too few to compare'"), `lib/agent/movement.ts`, `lib/pages/quarterly.ts`,
 *  `lib/pages/overview.ts` — so the badge was the one place disagreeing with
 *  the glossary a reader is measured against. The state TOKEN is unchanged;
 *  only the copy moved, which is the whole reason `state` is a token and this
 *  table is the one place it becomes words. The email's chip reads this table
 *  rather than carrying its own copy (components/email/delta-block.tsx). */
export const MOVEMENT_WORDS: Record<Exclude<VerdictState, 'moved'> | 'unchanged', string> = {
  no_clear_change: 'no clear change',
  too_little_data: 'too few to compare',
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

/** THE NON-ANSWER WRAPS; IT DOES NOT OVERPRINT (Block D wave 3, SH2).
 *
 *  It was `whitespace-nowrap`, and "comparison refused" needs about 117px. The
 *  quarterly standings' Change track is about 100px wide, so on six of seven
 *  fixture states, at both widths, the phrase ran into the column beside it
 *  and the sheet read "comparison refuseCon" over "Comments per video". Two
 *  blocks of text overprinted is the one defect a PDF reader cannot recover
 *  from, and a wrapped non-answer is still a readable non-answer.
 *
 *  `MOVED` keeps its nowrap on the figure alone (see `Moved`): a magnitude
 *  broken across two lines is a different kind of unreadable. */
const NON_ANSWER = 'text-xs font-medium text-muted-foreground'
const MOVED = 'text-xs font-semibold'

/** The band, as the artboard writes it: "band ±2.1", with the unit the change
 *  carries (Block D wave 3, SH18). The magnitude printed its unit and the band
 *  did not, and the ± — which is the whole reason a band is not a threshold —
 *  lived in a `title`. */
function band(value: number, unit?: string): string {
  return `band ±${Math.abs(value).toLocaleString('en-US')}${unit ? ` ${unit}` : ''}`
}

/**
 * A muted non-answer. Never coloured, never arrowed.
 *
 * AND IT PRINTS WHAT IT REFUSED (Block D wave 3, SH18). The change and the
 * band were in the `title` alone, so the six "no clear change" cells on the
 * Competitive standings were six unexplained refusals in print, on a keyboard
 * and to a screen reader — which also undercut the defence for keeping both
 * change columns. A refusal a reader can check is a measurement; one they
 * cannot is an assertion. Where there is nothing to show — a comparison
 * refused for a bookkeeping break, or a reading with no two sides — the word
 * stands alone, as it did.
 */
function NonAnswer({ word, title, change, bandPts, unit }: { word: string; title: string; change?: number | null; bandPts?: number | null; unit?: string }) {
  const showable = change != null && bandPts != null
  return (
    <span className={NON_ANSWER} title={title}>
      {word}
      {showable ? (
        <span className="font-normal"> · {change > 0 ? '+' : change < 0 ? '−' : '±'}{Math.abs(change).toLocaleString('en-US')}{unit ? ` ${unit}` : ''} · {band(bandPts, unit)}</span>
      ) : null}
    </span>
  )
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
function Moved({ change, unit, band: bandPts, title, good = 'up' }: { change: number; unit?: string; band?: number | null; title: string; good?: Good }) {
  const fav = favourability(change, good)
  return (
    <span title={title} className={`${MOVED} ${fav === null ? 'text-muted-foreground' : fav ? 'text-positive' : 'text-negative'}`}>
      <span className="whitespace-nowrap">{change > 0 ? '▲' : '▼'} {Math.abs(change).toLocaleString('en-US')}{unit ? ` ${unit}` : ''}</span>
      {/* THE BAND IS TEXT, NOT A TOOLTIP. lib/reports/weekly.ts's budget
          comment says "this product never prints a change without the band it
          cleared" — and on a printed page, in an email, and for anyone not
          using a mouse, a `title` attribute is not printed at all. */}
      {bandPts != null ? <span className="font-normal text-muted-foreground"> · {band(bandPts, unit)}</span> : null}
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
  const bandPts = 'bandPts' in verdict ? verdict.bandPts : verdict.band
  if (verdict.state === 'moved' && change != null) {
    return <Moved change={change} unit={unit} band={bandPts} good={good} title={bandPts != null ? `moved beyond the ${bandPts} pt margin of this measurement` : 'moved'} />
  }
  const why = 'refusedReason' in verdict && verdict.refusedReason ? REFUSED_WHY[verdict.refusedReason] : null
  const inside = change != null && bandPts != null
    ? `moved ${change > 0 ? '+' : ''}${change}${unit ? ` ${unit}` : ''}, inside the ${bandPts} pt margin of this measurement`
    : 'not enough on both sides to compare yet'
  // `moved` with no change is incoherent — nothing in lib/reading/verdicts.ts
  // can produce it — so it reads as the thin answer rather than as a movement
  // with no number, which is the only safe way for it to be wrong.
  const word = verdict.state === 'moved' ? MOVEMENT_WORDS.too_little_data : MOVEMENT_WORDS[verdict.state]
  // A REFUSAL SHOWS NO NUMBERS. `refused` is a break in our own bookkeeping —
  // the figure exists and saying it moved would be a claim about the record,
  // not about the conversation — so printing a change beside the word would be
  // the claim the state exists to withhold.
  const refused = verdict.state === 'refused'
  return <NonAnswer word={word} title={why ?? inside} change={refused ? null : change} bandPts={refused ? null : bandPts} unit={unit} />
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
