import { scrubProse, splitSentences, stripThemeRefs } from '../../prose/scrub'
import { capText, noDashes } from '../documents/scrub'
import { ADVICE, BANNED_PHRASES, toldWhatToDo, type WeekScrubCounts } from '../../written/scrub'
import { britishSpelling } from '../../written/spelling'

// What the brief writer's words go through (pure). Sentence by sentence, the
// unit every rule drops:
//
//  1. ids (G12, I2, A3, S1) and theme handles stripped; a dash between clauses
//     becomes a comma (`noDashes`);
//  2. a sentence that breaks a rule drops whole, and the rule is RECORDED
//     (`dropped`), so the workings say why every sentence went:
//     · §0a: the week read's BANNED_PHRASES, narrowed where a word is the
//       market's in another tenant ("readiness", "provisional", "calibrate"
//       are prosthetics words), the first person and pipeline words;
//     · TIME_COMPARISON (point 4 of the rebuild): no month-on-month basis
//       exists yet, so a sentence that claims a change drops. Narrowed to the
//       market as subject wherever a buyer uses the same words about their
//       own life ("since I became an amputee", "recently fitted", "a move to
//       a new socket", "first-time users");
//     · BRIEF_PROCESS: how the brief was made, "first brief", "the research",
//       "tracked rivals", the other briefs;
//     · UNMEASURED (the fix pass, 4 Oct): claims nothing in the product
//       measures. Rankings and ownership of talk, sales won or lost, the
//       order buyers ask in, and what holds, loses, stops or is shared by an
//       audience: the product reads COMMENTS, so "comments ask for" is
//       measured and "viewers stay" is not;
//     · ADVICE on the fields that interpret;
//  3. the `week_read` policy, one sentence at a time (a digit the model typed,
//     a direction word nothing earned, a magnitude word stripped);
//  4. British spelling, the field's cap.
//
// Each entry names the false positive it steps round.

/** What a market-level change is said ABOUT: a claim that the market moved,
 *  never a buyer's own story. */
const MARKET = String.raw`(?:demand|interest|the\s+(?:market|category|conversation|talk)|talk|attention|buyers'?\s+(?:focus|attention|interest|tastes?|preferences?)|tastes?|preferences?|sentiment|opinion)`

export type Rule = { name: string; re: RegExp }

export const TIME_COMPARISON: readonly Rule[] = [
  { name: 'change over time', re: /\b(?:increasingly|more\s+and\s+more|less\s+and\s+less|over\s+the\s+months|month\s+(?:after|on|by)\s+month|compared\s+(?:with|to)\s+(?:earlier|before|last|the\s+previous)|than\s+(?:before|earlier|last\s+month))\b/i },
  // "recently fitted", "lately my socket…" are a person's own; "demand has
  // recently…" is the market moving.
  { name: 'recently', re: new RegExp(String.raw`\b${MARKET}\s+(?:has\s+|have\s+)?(?:recently|lately)\b|\b(?:recently|lately),?\s+${MARKET}\b`, 'i') },
  { name: 'since a month', re: /\bsince\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|last\s+month|the\s+start)\b/i },
  // "since I became an amputee", "beginning to walk again" are a person's;
  // "interest has become practical" is the market moving.
  { name: 'became', re: new RegExp(String.raw`\b${MARKET}\s+(?:has\s+|have\s+|is\s+|are\s+)?(?:become|became|becoming|shift(?:s|ed|ing)?|emerg(?:es|ed|ing)|settl(?:es|ed|ing)|turn(?:s|ed|ing)?\s+(?:to|toward|towards))\b|\bshift(?:s|ed|ing)?\s+(?:toward|towards|away\s+from)\b`, 'i') },
  { name: 'no longer', re: /\b(?:buyers|people|shoppers|owners|users|customers|the\s+market|demand|interest|talk)\s+(?:no\s+longer|used\s+to)\b|\b(?:is|are)\s+no\s+longer\s+(?:the|a|an|what)\b/i },
  // "demand now reads as more validation driven". Not "people who are now
  // amputees", not "ready to buy now".
  { name: 'now reads as', re: new RegExp(String.raw`\b${MARKET}\s+(?:now\s+)?(?:reads?|reading)\s+(?:as|like)\b|\b${MARKET}\s+(?:is|are|was|were)\s+now\b|\bnow\s+reads?\s+as\b`, 'i') },
  // "compared with earlier asks", "than in earlier months". Not "a move to a
  // new socket", which is a person changing a part.
  { name: 'earlier', re: new RegExp(String.raw`\b(?:earlier|previous|prior|past)\s+(?:asks?|months?|weeks?|periods?|briefs?|reads?|seasons?)\b|\b(?:last|previous)\s+month\b|\bmore\s+than\s+(?:ever|before)\b|\b(?:a|the)\s+(?:shift|change|move)\s+(?:in|of)\s+${MARKET}\b`, 'i') },
  // The product's record decides what is new. Not "first-time users", not
  // "the first time I walked".
  { name: 'first time', re: /\b(?:heard|seen|appeared|raised|named|mentioned|talked\s+about)\s+for\s+the\s+first\s+time\b|\bfirst\s+(?:heard|seen|appeared)\b/i },
  // Words that lean on time (the review, 4 Oct): "still", "current",
  // "finally". The writer is told to say "owners" and "the leg they wear".
  { name: 'time word', re: /\bstill\b|\bcurrent(?:ly)?\b|\bfinally\b|\bany\s*more\b|\bnowadays\b|\bthese\s+days\b/i },
]

