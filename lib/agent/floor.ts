import { fmtInt } from '../format'
import { readableQuote } from '../quotes'
import { readsAsOffer } from '../pages/overview-market/offers'

// Ask's evidence floor, and which quotes an answer may print (walkthrough
// item 4, 29 Sep).
//
// WHAT WAS WRONG. "What's people's perception of Sealand?" came back "perception
// is mixed… doubt that the product earns its price", with every finding under
// it measured at "0 of 360 videos" or "1 of 360 videos" and a footer offering
// "Open the 0 videos behind this". The page measured the findings honestly and
// then printed the model's conclusions over the measurement anyway. The
// persona stopped trusting Ask at that line.
//
// SO A FINDING NEEDS VIDEOS BEHIND IT TO BE SHOWN AS ONE. Its support is the
// level the page prints beside it (the finding's measured k, the "N of M
// videos") where it was measured, and the videos behind its cited evidence
// where it was not. Under the floor it is not printed, its quotes go with it,
// and the judgement that reasoned only from it goes too. Where nothing stands,
// the answer says plainly that there is too little to answer, in the product's
// words, never the model's.
//
// READ-TIME, SO IT HOLDS FOR EVERY ANSWER. New answers and the ones stored
// before this rule render through the same loader (lib/pages/agent-thread.ts),
// so an old thread reopened today reads by the same rule as one asked today.
//
// PURE.

/**
 * The fewest videos a finding needs behind it to be printed as a finding.
 * Five is a default (walkthrough, 29 Sep): the same floor a plan-check verdict
 * stands on (`PLAN_VERDICT_MIN_VIDEOS`). 1 only drops a finding nothing
 * stands behind (the "0 of 360" rows).
 */
export const ASK_FINDING_FLOOR = 5

/** What the answer says where nothing it found clears the floor. */
export const tooLittleToAnswer = (floor: number = ASK_FINDING_FLOOR): string =>
  floor <= 1
    ? 'There is too little in your market about this to answer it: nothing we found on it has a video behind it we can count.'
    : `There is too little in your market about this to answer it: nothing we found on it has ${fmtInt(floor)} or more videos behind it, which is the least we draw a conclusion from.`

/** What the answer says where only some of its points clear the floor. */
export const partlyAnswered = (kept: number, of: number, floor: number = ASK_FINDING_FLOOR): string =>
  `Only ${fmtInt(kept)} of the ${fmtInt(of)} points this answer made ${kept === 1 ? 'has' : 'have'} ` +
  `${floor <= 1 ? 'videos' : `${fmtInt(floor)} or more videos`} behind ${kept === 1 ? 'it' : 'them'}, ` +
  `so only ${kept === 1 ? 'that one is' : 'those are'} shown, and the rest are left out.`

/** How an answer fared against the floor. `whole`: every point stands (or it
 *  had none and was silent). `partial`: some do. `thin`: none does. */
export type FloorState = 'whole' | 'partial' | 'thin'

interface FloorPoint {
  id: string
  conversationCount: number
}

interface FloorAnswer<P extends FloorPoint> {
  answer: string
  grounded: P[]
  judgement: { text: string; basedOn: string[] }[]
  nearest: { conversationCount: number }[]
  silent: boolean
}

export interface Floored<A> {
  answer: A
  state: FloorState
  /** The ids of the points taken out. */
  dropped: string[]
  /** What the answer says in place of its lead, where the lead cannot stand:
   *  null on a whole answer. */
  lead: string | null
}

/**
 * One answer, held to the floor.
 *
 * `supportOf` names a point's support: the measured k the page prints beside
 * it, else the videos behind its evidence. The lead sentence is the model's
 * summary of EVERY point, so it stands only where every point does; otherwise
 * `lead` carries the product's sentence and the caller prints it instead.
 */
