import { z } from 'zod'

import { estimateCost, RUN_MODEL_BUDGET_USD, SUBJECT_READS_BUDGET_USD, SUBJECT_READS_RUN_MARGIN_USD, SYNTHESIS_MODEL, SYNTHESIS_REASONING_EFFORT } from '../config'
import { longMonth } from '../format'
import { WHAT_THEY_SELL } from '../pages/market-frame'
import { placeSubject, type SubjectPlacement } from '../pages/subject-place'
import { CALIBRATED_PROSE_RULE, noDirectionRule } from '../pipeline/prose-rules'
import { allowTokens, splitSentences } from '../prose/scrub'
import { noDashes } from '../reports/documents/scrub'
import { companyLines, type CompanyContext } from './company'
import { judge, type DatedEvidence } from './evidence'
import { notesOf, POOL_MIN_VIDEOS } from './pool'
import { ADVICE, FORECAST, scrubWeekText, toldWhatToDo, WHOLE_SLACK } from './scrub'
import { MEDICAL_CLAIMS } from '../post-ideas/scrub'
import { inMonth } from './month'
import { speaksForTheMarket, subjectLenientGate } from './standing'
import type { SubjectRead, SubjectReadsData } from './types'
import { DELETED_WORDS } from './write'

// A TRACKED SUBJECT'S OWN READ (Heinrich, 14 Oct: "What's the point of
// tracking a subject if we just have nothing there"). Pure: the material, the
// prompt and its schema, the scrub, the thin line, and the money. The step
// that reads the material and makes the calls is ./subject-reads-step.ts.
//
// WHAT A READ IS. Two short parts under Market's subject panel's "Our read":
// what people said across the conversations inside the subject, then what it
// means for the company; and since v3 (16 Oct) a one-line headline, the
// subject's main point from the buyer's side, which Market's subject card
// prints above "What it means" with no figure on the card (Heinrich, 16 Oct:
// Market's top layer is analysis, the numbers one click down). Written for READY subjects only (ruling U6: every
// word of it rests on the subject's membership), from the month the panel's
// level reads (the week read's month, to the run's window end).
//
// WHY THE MONTH AND NOT FOUR WEEKS. The panel prints the subject's level as
// the month so far ("54 of 318 videos in your market, October so far",
// `month_subject_readings` on the market) and its month line; the read sits
// under that level, so it reads the same days. Four weeks would describe days
// the level does not count (the post ideas read four weeks because a week
// gave one idea a tenant; a subject's month is the unit its own figure has).
//
// GROUPED BY THE PAGES' RULE. A conversation is inside the subject where
// `placeSubject` (lib/pages/subject-place.ts, the three tiers every page uses)
// places it there, under the run's own clustering, so the read names the
// conversations the panel's "Inside it" lists. The week read's standing
// still groups by the pool's one-tier `subjectForTheme` (a pipeline
// follow-up AGENTS.md names); this read does not.
//
// THE MATERIAL IS THE MARKET'S, THE STANDING'S WAY: the subject's member
// insights' comment citations in the read's days that speak for the market
// (`speaksForTheMarket`: the category or a tracked brand, the read lane, no
// maker's video) and pass the subject's LENIENT gate (`subjectLenientGate`,
// no brand insider). Notes are Pass A's paraphrases, never a comment's words:
// the writer is shown no comment, no figure and no verdict.
//
// ENOUGH TO WRITE: such citations on `SUBJECT_READ_MIN_VIDEOS` (3, the pool's
// floor) distinct videos and `SUBJECT_READ_MIN_NOTES` (2) distinct notes.
// Below it a subject is THIN: no call; code writes one honest line on where
// its talk sat (`thinSubjectRead`), never nothing.

export const SUBJECT_READ_PASS = 'subject_read'
/** v2 (14 Oct, Heinrich on Össur's first reads: "What it means" restated
 *  Össur's own marketing and closed on abstractions): the meaning is the
 *  insight from the buyer's side of the talk (what people take for granted,
 *  doubt or need settled; the part of the device the talk turns on; a route
 *  or rival people praise), the company's claims context only. Chosen over
 *  three other wordings on the six subjects, offline (meaning-v2.md). */
/** v3 (16 Oct, Heinrich: Market's top layer becomes analysis, each subject a
 *  card of a headline and "What it means"): a one-line `headline` per
 *  written read, scrubbed as the meaning is; and the prompt made
 *  tenant-neutral before Sealand is switched on (the fresh check's three
 *  should-fixes: the prosthetic parts and "someone new to a prosthesis" went
 *  to every tenant, the coffee example broke the prompt's own rules, and "a
 *  cheaper route" invited a comparative `COMPARISON` does not catch). The
 *  meaning's rules are v2's. */
export const SUBJECT_READ_PROMPT_VERSION = 'subject_read_v3' as const
/** The written read's model (`WEEK_READ_MODEL`), at its effort. */
export const SUBJECT_READ_MODEL = SYNTHESIS_MODEL
export const SUBJECT_READ_EFFORT = SYNTHESIS_REASONING_EFFORT
/** The output ceiling of one attempt, reasoning included: a read is about four
 *  hundred words of answer, and medium effort reasons for a few thousand
 *  tokens before it. */
export const SUBJECT_READ_MAX_OUTPUT_TOKENS = 6_000