export const BRIEF_PROCESS: readonly Rule[] = [
  { name: 'first brief', re: /\bfirst\s+(?:brief|update|reading|issue|edition)\b|\bnothing\s+yet\s+to\s+compare\b/i },
  // "the research", "strands of the research". Not "buyers research the bag".
  { name: 'research', re: /\b(?:the|this|our|of|from|in)\s+research\b|\bresearchers?\b|\bstrands?\s+of\b/i },
  // How sure the reading is. Not "buyers lack confidence in the knee", not
  // "the reading on the app".
  { name: 'confidence', re: /\bconfidence\s+(?:is|was|here|in\s+(?:this|the)\s+(?:reading|finding))\b|\bhow\s+sure\b|\b(?:solid|reasonable|firm)\s+(?:reading|evidence|basis)\b|\bthe\s+(?:evidence|basis)\s+(?:is|was|remains|rests)\b|\b(?:this|the)\s+reading\s+(?:is|was|rests|shows|of|here)\b/i },
  { name: 'not settled', re: /\bnot\s+(?:yet\s+)?settled\b|\bopen\s+questions?\b|\bunanswered\s+by\b|\bit\s+(?:is|remains)\s+unclear\b|\bremains\s+unclear\s+(?:from|in)\b/i },
  // Our method. Not "gait analysis", which a clinic does to a walker.
  { name: 'method', re: /\bmethodolog\w*|\b(?:the|our|this)\s+(?:analysis|method)\b|\banaly(?:sed|zed)\s+(?:the|our|this|these)\s+(?:data|comments|videos|posts|conversation)\b|\bextracted\s+from\b|\bverified\s+(?:by|against|in)\b/i },
  { name: 'counted', re: /\bconversations?\s+across\b|\bcomments\s+read\b|\bvideos\s+read\b|\bread\s+for\s+the\s+category\b|\bas\s+at\b|\bstill\s+filling\b/i },
  { name: 'tracked', re: /\btracked\s+(?:rivals?|brands?|competitors?|subjects?)\b/i },
  { name: 'other briefs', re: /\b(?:other|another|separate)\s+(?:briefs?|work|sections?|pages?|teams?\s+cover)\b|\belsewhere\s+(?:this\s+month|in\s+the\s+(?:briefs?|month))\b|\b(?:sales|marketing|content|leadership)\s+brief\b|\bcovered\s+(?:elsewhere|separately)\b/i },
  { name: 'thin', re: /\bthin\s+(?:evidence|reading|sample|month|basis|data|update)\b|\b(?:evidence|reading|basis)\s+(?:is|was|remains)\s+thin\b|\bthinly\b/i },
]

