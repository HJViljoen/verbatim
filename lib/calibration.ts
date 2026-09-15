import { directionWordsFor } from './config'

// Calibrated language (Calibrated-Language doc 2026-07-04) — the companion to
// lib/curation.ts. Every "how much / how strong / how sure" word shown to a
// client is assigned HERE by rule from measured data, never chosen by the
// model: the model explains, code rates. Badges always carry their evidence
// ("Dominant · 21 of 36 Ossur conversations"), so the same word means the same
// thing on every page, every week. Thresholds are config, not hard-code —
// reviewed on live output alongside the curation gate (spec §10).

// ---- Ladder 1 · Prevalence — how much of the conversation is a theme? -------
// Measured against the theme's own entity group (client / competitor:X /
// industry-other): group sizes differ 5×, so a corpus-wide share would bury
// every client theme under industry noise. Denominator = the group's distinct
// insight-bearing conversations (union of the group's theme evidence).

export const PREVALENCE = {
  /** Dominant: ≥ this share of the group's conversations, and ≥ dominantMin. */
  dominantShare: 0.4,
  dominantMin: 10,
  /** Widespread: ≥ this share of the group's conversations, and ≥ widespreadMin. */
  widespreadShare: 0.15,
  widespreadMin: 5,
} as const

export type PrevalenceTier = 'dominant' | 'widespread' | 'recurring' | 'early_signal'

/** Classify a theme's reach: its distinct conversations vs its group's total. */
export function prevalenceTier(conversations: number, groupConversations: number): PrevalenceTier {
  if (conversations <= 1) return 'early_signal'
  const share = groupConversations > 0 ? conversations / groupConversations : 0
  if (conversations >= PREVALENCE.dominantMin && share >= PREVALENCE.dominantShare) return 'dominant'
  if (conversations >= PREVALENCE.widespreadMin && share >= PREVALENCE.widespreadShare) return 'widespread'
  return 'recurring'
}

export const PREVALENCE_LABEL: Record<PrevalenceTier, string> = {
  dominant: 'Dominant',
  widespread: 'Widespread',
  recurring: 'Recurring',
  early_signal: 'Early signal',
}

// ---- Ladder 2 · Sentiment — measured shares of rated conversations ----------
// Polarized is checked first: strong-both-ways data must never read "balanced".

export const SENTIMENT_LADDER = {
  /** Strongly positive/negative: leading share ≥ strong, opposing ≤ strongOther. */
  strong: 70,
  strongOther: 10,
  /** Leaning: one side leads the other by ≥ this many points. */
  lean: 15,
  /** Polarized: BOTH sides at ≥ this share. */
  polarized: 30,
} as const

export type SentimentTier =
  | 'strongly_positive' | 'leaning_positive' | 'balanced'
  | 'polarized' | 'leaning_negative' | 'strongly_negative'

/** Classify a measured sentiment split (percentages of rated conversations). */
export function sentimentTier(posPct: number, negPct: number): SentimentTier {
  const L = SENTIMENT_LADDER
  if (posPct >= L.polarized && negPct >= L.polarized) return 'polarized'
  if (posPct >= L.strong && negPct <= L.strongOther) return 'strongly_positive'
  if (negPct >= L.strong && posPct <= L.strongOther) return 'strongly_negative'
  if (posPct - negPct >= L.lean) return 'leaning_positive'
  if (negPct - posPct >= L.lean) return 'leaning_negative'
  return 'balanced'
}

export const SENTIMENT_TIER_LABEL: Record<SentimentTier, string> = {
  strongly_positive: 'Strongly positive',
  leaning_positive: 'Leaning positive',
  balanced: 'Balanced',
  polarized: 'Polarized',
  leaning_negative: 'Leaning negative',
  strongly_negative: 'Strongly negative',
}

