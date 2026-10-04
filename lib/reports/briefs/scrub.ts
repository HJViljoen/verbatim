import { ADVICE, scrubWeekText, toldWhatToDo, type WeekScrubCounts } from '../../written/scrub'

// What the brief writer's words go through (pure). The week read's scrub
// (lib/written/scrub.ts `scrubWeekText`: ids, dashes, §0a's BANNED_PHRASES and
// the first person, the `week_read` policy with no verdicts so a digit or a
// direction word drops its sentence, British spelling, a cap) with three
// lists of the brief's own as extra sentence rules:
//
//  · TIME_COMPARISON (point 4 of the rebuild). There is no month-on-month
//    basis yet, so a sentence that claims a change drops whole. The long-run
//    read's `CHANGE` list (narrowed, below), plus the forms the 30 Sep Leadership draft printed
//    and nothing caught: "Compared with earlier asks …, demand now reads as
//    more validation and use-case driven" and "Demand is settling around a
//    higher bar";
//  · BRIEF_PROCESS (§0a.1, §0a.3): the drafts' own breaks the week read's list
//    does not hold: "first brief", "strands of the research", confidence and
//    basis notes, "not settled", method words, "thin" said of evidence;
//  · ADVICE, the week read's, plus the company told what to do, on the fields
//    that interpret (what it means, in practice, the summary, risks and
//    questions for the business), never on what people said, where "a bag
//    should last years" is the market talking.
//
// Each entry names the false positive it steps round, as BANNED_PHRASES does.

export const TIME_COMPARISON: readonly { name: string; re: RegExp }[] = [
  // The long-run read's list (lib/written/longrun.ts `CHANGE`), less three
  // forms a buyer uses about their OWN bag ("when the old one no longer fits
  // the commute", "the bag they used to carry", "it would not close any
  // more"), which a brief's sections describe and which claim nothing about
  // the market. Those three are caught below only with the market as subject.
  { name: 'change over time', re: /\b(?:increasingly|more\s+and\s+more|less\s+and\s+less|these\s+days|lately|recently|over\s+time|over\s+the\s+months|month\s+(?:after|on|by)\s+month|compared\s+(?:with|to)\s+(?:earlier|before|last|the\s+previous)|than\s+(?:before|earlier|last\s+month))\b/i },
  { name: 'since a month', re: /\bsince\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|last\s+month|the\s+start)\b/i },
  { name: 'became', re: /\b(?:shift(?:s|ed|ing)?\s+(?:to|toward|towards|from|away)|settl(?:es|ed|ing)\s+(?:on|into|around)|is\s+becoming|are\s+becoming|became|has\s+become|have\s+become|emerg(?:es|ed|ing)|starting\s+to|beginning\s+to)\b/i },
  { name: 'no longer', re: /\b(?:buyers|people|shoppers|owners|users|customers|the\s+market|demand|interest|talk)\s+(?:no\s+longer|used\s+to)\b|\b(?:is|are)\s+no\s+longer\s+(?:the|a|an|what)\b/i },
  // "demand now reads as more validation driven". Not "ready to buy now".
  { name: 'now reads as', re: /\bnow\s+(?:reads?|reading|looks?|seems?|sits?|feels?|appears?|comes?\s+across)\b|\b(?:is|are|was|were)\s+now\b/i },
  // "demand is settling around a higher bar". Not "which of those they treat
  // as settled".
  { name: 'settling', re: /\bsettl(?:es|ed|ing)\s+(?:down|in)\b|\bis\s+settling\b|\bare\s+settling\b/i },
  // "compared with earlier asks", "than in earlier months", "the past few months".
  { name: 'earlier', re: /\b(?:earlier|previous|prior|past)\s+(?:asks?|months?|weeks?|periods?|years?|briefs?|reads?|seasons?)\b|\bthan\s+(?:it|they)\s+(?:used\s+to|once|did)\b|\b(?:last|previous)\s+month\b|\bmore\s+than\s+(?:ever|before)\b|\ba\s+(?:shift|change|move)\s+(?:in|from|to|toward|towards|away)\b/i },
  // "for the first time", "first heard": the product's record decides what is
  // new, and a brief does not say it.
  { name: 'first time', re: /\bfor\s+the\s+first\s+time\b|\bfirst\s+(?:heard|seen|appeared|time)\b/i },
]

