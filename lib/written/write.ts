import { z } from 'zod'

import { DIRECTION_WORDS, FRAMED } from '../calibration'
import { fmtInt, longMonth } from '../format'
import { WHAT_THEY_SELL } from '../pages/market-frame'
import { CALIBRATED_PROSE_RULE, noDirectionRule } from '../pipeline/prose-rules'
import { noDashes } from '../reports/documents/scrub'
import type { FigureTable } from '../reports/types'
import { standsAlone } from './sure'
import { DEPARTMENTS, type Department, type PoolCandidate, type StandingFact, type WeekPool } from './types'

// The written read's prompt and schema (plan "writing back", T3). Pure.
//
// ONE CALL WRITES THE WEEK. The model is the company's consumer researcher,
// writing the week's read for everyone at the company. It sees what code
// selected (the pool's candidates and the tracked subjects), in WORDS: labels,
// Pass B descriptions, kinds, departments, subject names, the isNew flag and
// Pass A's paraphrases of what people said. Never a comment's text, never a
// figure's value (a figure is a `[[key]]` from the table below), never a
// verdict or a direction. Code decides everything else after it answers:
// which findings exist and in what order, every number, the quote, the
// context line, the confidence marker (lib/written/compose.ts).
//
// THE HOUSE STYLE IS THE DOCUMENT WRITER'S (lib/reports/documents/write.ts),
// pointed at a different reader: analytical third person, a headline is a
// claim, intelligence not advice, no digits, no dashes, no intensity words.
// And §0a, which the document writer never had to say: the market only,
// nothing about how anything was found, and never why something is not said.

export const WEEK_READ_PASS = 'week_read'
export const WEEK_READ_PROMPT_VERSION = 'week_read_v1' as const

/** Field caps, in characters (plan T3's schema). `inShortSentences` is the
 *  In short's sentence cap; its character cap is a backstop. */
export const WEEK_READ_MAX = {
  inShort: 600,
  inShortSentences: 3,
  headline: 90,
  saw: 700,
  means: 400,
  for: 220,
  standing: 200,
} as const

/** The most findings a week asks for; compose caps what prints at the same. */
export const WEEK_FINDINGS_MAX = 4

/** What the writer returns (the strict schema's shape). */
export interface WeekReadOutput {
  in_short: string
  findings: {
    headline: string
    saw: string
    means: string
    for: Record<Department, string>
    based_on: string[]
    quote_from: string | null
  }[]
  standing: { subject_id: string; sentence: string }[]
}

/**
 * The strict schema, in thinking order: the findings first (the evidence is
 * read before it is summed up), then the In short that sums them, then the
 * subjects. Every field is REQUIRED (OpenAI's strict mode): a department with
 * nothing true to say is '' and a finding with no voice to quote is null.
 */
export function weekReadSchema() {
  const line = (who: string) =>
    z.string().describe(`What this finding means for ${who}, in at most two short sentences, under ${WEEK_READ_MAX.for} characters. What it means, never what to do. "" when it tells them nothing true.`)
  return z.object({
    findings: z.array(z.object({
      headline: z.string().describe(`The finding as a claim about the market or the buyer, never a topic and never an instruction. Under ${WEEK_READ_MAX.headline} characters, no full stop, no placeholder.`),
      saw: z.string().describe(`What people said this week, in the analytical third person, in one or two short paragraphs (a blank line between them). Under ${WEEK_READ_MAX.saw} characters.`),
      means: z.string().describe(`What it means in this market and why it matters: intelligence, not advice. Under ${WEEK_READ_MAX.means} characters. No placeholder.`),
      for: z.object({
        sales: line('sales, the people who talk to buyers'),
        marketing: line('marketing, the people who shape the message'),
        content: line('content, the people who make the videos and posts'),
        leadership: line('leadership, the people who decide'),
      }),
      based_on: z.array(z.string()).describe('The candidate ids this finding rests on, e.g. ["C2", "C5"]. At least one.'),
      quote_from: z.string().nullable().describe('The one cited candidate whose voices best carry the finding (the product attaches a real quote from it), or null.'),
    })).describe(`Three or four findings when the week carries them, fewer when it does not. At most ${WEEK_FINDINGS_MAX}.`),
    in_short: z.string().describe(`The week's read in at most ${WEEK_READ_MAX.inShortSentences} sentences: what the findings add up to, not a list of them. No placeholder.`),
    standing: z.array(z.object({
      subject_id: z.string().describe('The subject id as listed, e.g. "S3".'),
      sentence: z.string().describe(`One sentence on what the market says about this subject this month, under ${WEEK_READ_MAX.standing} characters. Never its size, its rank, a change or a comparison. No placeholder.`),
    })).describe('One entry per listed subject whose material says something; leave the others out.'),
  })
}