/** Per-tier rule, reader-facing — chip tooltips on the dashboard sentiment card. */
export const SENTIMENT_TIER_RULE: Record<SentimentTier, string> = {
  strongly_positive: 'At least 70% of rated conversations positive, no more than 10% negative.',
  leaning_positive: 'Positive leads negative by at least 15 points.',
  balanced: 'Neither positive nor negative leads by 15 points.',
  polarized: 'Both positive and negative above 30% — strong feelings both ways.',
  leaning_negative: 'Negative leads positive by at least 15 points.',
  strongly_negative: 'At least 70% of rated conversations negative, no more than 10% positive.',
}

// ---- Glossary — single source for chip tooltips + the page legend -----------
// One reader-facing rule per calibrated term. Chips set it as their title
// (hover explains the word where the confusion happens); the how-to-read
// floating card renders the same lines, so tooltip and legend can never drift.

/**
 * "21 of 36 conversations" — the shape this module's own header has promised
 * since it was written ("Badges always carry their evidence") without ever
 * exporting a formatter for it. Four surfaces hand-rolled the string and the
 * rest simply printed a bare count, so a reader could not tell whether "heard
 * in 3 conversations" was 3 of 4 or 3 of 400 (Tier 1, 2026-08-18).
 *
 * Returns just the count when there is no denominator worth stating, rather
 * than inventing one.
 */
export function evidenceOf(count: number, denom: number | null | undefined, noun = 'conversations'): string {
  const n = Math.max(0, Math.round(count))
  if (denom == null || denom <= 0 || denom < n) return `${n.toLocaleString('en-US')} ${noun}`
  return `${n.toLocaleString('en-US')} of ${denom.toLocaleString('en-US')} ${noun}`
}