export const BRIEF_PROCESS: readonly { name: string; re: RegExp }[] = [
  { name: 'first brief', re: /\bfirst\s+(?:brief|update|reading|issue|edition)\b|\bnothing\s+yet\s+to\s+compare\b/i },
  // "the research", "strands of the research". Not "buyers research the bag":
  // the verb is not the noun.
  { name: 'research', re: /\b(?:the|this|our|of|from|in)\s+research\b|\bresearchers?\b|\bstrands?\s+of\b/i },
  // How sure the reading is. Not "buyers lack confidence in the zip".
  { name: 'confidence', re: /\bconfidence\s+(?:is|was|here|in\s+(?:this|the)\s+(?:reading|finding))\b|\bhow\s+sure\b|\b(?:solid|reasonable|firm)\s+(?:reading|evidence|basis)\b|\bthe\s+(?:reading|evidence|basis)\s+(?:is|was|remains|rests)\b|\b(?:this|the)\s+reading\b/i },
  // What the brief could not settle ("It remains unclear which models …").
  // Not "the route to buy stays unclear", which is the market's problem.
  { name: 'not settled', re: /\bnot\s+(?:yet\s+)?settled\b|\bopen\s+questions?\b|\bunanswered\s+by\b|\bit\s+(?:is|remains)\s+unclear\b|\bremains\s+unclear\s+(?:from|in)\b/i },
  { name: 'method', re: /\bmethod(?:ology)?\b|\banaly(?:sis|sed|zed|st|sts)\b|\bextracted\b|\bverified\b/i },
  { name: 'counted', re: /\bconversations?\s+across\b|\bcomments\s+read\b|\bvideos\s+read\b|\bread\s+for\s+the\s+category\b|\bas\s+at\b|\bstill\s+filling\b/i },
  // The other briefs, which code names in one line of its own: "Elsewhere this
  // month …", "Other briefs cover …", "Separate work covers …".
  { name: 'other briefs', re: /\b(?:other|another|separate)\s+(?:briefs?|work|sections?|pages?|teams?\s+cover)\b|\belsewhere\s+(?:this\s+month|in\s+the\s+(?:briefs?|month))\b|\b(?:sales|marketing|content|leadership)\s+brief\b|\bcovered\s+(?:elsewhere|separately)\b/i },
  // "thin" said of evidence. Not "thin straps".
  { name: 'thin', re: /\bthin\s+(?:evidence|reading|sample|month|basis|data|update)\b|\b(?:evidence|reading|basis)\s+(?:is|was|remains)\s+thin\b|\bthinly\b/i },
]

/** The fields that interpret, where advice is a temptation. */
export type BriefField = 'market' | 'interpret' | 'headline'

export interface BriefScrubOptions {
  company: string
  field: BriefField
  /** Keep at most this many sentences. */
  maxSentences?: number
  /** A one-line field: dropped whole over `max`. */
  whole?: boolean
}

/** One field through every rule. Ids (G12, I2) are stripped by the shared
 *  scrub's own rule for C and S ids and by ours for the brief's. */
export function scrubBriefText(raw: string, max: number, o: BriefScrubOptions): { text: string; counts: WeekScrubCounts } {
  const told = toldWhatToDo(o.company)
  const extra = [
    ...TIME_COMPARISON,
    ...BRIEF_PROCESS,
    ...(o.field === 'interpret' ? [...ADVICE, ...(told ? [told] : [])] : []),
  ]
  const source = (raw ?? '').replace(/\s*[[(](?:[GIJ]\d+(?:,\s*)?)+[\])]/g, '').replace(/\b[GIJ]\d{1,3}\b/g, '')
  return scrubWeekText(source, max, { extra, maxSentences: o.maxSentences, whole: o.whole, headline: o.field === 'headline' })
}

/** The rules a sentence breaks, by name (the README's self-check and the
 *  tests read this; the scrub drops on the same lists). */
export function briefBreaks(text: string): string[] {
  return [...TIME_COMPARISON, ...BRIEF_PROCESS].filter(({ re }) => re.test(text ?? '')).map(({ name }) => name)
}

export const ZERO_COUNTS: WeekScrubCounts = { dropped: 0, droppedDigits: 0, droppedDirection: 0, droppedBanned: 0, droppedAdvice: 0, droppedLong: 0, leaked: false }

export const addCounts = (a: WeekScrubCounts, b: WeekScrubCounts): WeekScrubCounts => ({
  dropped: a.dropped + b.dropped,
  droppedDigits: a.droppedDigits + b.droppedDigits,
  droppedDirection: a.droppedDirection + b.droppedDirection,
  droppedBanned: a.droppedBanned + b.droppedBanned,
  droppedAdvice: a.droppedAdvice + b.droppedAdvice,
  droppedLong: a.droppedLong + b.droppedLong,
  leaked: a.leaked || b.leaked,
})