/** Field caps, in characters, and the counts. The writer is told each; scrub
 *  holds it to each with the week read's slack (`WHOLE_SLACK`), cut at a
 *  sentence's end (`scrubWeekText`), so a sentence a little over is kept (the
 *  offline test of 14 Oct lost the second, more specific sentence of a "what
 *  it means" at the bare cap). */
export const SUBJECT_READ_MAX = {
  paragraph: 560,
  sayingParagraphs: 2,
  means: 420,
  meansSentences: 3,
  /** The headline (v3): one line, held at these with NO slack (the fix
   *  round, 16 Oct): over either it is dropped whole, never cut. The writer
   *  is asked for less (`headlineAsk`, `headlineWordsAsk`), so the model's
   *  margin lives in the prompt and not in the scrub. */
  headline: 90,
  headlineWords: 14,
  headlineAsk: 80,
  headlineWordsAsk: 12,
} as const

/** Enough to write (the header). */
export const SUBJECT_READ_MIN_VIDEOS = POOL_MIN_VIDEOS
export const SUBJECT_READ_MIN_NOTES = 2
/** Conversations the writer is shown, at most, and notes on each. */
export const SUBJECT_READ_CONVERSATIONS = 6
export const SUBJECT_READ_CONVERSATION_NOTES = 6
/** Notes from outside those conversations, at most. */
export const SUBJECT_READ_LOOSE_NOTES = 6
/** Conversations the thin line names, at most. */
export const SUBJECT_READ_THIN_NAMES = 3
/** Calls in flight at once inside the step. */
export const SUBJECT_READ_CONCURRENCY = 4

// ---- The material ------------------------------------------------------------------

/** A conversation of the run's clustering, as the read takes it. */
export interface SubjectReadTheme {
  /** `theme_registry.id`. */
  themeId: string
  label: string
  description: string | null
  kind: string | null
  memberIds: readonly string[]
}

/** A conversation inside the subject, with what was said about the subject
 *  in it. */
export interface SubjectReadConversation {
  themeId: string
  label: string
  description: string | null
  kind: string | null
  /** Distinct market videos where its subject talk passed the lenient gate. */
  videos: number
  /** Pass A's paraphrases of that talk, best-fitting first. */
  notes: string[]
}

/** What one subject's read is written from. Holds no comment's words. */
export interface SubjectReadMaterial {
  subjectId: string
  name: string
  description: string | null
  /** Distinct market videos with a gated citation of its members. */
  videos: number
  /** Every conversation placed in it with talk of its in the read's days,
   *  the most videos first. The writer is shown those with notes, at most
   *  `SUBJECT_READ_CONVERSATIONS`; the thin line names the first. */
  conversations: SubjectReadConversation[]
  /** Its talk outside those conversations, in paraphrase. */
  loose: string[]
  /** Any member citation that speaks for the market in the read's days. */
  heard: boolean
  /** Enough to write (`SUBJECT_READ_MIN_VIDEOS`, `SUBJECT_READ_MIN_NOTES`). */
  enough: boolean
}

const distinct = (rows: readonly { e: DatedEvidence }[] | readonly DatedEvidence[]): number =>
  new Set((rows as readonly (DatedEvidence | { e: DatedEvidence })[]).map((r) => ('e' in r ? r.e : r).video.uuid)).size

/**
 * One subject's material (the header's rules). `evidence` is the read's days'
 * comment citations and may hold other subjects' rows; `themes` is the run's
 * clustering; `placed` is the pages' placement (`loadSubjectPlacement`).
 * Pure.
 */
export function subjectReadMaterial(input: {
  clientId: string
  subject: { id: string; name: string; description: string | null }
  members: ReadonlySet<string>
  evidence: readonly DatedEvidence[]
  market: ReadonlySet<string>
  themes: readonly SubjectReadTheme[]
  placed: SubjectPlacement | null
}): SubjectReadMaterial {
  const lenient = subjectLenientGate(input.clientId, input.subject)
  const own = input.evidence.filter((e) => input.members.has(e.insightId) && !e.redacted && speaksForTheMarket(e, input.market))
  const passed: { e: DatedEvidence; score: number }[] = []
  for (const e of own) {
    const v = judge(e, lenient)
    if (v.ok) passed.push({ e, score: v.score })
  }
  const inside = input.placed
    ? input.themes.filter((t) => t.label.trim() !== '' && placeSubject(t.memberIds, input.placed as SubjectPlacement) === input.subject.id)
    : []
  const insideIds = new Set(inside.flatMap((t) => t.memberIds))
  const conversations = inside
    .map((t) => {
      const ids = new Set(t.memberIds)
      const seen = own.filter((e) => ids.has(e.insightId))
      const mine = passed.filter((p) => ids.has(p.e.insightId))
      return {
        seen: distinct(seen),
        c: { themeId: t.themeId, label: t.label.trim(), description: t.description?.trim() || null, kind: t.kind, videos: distinct(mine), notes: notesOf(mine).slice(0, SUBJECT_READ_CONVERSATION_NOTES) },
      }
    })
    .filter((x) => x.seen > 0)
    .sort((a, b) => b.c.videos - a.c.videos || b.seen - a.seen || a.c.label.localeCompare(b.c.label))
    .map((x) => x.c)
  const loose = notesOf(passed.filter((p) => !insideIds.has(p.e.insightId))).slice(0, SUBJECT_READ_LOOSE_NOTES)
  const videos = distinct(passed)
  const notes = new Set([...conversations.flatMap((c) => c.notes), ...loose].map((n) => n.toLowerCase())).size
  return {
    subjectId: input.subject.id,
    name: input.subject.name,
    description: input.subject.description,
    videos,
    conversations,
    loose,
    heard: own.length > 0,
    enough: videos >= SUBJECT_READ_MIN_VIDEOS && notes >= SUBJECT_READ_MIN_NOTES,
  }
}