export const GLOSSARY = {
  // ---- The thirteen words (design §0, "the thirteen words a reader needs") --
  // update · month · week · video · audience · subject · theme · kind · rival ·
  // move · level · change · direction, with the flags `new` and `gone quiet`.
  // No reading surface prints a term outside this list — the four platform
  // names and the reading date excepted, because those are proper nouns and a
  // date. Everything below them is legacy: each entry belongs to a page Phase 1
  // retires or rewrites, and it goes when that page does (THIRTEEN_WORDS is the
  // list a new surface may draw from; see the note on it).
  update: ['Update', 'one delivery — a gather, an analysis, and everything written from it. Updates are counted and dated in the record; an update is never a period, and no figure on a reading page is indexed by one'],
  month: ['Month', 'the calendar month a comment was WRITTEN in — the one clock this product keeps. A month is re-read by every update until 30 days after it ends, marked "still filling" until then, and frozen after'],
  week: ['Week', 'seven days inside a month. Printed only on the weekly report and This week, always beside the month it is stated against, never on its own'],
  video: ['Video', 'one video and the comments written under it that month — the unit every share is a share of. A video posted in June and still drawing comment in September belongs to both months. Comments are counted separately, as comments'],
  audience: ['Audience', 'whose videos a figure is about: yours, one named rival’s, or the rest of the category. Every figure states which, and no two are pooled silently'],
  subject: ['Subject', 'something you told us you care about, in your own words, dated and logged — counted by exactly the rule a theme is'],
  theme: ['Theme', 'something the category kept saying, grouped and named from what was read. The grouping is ours and it can change; when it does, the line says so'],
  kind: ['Kind', 'what a comment was doing — a question, an objection, praise. One comment is one kind, and the kinds do not sum to the conversation'],
  rival: ['Rival', 'a brand you named in Settings. A rival that leaves the tracked set terminates its line with a break, never falling to zero, and a renamed rival is one line with the rename marked on it'],
  move: ['Move', 'something you did — a launch, a campaign, a message you pushed — dated by you and read against the audiences you did not touch. Your statement, not ours; we only report what the conversation did after it'],
  level: ['Level', 'what a figure is running at, always printed with its denominator: "3 of the 28 videos in your audience"'],
  change: ['Change', 'the difference between two levels, banded with each side’s video count as n. Inside the band it reads "no clear change"; under 100 videos a side, or 10 of the object’s own, "too few to compare"'],
  direction: ['Growing · fading · flat', 'a direction word, earned only by three consecutive monthly readings under one grouping and assigned in code, never by the model. One comparison can say a thing moved; it can never say which way it is going'],
  gone_quiet: ['Gone quiet', 'heard in earlier months and not in this one — a flag, not a direction, and computed only over updates that actually produced themes'],
  // `new` — the other flag — is the entry below. Its wording is still the
  // run-indexed one ("not present in your previous update") because that is
  // what the pages printing it today actually compute; it re-bases on the
  // monthly series with the page that prints it, and the code that already
  // reads the months calls the flag by the same name (VerdictFlag 'new').
  // ---- Legacy · each retires with the page that prints it -------------------
  // The LEGACY unit, and deliberately not the month-scoped one. Every figure
  // this tooltip sits behind — dominant, widespread, a theme's share, the
  // dashboard's video total — is computed per RUN over the cumulative corpus,
  // not per month. The month-scoped definition is correct for the monthly
  // reading and belongs to `video` above; printing it here would put a
  // month-scoped sentence under a figure that is not month-scoped, which is
  // the copy-matches-code rule broken in the helpful direction. It retires
  // with the pages that print it.
  conversations: ['Conversations', 'one video and the comments it sparked — the unit behind every "heard in…" and share figure; comments are always counted separately as comments'],
  dominant: ['Dominant', "at least 40% of the group's analysed conversations (minimum 10)"],
  widespread: ['Widespread', "at least 15% of the group's analysed conversations (minimum 5)"],
  recurring: ['Recurring', 'heard in more than one conversation, below Widespread'],
  early_signal: ['Early signal', 'heard in a single conversation so far but scored strong — worth watching, not yet confirmed'],
  strong_evidence: ['Strong evidence', 'high-confidence finding backed by two or more sources'],
  act_now: ['Act now', 'the single top-ranked action this update — never more than one'],
  plan_next: ['Plan next', 'ranked second or third this update'],
  worth_considering: ['Worth considering', 'ranked below the top three this update'],
  new: ['New', 'this theme was not present in your previous update'],
  sentiment: ['Strongly positive → Strongly negative', 'fixed cutoffs on the measured share of rated conversations; Polarized = both sides above 30%'],
  say_vs_hear: ['Say vs hear', "what your own videos claim (from their transcripts), set against what the tracked conversation actually says — 'not talked about yet' means the audience doesn't engage with the claim, not that it's wrong"],
  news: ['In the news', 'published coverage matched to your tracked names by headline — shown as context beside the conversation, never claimed as the cause of anything measured'],
  initiative: ['Initiative', 'something you told us you are trying to move, and the themes it is measured on — your statement, not ours; we only report whether the conversation followed'],
  // Two entries, one constant (D1): while the run-indexed direction words are
  // gated the tile prints a theme's share and how long it has been tracked and
  // no movement at all, so the promise of "holding steady" would be a rule the
  // code can no longer keep. Phase 1 flips the constant and the sentence back.
  moving: directionWordsFor('initiatives')
    ? ['Moving / not moving', 'the change in a theme’s share of the conversation since the day you started tracking it, in share points; under a point either way reads "holding steady", and two updates are the least that can say anything']
    : ['What it is running at', 'a theme’s share of the conversation this update, and how long you have been tracking it; the share of one update is a level, not a direction, and we do not read a change from it yet'],
  on_camera: ['Said on camera', 'the creator spoke it in their own video rather than typing it in a comment — filming an opinion costs time and reputation, so those conversations weigh more than a comment when a theme is ranked'],
  about_you: ['About you', "what other people's videos say about your brand, quoted verbatim from their transcripts and shown only when they name you — their words, never yours, and never counted as your audience"],
  search_terms: ['Search terms', 'the words we look for on every platform, in three groups — your brand, your competitors, your category. Changing them changes what the next update finds, and nothing before it'],
  term_value: ['Worth reviewing', 'across three or more updates — pooled, or on one platform on its own — this term found at least 100 posts, kept under 5% of them, and has led to no insight yet. A suggestion to look, never a change we make for you'],
} as const

export type GlossaryKey = keyof typeof GLOSSARY

/** Tooltip text for a glossary term. */
export const glossaryRule = (key: GlossaryKey): string => GLOSSARY[key][1]

