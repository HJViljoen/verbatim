import type { ReactNode } from 'react'
import { PREVALENCE_LABEL, prevalenceTier } from '@/lib/calibration'
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
 * A finding's LEVEL: the calibrated word and the counted pair that earned it.
 *
 * THE ARTBOARD'S CHIP SAYS "Strong evidence" AND THIS DOES NOT (D11). A tier
 * chip belongs to a CONCLUSION — `gateTier` turns a model's confidence and a
 * grounding count into one of three words, and that is a statement about a
 * recommendation, not about a theme. A grounded finding is a THEME reading, so
 * it earns a PREVALENCE word: `prevalenceTier` against the same denominator
 * the figures beside it print, which is the ladder `lib/calibration.ts` has
 * held since the calibration pass and the one a reader is measured against in
 * the glossary.
 *
 * `data-copy="level"` with the "of N" inside the SAME node, because rule (b)
 * reads a level node's whole text: "Widespread · 130 of 1,388 videos" passes
 * and "Widespread" beside a figure in a sibling cell does not — which is
 * exactly the failure the rule was written for.
 */
export function PrevalenceLevel({ value, noun = 'videos' }: { value: Counted; noun?: string }) {
  const tier = prevalenceTier(value.k, value.n)
  return (
    <span
      data-copy="level"
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-inner px-2 py-px text-[12px] font-medium text-muted-foreground"
    >
      {PREVALENCE_LABEL[tier]} · {fmtInt(value.k)} of {fmtInt(value.n)} {noun}
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

/** The amber "this one is inference" pill — a block-level mark, not a per-point
 *  one. See `JudgementRegister`. */
export function InferencePill({ children = 'this one is inference' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-warning/15 px-2 py-px text-[12px] font-medium text-warning">
      {children}
    </span>
  )
}