/** Names in the material that carry digits and may be written (`allowTokens`). */
export function subjectReadAllow(subjects: readonly SubjectReadMaterial[]): string[] {
  return allowTokens(subjects.flatMap((s) => [
    s.name, s.description ?? '', ...s.loose,
    ...s.conversations.flatMap((c) => [c.label, c.description ?? '', ...c.notes]),
  ]))
}

// ---- The prompt ----------------------------------------------------------------------

/** What the writer returns. `headline` is v3's (absent from an answer
 *  written before it). */
export interface SubjectReadOutput {
  saying: string[]
  means: string
  headline?: string
}

export function subjectReadSchema() {
  return z.object({
    saying: z.array(z.string()).describe(`What people said about the subject this month, as one account in one or two short paragraphs (at most ${SUBJECT_READ_MAX.sayingParagraphs}), each under ${SUBJECT_READ_MAX.paragraph} characters, in plain words and the analytical third person. No placeholder, no quotation marks.`),
    means: z.string().describe(`What it means for the company: one short paragraph of at most ${SUBJECT_READ_MAX.meansSentences} sentences, under ${SUBJECT_READ_MAX.means} characters. Intelligence, never an instruction or a forecast.`),
    headline: z.string().describe(`The subject's main point in one line, from the buyer's side: ONE claim about what the talk shows (what decides it for buyers, what they take for granted, or which part carries their judgement), never a report that people ask or talk, a plain statement in sentence case, at most about ${SUBJECT_READ_MAX.headlineWordsAsk} words and ${SUBJECT_READ_MAX.headlineAsk} characters, no full stop at the end. Never a question, never a list, never the subject's name restated, never the company's own claim.`),
  })
}

const KIND_WORDS: Readonly<Record<string, string>> = {
  praise: 'praise', objection: 'objections', pain_point: 'problems', question: 'questions', purchase_intent: 'intent to buy',
  feature_request: 'requests', buying_trigger: 'reasons to buy now', switching_signal: 'switching', demographic_signal: 'who is buying',
  misinformation: 'misunderstandings',
}
const kindWord = (k: string | null): string => (k ? KIND_WORDS[k] ?? k.replace(/_/g, ' ') : 'not recorded')

/** "October so far", or "September, the whole month" (the week carried past
 *  its end: M2, lib/written/month.ts). */
export function readMonthPhrase(month: string, complete: boolean): string {
  return complete ? `${longMonth(month)}, the whole month` : `${longMonth(month)} so far`
}

export interface SubjectReadPromptArgs {
  company: string
  clientId: string
  month: string
  complete: boolean
  material: SubjectReadMaterial
  context?: CompanyContext | null
}

/** The shared intensity rule (`CALIBRATED_PROSE_RULE`'s first line) without
 *  its sentence allowing a comparison the data shows: this prompt forbids
 *  every comparison (the fix round, 16 Oct: the two lines contradicted). */
export const INTENSITY_RULE = noDashes(CALIBRATED_PROSE_RULE.split('\n')[0]).replace(/\s*Comparisons \("X more than Y"\) are allowed only where the input data directly shows them\./, '')