export function floorAnswer<P extends FloorPoint, A extends FloorAnswer<P>>(
  answer: A,
  supportOf: (p: P) => number,
  floor: number = ASK_FINDING_FLOOR,
): Floored<A> {
  // Silence is already the honest answer, and says so in its own words.
  if (answer.silent) return { answer, state: 'whole', dropped: [], lead: null }
  const kept = answer.grounded.filter((p) => supportOf(p) >= Math.max(1, floor))
  const keptIds = new Set(kept.map((p) => p.id))
  const dropped = answer.grounded.filter((p) => !keptIds.has(p.id)).map((p) => p.id)
  const nearest = answer.nearest.filter((n) => n.conversationCount >= Math.max(1, floor))
  if (dropped.length === 0 && kept.length > 0) {
    return { answer: { ...answer, nearest }, state: 'whole', dropped, lead: null }
  }
  if (kept.length === 0) {
    return {
      answer: { ...answer, answer: '', grounded: [], judgement: [], nearest },
      state: 'thin',
      dropped,
      lead: tooLittleToAnswer(floor),
    }
  }
  // Part of it stands: the judgement keeps what reasons from a point that
  // stands, with the refs to the points taken out removed.
  const judgement = answer.judgement
    .map((j) => ({ ...j, basedOn: j.basedOn.filter((ref) => keptIds.has(ref)) }))
    .filter((j) => j.basedOn.length > 0)
  return {
    answer: { ...answer, answer: '', grounded: kept, judgement, nearest },
    state: 'partial',
    dropped,
    lead: partlyAnswered(kept.length, answer.grounded.length, floor),
  }
}

/** What a stored answer carries that the floor reads, where no measurement is
 *  to hand (the Ask rail's month of answers, `notAnsweredFrom`). */
export interface StoredFloorAnswer {
  silent?: boolean
  grounded?: readonly { conversationCount?: number | null }[]
}

/**
 * Would this stored answer read "too little to answer"? The floor on the
 * videos behind each point's own evidence (`conversationCount`), which is
 * `floorAnswer`'s support wherever a point was not measured. A thread page
 * holds its own answers to the measured count it prints and says so to the
 * rail; this is for the month's other answers. A result that is silent, or
 * carries no list of points at all, is not called thin.
 */
export function storedAnswerThin(result: StoredFloorAnswer | null | undefined, floor: number = ASK_FINDING_FLOOR): boolean {
  if (!result || result.silent || !Array.isArray(result.grounded)) return false
  return !result.grounded.some((p) => (p?.conversationCount ?? 0) >= Math.max(1, floor))
}

/** What the loader knows about the video behind one quote. */
export interface AskQuoteVideo {
  /** `segments_for_videos`: 'maker', 'noise' or 'market'. Null where it was
   *  not read, which does not refuse a quote (the noise filter fails open). */
  segment: string | null
  /** The tracked rival the video is filed under, where it is one. */
  rival: string | null
}

/**
 * May Ask print this quote? (Walkthrough item 4, the quote rules the pages
 * take, kept small and local here: the shared picker is being built elsewhere.)
 *
 *   - readable: English, or carrying its English (`readableQuote`);
 *   - not a maker's video, and not one our searches found off-topic;
 *   - not someone selling (`readsAsOffer`, in its own words or its English);
 *   - the right brand: a quote from under a tracked rival's video only where
 *     the question named that rival. "I'm not spending $300 on a Patagonia
 *     shirt" is not what people think of Sealand.
 *
 * One quote per video is the caller's, across the whole thread.
 */
/** A rival's name as retrieval compares it (`scopeAdmits`, lib/agent/retrieve.ts):
 *  accents, case and edge spaces folded, so the rival the question named is
 *  the rival its quotes are filed under. */
const foldName = (s: string): string => s.normalize('NFD').replace(/\p{M}+/gu, '').trim().toLowerCase()

export function askQuoteOk(
  q: { text: string; lang?: string | null; english?: string | null },
  video: AskQuoteVideo | undefined,
  namedRivals: readonly string[] = [],
): boolean {
  if (!q.text || !readableQuote({ text: q.text, lang: q.lang ?? null, english: q.english ?? null })) return false
  if (readsAsOffer(q.text) || readsAsOffer(q.english)) return false
  if (video?.segment === 'maker' || video?.segment === 'noise') return false
  if (video?.rival) {
    const named = new Set(namedRivals.map(foldName))
    if (!named.has(foldName(video.rival))) return false
  }
  return true
}
