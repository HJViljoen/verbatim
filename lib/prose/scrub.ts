import { directionHits, quotedSpans } from '../calibration'
import type { Verdict } from '../reading/verdicts'
import type { FigureTable } from '../reports/types'

// The two scrubbers, written once (design item 9, Phase 1 WP7).
//
// WHY THIS FILE EXISTS. Sixteen model calls write client-facing prose; five of
// them ran any scrubber at all, and the scrubber they ran was one of THREE
// near-copies of the same eleven lines — `validateBrief` (beat-level, re-anchors
// a mistyped figure to its token), `scrubCover` (sentence-level, no allow-list)
// and `scrubText` (paragraph-level, allow-list, dashes, caps). They are not
// interchangeable: extending the cover's copy to Pass D-b would have deleted
// every sentence naming a product with a digit in its name, because only one of
// the three has ever heard of `3R78`. So the LOOP lives here once, the extras
// stay with the slots that need them, and a policy decides which rules a slot
// gets rather than which file happened to import which.
//
// THE TWO RULES.
//  · A DIGIT is a figure, and a figure is code's. A sentence in which the model
//    typed one is dropped whole — never a word-delete, because a word-delete
//    leaves "The durability conversation is, and the comfort one is fading." on
//    the page with the leak buried in ai_call_log. The figure a sentence is
//    allowed to name is a `[[key]]` the caller's figure table holds, which the
//    surface substitutes at render.
//  · A DIRECTION is earned, and earning it takes three consecutive monthly
//    readings under one grouping. A sentence that names a direction for an
//    object nothing earned one for is dropped whole, on the same rule and for
//    the same reason.
//
// WHAT NEITHER RULE MAY DO. Reach inside a quotation. 41% of stored quotes are
// non-ASCII and the magnitude strip already deletes `vast` from inside the
// Dutch "dat staat vast", because `vast` is an English magnitude adjective and
// a Dutch verb particle and nothing told the strip where a quote starts. Words
// inside quotation marks are the speaker's. A NUMBER inside a quotation is
// still refused, because a figure the product prints is the product's claim
// however it is punctuated — which is also why a quote in the new slots is a
// sibling node with its own ref, never a span inside scrubbed prose (7.4% of
// stored quotes carry a digit; inside prose they would take their sentence
// with them).

// ---- The shared mechanics ---------------------------------------------------

/** The literal placeholder the model leaves where a figure belongs. */
export const FIGURE_KEY_RE = /\[\[([a-z][a-z0-9_]*)\]\]/g

/** A figure-like token: an optional sign, digits with separators, an optional
 *  unit. Catches "71%", "12.4k", "3", "+8 pts" — anything the model might type
 *  where a `[[key]]` belongs. */
export const FIGURE_RE = /[+-]?\d[\d.,]*\s?(?:%|k|m|bn|pts?|percent)?/gi

/**
 * Magnitude words: how MUCH, which code owns and the model may not free-style
 * (the CALIBRATED_PROSE_RULE banned set). Stripped as WORDS, because "many
 * buyers said so" is a whole sentence worth keeping once `many` is gone.
 *
 * `growing`, `increasing` and `increasingly` used to be on this list and are
 * not any more. They are DIRECTIONS, not magnitudes, and a word-delete of a
 * direction leaves "The durability conversation is, and the comfort one is
 * fading." on the page — broken English with the leak buried in ai_call_log,
 * which is the failure mode the direction rule exists to avoid. They belong to
 * DIRECTION_WORDS (lib/calibration.ts) and are handled the way every other
 * direction word is: by dropping the sentence, wherever a slot's policy asks
 * for the direction rule at all.
 *
 * THE COST OF THAT MOVE, MEASURED, and why the policy below does not simply
 * flip. On `digits` slots those three words are no longer deleted at all, so
 * the question is whether recommendations, insights and findings should take
 * the direction rule instead. Replaying it over today's production prose:
 * 11 of 311 recommendation-reasoning sentences drop (6 of 121 bodies empty
 * entirely), 8 of 121 recommendation TITLES empty entirely, 7 of 260 insight
 * descriptions, 2 of 246 findings, 0 of 7 personas. Almost every one is the
 * word `increase` — and on a recommendation `increase` is an IMPERATIVE
 * addressed to the reader ("Increase short-form posting cadence"), not a claim
 * that something is going up. That is a fourth false-positive class the word
 * list cannot see and the policy table has to hold off, exactly like a theme's
 * own description. Meanwhile the three words appear in 4 of 366 stored strings
 * all told. Deleting one in fifteen recommendations to catch four leaks is the
 * wrong trade, so these slots stay `digits` — and, since the first version of
 * this left the breach invisible as well as unpunished, `scrubProse` now counts
 * it (`flaggedDirection`) so the trade can be revisited on numbers.
 */