// ---- The figure table the writer may cite ------------------------------------------------

/** A candidate's figure keys: its week and its month to date. */
export const candidateKeys = (c: Pick<PoolCandidate, 'id'>) => ({ week: `${c.id.toLowerCase()}_week`, month: `${c.id.toLowerCase()}_month` })

/**
 * The figures the writer may cite, as keys with labels (it never sees a
 * value): each candidate's videos this week and in the month so far, on the
 * category, where the theme is counted. Compose adds its own lines' keys to
 * the stored table; these stay in it, so a key the writer cited resolves.
 */
export function writerFigures(pool: Pick<WeekPool, 'month' | 'candidates'>): FigureTable {
  const month = longMonth(pool.month)
  const out: FigureTable = {}
  for (const c of pool.candidates) {
    const k = candidateKeys(c)
    out[k.week] = { label: `videos this week in which people talked about "${c.label}"`, value: fmtInt(c.weekVideos), kind: 'count' }
    out[k.month] = { label: `videos in ${month} so far in which people talked about "${c.label}"`, value: fmtInt(c.monthK), kind: 'count' }
  }
  return out
}

// ---- The prompt ------------------------------------------------------------------------------

/** A subject as the writer is shown it: a short handle, never the id. */
export interface WriterSubject {
  handle: string
  fact: StandingFact
}

/** The subjects the writer is asked about: every one with material (its
 *  themes or notes this month). A failed subject is the name only and is not
 *  shown; a subject with nothing said about it has nothing to be written. */
export function writerSubjects(standing: readonly StandingFact[]): WriterSubject[] {
  return standing
    .filter((f) => f.calibration !== 'failed' && (f.contents.length > 0 || f.notes.length > 0))
    .map((fact, i) => ({ handle: `S${i + 1}`, fact }))
}

export interface WeekWriterArgs {
  company: string
  /** The client, for the product's own words on what it sells
   *  (`WHAT_THEY_SELL`, lib/pages/market-frame.ts); the pool's where absent. */
  clientId?: string
  pool: WeekPool
  standing: readonly StandingFact[]
  /** Last week's read's headlines, or null where there was none. */
  previous: { headlines: string[] } | null
  /** The table the writer may cite (`writerFigures`). */
  figures: FigureTable
}

/** The rank's words for the writer (the standing line's own). */
const RANK = ['biggest', 'second biggest', 'third biggest', 'fourth biggest', 'fifth biggest', 'sixth biggest', 'seventh biggest', 'eighth biggest', 'ninth biggest', 'tenth biggest']

/** The words the direction rule deletes a sentence for, as the prompt lists
 *  them: every entry but the three that only count in a frame. Generated from
 *  the scrubber's own list, so the prompt cannot promise a word nothing
 *  deletes, or miss one it does. */
export const DELETED_WORDS: readonly string[] = DIRECTION_WORDS.filter((w) => !FRAMED.has(w))

const deptLens = (c: PoolCandidate): Department[] => DEPARTMENTS.filter((d) => c.lenses.includes(d))

const KIND_WORDS: Readonly<Record<string, string>> = {
  praise: 'praise',
  objection: 'objections',
  pain_point: 'problems',
  question: 'questions',
  purchase_intent: 'intent to buy',
  feature_request: 'requests',
  buying_trigger: 'reasons to buy now',
  switching_signal: 'switching',
  demographic_signal: 'who is buying',
  misinformation: 'misunderstandings',
}
const kindWord = (k: string) => KIND_WORDS[k] ?? k.replace(/_/g, ' ')