/** The writer's two messages for one subject. Pure. */
export function buildSubjectReadPrompts(a: SubjectReadPromptArgs): { system: string; user: string } {
  const co = a.company
  const sells = WHAT_THEY_SELL[a.clientId]
  const what = sells ? `${sells} like ${co}'s` : `what ${co} sells`
  const name = a.material.name
  const system = [
    `You are the consumer researcher at ${co}. ${co} follows a subject in its market, and you write the short read at the top of that subject's page: what people in the market said about it this month, the insight it holds for ${co}, and that insight in one line. The market is the people worldwide buying and talking about ${what}, not only ${co}'s own customers. It is read on a phone, in under a minute.`,
    '',
    'What you are given, in the user message:',
    `- The subject: its name, and what it covers in ${co}'s own words.`,
    '- The conversations inside it this month (C1, C2 and so on), the most talked about first: each with its label and description, the kind of comment it mostly is, and paraphrases of what people said about the subject in it. The paraphrases are notes, not quotations: never put them in quotation marks and never present them as anyone\'s words.',
    '- Other things people said about the subject outside those conversations, in paraphrase, where there are any.',
    `- About ${co}: what it sells, what it says about itself in its own videos (its claims, in paraphrase) and whether it posted. This is ${co}'s own voice, not the market's: never present it as anything buyers said.`,
    '',
    'What you write:',
    `1. saying: what people said about ${name} this month, in one or two short paragraphs (at most ${SUBJECT_READ_MAX.sayingParagraphs}). Tell it as ONE account: what the talk was about, the concrete things people name and how they put it, and how the conversations connect (one worry seen from two sides, one cause behind two complaints, the same people at the same moment). Name a conversation in plain words where it helps the reader. Never one sentence per conversation in turn, never a list in prose ("First… Second…"). Every sentence must come from the conversations and notes given, and from nothing else.`,
    `2. means: what this talk means for ${co}, one short paragraph of at most ${SUBJECT_READ_MAX.meansSentences} sentences: the insight a marketing lead at ${co} takes away, never a summary of the saying paragraphs. Write it from the buyer's side of the talk, on the one or two of these the notes show most clearly:`,
    `  - what people here take for granted about ${what};`,
    '  - what they doubt or still need settled before buying, shown by a question they ask or a problem they name;',
    '  - the part of the product the talk turns on (a named part, a material, a size or a finish, in the words people in this market use), and in what role: the thing people ask about, praise, blame or work around;',
    '  - a fix, a part or a product people praise, named for what it is and for what they praise in it, never set against something else ("cheaper", "an alternative", "instead of").',
    `  - Never about ${co}'s own words. ${co}'s claims (under About ${co}) are context only: at most one clause may say whether the talk bears a claim out or tests it. Never open with a claim, never make one the subject, never restate one.`,
    '  - Only what a note shows: a doubt is a question asked or a problem named, never a feeling you infer. Never frame a point by what something is not ("not one purchase", "not only"). No abstract role words ("sits in the role of", "sits in a space where", "sits inside stories about", "a story about identity"): name the thing. End on the concrete point.',
    '  - Never "comes up", "up" or "down" about talk or a share, and never "is new" or "are new" about anyone or anything: those read as a direction and delete the sentence. Say "appears", "is asked about", "is named", "someone buying for the first time".',
    `  - Intelligence, not instructions: say what is true about the business, never what ${co} should do. Never "should", "could", "needs to", "must", "consider", "make sure", "an opportunity", and never an imperative. Never a forecast ("will", "likely", "set to").`,
    `  - ${co}'s claims are its own words, not evidence about the market. Never say how a claim was received or whether buyers believe it unless a note says so, and never say the market ignores, overlooks or does not mention something: the notes are not everything people said.`,
    `  - Every claim rests on the notes given, and on nothing else: never say how ${co}'s products reach people, who buys them, where, or through whom, unless a note says so.`,
    '  - No comparison of one channel, product, group or brand with another: never "as much as", "more than", "less than", "rather than" or any "than", never "the best" or "the most", never one thing "over" another. A sentence with "than" or "as much as" is deleted.',
    '  - When unsure whether a claim rests on what is given, leave it out. One true sentence is better than three.',
    `3. headline: the subject's main point in one line, written last. It is printed on its own above "means", with no figure beside it: the one point a reader takes away, never a summary of "saying" or of "means".`,
    `  - At most about ${SUBJECT_READ_MAX.headlineWordsAsk} words and ${SUBJECT_READ_MAX.headlineAsk} characters; a line over ${SUBJECT_READ_MAX.headlineWords} words or ${SUBJECT_READ_MAX.headline} characters is deleted. A plain statement in sentence case (a capital on the first word and on names only), with no full stop or other mark at the end.`,
    '  - ONE point about the subject, never a list of three nouns. For coffee machines, "The milk wand is the part owners blame for a slow clean", not "Milk wand, descale and drip tray need settling".',
    '  - The insight: what the talk SHOWS from the buyer\'s side, that is what decides it for buyers, what they take for granted, or which part carries their judgement. Name the thing they name.',
    '  - Never a report that people ask, talk or discuss: never open on "Buyers ask", "People ask", "People talk", "Buyers want … explained" or any other report of asking or talking. Say what the asking shows. For coffee machines, "Owners take good coffee for granted and count the cleaning time", not "Buyers ask how long the daily clean takes".',
    '  - This subject\'s own point in its own words: the subjects\' headlines are read side by side, so never a stock frame ("Buyers judge … by …", "… is judged by …").',
    `  - Never a label or a topic ("${name}", "Questions about ${name}"), never the subject's name restated as a claim ("${name} matters to buyers"), and never ${co}'s own claim or a line about ${co}'s words.`,
    '  - Every rule for "means" and every house rule below holds here too. Never an inferred feeling, a "not X" frame, a size or a rank. A headline is deleted, and the subject prints without one, where it is a question (with or without its question mark), the subject\'s name alone, a line that opens on people asking, talking, discussing or wondering ("Buyers ask", "People talk"), an instruction, a forecast ("will", "set to"), a comparison ("than", "the best", "the most", one thing "over" another), in the first or second person ("I", "we", "you"), or where it holds a digit, an amount in words, a direction word or, in a medical market, a medical claim.',
    '',
    'House style:',
    `- Plain language, for a busy person at ${co} reading on a phone. Short sentences. Concrete nouns: the thing people name, in the market's own words. No consultant abstractions: never "a fit problem", "legible", "positioning", "lens", "value proposition", "use case", "resonates", "narrative", "friction", "ecosystem", "landscape", "journey". Name the thing instead.`,
    '- Literal words, never an idiom or a figure of speech.',
    `- A research report, not a memo: the analytical third person ("people describe", "users ask", "${co} is compared"), claims rather than hedges. Never "we", "our", "us" or "you"; never address the reader. No headings, no bullet points, no exclamation marks.`,
    '- Name products, brands and conversations plainly. Never name a person or an account.',
    '- The market only. Never mention how anything was found, gathered, collected, searched, read, counted or checked. Never mention data, sources, samples, coverage, searches, updates, platforms, this service, a tool, a model, AI or Verbatim, and never write "this read", "this report" or "this page". Never explain why something is not said or cannot be compared: if something cannot be said, leave it out. A sentence that does any of this is deleted before anyone reads it.',
    '- Never say how big the subject or a conversation is, or how it ranks ("the main worry", "the biggest", "most people", "more than"): code prints the counts beside your words.',
    '- You have NO numbers. Never type a digit: not in a date, a size, an age or a product name. Never write an amount, a price, a percentage or a count in words either: "fifty thousand euros" is a number too. A sentence with a digit or an amount in words is deleted.',
    INTENSITY_RULE,
    '- Never write an id (C2) in prose.',
    noDashes(noDirectionRule('week_read')),
    `- The rule above is a word list, and it deletes a sentence for these words even where they describe a thing rather than a movement ("the lower part", "a flat surface", "a drop test", "climbing stairs"): ${DELETED_WORDS.join(', ')}. Say it another way ("the bottom part", "even ground", "a test from a height", "taking the stairs").`,
    '- Never a medical or clinical claim: never say what a product, a treatment or a habit does to the body or to health, never that something heals, treats, cures, prevents, relieves or causes pain, a sore, an infection or a condition, never that something is safe or unsafe, and never that doctors or clinicians recommend something. Say what people say about it.',
    '- No dashes between clauses (no em dash, no en dash, no spaced hyphen); use a comma, a colon or a full stop. British spelling.',
    '',
    'An example of the register, for a different company and market (coffee machines, the subject "Cleaning and upkeep"); do not reuse its content. Each part does its own job: saying tells what was said; means says what it adds up to for the business, without telling it again; headline is the one point.',
    '- saying: "Owners described the daily clean in detail: the drip tray, the milk wand, and how often the machine asks to be descaled. Those who need a brush or a tablet every week complained about it, even when they liked the coffee.\\n\\nBuyers asked how long the clean takes before they bought, and owners answered with the routine they keep each morning and the machines whose milk wand rinses itself."',
    '- means: "Good coffee is taken for granted here. What a buyer still needs settled before buying is the time the clean takes each morning, and the milk wand is the part that decides it: a wand that rinses itself is the feature owners name to each other." Not, the saying told again: "Owners describe the drip tray, the milk wand and the descale, and buyers ask how long the clean takes." Not, the company\'s claim restated: "The company sells its machines on a decade of use, and owners judge that decade by the clean." Not, a feeling inferred and a "not X" frame: "Owners forgive the noise, but not a brush every morning." Not, an abstract close: "Upkeep sits inside the product story." Not, advice: "The company should show the clean in its videos."',
    '- headline: "The morning clean decides the purchase once the coffee is good". Not, a report of asking: "Buyers ask how long the clean takes before they buy". Not, a summary and a list: "Owners describe the drip tray, milk wand and descale". Not, a question: "Is the daily clean worth it". Not, the subject\'s name restated: "Cleaning and upkeep matter to owners". Not, the company\'s claim: "A decade of use, judged at the descale".',
  ].join('\n')

  const m = a.material
  const shown = m.conversations.filter((c) => c.notes.length > 0).slice(0, SUBJECT_READ_CONVERSATIONS)
  const blocks = shown.map((c, i) => [
    `C${i + 1}: "${c.label}"`,
    c.description ? `  Description: ${c.description}` : '',
    `  Kind of comment it mostly is: ${kindWord(c.kind)}`,
    `  What people said about ${name} in it, in paraphrase:\n${c.notes.map((n) => `  - ${n}`).join('\n')}`,
  ].filter(Boolean).join('\n'))
  const user = [
    `Company: ${co}`,
    `The month: ${readMonthPhrase(a.month, a.complete)}.`,
    `The subject: ${name}`,
    m.description ? `What it covers, in ${co}'s words: ${m.description}` : '',
    blocks.length ? `Conversations inside it this month, the most talked about first:\n${blocks.join('\n\n')}` : 'Conversations inside it this month: none of its own.',
    m.loose.length ? `Other things people said about ${name}, outside those conversations, in paraphrase:\n${m.loose.map((n) => `- ${n}`).join('\n')}` : '',
    companyLines(co, a.context, a.month, a.complete) || `About ${co}: nothing recorded beyond its name.`,
  ].filter(Boolean).join('\n\n')
  return { system, user }
}