/**
 * The thirteen words, in the design's own order, plus the two flags.
 *
 * A reading surface built from Phase 1 on draws its vocabulary from HERE and
 * prints no term outside it. The rest of GLOSSARY is legacy — `dominant`,
 * `early_signal`, `say_vs_hear`, `moving`, `about_you` and the others each
 * belong to a page that Phase 1 retires or rewrites, and deleting an entry
 * while the word is still on the screen that prints it would leave the word
 * unexplained, which is worse than a long glossary. They go with their pages.
 */
export const THIRTEEN_WORDS = [
  'update', 'month', 'week', 'video', 'audience', 'subject', 'theme', 'kind',
  'rival', 'move', 'level', 'change', 'direction',
] as const satisfies readonly GlossaryKey[]

/** The two flags that sit beside the thirteen. A flag is not a direction: it
 *  says an object was or was not there, never which way it is going. */
export const READER_FLAGS = ['new', 'gone_quiet'] as const satisfies readonly GlossaryKey[]

// ---- The direction vocabulary — the scrubber's match list ------------------
// One list, three users, so they cannot drift (design item 9): the code that
// PRINTS a direction word, the prompt rule that BANS one, and the scrubber
// that ENFORCES the ban (lib/prose/scrub.ts).
//
// NOT `MAGNITUDE_WORDS` (lib/prose/scrub.ts), which is about how MUCH; this
// one is about which WAY. `growing` and `increasing` are the only two members
// of both. And NOT `DIRECTION_WORDS_BY_READER` (lib/config.ts), which is the
// per-reader gate on whether a direction may be printed at all.
//
// CALIBRATION. Measured on production prose, three classes of false positive
// decide the shape of this list and of `directionHits`:
//
//  1. `up` / `down` as verb particles. A 24-word regex over the 51 stored
//     executive-brief beats returns two hits and BOTH are particles — "unless
//     Össur shows up with clearer education", "happening outside Össur unless
//     it shows up earlier". A bare `up` in the list deletes correct prose, so
//     `up` and `down` count only in a movement frame: after a movement verb
//     ("moved up", "is down"), before `from`/`on`/`against`/`by`/`since`, or
//     in front of a points noun ("up 4 points").
//  2. A direction word describing the SUBJECT rather than a measurement —
//     "fielding errors that change momentum", "practical skills like growing
//     food" (49 of 8,192 theme descriptions, 13 of 8,192 theme labels). No
//     word list can tell those apart from a movement claim, so they are held
//     off by the POLICY TABLE instead: a theme's label and description are the
//     model's own words and are never direction-scrubbed.
//  3. Foreign-language homographs. The magnitude strip already deletes `vast`
//     from inside the Dutch "dat staat vast" because it is a word-delete with
//     no idea where a quote starts. This list is only ever used for a SENTENCE
//     DROP, never a word delete, and `directionHits` ignores quoted spans:
//     inside quotation marks the words are the speaker's, not a claim of ours.
export const DIRECTION_WORDS = [
  // The product's own three, and the flags.
  'growing', 'grew', 'grows', 'growth',
  'fading', 'faded', 'fades',
  'flat', 'flattened',
  'new', 'gone quiet',
  // The words a model reaches for instead.
  'rising', 'rise', 'risen', 'rose',
  'declining', 'decline', 'declined', 'declines',
  'falling', 'fell', 'fallen',
  'climbing', 'climbed',
  'gaining', 'gained', 'gains',
  'losing ground', 'lost ground',
  'momentum',
  'steady', 'steadily', 'holding steady',
  'trending', 'trended',
  'accelerating', 'accelerated',
  'slowing', 'slowed',
  'shrinking', 'shrank', 'shrunk',
  'increasing', 'increased', 'increase',
  'decreasing', 'decreased', 'decrease',
  'more and more', 'less and less',
  'upward', 'downward', 'uptick', 'downtick',
  'surging', 'surged', 'surge',
  'picked up', 'tapered off',
  // Particle-shaped, matched only in a movement frame (class 1 above).
  'up', 'down',
] as const

