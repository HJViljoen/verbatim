// The Verbatim Agent's output contract.
//
// THE ONE RULE, and the reason these are separate keys rather than a flag on a
// single list: access is not authority. The agent may read every layer of the
// corpus, but a GROUNDED point must be traceable to insights the pipeline
// already extracted and verified, while anything the agent worked out for
// itself belongs in JUDGEMENT. A flag can be dropped in a render; a key cannot.
//
// The failure this contract guards against in BOTH directions:
//   - a proposal wearing an evidence badge (bluffing), and
//   - a real finding suppressed because it did not perfectly resolve (FALSE
//     SILENCE). Enforcement therefore DEMOTES rather than drops.

import { fullDate, platformLabel } from '../format'

export interface GroundedPoint {
  /** Stable within one answer, so judgement can cite it. */
  id: string
  /** The sentence the reader actually reads. */
  text: string
  /** REQUIRED, non-empty, and checked against rows that still exist. This is
   *  the whole difference between grounded and judgement. */
  insightIds: string[]
  themeRefs: { themeId: string; registryId: string | null; label: string }[]
  /** Whose audience this point rests on: 'client' only when every insight
   *  behind it came off a video tagged as the client's. The page uses it to
   *  decide whether it may say "your customers" — on 2026-09-10 it said that
   *  over a comment from another brand's audience. */
  voices: 'client' | 'category'
  /** Real comments. A quote carries the id it came from — an uncitable quote
   *  never reaches this register. */
  quotes: { text: string; commentId: string | null; videoId: string | null; lang?: string | null; english?: string | null }[]
  /** Distinct source videos behind `insightIds`. Computed in code from the
   *  cited rows, never taken from the model (the 2026-08-19 lesson). */
  conversationCount: number
}

export interface JudgementPoint {
  text: string
  /** GroundedPoint ids this reasons from. REQUIRED: a proposal that cites
   *  nothing is untethered, and untethered prose is what the register exists to
   *  keep out of the evidence column. */
  basedOn: string[]
}

/** Question mode only. The corpus had nothing on what was asked, but it does
 *  have something adjacent, and saying so is more useful than a blank. Always
 *  labelled as not-what-you-asked. NEVER produced in document mode: annotating
 *  every silent claim with a tangent turns a nine-claim brief into nine
 *  tangents and makes the summary line meaningless. */
export interface NearestThing {
  text: string
  insightIds: string[]
  conversationCount: number
}

export interface AgentAnswer {
  /** Answer first. Short, direct, in the executive-brief register — this is the
   *  thing the client came for, not a preamble to it. */
  answer: string
  grounded: GroundedPoint[]
  judgement: JudgementPoint[]
  /** True when nothing survived grounding. A first-class result: the corpus
   *  genuinely does not speak to this. */
  silent: boolean
  nearest: NearestThing[]
  /** Set when the question asks about something the corpus structurally cannot
   *  see — the client's own spend, revenue or campaign results. The classifier
   *  detected this from the first day and NOTHING used it, so a question about
   *  internal numbers came back looking like an answer to it. */
  notice?: string
  runId: string
  costUsd: number
}

/** Shown when the question is about the client's own metrics. Fixed text, like
 *  the silence sentence: a promise about what we can see is not something to
 *  let a model rephrase each time. */
export const OUT_OF_CORPUS_NOTICE =
  'This asks about your own numbers, which we cannot see. We only read public conversation. What follows is what people are saying around the subject, not an answer about your results.'

export type AgentOutcome = 'answered' | 'partial' | 'silent'

/** answered — grounded points carried the answer, quotes and all.
 *  partial  — the answer stands, but part of it is the agent's own reasoning
 *             (including the case where real analysis was found but could not
 *             be quoted).
 *  silent   — nothing resolved at all; the corpus does not speak to this.
 *
 *  Note the deliberate gap: `grounded.length === 0` is NOT silence on its own.
 *  A question that reached real insights with no quotable evidence behind them
 *  is a partial answer, and reporting it as silence would tell a client we have
 *  nothing when we have something we simply cannot quote. */
export function outcomeOf(answer: AgentAnswer): AgentOutcome {
  if (answer.silent) return 'silent'
  // Judgement does NOT make an answer partial. The prompt asks for judgement
  // and says an answer without it is worse, and enforcement appends every
  // demoted point to it — so keying on judgement made 'partial' the only value
  // the column ever took (5 of 5 in production) and killed the demand-signal
  // roadmap the table was built for. What actually distinguishes them is
  // whether anything got GROUNDED.
  return answer.grounded.length === 0 ? 'partial' : 'answered'
}

