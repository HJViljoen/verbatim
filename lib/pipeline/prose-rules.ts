import { PROSE_POLICY, scrubProse, stripThemeRefs, type ProseSlot, type ScrubProseInput } from '../prose/scrub'
import { DIRECTION_PROMPT_EXAMPLES } from '../calibration'

// Shared prompt rule (Calibrated-Language doc 2026-07-04): magnitude words are
// assigned by code from measured data (lib/calibration.ts) — the model's prose
// must not free-style them. One string imported by Passes B/C/D so the wording
// never drifts between prompts.
//
// THE LIST IS `MAGNITUDE_WORDS`, and nothing else. It used to name "growing"
// and "increasingly" as intensity words; they are DIRECTIONS, they left
// MAGNITUDE_WORDS for DIRECTION_WORDS with the rest of the direction
// vocabulary, and a prompt that keeps banning them here bans them under a rule
// the code no longer runs. `noDirectionRule` below bans them, in every variant,
// as what they are. `prose-rules.test.ts` holds the two lists together.

export const CALIBRATED_PROSE_RULE =
  '- Your prose explains WHAT people express and WHY it matters — never HOW MUCH. ' +
  'Do not use intensity or frequency words: "very", "extremely", "significant", "overwhelming", ' +
  '"huge", "strong", "most", "many", "widespread", "frequent", "frequently", "consistently", "vast", "majority", ' +
  'or their synonyms. The product renders measured counts next to your text, so a magnitude claim in ' +
  'prose is a defect. Comparisons ("X more than Y") are allowed only where the input data directly shows them.\n' +
  '- Prose is client-facing. NEVER cite internal handles like [T4] or T12 inside titles, findings, or ' +
  'descriptions — name the topic in plain words instead. T# belongs ONLY in the structured supporting_themes field.'

/** The handle strip lives with the scrubbers now, because every policy in the
 *  table — `none` included — is defined as running it. Re-exported here for the
 *  passes that have always imported it from this file. */
export { stripThemeRefs }

/** What a slot is called inside its own prompt. Used only to say WHICH
 *  deliverable a rule is enforced on, when one prompt writes several. */
const DELIVERABLE: Partial<Record<ProseSlot, string>> = {
  pass_c_finding: 'a finding',
  pass_d_a_insight: 'a market insight',
  pass_d_a_consumer_summary: 'the consumer summary',
  pass_d_a_brief: 'the executive brief',
  pass_d_a_say_vs_hear: 'a say-vs-hear gap',
  pass_d_b_recommendation: 'a recommendation',
  pass_e_persona: 'a persona',
  step_2c_event_explanation: 'the explanation',
  report_cover: 'the cover',
  document_write: 'the document',
  agent_answer: 'an answer',
}

const nameOf = (slot: ProseSlot): string => DELIVERABLE[slot] ?? 'this prose'

const andList = (parts: string[]): string =>
  parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`

/**
 * The prompt rule that pairs with the direction scrubber (item 9) — written
 * for the slots THIS prompt writes, because the enforcement differs per slot.
 *
 * The magnitude half above has been in eleven prompts since July and four of
 * them enforce it. This half promised in its first draft that "a sentence that
 * names one without a verdict behind it is deleted before the reader sees it",
 * and was then added to four prompts — Pass C, Pass D-a, Pass D-b, Pass E —
 * of which only Pass D-a's executive brief runs the direction rule at all. The
 * other seven slots are `digits` in PROSE_POLICY and nothing deletes anything.
 * A sentence in a prompt that nothing enforces is the exact defect item 9
 * exists to end, and writing it into four more prompts would have been the
 * defect with a wider blast radius.
 *
 * So the sentence is generated from the policy: where the rule bites it says
 * so, where it does not it says what actually happens (the claim is a defect
 * and the run's counters log it), and a prompt writing several deliverables
 * names the ones the deletion reaches. Change a slot's policy and its prompt
 * changes with it.
 */
export function noDirectionRule(...slots: ProseSlot[]): string {
  const enforced = slots.filter((s) => PROSE_POLICY[s] === 'direction' || PROSE_POLICY[s] === 'both')
  const earned =
    'A direction takes three consecutive monthly readings to earn and is assigned by code'
  const consequence =
    enforced.length === 0
      ? `${earned}, which prints the word itself wherever it has earned one; a direction word in your prose is a claim the product cannot stand behind, and every one is counted against this prompt.`
      : enforced.length === slots.length
        ? `${earned}; a sentence that names one without a verdict behind it is deleted before the reader sees it.`
        : `${earned}; in ${andList(enforced.map(nameOf))} a sentence that names one without a verdict behind it is deleted before the reader sees it, and everywhere else it is counted against this prompt as a defect.`
  // The examples are GENERATED from the list the scrubber matches on, never
  // typed out beside it: the hand-typed sentence banned "picking up" while
  // DIRECTION_WORDS held only "picked up", so on a `both` slot the prompt
  // promised deletion for a phrase nothing deleted. A word can now only be
  // promised to a model if something deletes it.
  const examples = DIRECTION_PROMPT_EXAMPLES.map((w) => `"${w}"`).join(', ')
  return (
    `- You may NOT say which WAY anything is going. Not ${examples}, ` +
    'or any synonym — and not a comparison that implies one ("stronger than last time"). ' +
    `${consequence} Describe WHAT people say and why it matters, in the present tense.`
  )
}

/**
 * One slot's scrubber, holding its own counters.
 *
 * A pass makes one of these, runs every string it is about to store through
 * `run`, and puts `counts()` into its `logAiCall` response — the way Pass D-a
 * already logs `brief_leaked` / `brief_dropped`. Without the counters a prompt
 * that starts leaking is invisible until a reader finds a gap in a paragraph.
 */
export function slotScrubber(slot: ProseSlot, input: ScrubProseInput = {}) {
  let dropped = 0
  let droppedDigits = 0
  let droppedDirection = 0
  let flaggedDirection = 0
  let leaked = false
  return {
    run(raw: string | null | undefined): string {
      const out = scrubProse(slot, raw ?? '', input)
      dropped += out.dropped
      droppedDigits += out.droppedDigits
      droppedDirection += out.droppedDirection
      flaggedDirection += out.flaggedDirection
      leaked = leaked || out.leaked
      return out.text
    },
    /** The same, for a field that may legitimately be null. */
    runNullable(raw: string | null | undefined): string | null {
      if (raw == null) return null
      const text = this.run(raw)
      return text || null
    },
    counts: () => ({ prose_dropped: dropped, prose_dropped_digits: droppedDigits, prose_dropped_direction: droppedDirection, prose_direction_flagged: flaggedDirection, prose_leaked: leaked }),
  }
}
