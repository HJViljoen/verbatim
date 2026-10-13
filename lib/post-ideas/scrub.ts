import { scrubProse, splitSentences, stripThemeRefs, tidy } from '../prose/scrub'
import { capText, noDashes } from '../reports/documents/scrub'
import { BANNED_PHRASES } from '../written/scrub'
import { britishSpelling } from '../written/spelling'

// What the writer's words go through before a post idea is stored (depth v2,
// T13). Pure. Sentence by sentence, the unit every product rule drops:
//
//  1. the ids strip and `noDashes` (house style: a dash between clauses is a
//     comma); a title the writer wrapped in quotation marks loses them;
//  2. the `post_idea` policy (lib/prose/scrub.ts, `digits`): a sentence with a
//     digit the model typed drops (every figure on an idea is code's: the
//     sub-questions' counts, the multiples, the length), magnitude words are
//     stripped as words, and a direction word is COUNTED, not dropped, because
//     the list's words are this market's own nouns ("a liner that keeps
//     slipping", "lower limb", "drop foot");
//  3. NEVER A MEDICAL CLAIM (`MEDICAL_CLAIMS`): a sentence saying what a
//     product, a treatment or a habit does to the body (heals, prevents,
//     relieves, causes pain or an infection), that something is safe, that it
//     is clinically proven or recommended by doctors, a diagnosis, a medicine
//     or a dose, or a line sending the reader to a doctor, drops whole. The
//     Content page prints the "check with your medical team" line itself
//     (lib/post-ideas/medical.ts, T6); the writer never does. A QUESTION ASKS
//     RATHER THAN CLAIMS: a sentence ending in a question mark, or a clause
//     opened by a neutral question word ("what causes", "whether it is safe",
//     "how to"), is let through every rule but the medicine one; "how" and
//     "why" alone are not neutral ("how silicone prevents sores" presumes it
//     does) and let nothing through;
//  4. on the cover and the labels: the words that only ever claim the
//     conversation moved (`MOVEMENT`: "trending", "on the rise", "more and
//     more") drop their sentence, and so does the first person (the product
//     never says "we"); on the cover, a sentence about how the idea was made
//     (`BANNED_PHRASES`, the written read's backstop);
//  5. British spelling; a field cap. A title or a label over its cap is held
//     whole rather than cut (no question prints half asked); a cover is cut
//     at a sentence boundary.

export type IdeaField = 'title' | 'cover' | 'label'

/** The longest each field stores. The title's CHECK allows 200. */
export const IDEA_FIELD_MAX: Record<IdeaField, number> = { title: 160, cover: 320, label: 60 }

interface Rule {
  name: string
  re: RegExp
  /** A question, or a clause opened by a neutral question word, asks rather
   *  than claims, and passes this rule. */
  asks: boolean
}

/** What a body, a health problem or a recovery is, as the effect rule reads it. */
const HEALTH = String.raw`(?:pain|aches?|soreness|swelling|infections?|irritation|sores?|blisters?|ulcers?|rash(?:es)?|wounds?|inflammation|circulation|symptoms?|injur(?:y|ies)|conditions?|diseases?|nerve\s+(?:pain|damage)|phantom(?:\s+(?:limb\s+)?(?:pain|sensations?))?|skin\s+(?:breakdown|damage|problems?|issues?|conditions?)|arthritis|atrophy|falls|recovery|healing)`
const EFFECT_VERBS = String.raw`(?:prevent\w*|reliev\w*|reduc\w*|eliminat\w*|eas(?:e|es|ed|ing)|sooth\w*|stop(?:s|ped|ping)?|avoid\w*|revers\w*|treat(?:s|ed|ing)?|improv\w*|caus\w*|trigger\w*|worsen\w*|help(?:s|ed|ing)?(?:\s+with)?|fix(?:es|ed|ing)?|leads?\s+to|led\s+to|protects?\s+against)`

/**
 * A medical or clinical claim, by kind. Each entry is written to drop a
 * CLAIM and to step round the market's own words: "medical aid" (South
 * Africa's insurance) names no claim, "the signs it's worn out" is about a
 * liner, and "a powered knee" is a product.
 */
