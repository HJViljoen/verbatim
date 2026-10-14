import { z } from 'zod'

import { estimateCost, RUN_MODEL_BUDGET_USD, SUBJECT_READS_BUDGET_USD, SUBJECT_READS_RUN_MARGIN_USD, SYNTHESIS_MODEL, SYNTHESIS_REASONING_EFFORT } from '../config'
import { longMonth } from '../format'
import { WHAT_THEY_SELL } from '../pages/market-frame'
import { placeSubject, type SubjectPlacement } from '../pages/subject-place'
import { CALIBRATED_PROSE_RULE, noDirectionRule } from '../pipeline/prose-rules'
import { allowTokens } from '../prose/scrub'
import { noDashes } from '../reports/documents/scrub'
import { companyLines, type CompanyContext } from './company'
import { judge, type DatedEvidence } from './evidence'
import { notesOf, POOL_MIN_VIDEOS } from './pool'
import { ADVICE, FORECAST, scrubWeekText, toldWhatToDo, WHOLE_SLACK } from './scrub'
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
// means for the company. Written for READY subjects only (ruling U6: every
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
export const SUBJECT_READ_PROMPT_VERSION = 'subject_read_v1' as const
/** The written read's model (`WEEK_READ_MODEL`), at its effort. */
export const SUBJECT_READ_MODEL = SYNTHESIS_MODEL
export const SUBJECT_READ_EFFORT = SYNTHESIS_REASONING_EFFORT
/** The output ceiling of one attempt, reasoning included: a read is about four
 *  hundred words of answer, and medium effort reasons for a few thousand
 *  tokens before it. */
export const SUBJECT_READ_MAX_OUTPUT_TOKENS = 6_000

/** Field caps, in characters, and the counts. The writer is told each; scrub
 *  holds it to each with the week read's slack (`WHOLE_SLACK`), by whole
 *  sentences, so a sentence a little over is kept and none prints half said
 *  (the offline test of 14 Oct lost the second, more specific sentence of a
 *  "what it means" at the bare cap). */