/** The three that need a frame around them before they are a claim. `up` and
 *  `down` are verb particles far more often than measurements (class 1), and
 *  `new` is an ordinary adjective — "the new socket", "new to the category" —
 *  far more often than it is the flag. Each is counted only in the frame that
 *  makes it one. */
const FRAMED = new Set(['up', 'down', 'new'])

/** Verbs after which `up` / `down` is a measurement, not a particle. */
const MOVEMENT_VERBS =
  'moved|moves|move|moving|went|goes|go|going|ticked|ticks|edged|edges|nudged|nudges|' +
  'is|was|are|were|be|been|sits|sat|held|holding|trending|trended|came|comes|tracking|tracked'

/** Nouns after which `up` / `down` is a measurement ("up 4 points"). */
const POINT_NOUNS = 'points?|pts?|percent|%'

const escape = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Word-boundary matcher for one entry; multi-word entries match as a phrase. */
const wordRe = (word: string): RegExp => new RegExp(`\\b${escape(word).replace(/\s+/g, '\\s+')}\\b`, 'gi')

/**
 * Spans a reader would read as somebody else's words: anything between a pair
 * of quotation marks, straight or curly. A direction word inside one is being
 * QUOTED, not claimed, and nothing this product does to its own prose may
 * reach inside a quotation (§6.2: the magnitude strip does, and mutilates
 * Dutch and German text every time it runs).
 *
 * THE STRAIGHT SINGLE QUOTE IS THE DANGEROUS ONE, and it is the only mark here
 * that has a second job in ordinary English. "The theme's share is growing, and
 * it's clear buyers care." brackets a span between a POSSESSIVE and a
 * CONTRACTION; read as a quotation it hides `growing` from `directionHits` and
 * the magnitude words from `replaceOutsideQuotes`, and the sentence ships with
 * `leaked: false` so nothing reaches ai_call_log either — a scrubber that
 * cannot see a leak reports a clean run. 20 of 732 stored recommendation,
 * finding and market-insight strings carry such a false span today. So a pair
 * of straight single quotes counts as a quotation only when neither mark sits
 * against a letter or a digit; an apostrophe always does. A real quotation
 * (‘…’, or 'dat staat vast' between spaces) is unaffected.
 */