/** Claims nothing in the product measures (the review, 4 Oct). */
export const UNMEASURED: readonly Rule[] = [
  // "Ottobock owns knee technology talk", "leads the category", "second
  // largest share". Not "owns a Rheo knee".
  { name: 'ranking', re: /\bowns?\s+(?:the\s+)?(?:[\w-]+\s+){0,3}(?:talk|conversation|category|market|space|segment)\b|\bleads?\s+(?:the\s+)?(?:talk|conversation|category|market|field|pack)\b|\bdominat\w+|\b(?:second|third|fourth|fifth)[\s-]largest\b|\blargest\s+share\b|\bahead\s+of\s+(?:the\s+)?(?:rivals?|competitors?|others|the\s+pack)\b|\b(?:falls?|sits?|lags?|trails?)\s+behind\b/i },
  // A comparison with no counted base. Not "more than one job".
  { name: 'more than', re: /\b(?:more|less|fewer)\s+(?:often\s+)?than\s+(?!one\b)|\bmost\s+often\b/i },
  // Sales won or lost: the product reads talk, not tills.
  { name: 'sales outcome', re: /\bwins?\s+(?:it\s+|them\s+)?(?:the\s+)?(?:[\w-]+\s+)?sales?\b|\bwins?\s+(?:buyers|customers|over)\b|\bloses?\s+(?:the\s+)?(?:sales?|buyers|customers)\b|\bclos(?:e|es|ed|ing)\s+the\s+sale\b|\bconver(?:t|ts|ted|ting|sion)\b|\bmakes?\s+the\s+sale\b/i },
  // The order buyers ask in. Not "before buying", which is when, not order.
  { name: 'order', re: /\bbefore\s+(?:they\s+)?(?:ask|asks|asking|look|looks|looking|consider)\b|\b(?:first|then)\s+(?:ask|asks|look|looks|turn|turns)\b|\bstarts?\s+with\b|\bthe\s+first\s+(?:thing|question)\b/i },
  // What an audience does with a post: the product counts comments, not
  // watching, scrolling or sharing. Not "price stops people from buying".
  { name: 'attention', re: /\b(?:viewers?|people|audiences?|they)\s+(?:stay|stays|stayed)\b|\bkeeps?\s+(?:[\w-]+\s+){0,2}(?:watching|engaged|hooked)\b|\bkeeps?\s+(?:their\s+)?attention\b|\bholds?\s+(?:their\s+)?attention\b|\bloses?\s+(?:them|viewers|people|attention|interest)\b|\bwhat\s+loses\b|\bshareable\b|\b(?:share|shares|shared|sharing)\s+(?:it|them|the\s+post|posts?|videos?)\b|\bstops?\s+(?:people|viewers|them)\s+(?:on|scrolling|in\s+their)\b|\bstops?\s+the\s+scroll\b|\bscroll\w*\b|\bdrives?\s+(?:comments|engagement|attention|shares)\b|\bgo(?:es|ing)?\s+viral\b|\bdraws?\s+(?:viewers|people)\s+in\b/i },
]

/** BANNED_PHRASES with its "readiness" entry narrowed to our machinery: in a
 *  prosthetics market "readiness", "provisional" and "calibrate" are the
 *  market's own words (a provisional socket, calibrating a knee). */