export const MEDICAL_CLAIMS: readonly Rule[] = [
  { name: 'cures', re: /\b(?:cure[sd]?|curing|heal(?:s|ed|ing)?|remed(?:y|ies|ied))\b/i, asks: true },
  { name: 'effect on the body', re: new RegExp(String.raw`\b${EFFECT_VERBS}\s+(?:\w+\s+){0,3}?${HEALTH}\b`, 'i'), asks: true },
  {
    name: 'safety',
    re: /\b(?:is|are|it'?s|they'?re|be|being|stays?|remains?|feels?)\s+(?:\w+\s+)?(?:safe|unsafe|harmless|dangerous|risk[- ]free)\b|\bsafe\s+(?:to|for|with)\b|\bno\s+(?:health\s+)?risks?\b|\bwithout\s+(?:any\s+)?risk\b/i,
    asks: true,
  },
  {
    name: 'proven or recommended',
    re: /\b(?:clinically|medically|scientifically)\s+(?:proven|tested|approved|validated|shown)\b|\bproven\s+to\b|\b(?:doctors?|physicians?|clinicians?|surgeons?|prosthetists?|physios?|physiotherapists?|experts?)\s+(?:recommend|agree|advise|approve)\w*\b|\bFDA\b|\bapproved\s+by\b|\bevidence[- ]based\b/i,
    asks: true,
  },
  {
    name: 'diagnosis',
    re: /\bdiagnos\w*|\bmeans\s+you\s+(?:have|need|should)\b|\b(?:is|are)\s+(?:usually\s+|often\s+|always\s+)?(?:a\s+)?(?:sure\s+|clear\s+|early\s+|warning\s+)?signs?\s+of\s+(?:an?\s+)?(?:infection|disease|condition|illness|injury|neuroma|ulcer|nerve\s+damage|blood\s+clot)/i,
    asks: true,
  },
  {
    name: 'medicine',
    re: /\b(?:medications?|medicines?|dosages?|doses|dosing|ibuprofen|paracetamol|acetaminophen|painkillers?|pain\s+(?:relievers?|killers?|medication)|antibiotics?|opioids?|steroids?|prescri(?:be|bed|bing|ption|ptions))\b/i,
    asks: false,
  },
  {
    name: 'sent to a doctor',
    re: /\bmedical\s+(?:advice|team|professional|guidance)\b|\b(?:see|ask|consult|check\s+with|talk\s+to|speak\s+to|speak\s+with)\s+(?:a|your)\s+(?:doctor|physician|gp|clinician|surgeon|prosthetist|medical\s+team|care\s+team|physio(?:therapist)?)\b/i,
    asks: true,
  },
]

/** The words that only ever claim the conversation moved. Kept narrow on
 *  purpose (see the header): "growing" and "rising" are not here, because a
 *  child grows out of a socket and a user rises from a chair. */
export const MOVEMENT = /\b(?:trend(?:s|ed|ing|y)?|momentum|on\s+the\s+rise|more\s+and\s+more|less\s+and\s+less|increasingly|surg(?:e|es|ed|ing)|soar(?:s|ed|ing)?|spik(?:e|es|ed|ing)|upticks?|downticks?|gone\s+quiet|(?:growing|rising|falling|declining)\s+(?:numbers?|shares?|interest|conversations?|talk|demand|concerns?|attention|volumes?|questions?)|(?:grew|rose|fell|dropped|jumped|doubled|tripled)\s+(?:this|last)\s+(?:week|month))\b/i

/** The first person: the product never says "we". */
const FIRST_PERSON = /\b(?:[Ww]e|[Oo]urs?|us)\b/

/** A clause opener that asks without presuming the answer. */
const NEUTRAL_ASK = /\b(?:what|whether|when|which|if|where|who|how\s+(?:to|do|does|did|can|could|should|would|long|often|much|many|soon|fast|far))\b/i

/** Does this match ask rather than claim? The sentence is a question, or the
 *  clause the match sits in opens on a neutral question word before it. */
function asks(sentence: string, at: number): boolean {
  if (/\?\s*$/.test(sentence.trim())) return true
  const clauses = sentence.slice(0, at).split(/[,;:]|\s(?:and|but|or)\s/i)
  return NEUTRAL_ASK.test(clauses[clauses.length - 1] ?? '')
}