export type QuestionIntent =
  /** Answerable from the conversation corpus. */
  | 'about_customers'
  /** About the client's own numbers (ad spend, revenue, internal metrics).
   *  The corpus cannot see these, and pretending otherwise is the fastest way
   *  to lose a client's trust in everything else on the page. */
  | 'about_our_metrics'
  /** Neither — small talk, or a question about the product itself. */
  | 'out_of_scope'

export interface QuestionPlan {
  intent: QuestionIntent
  /** The question restated in the vocabulary the CORPUS uses. Clients ask
   *  "should we run a Black Friday promo"; no theme is labelled that, and
   *  matching on the question as typed is the measured under-recall problem. */
  retrievalQueries: string[]
  /** 'trend' pulls the cross-run layers that survive pruning. Never implies
   *  that historical insight TEXT can be retrieved — it cannot. */
  timeframe: 'current' | 'trend'
}

// ── The three registers' headings, said once (Phase 1 WP21, AS4/B3) ─────────
//
// They were written out in three places and two of them had drifted. The deck
// HARD-CODED "What your customers said" over every answer, ignoring the
// `voices` field it carries — the field added on 2026-09-10 precisely because
// the page had printed that sentence over a Patagonia comment under a Sealand
// question. A PDF is the artefact that leaves the building, so the copy that
// could not be checked was the copy in the riskiest place. The third register
// said "What I'd take from that" on screen and "What the agent would take from
// that" on paper, which is the same voice speaking as two different people.
//
// One first person, everywhere. The answer prose is already written in it
// ("I could not find any claims about customers or the market in that
// document"), and a reader who has just been answered by something that says
// "I" should not be handed a deck about "the agent".

/** "What your customers said" only when every point rests on the client's own
 *  audience. `voices` is computed off the LIVE video tag, not the frozen theme
 *  bucket (lib/agent/retrieve.ts), which is what makes the claim checkable. */
export function saidHeading(points: readonly { voices: 'client' | 'category' }[]): string {
  return points.length > 0 && points.every((p) => p.voices === 'client')
    ? 'What your customers said'
    : 'What people said'
}

export const NEAREST_HEADING = 'Not what you asked, but close'

export const JUDGEMENT_HEADING = 'What I’d take from that'

// ── Where a quoted voice was said, said once (Phase 1 WP21 fix pass) ────────
//
// The footnote numbering was unified across the two renderers and the DATE was
// not: the screen printed `shortDate(meta.date)` — "30 Aug" — and the deck's
// evidence appendix printed the stored string raw, "2026-08-30", for the same
// numbered quote. A reader comparing the answer on screen with the appendix in
// the PDF saw one fact rendered two ways.
//
// THE YEAR STAYS. `fullDate`, not `shortDate`: an answer retrieves across the
// whole corpus, whose comments run back to 2020 on this tenant, and a column of
// citations reading "30 Aug" beside "30 Aug" is two different Augusts (the rule
// lib/format.ts already writes down for the readiness page). The screen gains
// the year rather than the deck losing it.

/** "YouTube · 30 Aug 2026", with whichever halves are recorded. Empty when
 *  neither is — the caller says "source on file", which is a different
 *  sentence in each renderer's own furniture. */
export function citationWhere(
  meta: { platform?: string | null; date?: string | null } | null | undefined,
): string {
  return [meta?.platform ? platformLabel(meta.platform) : null, meta?.date ? fullDate(meta.date) : null]
    .filter(Boolean)
    .join(' · ')
}

/**
 * What a citation's link OPENS, in the reader's words.
 *
 * THE ARTBOARD SAYS "the video →" AND "the thread →" AND IT IS RIGHT. The build
 * branched on `commentLevel` alone — "the comment →" or "the post →" — so a
 * TikTok video and a Reddit thread read identically and the destination was
 * indistinguishable, which is the one thing a provenance link has to say.
 * `commentLevel` decides whether we hold the comment's own address; the
 * PLATFORM decides what the reader lands on. Anything we do not recognise
 * keeps the old, weaker words rather than guessing at a noun.
 *
 * One helper, so the screen's finding, the deck's appendix and a share link
 * name one destination.
 */
export function citationDestination(
  meta: { platform?: string | null; commentLevel?: boolean } | null | undefined,
): string {
  switch (meta?.platform) {
    case 'reddit':
      return meta.commentLevel ? 'the thread' : 'the post'
    case 'youtube':
    case 'tiktok':
    case 'instagram':
      return 'the video'
    default:
      return meta?.commentLevel ? 'the comment' : 'the post'
  }
}