export const SUBJECT_READ_MAX = {
  paragraph: 560,
  sayingParagraphs: 2,
  means: 420,
  meansSentences: 3,
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

/** What the writer returns. */
export interface SubjectReadOutput {
  saying: string[]
  means: string
}

export function subjectReadSchema() {
  return z.object({
    saying: z.array(z.string()).describe(`What people said about the subject this month, as one account in one or two short paragraphs (at most ${SUBJECT_READ_MAX.sayingParagraphs}), each under ${SUBJECT_READ_MAX.paragraph} characters, in plain words and the analytical third person. No placeholder, no quotation marks.`),
    means: z.string().describe(`What it means for the company: one short paragraph of at most ${SUBJECT_READ_MAX.meansSentences} sentences, under ${SUBJECT_READ_MAX.means} characters. Intelligence, never an instruction or a forecast.`),
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

/** The writer's two messages for one subject. Pure. */
export function buildSubjectReadPrompts(a: SubjectReadPromptArgs): { system: string; user: string } {
  const co = a.company
  const sells = WHAT_THEY_SELL[a.clientId]
  const what = sells ? `${sells} like ${co}'s` : `what ${co} sells`
  const name = a.material.name
  const system = [
    `You are the consumer researcher at ${co}. ${co} follows a subject in its market, and you write the short read at the top of that subject's page: what people in the market said about it this month, and what that means for ${co}. The market is the people worldwide buying and talking about ${what}, not only ${co}'s own customers. It is read on a phone, in under a minute.`,
    '',
    'What you are given, in the user message:',
    `- The subject: its name, and what it covers in ${co}'s own words.`,
    '- The conversations inside it this month (C1, C2 and so on), the most talked about first: each with its label and description, the kind of comment it mostly is, and paraphrases of what people said about the subject in it. The paraphrases are notes, not quotations: never put them in quotation marks and never present them as anyone\'s words.',
    '- Other things people said about the subject outside those conversations, in paraphrase, where there are any.',
    `- About ${co}: what it sells, what it says about itself in its own videos (its claims, in paraphrase) and whether it posted. This is ${co}'s own voice, not the market's: never present it as anything buyers said.`,
    '',
    'What you write:',
    `1. saying: what people said about ${name} this month, in one or two short paragraphs (at most ${SUBJECT_READ_MAX.sayingParagraphs}). Tell it as ONE account: what the talk was about, the concrete things people name and how they put it, and how the conversations connect (one worry seen from two sides, one cause behind two complaints, the same people at the same moment). Name a conversation in plain words where it helps the reader. Never one sentence per conversation in turn, never a list in prose ("First… Second…"). Every sentence must come from the conversations and notes given, and from nothing else.`,
    `2. means: what it means for ${co}, one short paragraph of at most ${SUBJECT_READ_MAX.meansSentences} sentences, about ${co} in particular, never about the category in general. Connect what people said to what ${co} sells and to what it says about itself (under About ${co}): where the talk bears on one of ${co}'s claims or products, name it and say what the talk means for it, in the market's terms. Where it bears on none, say what it means for a company that sells ${what}. A line that would be as true of any rival is not about ${co}: make it specific.`,
    `  - Intelligence, not instructions: say what is true about the business, never what ${co} should do. Never "should", "could", "needs to", "must", "consider", "make sure", "an opportunity", and never an imperative. Never a forecast ("will", "likely", "set to").`,
    `  - ${co}'s claims are its own words, not evidence about the market. Never say how a claim was received or whether buyers believe it unless a note says so, and never say the market ignores, overlooks or does not mention something: the notes are not everything people said.`,
    '',
    'House style:',
    `- Plain language, for a busy person at ${co} reading on a phone. Short sentences. Concrete nouns: the thing people name, in the market's own words. No consultant abstractions: never "a fit problem", "legible", "positioning", "lens", "value proposition", "use case", "resonates", "narrative", "friction", "ecosystem", "landscape", "journey". Name the thing instead.`,
    '- Literal words, never an idiom or a figure of speech.',
    `- A research report, not a memo: the analytical third person ("people describe", "users ask", "${co} is compared"), claims rather than hedges. Never "we", "our", "us" or "you"; never address the reader. No headings, no bullet points, no exclamation marks.`,
    '- Name products, brands and conversations plainly. Never name a person or an account.',
    '- The market only. Never mention how anything was found, gathered, collected, searched, read, counted or checked. Never mention data, sources, samples, coverage, searches, updates, platforms, this service, a tool, a model, AI or Verbatim, and never write "this read", "this report" or "this page". Never explain why something is not said or cannot be compared: if something cannot be said, leave it out. A sentence that does any of this is deleted before anyone reads it.',
    '- Never say how big the subject or a conversation is, or how it ranks ("the main worry", "the biggest", "most people", "more than"): code prints the counts beside your words.',
    '- You have NO numbers. Never type a digit: not in a date, a size, an age or a product name. A sentence with a digit is deleted.',
    noDashes(CALIBRATED_PROSE_RULE.split('\n')[0]),
    '- Never write an id (C2) in prose.',
    noDashes(noDirectionRule('week_read')),
    `- The rule above is a word list, and it deletes a sentence for these words even where they describe a thing rather than a movement ("lower limb", "a flat surface", "a drop foot", "climbing stairs"): ${DELETED_WORDS.join(', ')}. Say it another way ("below the knee", "even ground", "a foot that drags", "going up stairs").`,
    '- Never a medical or clinical claim: never say what a product, a treatment or a habit does to the body or to health, never that something heals, treats, cures, prevents, relieves or causes pain, a sore, an infection or a condition, never that something is safe or unsafe, and never that doctors or clinicians recommend something. Say what people say about it.',
    '- No dashes between clauses (no em dash, no en dash, no spaced hyphen); use a comma, a colon or a full stop. British spelling.',
    '',
    'An example of the register, for a different company and market (coffee machines, the subject "Cleaning and upkeep"); do not reuse its content:',
    '- saying: "Owners described the daily clean in detail: the drip tray, the milk wand, and how often the machine asks to be descaled. Those who need a brush or a tablet every week complained about it, even when they liked the coffee.\\n\\nBuyers asked about the clean before they asked about the taste, and owners answered them with the routine they keep each morning."',
    '- means: "The company sells its machines on a decade of use. Owners judge that decade by the clean it asks of them each morning, so the upkeep is where the promise is tested." Not, true of any rival: "Machines are judged on upkeep." Not, advice: "The company should show the clean in its videos."',
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

export interface SubjectReadScrub {
  /** Sentences dropped, whatever the reason. */
  dropped: number
  leaked: boolean
}

/** A sentence's end before any capital, "Össur" included: the shared
 *  splitter (`splitSentences`, lib/prose/scrub.ts) starts a sentence only at an
 *  ASCII capital, so to it "… insurers. Össur's knees …" is ONE sentence, and
 *  a rule that drops one drops both. */
const SENTENCE_END = /(?<=[.!?])\s+(?=[\p{Lu}\[“"])/u

/** One paragraph through `scrubWeekText`, a sentence at a time (each handed
 *  over as its own paragraph, so no sentence takes its neighbour with it),
 *  then put back together, capped at `max` by WHOLE sentences: a claim never
 *  prints half said (the first is kept whatever its length). Pure. */
function scrubBySentence(raw: string, max: number, o: Parameters<typeof scrubWeekText>[2]): ReturnType<typeof scrubWeekText> {
  const sentences = (raw ?? '').replace(/\s+/g, ' ').trim().split(SENTENCE_END).filter(Boolean)
  const r = scrubWeekText(sentences.join('\n\n'), Number.MAX_SAFE_INTEGER, o)
  const kept: string[] = []
  let used = 0
  for (const s of r.text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)) {
    if (kept.length > 0 && used + 1 + s.length > max) break
    kept.push(s)
    used += (kept.length > 1 ? 1 : 0) + s.length
  }
  return { ...r, text: kept.join(' ') }
}

/**
 * The writer's answer through the `week_read` policy (`scrubWeekText`: no
 * digit, no direction word, no sentence about how it was made, no first
 * person, ids stripped, dashes made commas, British spelling), with the week
 * read's implication rules on `means` (`ADVICE`, `FORECAST`, the company told
 * what to do). `ready` where anything of what was said survives; `held`
 * otherwise. Pure.
 */
export function finishSubjectRead(m: SubjectReadMaterial, raw: SubjectReadOutput, o: { company: string; allow: readonly string[] }): { read: SubjectRead; scrub: SubjectReadScrub } {
  let dropped = 0
  let leaked = false
  const told = toldWhatToDo(o.company)
  // A paragraph the writer broke with a blank line is two paragraphs.
  const paragraphs = (raw.saying ?? []).flatMap((p) => (p ?? '').split(/\n\s*\n/)).map((p) => p.trim()).filter(Boolean)
  const saying = paragraphs.flatMap((p) => {
    const r = scrubBySentence(p, Math.round(SUBJECT_READ_MAX.paragraph * WHOLE_SLACK), { allow: o.allow })
    dropped += r.counts.dropped
    leaked ||= r.counts.leaked
    return r.text ? [r.text] : []
  }).slice(0, SUBJECT_READ_MAX.sayingParagraphs)
  const meansR = scrubBySentence(raw.means ?? '', Math.round(SUBJECT_READ_MAX.means * WHOLE_SLACK), { allow: o.allow, maxSentences: SUBJECT_READ_MAX.meansSentences, extra: [...ADVICE, ...FORECAST, ...(told ? [told] : [])] })
  dropped += meansR.counts.dropped
  leaked ||= meansR.counts.leaked
  const means = meansR.text
  const read: SubjectRead = {
    subjectId: m.subjectId,
    name: m.name,
    status: saying.length > 0 ? 'ready' : 'held',
    saying,
    means: saying.length > 0 ? means : '',
    basedOn: shownConversations(m),
    ...(saying.length > 0 ? {} : { reason: 'the scrub left nothing of what was said' }),
  }
  return { read, scrub: { dropped, leaked } }
}

/** "“A”", "“A” and “B”", "“A”, “B” and “C”". */
const andList = (xs: readonly string[]): string =>
  xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/**
 * A THIN subject's read, written by code (no call): where its talk sat this
 * month, by the pages' placement, or that it sat inside other conversations,
 * or that the comments said nothing of it. Never a count, never a size word:
 * the panel prints the level above it. Through the same scrub. Pure.
 */
export function thinSubjectRead(m: SubjectReadMaterial, o: { month: string; complete: boolean; allow: readonly string[] }): SubjectRead {
  const when = o.complete ? `In ${longMonth(o.month)}` : `In ${longMonth(o.month)} so far`
  const names = m.conversations.slice(0, SUBJECT_READ_THIN_NAMES).map((c) => `“${c.label}”`)
  const line = names.length > 0
    ? `${when}, talk about ${m.name} sat in ${andList(names)}.`
    : m.heard
      ? `${when}, talk about ${m.name} sat inside other conversations, with none of its own.`
      : `${when}, the comments said nothing about ${m.name}.`
  const text = scrubBySentence(line, SUBJECT_READ_MAX.paragraph, { allow: o.allow }).text
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