/** The medical rules a sentence breaks, by name, in the order listed. */
export function medicalHits(sentence: string): string[] {
  const out: string[] = []
  for (const rule of MEDICAL_CLAIMS) {
    const m = rule.re.exec(sentence)
    if (!m) continue
    if (rule.asks && asks(sentence, m.index)) continue
    out.push(rule.name)
  }
  return out
}

export interface IdeaScrubCounts {
  /** Sentences dropped, whatever the reason. */
  dropped: number
  droppedDigits: number
  droppedMedical: number
  droppedMovement: number
  /** …on the cover: about how the idea was made (`BANNED_PHRASES`). */
  droppedBanned: number
  droppedFirstPerson: number
  /** A title or label held whole for running over its cap. */
  droppedLong: number
  /** Direction words KEPT (the `digits` policy), counted for `ai_call_log`. */
  flaggedDirection: number
  /** The medical rules that dropped a sentence, by name. */
  medical: string[]
  leaked: boolean
}

export const NO_SCRUB: IdeaScrubCounts = {
  dropped: 0, droppedDigits: 0, droppedMedical: 0, droppedMovement: 0, droppedBanned: 0, droppedFirstPerson: 0, droppedLong: 0, flaggedDirection: 0, medical: [], leaked: false,
}

export function addScrubCounts(a: IdeaScrubCounts, b: IdeaScrubCounts): IdeaScrubCounts {
  return {
    dropped: a.dropped + b.dropped,
    droppedDigits: a.droppedDigits + b.droppedDigits,
    droppedMedical: a.droppedMedical + b.droppedMedical,
    droppedMovement: a.droppedMovement + b.droppedMovement,
    droppedBanned: a.droppedBanned + b.droppedBanned,
    droppedFirstPerson: a.droppedFirstPerson + b.droppedFirstPerson,
    droppedLong: a.droppedLong + b.droppedLong,
    flaggedDirection: a.flaggedDirection + b.flaggedDirection,
    medical: [...a.medical, ...b.medical],
    leaked: a.leaked || b.leaked,
  }
}

/** Quotation marks wrapped round a whole field: a title is the market's
 *  question in plain words, never a quotation of one comment. */
const unwrap = (s: string): string => s.trim().replace(/^["“”'‘’]+\s*/, '').replace(/\s*["“”'‘’]+(?=[?.!]?$)/, '').trim()

/**
 * One field of one idea through every rule. `allow` is the run's digit-bearing
 * names (`allowTokens`: "C-Leg 4", "X5"). Pure.
 */
export function scrubIdeaText(raw: string, field: IdeaField, opts: { allow?: readonly string[] } = {}): { text: string; counts: IdeaScrubCounts } {
  const counts: IdeaScrubCounts = { ...NO_SCRUB, medical: [] }
  const source = unwrap(noDashes(stripThemeRefs(raw ?? '')))
  if (!source) return { text: '', counts }
  const prose = scrubProse('post_idea', source, { allow: opts.allow })
  counts.dropped += prose.dropped
  counts.droppedDigits += prose.droppedDigits
  counts.flaggedDirection += prose.flaggedDirection
  counts.leaked = prose.leaked
  const kept: string[] = []
  for (const sentence of splitSentences(prose.text)) {
    const medical = medicalHits(sentence)
    if (medical.length > 0) { counts.droppedMedical++; counts.medical.push(...medical); continue }
    if (field !== 'title' && MOVEMENT.test(sentence)) { counts.droppedMovement++; continue }
    if (field !== 'title' && FIRST_PERSON.test(sentence)) { counts.droppedFirstPerson++; continue }
    if (field === 'cover' && BANNED_PHRASES.some(({ re }) => re.test(sentence))) { counts.droppedBanned++; continue }
    kept.push(sentence)
  }
  const dropped = counts.droppedMedical + counts.droppedMovement + counts.droppedFirstPerson + counts.droppedBanned
  counts.dropped += dropped
  if (dropped > 0) counts.leaked = true
  let text = tidy(britishSpelling(kept.join(' ')))
  const max = IDEA_FIELD_MAX[field]
  if (text.length > max) {
    if (field === 'cover') text = capText(text, max)
    else { counts.droppedLong++; counts.dropped++; counts.leaked = true; text = '' }
  }
  return { text, counts }
}