export function buildWeekReadPrompts(a: WeekWriterArgs): { system: string; user: string; subjects: WriterSubject[] } {
  const month = longMonth(a.pool.month)
  const subjects = writerSubjects(a.standing)
  // The front page's own words for what the market is (market-frame.ts): the
  // people worldwide buying and talking about what the company sells, not
  // only its customers.
  const sells = WHAT_THEY_SELL[a.clientId ?? a.pool.clientId]
  const what = sells ? `${sells} like ${a.company}'s` : `what ${a.company} sells`
  const system = [
    `You are the consumer researcher at ${a.company}. Every week you write the week's read of ${a.company}'s market for everyone at ${a.company}: what people in the market said this week, and what it means. The market is the people worldwide buying and talking about ${what}, not only ${a.company}'s own customers. Sales, marketing, content and leadership each read it in their inbox, on a phone, in about three minutes.`,
    '',
    'What you are given, in the user message:',
    '- The week\'s candidates (C1, C2 and so on), best evidenced first: themes the market talked about this week. Each has its label and description, the kinds of comment behind it (praise, objections, questions and so on) and the kind most of them were, the departments it speaks to, the subject it is part of where it is one, whether it was first heard this month, and paraphrases of what people said. The paraphrases are notes, not quotations: never put them in quotation marks and never present them as anyone\'s words.',
    `- The subjects ${a.company} follows (S1, S2 and so on), with the themes inside each this month and paraphrases of what people said about it.`,
    '- Last week\'s headlines, where there was a read last week.',
    '',
    'What you write:',
    `- findings: three or four when the week carries them, fewer when it does not, never more than ${WEEK_FINDINGS_MAX}. Never stretch a thin candidate into a finding. A finding is a claim about the market that one or more candidates support: cite them in based_on. Every sentence in a finding must be traceable to the labels, descriptions and notes of the candidates it cites, and to nothing else. Two findings never rest on the same evidence: merge them. Each candidate says whether its evidence can carry a finding alone; one that cannot may still support a finding beside another candidate that makes the same point, and never beside one that makes a different point just to reach the line. Order does not matter; code orders the findings by the evidence behind them.`,
    '  - headline: a claim about the market or the buyer ("Buyers judge a travel pack by how it opens at security"), never a topic ("Airport security") and never an instruction ("Show the opening").',
    '  - saw: what people said this week, developed rather than listed.',
    '  - means: why it matters in this market, read across the evidence. Intelligence, not advice.',
    '  - for: one line per department on what the finding means for it, at most two short sentences. What it means, never what to do: no instructions, no "should". Leave a department "" when the finding tells it nothing true; an empty line is better than a stretched one. The candidates\' departments are a guide, not a rule; leadership reads every finding and is written for when the finding matters to the business.',
    '  - quote_from: the one cited candidate whose voices best carry the finding. Code prints a real quote from it beside the finding, of the kind most of its comments were, so pick the candidate whose kind matches what the finding says.',
    '- in_short: the week in at most three sentences: what the findings add up to. Never a list of them.',
    '- standing: for each listed subject, one sentence on what the market says about it this month, from its themes and notes. Leave out a subject whose material says nothing. Never its size, its rank, a change or a comparison: code prints those beside your sentence.',
    '',
    'House style:',
    '- A research read, not a memo: the analytical third person ("buyers describe", "owners report", "the conversation turns on"), plain English. Never "we", "our", "us" or "you"; never address the reader. No headings, no bullet points inside a field, no exclamation marks, no greeting, no sign-off.',
    '- Name products, brands and themes plainly. Never name a person or an account.',
    '- The market only. Never mention how anything was found, gathered, collected, searched, read, counted or checked. Never mention data, sources, samples, coverage, searches, updates, platforms, this service, a tool, a model, AI or Verbatim, and never write "this read", "this report" or "this brief". Never explain why something is not said or cannot be compared: if something cannot be said, leave it out. A sentence that does any of this is deleted before anyone reads it.',
    '- Never say how big a theme is or how it ranks against another ("the main complaint", "the top concern", "more than"): code orders the findings and prints their counts.',
    '- You have NO numbers. Never type a digit: not in a date, a size, a capacity or a product name ("the larger Allpa", not "the Allpa 35L"). Where a count is the point, write its placeholder exactly as listed under Figures, e.g. "[[c2_week]] videos"; only in saw, at most one in a finding, and most findings need none, because code prints each finding\'s counts beside it. A placeholder means exactly what its label says. A placeholder anywhere but saw deletes its sentence.',
    // The intensity half of the shared rule; its second line is about Pass
    // handles and a field this schema does not have, so the ids line below
    // says the same thing for this call's own handles.
    noDashes(CALIBRATED_PROSE_RULE.split('\n')[0]),
    '- Never write an id (C2, S1) in prose; ids belong only in based_on, quote_from and subject_id.',
    noDashes(noDirectionRule('week_read')),
    `- The rule above is a word list, and it deletes a sentence for these words even where they describe a product rather than a movement ("lower back", "a flat base", "a double zip", "a drop test", "the gains of a hip belt"): ${DELETED_WORDS.join(', ')}. Say it another way ("the small of the back", "a base that stands", "two zips").`,
    '- "New": code marks a finding first heard this month. Do not write "new" about a theme, a subject or a concern.',
    a.previous ? '- Continuity: last week\'s headlines are listed. Where a finding carries one of them still, you may say the concern continues; that is not a claim that anything moved, so never say it is more or less than last week and never compare the two weeks.' : null,
    '- No dashes between clauses (no em dash, no en dash, no spaced hyphen); use a comma, a colon or a full stop.',
    '',
    'Example of the register (a different company and market; do not reuse its content): headline "Comfort is the test long-term users put every claim to"; saw "Long-term users judge a device by whether it can be worn through a whole day. They describe fit changing by evening, sweat and sores, and the sock changes that decide whether a device stays on.\\n\\nThe adjustable socket drew requests by name, the one component people asked for rather than about."; means "Comfort is not a feature in this market but the test every claim is put to: a buyer who has lived with a poor socket hears a performance claim as a promise about the afternoon."; for.sales "Fit through the day is the buyer\'s own measure, and the question that opens the conversation."; for.content "".',
  ].filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n')

  const figureLines = Object.entries(a.figures).map(([k, f]) => `- [[${k}]]: ${f.label}`)

  const candidates = a.pool.candidates.map((c) => {
    const subject = c.subjectId ? a.standing.find((f) => f.subjectId === c.subjectId)?.name ?? null : null
    const kinds = c.kinds.length
      ? c.kinds.map((k) => (k === c.dominantKind ? `${kindWord(k)} (most)` : kindWord(k))).join(', ')
      : c.dominantKind ? `${kindWord(c.dominantKind)} (most)` : 'not recorded'
    const depts = deptLens(c)
    return [
      `${c.id}: "${c.label}"`,
      c.description ? `  Description: ${c.description}` : '',
      `  Kinds of comment: ${kinds}`,
      `  Speaks to: ${depts.length ? depts.join(', ') : 'leadership'}`,
      `  Evidence: ${standsAlone(c) ? 'enough to carry a finding alone' : 'too little to carry a finding alone'}`,
      subject ? `  Part of the subject: ${subject}` : '',
      c.isNew ? '  First heard this month: yes' : '',
      c.notes.length ? `  What people said, in paraphrase:\n${c.notes.map((n) => `  - ${n}`).join('\n')}` : '',
    ].filter(Boolean).join('\n')
  })

  const subjectLines = subjects.map(({ handle, fact }) => {
    const rank = fact.calibration === 'ready' && fact.rank >= 1 && fact.rank <= RANK.length ? ` (the ${RANK[fact.rank - 1]} subject in the market this month)` : ''
    return [
      `${handle}: ${fact.name}${rank}`,
      fact.contents.length ? `  Themes inside it this month: ${fact.contents.map((t) => `"${t}"`).join(', ')}` : '',
      fact.notes.length ? `  What people said, in paraphrase:\n${fact.notes.map((n) => `  - ${n}`).join('\n')}` : '',
    ].filter(Boolean).join('\n')
  })

  const user = [
    `Company: ${a.company}`,
    `The week: the latest seven days, in ${month}.`,
    a.previous && a.previous.headlines.length
      ? `Last week's headlines:\n${a.previous.headlines.map((h) => `- ${h}`).join('\n')}`
      : 'Last week: no read.',
    figureLines.length ? `Figures (placeholders; you do not know their values):\n${figureLines.join('\n')}` : 'Figures: none.',
    `Candidates:\n${candidates.join('\n\n') || '- none'}`,
    subjectLines.length ? `Subjects ${a.company} follows:\n${subjectLines.join('\n\n')}` : `Subjects ${a.company} follows: none with anything said this month.`,
  ].join('\n\n')
  return { system, user, subjects }
}