export const MAGNITUDE_WORDS = [
  'very', 'extremely', 'significant', 'significantly', 'overwhelming', 'overwhelmingly',
  'huge', 'hugely', 'strong', 'strongly', 'most', 'many', 'widespread', 'frequent',
  'frequently', 'consistently', 'vast', 'majority',
]
export const MAGNITUDE_RE = new RegExp(`\\b(${MAGNITUDE_WORDS.join('|')})\\b`, 'gi')

/** Defensive strip for internal handles that leak into client-facing prose
 *  despite the prompt rule (seen live: Pass C findings citing "[T18]",
 *  2026-07-09). Covers T# (themes), C# (competitive insights), and S# (client
 *  claims, Step 2b) — the same leak class for every bracket-labelled input.
 *  Removes bracketed refs and tidies the whitespace/punctuation left behind.
 *
 *  It lives here, and `scrubProse` runs it under EVERY policy, because the
 *  table defines `none` as "handles are stripped and nothing else". It used to
 *  run one level up in `slotScrubber`, so a caller reaching `scrubProse`
 *  directly got a documented strip that never happened. */
export function stripThemeRefs(text: string): string {
  return text
    .replace(/\s*\[[TSC]\d+\](\[[TSC]\d+\])*/g, '')
    .replace(/\s*\([TSC]\d+(,\s*[TSC]\d+)*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim()
}

/** Collapse whitespace and tidy the punctuation a strip leaves behind. */
export function tidy(text: string): string {
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/^[\s,;:–-]+/, '')
    .trim()
}

/** Sentences, for a body that may carry `[[keys]]` and opening quotation
 *  marks. A sentence is the unit both rules drop, so this is the unit of
 *  damage: it is deliberately conservative about splitting. */
export function splitSentences(body: string): string[] {
  return body
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z\[“"])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Replace every match of `re` that lies OUTSIDE a quotation. The one mechanic
 * that keeps a word-level rule off somebody else's words.
 */
export function replaceOutsideQuotes(text: string, re: RegExp, replacement: string): string {
  const spans = quotedSpans(text)
  if (spans.length === 0) return text.replace(re, replacement)
  let out = ''
  let cursor = 0
  for (const [start, end] of spans) {
    out += text.slice(cursor, start).replace(re, replacement) + text.slice(start, end)
    cursor = end
  }
  return out + text.slice(cursor).replace(re, replacement)
}

/**
 * Tokens that carry a digit but are NAMES, not numbers: "3R78", "C-Leg 4",
 * "X3", "L5999". Mined from a run's own inputs — theme labels and
 * descriptions, the tenant's claims, its product names — and carried, so every
 * slot in a run shares one allow-list instead of each deriving its own from
 * whatever it happens to hold. A bare number with a unit or an ordinal (90k,
 * 4th, 12pm) never qualifies.
 */
export function allowTokens(texts: readonly string[]): string[] {
  const out = new Set<string>()
  for (const text of texts) {
    for (const m of (text ?? '').matchAll(/\b(?=[A-Za-z0-9-]*\d)(?=[A-Za-z0-9-]*[A-Za-z])[A-Za-z0-9][A-Za-z0-9-]{1,14}\b/g)) {
      if (/^\d+[A-Za-z]{1,2}$/.test(m[0])) continue
      out.add(m[0])
    }
  }
  // Longest first: "C-Leg 4" must be removed before "4" is looked for.
  return [...out].sort((a, b) => b.length - a.length)
}

const allowRegexes = (allow: readonly string[]): RegExp[] =>
  allow.map((a) => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}\\b`, 'gi'))

// ---- The result -------------------------------------------------------------

export interface ProseScrub {
  text: string
  /** Sentences dropped, whatever the reason. */
  dropped: number
  /** …of which, dropped because the model typed a figure of its own. */
  droppedDigits: number
  /** …of which, dropped because they named a direction nothing earned. */
  droppedDirection: number
  /** Sentences that named a direction nothing earned and were KEPT, because
   *  this slot's policy does not run the direction rule. Counted so a prompt
   *  that starts claiming movement is visible in `ai_call_log` on the slots
   *  where deleting the sentence would cost more than the claim does — a
   *  recommendation's "Increase short-form output" is an instruction to the
   *  reader, not a reading (8 of 121 stored recommendation titles are one, and
   *  the rule would empty every one of them). Never a reason to call a call
   *  `leaked`: nothing was removed. */
  flaggedDirection: number
  /** Something had to be removed or dropped — the flag that belongs in this
   *  call's `ai_call_log.response`, so a prompt that starts leaking is visible
   *  before a reader finds it. */
  leaked: boolean
}

const EMPTY: ProseScrub = { text: '', dropped: 0, leaked: false, droppedDigits: 0, droppedDirection: 0, flaggedDirection: 0 }

const merge = (a: ProseScrub, b: ProseScrub): ProseScrub => ({
  text: b.text,
  dropped: a.dropped + b.dropped,
  droppedDigits: a.droppedDigits + b.droppedDigits,
  droppedDirection: a.droppedDirection + b.droppedDirection,
  flaggedDirection: a.flaggedDirection + b.flaggedDirection,
  leaked: a.leaked || b.leaked,
})

// ---- Rule 1 · the digit scrubber -------------------------------------------

export interface DigitOptions {
  /** Product names that may carry digits (allowTokens). */
  allow?: readonly string[]
  /** Strip magnitude words too, outside quotations. On by default: every
   *  prompt that bans them is a prompt this rule backs up. */
  magnitude?: boolean
}

/**
 * Drop every sentence in which the model wrote a number of its own, or cited a
 * figure key the table does not hold.
 *
 * The one implementation. `scrubCover` and the document writer's `scrubText`
 * both run it; `validateBrief` keeps its own beat-level variant because it does
 * something this cannot — it re-anchors a mistyped figure to the `[[n]]` token
 * so the dashboard still knows where to bold, which is only meaningful for a
 * slot with exactly one figure.
 */
export function dropDigitSentences(raw: string, figures: FigureTable, opts: DigitOptions = {}): ProseScrub {
  const allowed = allowRegexes(opts.allow ?? [])
  const kept: string[] = []
  let dropped = 0
  let leaked = false
  for (const sentence of splitSentences(raw ?? '')) {
    const keys = [...sentence.matchAll(FIGURE_KEY_RE)].map((m) => m[1])
    if (keys.some((k) => !figures[k])) { dropped += 1; continue }
    let bare = sentence.replace(FIGURE_KEY_RE, ' ')
    for (const re of allowed) bare = bare.replace(re, ' ')
    FIGURE_RE.lastIndex = 0
    if (bare.replace(FIGURE_RE, '') !== bare) { dropped += 1; leaked = true; continue }
    let text = sentence
    if (opts.magnitude !== false) {
      const stripped = replaceOutsideQuotes(sentence, MAGNITUDE_RE, '')
      if (stripped !== sentence) leaked = true
      text = stripped
    }
    text = tidy(text)
    if (!text || text.replace(FIGURE_KEY_RE, '').replace(/[\s.,;:!?"“”'‘’]/g, '') === '') { dropped += 1; continue }
    kept.push(text)
  }
  return { text: kept.join(' '), dropped, droppedDigits: dropped, droppedDirection: 0, flaggedDirection: 0, leaked }
}

// ---- Rule 2 · the direction scrubber ---------------------------------------

/**
 * Drop every sentence that names a direction for an object nothing earned one
 * for.
 *
 * WHAT LICENSES A DIRECTION WORD. Not the presence of a verdict: a verdict's
 * `state` answers "did this move?", and `moved` is not a direction — a single
 * banded comparison can never say which WAY a thing is going (lib/reading/
 * verdicts.ts). What licenses the word is `Verdict.direction`, which
 * `directionWord` fills in only from three consecutive readings inside one
 * clustering regime. So the rule the design states as "an object without a
 * verdict token" is enforced here as "an object whose verdict does not carry a
 * direction", which is the same rule read against the contract the product
 * actually issues, and stricter in exactly the case that matters: a refused or
 * thin comparison hands the model a token and still owes it no word.
 *
 * NAMING THE OBJECT is by label, because a label is what a sentence can
 * contain — the model is never handed an id to type. That is a loose match and
 * it is deliberately loose in the safe direction: a sentence naming no object
 * at all ("Attention is fading.") is licensed by nothing and drops.
 *
 * THE LICENCE IS PER CLAUSE, not per sentence. One earned label used to licence
 * every direction word beside it, so "Durability is growing and fit is fading."
 * survived on durability's verdict alone and shipped an unearned claim about
 * fit — loose in the UNSAFE direction, which is the one thing the match may not
 * be. A sentence is split on `;` and on the conjunctions that join two clauses,
 * and every clause that names a direction must name an earned object itself.
 * The residual looseness is an elided subject ("durability is growing and
 * gaining"): the second clause names no object, so the sentence drops. That is
 * the safe direction, and the slots this rule runs on all have a code-composed
 * fallback behind them.
 */
export function dropUnverdictedDirection(raw: string, verdicts: readonly Verdict[] = []): ProseScrub {
  const { kept, offending } = scanDirection(raw, verdicts)
  return {
    text: kept.join(' '),
    dropped: offending.length,
    droppedDigits: 0,
    droppedDirection: offending.length,
    flaggedDirection: 0,
    leaked: offending.length > 0,
  }
}

/**
 * The same scan, reporting instead of deleting — for a slot whose policy is
 * `digits`.
 *
 * Those slots keep the sentence, and before this nothing knew they had one:
 * the prompt banned direction words, no code enforced the ban, and no counter
 * recorded a breach, so "the prompt says so" was the whole of the rule. Now a
 * breach is a number in this call's `ai_call_log` response, which is what lets
 * the policy be flipped later on evidence rather than on taste.
 */
export function countUnverdictedDirection(raw: string, verdicts: readonly Verdict[] = []): number {
  return scanDirection(raw, verdicts).offending.length
}

/** One scan, two consequences. `offending` are the sentences that name a
 *  direction no verdict earned; `kept` is everything else, in order. */
function scanDirection(raw: string, verdicts: readonly Verdict[]): { kept: string[]; offending: string[] } {
  const earned = verdicts
    .filter((v) => v.direction != null)
    .map((v) => (v.objectLabel ?? '').trim().toLowerCase())
    .filter((label) => label.length >= 3)
  const kept: string[] = []
  const offending: string[] = []
  for (const sentence of splitSentences(raw ?? '')) {
    if (directionHits(sentence).length === 0) { kept.push(sentence); continue }
    const licensed = clausesOf(sentence).every((clause) => {
      if (directionHits(clause).length === 0) return true
      const lower = clause.toLowerCase()
      return earned.some((label) => lower.includes(label))
    })
    if (licensed) kept.push(sentence)
    else offending.push(sentence)
  }
  return { kept, offending }
}

/** A sentence's clauses, for the licence check only. Split on a semicolon and
 *  on the words that join two clauses — never on a bare comma, which brackets
 *  an apposition ("Durability, the theme buyers keep returning to, is growing")
 *  as often as it separates one. */
function clausesOf(sentence: string): string[] {
  return sentence
    .split(/;|\s+(?:and|but|while|whereas|though|although|yet)\s+/i)
    .map((c) => c.trim())
    .filter(Boolean)
}

// ---- The policy table -------------------------------------------------------

/**
 * Every place a model writes prose this product may show a reader.
 *
 * The list is the point: "extend the scrubber to every prose slot" is only
 * checkable if the slots are enumerated somewhere, and before this table they
 * were discoverable only by reading sixteen files. A new model call adds itself
 * here or it does not ship — `scrub.test.ts` asserts the table is total.
 *
 * WIRED means the table DRIVES the slot, not that it describes it: `scrubCover`,
 * the document writer's `scrubText` and `validateBrief` each read their own row
 * here rather than hard-wiring one of the two rules, so a policy change reaches
 * all of them.
 *
 * WIRED as of Phase 1 WP7: pass_c_finding, pass_d_a_insight,
 * pass_d_a_consumer_summary, pass_d_a_brief (through validateBrief),
 * pass_d_a_say_vs_hear, pass_d_b_recommendation, pass_e_persona,
 * step_2c_event_explanation, report_cover, document_write. `pass_b_theme` and
 * `agent_interpret` are `none` and need no wiring.
 *
 * NOT WIRED YET, and each for a stated reason: `pass_a_audience_insight` is
 * the slot this table was missing — Pass A writes `audience_insights.title`
 * and `.description`, which Competitive's CO5 puts in front of a client
 * verbatim, and nothing had ever named it here. It is `digits` because that is
 * what it should get, and it is unwired because Pass A runs once per video at
 * corpus scale with no figure table and no run allow-list in hand at the call
 * site; wiring it means carrying `allowTokens` into the per-video loop, which
 * is item 9's remaining half rather than a line. Until then the breach is
 * visible where it lands: a `data-copy="stored"` node naming this slot
 * (lib/test/copy-contract.ts) says out loud that these words were adjudicated
 * by nothing.
 *
 * `agent_answer` USED TO SAY IT WAS WAITING FOR WP21. WP21 has landed — Ask's
 * movement block is re-based on the monthly reading and
 * `DIRECTION_WORDS_BY_READER['agent.movement']` is the map's first `true`, so
 * this table is now the only thing that could hold the slot. It still does not,
 * and the reason is MEASURED rather than assumed. Replaying both rules over the
 * 101 stored agent strings (135 sentences) in production, 2026-09-16:
 *
 *  · the DIRECTION rule with an empty `verdicts[]` drops 11 of the 135 and
 *    empties 8 of the 101 strings outright — and all eleven are false positives
 *    of calibration class 2, a direction word about the SUBJECT rather than
 *    about a reading. The words that did it, with the phrase each landed in:
 *    `lower` ("a first or replacement LOWER-LIMB prosthesis" — this tenant's
 *    product category is a direction word), `falls` ("FALLS and balance
 *    challenges"), `stronger` ("the STRONGER signal is not that people are
 *    unaware"), `gains` ("measurable GAINS in comfort"), `improved` and
 *    `improving`, `drop` ("referral DROP-off analysis") and `new` ("the
 *    message is not that a product is NEW"). Ask answers in conversational
 *    analyst prose, where those are the thing itself, and no word list tells
 *    them from a claim about movement. None of the 101 carries a movement
 *    claim at all.
 *  · the DIGIT rule with an empty table drops exactly one sentence, and it is
 *    "openness to innovation through 3D printing" — a name, not a figure. The
 *    allow-list cannot rescue that one either: `3D` is shaped like `90k`, and
 *    `allowTokens` drops that shape by its ordinal rule.
 *
 * Wiring the slot today would therefore delete about one stored answer in
 * twelve to catch nothing — the trade this table already refused for a
 * recommendation. What it waits on is nameable rather than hand-waved: a figure
 * table Ask holds (its answers count things, and the movement block now hands
 * the model real month figures — "44 of 388 videos (11.3%)" — which a digit
 * rule with no table deletes as readily as an invented one), and a licence
 * check that can tell a noun from a reading. Until both exist, the guard on a
 * direction word in an Ask answer is the movement block itself: every line in
 * it carries a verdict decided in code, and a line that earned no direction
 * says so in words. That is weaker than a scrubber, and it is written down here
 * rather than shipped as though it were not.
 *
 * `ask_verdict`, `ask_judge` and `ask_extract_title` were pointed at WP21 too,
 * and WP21 did not touch them: they write over the CLIENT'S OWN DOCUMENT rather
 * than over the reading, and they wait on the same figure table. The three
 * interpretation slots wait for the packages that write them (WP8, WP18, WP20);
 * `composeInterpretation` runs their policy already.
 */
export const PROSE_SLOTS = [
  'pass_a_audience_insight',
  'pass_b_theme',
  'pass_c_finding',
  'pass_d_a_insight',
  'pass_d_a_consumer_summary',
  'pass_d_a_brief',
  'pass_d_a_say_vs_hear',
  'pass_d_b_recommendation',
  'pass_e_persona',
  'step_2c_event_explanation',
  'agent_answer',
  'agent_interpret',
  'ask_extract_title',
  'ask_verdict',
  'ask_judge',
  'report_cover',
  'document_write',
  'interpretation_monthly',
  'interpretation_quarterly',
  'interpretation_anomaly',
] as const

export type ProseSlot = (typeof PROSE_SLOTS)[number]

/** `none` — handles are stripped and nothing else. `digits` — the figure rule.
 *  `direction` — the direction rule. `both` — both. */
export type ProsePolicy = 'none' | 'digits' | 'direction' | 'both'

/**
 * Which rules each slot gets, and why.
 *
 * THE ONE `none`. A theme's label and its description are the model's own
 * words — §7 permits them explicitly — and they are where a direction word is
 * usually about the SUBJECT rather than the reading: "fans are frustrated by
 * errors that change momentum", "practical skills like growing food". 49 of
 * 8,192 stored descriptions and 13 of 8,192 labels carry one that way. A
 * scrubber on that slot destroys correct prose to prevent nothing, because a
 * theme label is never a claim about movement.
 *
 * THE THREE `both` THAT ARGUE. The monthly report's two sentences, the
 * quarterly review's page and the weekly report's anomaly explanation are the
 * only places the model may argue, and each carries the label
 * *interpretation*. They get both rules because they are the only slots handed
 * verdicts in the first place.
 *
 * EVERY OTHER `both`. The brief, the cover and the agent's answer are prose
 * about a reading, written without verdicts. The direction rule with an empty
 * `verdicts[]` deletes every directional sentence — which is exactly what the
 * prompts already ask for in words and have never enforced (the agent's
 * movement block is a sentence in a prompt). When a reader's direction words
 * are turned back on (DIRECTION_WORDS_BY_READER), its slot starts being handed
 * verdicts and the same rule lets the earned sentences through — WHERE THE SLOT
 * IS WIRED AT ALL. `agent_answer` is the first slot to reach the second half of
 * that sentence without the first: WP21 turned `agent.movement` on, and the
 * measurement above is why this policy row still drives nothing.
 *
 * WHY AN OWNED EVENT'S EXPLANATION IS ONLY `digits`. Step 2c is the one slot
 * where the direction is already code's: `detectAccountEvents` computes
 * `direction: 'up' | 'down'` and a severity from the account's own median and
 * renders them into the fact line the model is given ("TikTok followers moved
 * up 4.2% week-over-week"). The model repeating a direction code assigned is
 * the contract working, not a leak. The FIGURE in that line is the defect —
 * it is interpolated rather than tokenised — so the digit rule is what this
 * slot needs, and item 40's explainer is built on tokens from the start.
 */
export const PROSE_POLICY: Record<ProseSlot, ProsePolicy> = {
  pass_a_audience_insight: 'digits',
  pass_b_theme: 'none',
  pass_c_finding: 'digits',
  pass_d_a_insight: 'digits',
  pass_d_a_consumer_summary: 'digits',
  pass_d_a_brief: 'both',
  pass_d_a_say_vs_hear: 'digits',
  pass_d_b_recommendation: 'digits',
  pass_e_persona: 'digits',
  step_2c_event_explanation: 'digits',
  agent_answer: 'both',
  agent_interpret: 'none',
  ask_extract_title: 'digits',
  ask_verdict: 'digits',
  ask_judge: 'digits',
  report_cover: 'both',
  document_write: 'digits',
  interpretation_monthly: 'both',
  interpretation_quarterly: 'both',
  interpretation_anomaly: 'both',
}

/** The only three places the model may argue, each carrying the label. */
export const INTERPRETATION_SLOTS = [
  'interpretation_monthly',
  'interpretation_quarterly',
  'interpretation_anomaly',
] as const satisfies readonly ProseSlot[]

export const isInterpretation = (slot: ProseSlot): boolean =>
  (INTERPRETATION_SLOTS as readonly ProseSlot[]).includes(slot)

export interface ScrubProseInput {
  /** The figures this call was given by key. An empty table means the slot may
   *  name no figure at all, which is a policy, not an oversight. */
  figures?: FigureTable
  /** The verdicts this call was given. Empty licenses no direction word. */
  verdicts?: readonly Verdict[]
  /** The run's allow-list (allowTokens), carried. */
  allow?: readonly string[]
}

/**
 * Run a slot's policy over one string. The digit rule first: a sentence the
 * model invented a number in is gone whatever else it says, and running the
 * direction rule over it afterwards would double-count the drop.
 */
export function scrubProse(slot: ProseSlot, raw: string, input: ScrubProseInput = {}): ProseScrub {
  const policy = PROSE_POLICY[slot]
  // Under every policy, `none` included: the table defines `none` as "handles
  // are stripped and nothing else", and a caller reaching this function
  // directly used to get neither.
  const source = stripThemeRefs((raw ?? '').trim())
  if (!source) return EMPTY
  if (policy === 'none') return { ...EMPTY, text: source }
  let out: ProseScrub = { ...EMPTY, text: source }
  if (policy === 'digits' || policy === 'both') {
    out = merge(out, dropDigitSentences(out.text, input.figures ?? {}, { allow: input.allow }))
  }
  if (policy === 'direction' || policy === 'both') {
    out = merge(out, dropUnverdictedDirection(out.text, input.verdicts ?? []))
  } else {
    // `digits`. The direction rule does not run here, so the breach is counted
    // and the sentence kept — see `flaggedDirection`.
    out = { ...out, flaggedDirection: countUnverdictedDirection(out.text, input.verdicts ?? []) }
  }
  return out
}
