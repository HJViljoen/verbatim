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
 * So the level prints as the glossary's own example of a level — "130 of 1,388
 * videos" — and the ladder word goes. Nothing is lost that the page did not
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
 */
export function FindingLevel({ value, noun = 'videos' }: { value: Counted; noun?: string }) {
  return (
    <span
      data-copy="level"
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-inner px-2 py-px text-[12px] font-medium text-foreground tabular-nums"
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
 * "over 3 readings" rather than the mock's "3rd month": the run is
 * `DIRECTION_RUN` readings, and "3rd month" claims a position in a sequence
 * that the word does not carry. Same node, same length, one fewer claim.
 */
export function DirectionWord({ direction }: { direction: Direction | null | undefined }) {
  if (!direction) return null
  return (
    <span data-copy="verdict" className="whitespace-nowrap text-[12px] font-medium text-muted-foreground">
      {direction} over 3 readings
    </span>
  )
}

/** A verdict chip on a plan claim — the three words `PLAN_VERDICT_LABEL`
 *  already fixes, in the sentiment tints §3.6 assigns them. */
export function ClaimChip({ tone, children }: { tone: 'supported' | 'contradicted' | 'untested'; children: ReactNode }) {
  const cls =
    tone === 'supported'
      ? 'bg-accent text-accent-foreground'
      : tone === 'contradicted'
        ? 'bg-negative/12 text-negative'
        : 'bg-inner text-muted-foreground'
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-px text-[12px] font-medium ${cls}`}>
      {children}
    </span>
  )
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