/** The conversations a written read was handed (registry ids, its order). */
export const shownConversations = (m: SubjectReadMaterial): string[] =>
  m.conversations.filter((c) => c.notes.length > 0).slice(0, SUBJECT_READ_CONVERSATIONS).map((c) => c.themeId)

// ---- Scrub and compose ----------------------------------------------------------------

/** A comparison, which "what it means" never makes (the lead's ruling, 14
 *  Oct: "Össur's knees reach people through insurers as much as through
 *  clinics" compared two channels no note compared). Applied to the meaning
 *  paragraph only, on the sentence-drop rule: what people said may compare
 *  in their own terms. */
export const COMPARISON: readonly { name: string; re: RegExp }[] = [
  { name: 'comparison', re: /\bas\s+much\s+as\b|\bthan\b/i },
]

export interface SubjectReadScrub {
  /** Sentences dropped, whatever the reason. */
  dropped: number
  leaked: boolean
  /** The headline (v3): `kept` only where a ready read stores one; else
   *  `dropped` (the scrub, a refusal, a cap, or a held read). Absent where
   *  the writer wrote none (an answer from before v3). */
  headline?: 'kept' | 'dropped'
}

// ---- The headline's own refusals (the fix round, 16 Oct) --------------------------------
//
// The meaning's extras run on the headline too; these close what a one-line
// claim can do that a paragraph's sentence rules miss (the fresh check's
// probes). Each is narrow on purpose and tested both ways: every headline the
// real dry runs wrote (Össur and Sealand, 16 Oct) passes them all.

