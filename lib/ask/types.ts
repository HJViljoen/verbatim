// The Ask engine's contract.
//
// THREE REGISTERS, and the separation is structural rather than a flag:
//
//   ClaimResult   GROUNDED. A verdict, a count, the themes and insight ids
//                 behind it. Nothing in here is the model's opinion.
//   Judgement     THE MODEL'S OWN PROPOSAL, marked as such and citing the claim
//                 refs it reasons from. It may propose, infer and recommend
//                 freely — it may not pose as evidence.
//   'silent'      A FIRST-CLASS VERDICT. "The conversation does not speak to
//                 this" is an answer, not a gap to fill.
//
// A flag on one list would let a careless render merge them; separate types
// mean the grounded panel cannot accidentally print a proposal.

export type Verdict = 'echoes' | 'contradicts' | 'silent'

export const VERDICTS: readonly Verdict[] = ['echoes', 'contradicts', 'silent'] as const

/**
 * The fewest distinct videos, each with a real comment we can show, that a
 * supported or contradicted verdict stands on (walkthrough item 5).
 *
 * A verdict needs real support. Until this floor the rule was one quotable
 * comment, so a claim read "Contradicted" on one or two videos and flipped
 * back the next week. Below the floor a claim reads untested.
 */
export const PLAN_VERDICT_MIN_VIDEOS = 1

/**
 * How much of a changed verdict's evidence has to be NEW for the change to be
 * printed: the share of its videos that were not behind the verdict it
 * replaces. Below it the same evidence was read two ways, which is the model's
 * variance and not the conversation moving.
 */
export const VERDICT_NEW_EVIDENCE_SHARE = 0.5

/** A theme the verdict rests on. `registryId` is the cross-run key — the one a
 *  later re-evaluation can still resolve after labels churn. */
export interface ThemeRef {
  themeId: string
  registryId: string | null
  label: string
}

export interface ClaimResult {
  /** C1, C2 … — stable within one check, and how judgement cites back. */
  ref: string
  /** The claim as extracted from the submission, in the author's own terms. */
  claim: string
  verdict: Verdict
  /** What the conversation actually says on this subject. Null when silent —
   *  enforced in code, never trusted to the model. */
  theySay: string | null
  /** Distinct source videos behind the verdict, CUMULATIVE OVER THE RUN and
   *  never month-scoped — validateVerdicts says the same thing, and the two
   *  comments had come to disagree. The monthly reading's month-scoped
   *  definition of a conversation (lib/calibration.ts) is a different unit from
   *  this one; it is not what this counts. */
  conversationCount: number
  themeRefs: ThemeRef[]
  /** Grounding for live quote resolution. No quote text is stored. */
  insightIds: string[]
  /** The document sentence this claim came from, verbatim. Null when the claim
   *  is implied rather than written — which the annotated view says out loud,
   *  because "your plan rests on this and never states it" is worth knowing. */
  source?: string | null
  /**
   * A verdict a re-reading proposed and the hold has not printed yet
   * (`holdVerdicts`, lib/ask/verdicts.ts): an untested claim takes a verdict
   * only when two re-readings in a row agree on it. Stored on the claim so the
   * next re-reading can see the first one. Absent on every claim written
   * before the hold, and on any claim nothing is pending for.
   */
  pending?: { verdict: Verdict } | null
}

export interface Judgement {
  text: string
  /** Which claims this proposal reasons from. A judgement citing nothing is
   *  still allowed — it is visibly the model's own view either way — but the
   *  refs are what let a reader check the reasoning against the evidence. */
  basedOnRefs: string[]
}

export interface AskSummary {
  supported: number
  contradicted: number
  untested: number
}

export interface AskResult {
  claims: ClaimResult[]
  summary: AskSummary
  judgement: Judgement[]
  costUsd: number
}

/** One claim as extracted from the submission, before any verdict. */
export interface ExtractedClaim {
  ref: string
  claim: string
  /** The sentence in the document this was drawn from, verbatim — or null when
   *  the claim is implied rather than stated. Never trusted: it is checked
   *  against the document text before it is used to highlight anything. */
  source?: string | null
}
