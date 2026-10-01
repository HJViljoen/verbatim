import type { ReactNode } from 'react'
import { fmtInt } from '@/lib/format'
import type { Direction } from '@/lib/reading/bands'
import type { Counted } from '@/lib/reading/verdicts'

// The marks an Ask answer wears (Block D wave 2, E-ask).
//
// Three small nodes, all of them the honest form of something the artboard
// draws with a word the product has not earned. They live here rather than
// inline so the copy contract's markers are attached by the primitive and a
// finding cannot print a level without its "of N" by forgetting to.

/**
 * A finding's LEVEL: the counted pair, and nothing else.
 *
 * TWO WORDS WERE WRONG HERE AND THE SECOND ONE IS THIS FIX.
 *
 * The artboard's chip says "Strong evidence". That was right to refuse (D11):
 * a tier chip belongs to a CONCLUSION — `gateTier` over a model's confidence
 * and a grounding count — and a grounded finding is a theme reading, not a
 * recommendation.
 *
 * What replaced it was `PREVALENCE_LABEL` — Dominant · Widespread · Recurring ·
 * Early signal — and that is wrong for a different reason, which D11 did not
 * reach. AGENTS.md: "a new surface draws its vocabulary from `THIRTEEN_WORDS`
 * plus the two `READER_FLAGS` and prints no term outside them". Those four are
 * outside it, and `ASK_LEGEND` — this surface's own "How to read this page" —
 * is exactly that list, so the chip a reader is most likely to click the legend
 * about was the one word the legend could not explain. Worse, the glossary
 * entry they WOULD find is legacy and written in the other unit: "at least 15%
 * of the group's analysed CONVERSATIONS (minimum 5)", computed per run over the
 * cumulative corpus, under a chip whose denominator is a comment-dated month's
 * VIDEOS. Two definitions of one word on one page.
 *
 * So the level prints as the glossary's own example of a level — "104 of 626
 * videos" (Sealand's Looks & style, September) — and the ladder word goes. Nothing is lost that the page did not
 * already say: the audience and the month are in the mono line beside it, the
 * comparison is in the badge after it, and `level` is one of the thirteen.
 * Adding the prevalence ladder to `THIRTEEN_WORDS` instead would be this
 * surface re-legislating a rule that belongs to `lib/calibration.ts` and to
 * every other reading page; `components/pages/voice-surface/theme.tsx` prints
 * the same ladder and is Voice's to answer for.
 *
 * `data-copy="level"` with the "of N" inside the SAME node, because rule (b)
 * reads a level node's whole text: a bare figure beside a denominator in a
 * sibling cell is exactly the failure the rule was written for.
 *
 * AND IT IS NOT HIGHLIGHTED (round 2, 1 Oct). It took the artboard's green
 * chip (`accent`) for emphasis, and on the page that read as a highlighted
 * phrase, which Heinrich bans. The counted pair keeps its emphasis in weight
 * alone; `MovementBadge`'s colour, beside it, is still the one on an axis.
 */
export function FindingLevel({ value, noun = 'videos' }: { value: Counted; noun?: string }) {
  // NO HIGHLIGHT (round 2, 1 Oct; Heinrich's ban on highlighted phrases): the
  // pale-yellow chip read as a highlighted phrase inside a sentence. The level
  // keeps its emphasis in weight alone, the same in a row and in a sentence.
  return (
    <span
      data-copy="level"
      className="whitespace-nowrap font-semibold text-foreground tabular-nums"
    >
      {fmtInt(value.k)} of {fmtInt(value.n)} {noun}
    </span>
  )
}

/**
 * The direction word, and the only node on this surface allowed to print one.
 *
 * Ask is the ONE reader whose flag is true (`directionWordsFor('agent.movement')`,
 * lib/config.ts), and the word still has to be earned: `directionWord` needs
 * three consecutive readings in one clustering regime, each over both floors,
 * and `movementDirection` withholds it on a thin month. `measureAnswer` has
 * already done all of that — this prints `FindingMeasure.direction` and
 * computes nothing.
 *
 * "over 3 months" rather than the mock's "3rd month": the run is
 * `DIRECTION_RUN` consecutive months, and "3rd month" claims a position in a
 * sequence that the word does not carry. It said "over 3 readings", which is
 * our word for how a month is counted (§0a).
 */
export function DirectionWord({ direction }: { direction: Direction | null | undefined }) {
  if (!direction) return null
  return (
    <span data-copy="verdict" className="whitespace-nowrap text-[12px] font-medium text-muted-foreground">
      {direction} over 3 months
    </span>
  )
}

/**
 * A verdict chip on a plan claim — the three words `PLAN_VERDICT_LABEL`
 * already fixes, in the sentiment tints §3.6 assigns them.
 *
 * THE RED IS IN THE TINT AND THE RING, NOT IN THE TEXT — the fix
 * `InferencePill` argues twenty lines below, in the colour it had not been
 * applied to. `bg-negative/12 text-negative` is `#DB3B2E` on `#FBE7E6`:
 * **3.78:1** at 12px against a 4.5:1 floor, and it renders on the plan rail of
 * both routes in every populated shot ("1 contradicted"). Moving the words to
 * `foreground` takes it to 12.3:1 light and 12.6:1 dark, and the ring keeps the
 * colour doing the signalling — exactly the trade the amber pill made when
 * `bg-warning/15 text-warning` measured 1.9:1.
 *
 * `supported` is untouched: `accent-foreground` on `accent` is 5.4:1 light and
 * 7.6:1 dark, which clears the floor, and it is the one chip here whose ink IS
 * legible. `untested` keeps `bg-inner text-muted-foreground` (4.46:1) because
 * that pair is app-wide — fourteen other call sites and `lib/ui-colors.ts` —
 * and moving it here alone would make this file the one place the product's
 * quiet grey means something different. Same answer, and the same reason, as
 * the `--warning-foreground` token `InferencePill` refers to whoever owns
 * `app/globals.css`.
 */
export function ClaimChip({ tone, children }: { tone: 'supported' | 'contradicted' | 'untested'; children: ReactNode }) {
  // NO TINT (round 2, 1 Oct; Heinrich's ban on highlighted phrases): the three
  // counts sit in a line of text beside the plan's name, so they are words in
  // that line, set in weight, the untested one quieter.
  const cls = tone === 'untested' ? 'font-medium text-muted-foreground' : 'font-semibold text-foreground'
  return <span className={`whitespace-nowrap text-[12px] ${cls}`}>{children}</span>
}

/**
 * The amber "this one is inference" pill — a block-level mark, not a per-point
 * one. See `Judgement`.
 *
 * THE AMBER IS IN THE TINT AND THE RING, NOT IN THE TEXT. `bg-warning/15
 * text-warning` is #E6B03C on a 15% tint of ITSELF — about 1.9:1, so the two
 * honesty flags this surface added ("this one is inference", "1 claim crossed")
 * were the least legible text on the page. The colour still has to signal, so
 * it moves to a ring and a slightly stronger tint and the words go to
 * `foreground`, which reads at well over 4.5:1 on that tint.
 *
 * The `bg-warning/15 text-warning` pair is app-wide (fourteen other call sites,
 * `lib/ui-colors.ts` included) and the real fix is a `--warning-foreground`
 * token dark enough to carry text — that is a palette change and it belongs to
 * whoever owns `app/globals.css`, named in the merge note. This file fixes the
 * two marks this package put the product's inference marker on.
 */
export function InferencePill({ children = 'this one is inference' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-warning/15 px-2 py-px text-[12px] font-medium text-foreground ring-1 ring-warning/50">
      {children}
    </span>
  )
}
