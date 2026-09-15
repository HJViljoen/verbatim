import { scrubProse, type ProseSlot, type ScrubProseInput } from '../prose/scrub'

// Shared prompt rule (Calibrated-Language doc 2026-07-04): magnitude words are
// assigned by code from measured data (lib/calibration.ts) — the model's prose
// must not free-style them. One string imported by Passes B/C/D so the wording
// never drifts between prompts.

export const CALIBRATED_PROSE_RULE =
  '- Your prose explains WHAT people express and WHY it matters — never HOW MUCH. ' +
  'Do not use intensity or frequency words: "very", "extremely", "significant", "overwhelming", ' +
  '"huge", "strong", "most", "many", "widespread", "frequent", "consistently", "growing", "increasingly", ' +
  'or their synonyms. The product renders measured counts next to your text, so a magnitude claim in ' +
  'prose is a defect. Comparisons ("X more than Y") are allowed only where the input data directly shows them.\n' +
  '- Prose is client-facing. NEVER cite internal handles like [T4] or T12 inside titles, findings, or ' +
  'descriptions — name the topic in plain words instead. T# belongs ONLY in the structured supporting_themes field.'

/** Defensive strip for internal handles that leak into client-facing prose
 *  despite the prompt rule (seen live: Pass C findings citing "[T18]",
 *  2026-07-09). Covers T# (themes), C# (competitive insights), and S# (client
 *  claims, Step 2b) — the same leak class for every bracket-labelled input.
 *  Removes bracketed refs and tidies the whitespace/punctuation left behind. */
export function stripThemeRefs(text: string): string {
  return text
    .replace(/\s*\[[TSC]\d+\](\[[TSC]\d+\])*/g, '')
    .replace(/\s*\([TSC]\d+(,\s*[TSC]\d+)*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim()
}

/**
 * The prompt rule that pairs with the direction scrubber (item 9).
 *
 * The magnitude half above has been in eleven prompts since July and four of
 * them enforce it. This half is enforced everywhere its slot's policy asks for
 * it (lib/prose/scrub.ts), so the sentence in the prompt and the rule in the
 * code are the same rule — and a model that ignores it loses the sentence
 * rather than shipping a claim the product cannot stand behind.
 */
export const NO_DIRECTION_RULE =
  '- You may NOT say which WAY anything is going. Not "growing", "fading", "rising", "declining", ' +
  '"gaining", "losing ground", "momentum", "steady", "trending", "picking up", "up", "down", ' +
  '"more and more", or any synonym — and not a comparison that implies one ("stronger than last time"). ' +
  'A direction takes three consecutive monthly readings to earn and is assigned by code; a sentence ' +
  'that names one without a verdict behind it is deleted before the reader sees it. Describe WHAT ' +
  'people say and why it matters, in the present tense.'

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
  let leaked = false
  return {
    run(raw: string | null | undefined): string {
      const out = scrubProse(slot, stripThemeRefs(raw ?? ''), input)
      dropped += out.dropped
      droppedDigits += out.droppedDigits
      droppedDirection += out.droppedDirection
      leaked = leaked || out.leaked
      return out.text
    },
    /** The same, for a field that may legitimately be null. */
    runNullable(raw: string | null | undefined): string | null {
      if (raw == null) return null
      const text = this.run(raw)
      return text || null
    },
    counts: () => ({ prose_dropped: dropped, prose_dropped_digits: droppedDigits, prose_dropped_direction: droppedDirection, prose_leaked: leaked }),
  }
}