export function quotedSpans(text: string): [number, number][] {
  const found: [number, number][] = []
  for (const m of text.matchAll(/"[^"]*"|“[^”]*”|‘[^’]{2,}’/g)) {
    const start = m.index ?? 0
    found.push([start, start + m[0].length])
  }
  for (const m of text.matchAll(/(^|[^\p{L}\p{N}'’])('[^']{2,}')(?=$|[^\p{L}\p{N}'’])/gu)) {
    const start = (m.index ?? 0) + m[1].length
    found.push([start, start + m[2].length])
  }
  // `replaceOutsideQuotes` walks these in order and assumes they do not
  // overlap; two passes can nest ("he said 'yes' to it"), so merge.
  found.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const spans: [number, number][] = []
  for (const [start, end] of found) {
    const last = spans[spans.length - 1]
    if (last && start < last[1]) {
      if (end > last[1]) last[1] = end
      continue
    }
    spans.push([start, end])
  }
  return spans
}

/**
 * Every direction word this text claims, lower-cased, in the order found and
 * without repeats. Empty means the sentence makes no directional claim.
 *
 * Quoted spans are skipped, and `up` / `down` count only inside a movement
 * frame. This is the whole detection half of the direction-word rule; the
 * decision of what to DO about a hit belongs to the scrubber, which needs the
 * verdicts to know whether the claim was earned.
 */
export function directionHits(text: string): string[] {
  const source = text ?? ''
  if (!source) return []
  const spans = quotedSpans(source)
  const quoted = (index: number): boolean => spans.some(([a, b]) => index >= a && index < b)
  const found: string[] = []
  for (const word of DIRECTION_WORDS) {
    const re = wordRe(word)
    for (const m of source.matchAll(re)) {
      const at = m.index ?? 0
      if (quoted(at)) continue
      if (FRAMED.has(word) && !inClaimFrame(word, source, at, m[0].length)) continue
      if (!found.includes(word)) found.push(word)
      break
    }
  }
  return found
}

/** Is this occurrence a claim about movement or presence, or just English? */
function inClaimFrame(word: string, text: string, at: number, length: number): boolean {
  const before = text.slice(Math.max(0, at - 40), at)
  const after = text.slice(at + length, at + length + 40)
  if (word === 'new') {
    // The flag, not the adjective: "new this month", "is new", "newly heard".
    if (/\b(is|are|was|were|reads?|counts? as|flagged)\s+$/i.test(before)) return true
    if (/^\s+(this|last)\s+(month|week|update|quarter)\b/i.test(after)) return true
    if (/^\s+(to|in)\s+(the\s+)?(reading|months?|series|record)\b/i.test(after)) return true
    return false
  }
  if (new RegExp(`\\b(${MOVEMENT_VERBS})\\s+$`, 'i').test(before)) return true
  if (/^\s+(from|on|against|by|since|versus|vs\.?)\b/i.test(after)) return true
  if (new RegExp(`^\\s+[\\w.,]*\\s*(${POINT_NOUNS})\\b`, 'i').test(after)) return true
  return false
}

// ---- Ladder 4 · Priority — positional, forced scarcity ----------------------
// The model ranks (relative judgment is reliable); code assigns the words
// (absolute judgment inflates — the 3 Jul run rated 4 of 4 recs "high").
// Position in the client-facing order decides: #1 = Act now, #2–3 = Plan next.
// Pass D-b's stored priority carries the same positions (high/medium/low by
// output rank), so DB values and display order agree from the next run on.

export function priorityWord(rank: number): string {
  if (rank === 0) return 'Act now'
  if (rank <= 2) return 'Plan next'
  return 'Worth considering'
}

/** DB priority value for a D-b output position — rank 0 → high, 1–2 → medium. */
export function priorityForRank(rank: number): 'high' | 'medium' | 'low' {
  if (rank === 0) return 'high'
  if (rank <= 2) return 'medium'
  return 'low'
}

// ---- Share tile · what you published vs what was tracked -------------------
// The share ring counts everything tracked for a brand: videos other accounts
// posted about it AND the brand's own posts, on the same rule for the client
// and every competitor (2026-09-10). The footnote keeps the two facts apart
// anyway, because a reader who published nothing and a reader who published
// daily read the same ring very differently: the exact own-post census
// (run_summary.owned_census) says what YOU published, the share count says how
// much was tracked in total.

/** The share tile's opening clause. `ownedPosts` null = an update written
 *  before the census existed; the old wording stands rather than a guess. */
export function shareFootnoteLead(ownedPosts: number | null, clientVideos: number | null): string {
  const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`
  if (ownedPosts == null) {
    return clientVideos ? `${clientVideos.toLocaleString('en-US')} of your videos` : 'none of your videos'
  }
  const tracked = clientVideos ?? 0
  return `You published ${plural(ownedPosts, 'post')} this update · ${plural(tracked, 'video')} by and about you ${tracked === 1 ? 'was' : 'were'} tracked`
}

// ---- Ladder 5 · The recommendation lifecycle -------------------------------
// The one ladder the CLIENT sets, not code: whether they have done anything
// about a recommendation. The DB vocabulary is older than the UI (the column
// and its tenant grant date from 2026-08-18 and were never written), so the
// stored words stay and the display words are assigned here — `acted_on`
// reads "Done", `in_progress` reads "Working on it".

export const REC_STATUSES = ['new', 'acknowledged', 'in_progress', 'acted_on', 'dismissed'] as const
export type RecStatus = (typeof REC_STATUSES)[number]

export const REC_STATUS_LABEL: Record<RecStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  in_progress: 'Working on it',
  acted_on: 'Done',
  dismissed: 'Dismissed',
}

/** A stored status, or 'new' for a row written before the lifecycle had a UI
 *  (status has a DB default but is nullable). */
export const recStatus = (value: string | null | undefined): RecStatus =>
  (REC_STATUSES as readonly string[]).includes(value ?? '') ? (value as RecStatus) : 'new'