export type HeadlineRefusal = 'question' | 'name' | 'report' | 'person' | 'imperative' | 'forecast' | 'comparison' | 'direction'

/** Auxiliaries and modals: a headline that opens on one is a question. */
const QUESTION_AUX = new Set(['am', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'shall', 'has', 'have', 'had', 'may', 'might', 'must'])
/** Wh-words that open a headline only as a question ("Which bag fits"). */
const QUESTION_WH = new Set(['which', 'why', 'who', 'whose'])
/** Wh-words that also open a statement's clause ("How a bag carries…",
 *  "When the leg is fitted, …"): a question only where an auxiliary comes
 *  next, or one word and then an auxiliary, that word not the clause's own
 *  subject ("How long does…", "What size is…"; never "How it is made…"). */
const CLAUSE_WH = new Set(['what', 'how', 'when', 'where'])
const CLAUSE_SUBJECTS = new Set(['it', 'they', 'he', 'she', 'this', 'that', 'these', 'those', 'people', 'buyers', 'owners', 'users', 'someone', 'one', 'i', 'we', 'you'])
/** Verbs that open an instruction whatever follows ("Consider…", "Try…"). */
const ALWAYS_IMPERATIVE = new Set(['add', 'avoid', 'consider', 'create', 'ensure', 'explain', 'give', 'let', 'try'])
/** Verbs that are also nouns ("Build quality…", "Use in the rain…", "Focus
 *  falls on…"): an instruction only before an object, a particle or an -ing
 *  word ("Make the repair service easy to find", "Focus on the socket"). */
const OBJECT_IMPERATIVE = new Set(['answer', 'build', 'focus', 'highlight', 'keep', 'make', 'offer', 'show', 'start', 'stop', 'use'])
const IMPERATIVE_NEXT = /^(?:the|a|an|it|them|this|that|these|those|every|each|your|their|its|more|less|sure|buyers|people|owners|users|customers|on|with|up|out|how|what|why|where|when|which|\p{L}+ing)$/u