export const BRIEF_BANNED: readonly Rule[] = [
  ...BANNED_PHRASES.filter((r) => r.name !== 'readiness'),
  { name: 'readiness', re: /\b(?:data|update|reading|subject)\s+readiness\b|\breadiness\s+(?:check|score|state)\b|\bcalibrat\w*\s+(?:subjects?|figures?|readings?|matching|the\s+(?:subject|reading))\b|\bprovisional\s+(?:readings?|figures?|subjects?|levels?|counts?|results?|shares?)\b/i },
  { name: 'first person', re: /\b(?:[Ww]e|[Oo]urs?|us)\b/ },
  { name: 'pipeline words', re: /\b(?:candidates?|insights?|clustering|clustered|the\s+pipeline)\b|\b(?:this|last|next|each|every|latest)\s+runs?\b/i },
  { name: 'AI', re: /\bAI\b|\bthe\s+(?:language\s+)?model\s+(?:wrote|read|found|says?)\b/ },
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

export interface BriefScrub {
  text: string
  counts: WeekScrubCounts
  /** Every sentence dropped, with the rule that dropped it. */
  dropped: { sentence: string; rule: string }[]
}

const stripIds = (s: string): string =>
  s.replace(/\s*[[(](?:[GIJACS]\d+(?:,\s*)?)+[\])]/g, '').replace(/\b[GIJACS]\d{1,3}\b/g, '')

/** A sentence whose first word the magnitude strip took starts lower case. */
const capitalised = (s: string): string => (/^[a-z][a-z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s)

/** The rule a sentence breaks first, or null. */
export function firstBreak(sentence: string, rules: readonly Rule[]): string | null {
  for (const r of rules) if (r.re.test(sentence)) return r.name
  return null
}

/** One field through every rule. */
export function scrubBriefText(raw: string, max: number, o: BriefScrubOptions): BriefScrub {
  const told = toldWhatToDo(o.company)
  const rules: Rule[] = [
    ...BRIEF_BANNED, ...TIME_COMPARISON, ...BRIEF_PROCESS, ...UNMEASURED,
    ...(o.field === 'interpret' ? [...ADVICE, ...(told ? [told] : [])] : []),
  ]
  const counts: WeekScrubCounts = { dropped: 0, droppedDigits: 0, droppedDirection: 0, droppedBanned: 0, droppedAdvice: 0, droppedLong: 0, leaked: false }
  const dropped: BriefScrub['dropped'] = []
  const drop = (sentence: string, rule: string, kind: 'banned' | 'advice' | 'digits' | 'direction') => {
    dropped.push({ sentence, rule })
    counts.dropped += 1
    counts.leaked = true
    if (kind === 'banned') counts.droppedBanned += 1
    if (kind === 'advice') counts.droppedAdvice += 1
    if (kind === 'digits') counts.droppedDigits += 1
    if (kind === 'direction') counts.droppedDirection += 1
  }
  const paragraphs = (raw ?? '').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
  const out: string[] = []
  let sentences = 0
  for (const para of paragraphs) {
    const kept: string[] = []
    for (const sentence of splitSentences(noDashes(stripIds(stripThemeRefs(para))))) {
      const rule = firstBreak(sentence, rules)
      if (rule) { drop(sentence, rule, ADVICE.some((a) => a.name === rule) || rule === 'told what to do' ? 'advice' : 'banned'); continue }
      const r = scrubProse('week_read', sentence, { figures: {}, allow: [], verdicts: [] })
      if (!r.text.trim()) { drop(sentence, r.droppedDigits > 0 ? 'a digit' : r.droppedDirection > 0 ? 'a direction word' : 'the prose policy', r.droppedDigits > 0 ? 'digits' : 'direction'); continue }
      kept.push(capitalised(r.text.trim()))
    }
    if (kept.length === 0) continue
    let text = britishSpelling(kept.join(' '))
    if (o.maxSentences != null) {
      const room = o.maxSentences - sentences
      if (room <= 0) break
      const ss = splitSentences(text)
      text = ss.slice(0, room).join(' ')
      sentences += Math.min(ss.length, room)
    }
    out.push(text)
  }
  if (o.whole && out.join('\n\n').length > max) {
    counts.droppedLong += 1
    counts.leaked = true
    dropped.push({ sentence: out.join(' '), rule: 'over its length' })
    return { text: '', counts, dropped }
  }
  let text = capParagraphs(out, max)
  if (o.field === 'headline') text = text.replace(/\s+/g, ' ').replace(/[.!]+$/, '').trim()
  return { text, counts, dropped }
}

function capParagraphs(paragraphs: readonly string[], max: number): string {
  const kept: string[] = []
  let used = 0
  for (const p of paragraphs) {
    if (used + p.length <= max) { kept.push(p); used += p.length + 2; continue }
    const room = max - used
    if (kept.length === 0 || room > 80) kept.push(capText(p, Math.max(room, 1)))
    break
  }
  return kept.join('\n\n')
}

/** The rules a sentence breaks, by name (the self-check reads this). */
export function briefBreaks(text: string): string[] {
  return [...TIME_COMPARISON, ...BRIEF_PROCESS, ...UNMEASURED].filter(({ re }) => re.test(text ?? '')).map(({ name }) => name)
}

// ---- Normalising what survives --------------------------------------------------------------

/**
 * Names written as the points write them: a hyphenated or digit-free product
 * name the writer split ("Pro Flex Terra" for "Pro-Flex Terra") is put back.
 * The names are read from the points themselves, so no tenant list. Pure.
 */
export function restoreNames(text: string, names: readonly string[]): string {
  let out = text
  for (const name of names) {
    if (!name.includes('-')) continue
    const loose = name.split('-').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s]+')
    out = out.replace(new RegExp(`\\b${loose}\\b`, 'g'), name)
  }
  return out
}

/** Hyphenated names in a text: "Pro-Flex", "Black-Hole"; capitalised parts
 *  only, so an ordinary compound ("day-to-day") is not a name. Pure. */
export function hyphenatedNames(texts: readonly string[]): string[] {
  const out = new Set<string>()
  for (const t of texts) for (const m of t.matchAll(/\b[A-Z][\w]*(?:-[A-Z0-9][\w]*)+\b/g)) out.add(m[0])
  return [...out]
}

/** One spelling of trade-off. Pure. */
export const tradeOff = (text: string): string => text.replace(/\btrade[\s]?offs\b/gi, 'trade-offs').replace(/\btrade[\s]?off\b/gi, 'trade-off')

/**
 * No robotic repeated subjects: where a sentence opens on the same words as
 * the sentence before it ("Current leg users… Current leg users…"), the
 * repeat becomes "They". Only after a kept sentence, so nothing points back
 * at a sentence the scrub took. Pure.
 */
export function varySubjects(text: string): string {
  return text.split(/\n\s*\n/).map((para) => {
    const ss = splitSentences(para)
    for (let i = 1; i < ss.length; i++) {
      const prev = subjectOf(ss[i - 1])
      const cur = subjectOf(ss[i])
      if (prev && cur && prev.toLowerCase() === cur.toLowerCase()) ss[i] = `They${ss[i].slice(cur.length)}`
    }
    return ss.join(' ')
  }).join('\n\n')
}

/** The opening plural subject of a sentence ("Buyers", "Current leg users"):
 *  a capitalised word and up to three more, the last a plural, before a verb
 *  of saying or doing. Null otherwise. */
const VERBS = 'ask|asks|want|wants|say|says|describe|describes|talk|talks|look|looks|treat|treats|judge|judges|praise|praises|question|questions|compare|compares|use|uses|are|have|need|needs|come|see|read|reads|test|tests|name|names|hold|holds|pause|pauses|hesitate|hesitates|expect|expects|find|finds|tie|ties|weigh|weighs|link|links|credit|credits|react|reacts|respond|responds|move|moves|stay|stays|buy|buys|report|reports|worry|worries|put|puts|picture|pictures|place|places|shop|shops|focus|focuses|frame|frames|connect|connects|separate|separates|value|values|call|calls'
const SUBJECT = new RegExp(`^([A-Z][\\w-]*(?:\\s+[a-z][\\w-]*){0,3})\\s+(?:${VERBS})\\b`)
function subjectOf(sentence: string): string | null {
  const m = SUBJECT.exec(sentence)
  if (!m) return null
  const words = m[1].split(/\s+/)
  return /s$/i.test(words[words.length - 1]) ? m[1] : null
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