const HEADLINE_RULES: readonly { name: HeadlineRefusal; re: RegExp }[] = [
  // A report that people ask or talk, at the opening only (the headline round,
  // 16 Oct: five of nine opened "Buyers ask"). A backstop: the prompt asks for
  // what the talk shows. "Buyers take the socket's fit for granted" stands.
  { name: 'report', re: /^(?:buyers|people|customers|viewers|users)\s+(?:ask|asks|asked|asking|talk|talks|talked|talking|discuss|discusses|discussed|wonder|wonders|wondered)\b/iu },
  // "I", "me", "my", "you", "your"; "we", "our", "us" already drop (LOCAL_BANNED).
  { name: 'person', re: /(?<![\p{L}\p{N}])(?:I|[Mm]e|[Mm]y|[Mm]ine|[Yy]ou|[Yy]our|[Yy]ours|[Yy]ourself)(?![\p{L}\p{N}])/u },
  // "will" as a verb (never "the will to walk"), "won't", "set to" a change.
  { name: 'forecast', re: /(?<!\b(?:the|a|their|his|her|its|own|free|good|strong)\s)\bwill\b(?!\s+(?:to|power)\b)|\bwon['’]t\b|\b(?:is|are|was|were|seems?|looks?|appears?)\s+set\s+to\b|\bset\s+to\s+(?:be|become|continue|remain|stay|grow|rise|fall)\b/iu },
  // A superlative; one thing chosen "over" another (never "over a long day"
  // or "over time"); "prefer X to Y"; "ahead of" as a rank (never "ahead of a
  // flight"). "than" and "as much as" drop through `COMPARISON`.
  { name: 'comparison', re: /\bthe\s+(?:best|most|least|worst)\b/iu },
  { name: 'comparison', re: /\b(?:choose|chooses|chose|chosen|choosing|pick|picks|picked|picking|prefer|prefers|preferred|preferring|favou?r|favou?rs|favou?red|favou?ring|rank|ranks|ranked|rate|rates|rated|value|values|valued|win|wins|won)\b(?:\s+\S+){0,5}?\s+over\b(?!\s+(?:time|years|months|weeks|(?:a|the)\s+(?:long|full|whole|day|week|month|year|years|trip|journey|weekend)))/iu },
  { name: 'comparison', re: /\bprefer(?:s|red|ring)?\s+(?:\S+\s+){1,4}?to\s+(?:the|a|an|\p{Lu})/u },
  { name: 'comparison', re: /\b(?:is|are|was|were|sits?|sat|stays?|stayed|comes?|came|ranks?|ranked|puts?|placed?|places|well|far|just|way)\s+(?:\S+\s+){0,2}?ahead\s+of\b(?!\s+(?:travel|time|(?:a|the)\s+(?:trip|flight|journey|holiday|season|launch|fitting)))/iu },
  // A direction the word list does not hold.
  { name: 'direction', re: /\bincreasingly\b|\bdecreasingly\b/iu },
]

/** A headline's words, lower case, its edge punctuation off. */
const headlineWords = (s: string): string[] =>
  s.trim().split(/\s+/).map((w) => w.toLowerCase().replace(/^[^\p{L}\p{N}&]+|[^\p{L}\p{N}&]+$/gu, '')).filter(Boolean)

/** The headline's own refusals beyond the meaning's rules (v3, the fix round):
 *  a question (its question mark, an auxiliary first, or a wh-word that opens
 *  only a question), the subject's name alone ("&" read as "and", its words
 *  in any order), a report that people ask or talk ("Buyers ask…", the
 *  headline round), the first or second person, an instruction (a bare verb
 *  first), a forecast, a comparison or a direction word the list misses.
 *  Each leaves the read without a headline. Pure. */
export function headlineRefused(headline: string, subjectName: string): HeadlineRefusal | null {
  const h = headline.trim()
  if (/\?[\s"”’']*$/u.test(h)) return 'question'
  const words = headlineWords(h)
  const [w0 = '', w1 = '', w2 = ''] = words
  if (QUESTION_AUX.has(w0) && words.length > 1) return 'question'
  if (QUESTION_WH.has(w0)) return 'question'
  if (CLAUSE_WH.has(w0) && (QUESTION_AUX.has(w1) || (QUESTION_AUX.has(w2) && !CLAUSE_SUBJECTS.has(w1)))) return 'question'
  const nameSet = (xs: string[]) => [...new Set(xs.map((w) => (w === '&' ? 'and' : w)).filter((w) => w !== 'and'))].sort().join(' ')
  if (words.length > 0 && nameSet(words) === nameSet(headlineWords(subjectName))) return 'name'
  if (ALWAYS_IMPERATIVE.has(w0) || (OBJECT_IMPERATIVE.has(w0) && IMPERATIVE_NEXT.test(w1))) return 'imperative'
  for (const rule of HEADLINE_RULES) if (rule.re.test(h)) return rule.name
  return null
}

/** Words in a line, as the headline's cap counts them. Pure. */
const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length

/**
 * The writer's answer through the `week_read` policy (`scrubWeekText`: no
 * digit, no direction word, no sentence about how it was made, no first
 * person, ids stripped, dashes made commas, British spelling), with the week
 * read's implication rules on `means` (`ADVICE`, `FORECAST`, the company told
 * what to do), and on `means` alone a comparison (`COMPARISON`) and, in a
 * medical market (`medical`: `printsMedicalLine`, lib/post-ideas/medical.ts),
 * a medical claim (`MEDICAL_CLAIMS`, the post ideas' rules), each dropping
 * its sentence. `ready` where anything of what was said survives; `held`
 * otherwise.
 *
 * THE HEADLINE (v3) takes the meaning's finish whole (the same policy and
 * the same extras), as one line: the writer's first sentence only (a second
 * never stands in for a first the scrub dropped), its own refusals read on
 * the writer's words before the scrub touches them (`headlineRefused`: the
 * magnitude strip would take "most" out of "the most"), no full stop and no
 * trailing mark, and dropped whole rather than cut past
 * `SUBJECT_READ_MAX.headline` characters or `headlineWords` words, with no
 * slack. Whatever drops it, the read is stored without one; a thin, held or
 * failed read never has one. Pure.
 */
export function finishSubjectRead(m: SubjectReadMaterial, raw: SubjectReadOutput, o: { company: string; allow: readonly string[]; medical?: boolean }): { read: SubjectRead; scrub: SubjectReadScrub } {
  let dropped = 0
  let leaked = false
  const told = toldWhatToDo(o.company)
  // The meaning's extras: the headline is held to the same.
  const extra = [...ADVICE, ...FORECAST, ...(told ? [told] : []), ...COMPARISON, ...(o.medical ? MEDICAL_CLAIMS.map((r) => ({ name: r.name, re: r.re })) : [])]
  // A paragraph the writer broke with a blank line is two paragraphs.
  const paragraphs = (raw.saying ?? []).flatMap((p) => (p ?? '').split(/\n\s*\n/)).map((p) => p.trim()).filter(Boolean)
  const saying = paragraphs.flatMap((p) => {
    const r = scrubWeekText(p, Math.round(SUBJECT_READ_MAX.paragraph * WHOLE_SLACK), { allow: o.allow })
    dropped += r.counts.dropped
    leaked ||= r.counts.leaked
    return r.text ? [r.text] : []
  }).slice(0, SUBJECT_READ_MAX.sayingParagraphs)
  const meansR = scrubWeekText(raw.means ?? '', Math.round(SUBJECT_READ_MAX.means * WHOLE_SLACK), {
    allow: o.allow,
    maxSentences: SUBJECT_READ_MAX.meansSentences,
    extra,
  })
  dropped += meansR.counts.dropped
  leaked ||= meansR.counts.leaked
  const means = meansR.text
  const rawHeadline = (raw.headline ?? '').replace(/\s+/g, ' ').trim()
  let headline = ''
  if (rawHeadline) {
    // One line: its first sentence only, so a second never stands in for a
    // first the scrub dropped.
    const first = splitSentences(rawHeadline)[0] ?? ''
    if (headlineRefused(first, m.name)) {
      dropped += 1
      leaked = true
    } else {
      const r = scrubWeekText(first, SUBJECT_READ_MAX.headline, { allow: o.allow, maxSentences: 1, headline: true, whole: true, extra })
      dropped += r.counts.dropped
      leaked ||= r.counts.leaked
      const text = r.text.replace(/[\s.!:;,…]+$/u, '')
      if (text && wordCount(text) <= SUBJECT_READ_MAX.headlineWords && !headlineRefused(text, m.name)) headline = text
      else if (text) { dropped += 1; leaked = true }
    }
  }
  const ready = saying.length > 0
  const read: SubjectRead = {
    subjectId: m.subjectId,
    name: m.name,
    status: ready ? 'ready' : 'held',
    saying,
    means: ready ? means : '',
    ...(ready && headline ? { headline } : {}),
    basedOn: shownConversations(m),
    ...(ready ? {} : { reason: 'the scrub left nothing of what was said' }),
  }
  return { read, scrub: { dropped, leaked, ...(rawHeadline ? { headline: ready && headline ? 'kept' as const : 'dropped' as const } : {}) } }
}

/** "“A”", "“A” and “B”", "“A”, “B” and “C”". */
const andList = (xs: readonly string[]): string =>
  xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/**
 * A THIN subject's read, written by code (no call): where its talk sat this
 * month, by the pages' placement, or that it sat inside other conversations,
 * or, where none of its gated talk is left to name, that there is no read of
 * it yet, giving no reason (§0a: prose never says why it cannot say something;
 * the fresh check, 14 Oct). NEVER A CLAIM OF SILENCE (the lead's ruling, 14 Oct): the
 * level counts comments this line cannot see (demographic citations, makers'
 * and off-lane videos), so "said nothing" could sit under a level above 0.
 * Never a count, never a size word: the panel prints the level above it.
 * Through the same scrub. Pure.
 */
export function thinSubjectRead(m: SubjectReadMaterial, o: { month: string; complete: boolean; allow: readonly string[] }): SubjectRead {
  const when = o.complete ? `In ${longMonth(o.month)}` : `In ${longMonth(o.month)} so far`
  const names = m.conversations.slice(0, SUBJECT_READ_THIN_NAMES).map((c) => `“${c.label}”`)
  const line = names.length > 0
    ? `${when}, talk about ${m.name} sat in ${andList(names)}.`
    : m.heard
      ? `${when}, talk about ${m.name} sat inside other conversations, with none of its own.`
      : `No read of ${m.name} ${inMonth(o.month, o.complete)} yet.`
  const text = scrubWeekText(line, SUBJECT_READ_MAX.paragraph, { allow: o.allow }).text
  return {
    subjectId: m.subjectId,
    name: m.name,
    status: 'thin',
    saying: text ? [text] : [],
    means: '',
    basedOn: m.conversations.slice(0, SUBJECT_READ_THIN_NAMES).map((c) => c.themeId),
  }
}

/** The stored data of a set of reads. Pure. */
export function subjectReadsData(a: { month: string; read: { from: string; to: string }; subjects: SubjectRead[]; costUsd: number; error?: string }): SubjectReadsData {
  const any = a.subjects.some((s) => s.status === 'ready' || s.status === 'thin')
  return {
    version: 1,
    promptVersion: SUBJECT_READ_PROMPT_VERSION,
    month: a.month,
    read: a.read,
    status: any ? 'ready' : 'failed',
    model: SUBJECT_READ_MODEL,
    costUsd: Math.round(a.costUsd * 10_000) / 10_000,
    subjects: a.subjects,
    ...(a.error ? { error: a.error } : {}),
  }
}

// ---- The money ---------------------------------------------------------------------------

/** What is left of the per-run cap after this run's earlier subject-read
 *  calls. Pure. */
export const subjectReadsCapLeft = (readsSpent = 0): number => Math.max(0, SUBJECT_READS_BUDGET_USD - readsSpent)

/** May the step start: something left of its cap, and that plus the margin
 *  left under the run's budget? The post ideas' rule. Pure. */
export const subjectReadsHeadroom = (spent: number, budget = RUN_MODEL_BUDGET_USD, readsSpent = 0): boolean =>
  subjectReadsCapLeft(readsSpent) > 0 && budget - spent >= subjectReadsCapLeft(readsSpent) + SUBJECT_READS_RUN_MARGIN_USD

/** What the step's calls may spend between them. Pure. */
export const subjectReadsRoom = (spent: number, budget = RUN_MODEL_BUDGET_USD, readsSpent = 0): number =>
  Math.max(0, Math.min(subjectReadsCapLeft(readsSpent), budget - SUBJECT_READS_RUN_MARGIN_USD - spent))

/** One attempt's worst case: the prompt counted at two characters a token,
 *  and the whole output ceiling. Pure. */
export function subjectReadAttemptMaxUsd(prompts: { system: string; user: string }): number {
  return estimateCost(SUBJECT_READ_MODEL, Math.ceil((prompts.system.length + prompts.user.length) / 2), SUBJECT_READ_MAX_OUTPUT_TOKENS)
}

/**
 * The step's money across calls in flight together: an attempt starts only
 * where what is spent, plus every started attempt's worst case not yet
 * settled, plus its own worst case, fits `room`; when it returns, its worst
 * case gives way to what it cost. Mutable, one per step.
 */
export class SpendGate {
  private spentUsd = 0
  private held = 0
  constructor(readonly room: number) {}
  /** Hold an attempt's worst case, or refuse it (false). */
  reserve(worst: number): boolean {
    if (this.spentUsd + this.held + worst > this.room + 1e-9) return false
    this.held += worst
    return true
  }
  /** The attempt returned (or failed) having cost `actual`. */
  settle(worst: number, actual: number): void {
    this.held = Math.max(0, this.held - worst)
    this.spentUsd += actual
  }
  get spent(): number { return this.spentUsd }
}
