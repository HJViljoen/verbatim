import { z } from 'zod'

import { DIRECTION_WORDS, FRAMED } from '../calibration'
import { fmtInt, longMonth } from '../format'
import { WHAT_THEY_SELL } from '../pages/market-frame'
import { CALIBRATED_PROSE_RULE, noDirectionRule } from '../pipeline/prose-rules'
import { noDashes } from '../reports/documents/scrub'
import type { FigureTable } from '../reports/types'
import { standsAlone } from './sure'
import { firstHeardThisWeek, type PoolCandidate, type StandingFact, type WeekPool } from './types'

// The written read's prompt and schema (plan "writing back", T3; v3 30 Sep).
// Pure.
//
// ONE CALL WRITES THE WEEK. The model is the company's consumer researcher,
// writing the week's report for everyone at the company. It sees what code
// selected (the pool's candidates and the tracked subjects), in WORDS: labels,
// Pass B descriptions, kinds, subject names, whether a theme was first heard
// this week, and Pass A's paraphrases of what people said. Never a comment's
// text, never a figure's value (a figure is a `[[key]]` from the table below),
// never a verdict or a direction. Code decides everything else after it
// answers: which findings and report lines print and in what order, every
// number, every quote, the context lines, the confidence marker
// (lib/written/compose.ts).
//
// V3 IS A REPORT (Heinrich, 30 Sep: "I don't feel like it is really a report.
// I think it's just four things from the Your market page … put into easy to
// read on the phone format"). One call writes both halves:
//  · the findings, as before but with no department lines (the weekly is one
//    general report; department reading lives in the monthly briefs): the
//    This week page lists them and the Dashboard tile names them;
//  · the report on top of them: the week in one line; what happened, two or
//    three paragraphs telling the week as ONE story, pointing to at most two
//    voices; what it means for the company, two or three implications that
//    are intelligence, not instructions; conversations first heard this week,
//    only from candidates code marks so; and one or two open questions worth
//    watching, never a forecast.
// The findings come first in the schema (the thinking order: the evidence is
// read and split into ideas before the story is told), the one line last but
// the subjects.
//
// THE HOUSE STYLE IS THE DOCUMENT WRITER'S (lib/reports/documents/write.ts),
// pointed at a different reader: analytical third person, a headline is a
// claim, intelligence not advice, no digits, no dashes, no intensity words.
// And §0a, which the document writer never had to say: the market only,
// nothing about how anything was found, and never why something is not said.

export const WEEK_READ_PASS = 'week_read'
export const WEEK_READ_PROMPT_VERSION = 'week_read_v3' as const

/** Field caps, in characters, and the report's counts. Compose and scrub hold
 *  the writer to every one. */
export const WEEK_READ_MAX = {
  weekLine: 160,
  headline: 90,
  saw: 700,
  means: 400,
  paragraph: 560,
  storyParagraphs: 3,
  storyQuotes: 2,
  implication: 260,
  implicationSentences: 2,
  implications: 3,
  newItem: 240,
  newItems: 3,
  watch: 170,
  watchItems: 2,
  standing: 200,
} as const

/** The most findings a week asks for; compose caps what prints at the same. */
export const WEEK_FINDINGS_MAX = 4

/** What the writer returns (the strict schema's shape). */
export interface WeekReadOutput {
  findings: {
    headline: string
    saw: string
    means: string
    based_on: string[]
    quote_from: string | null
  }[]
  story: { paragraph: string; based_on: string[]; quote_from: string | null }[]
  implications: { implication: string; based_on: string[] }[]
  new_this_week: { candidate: string; sentence: string }[]
  watch: { question: string; based_on: string[] }[]
  week_in_one_line: string
  standing: { subject_id: string; sentence: string }[]
}

const basedOn = (what: string) =>
  z.array(z.string()).describe(`The candidate ids ${what} rests on, e.g. ["C2", "C5"]. At least one.`)

/**
 * The strict schema, in thinking order: the findings first (the evidence is
 * read and split into ideas before anything is summed up), then the story told
 * from them, what it means, what was first heard, what to watch, the one line
 * that sums it all, then the subjects. Every field is REQUIRED (OpenAI's strict
 * mode): a list with nothing true in it is empty, and a line with no voice to
 * quote has quote_from null.
 */
export function weekReadSchema() {
  return z.object({
    findings: z.array(z.object({
      headline: z.string().describe(`One claim about the market or the buyer, no broader than the cited candidates show; never a topic and never an instruction. Plain words, under ${WEEK_READ_MAX.headline} characters, no full stop, no placeholder.`),
      saw: z.string().describe(`What people said this week about this one idea: the things they name and how they put it, in plain words and the analytical third person, in one or two short paragraphs (a blank line between them). Under ${WEEK_READ_MAX.saw} characters.`),
      means: z.string().describe(`Why this matters in this market, in plain words: intelligence, not advice. Under ${WEEK_READ_MAX.means} characters. No placeholder.`),
      based_on: basedOn('this finding').describe('The candidate ids this finding rests on, e.g. ["C2"]. Several only when they say the same thing in other words, never to reach enough evidence. At least one.'),
      quote_from: z.string().nullable().describe('The cited candidate whose voices say this finding most directly, or null. Code prints the real quote that best fits what you wrote, from the cited candidates; this breaks a tie.'),
    })).describe(`One finding per distinct idea, each standing on its own evidence. Fewer is fine; never more than ${WEEK_FINDINGS_MAX}.`),
    story: z.array(z.object({
      paragraph: z.string().describe(`One paragraph of the week's story, in plain words and the analytical third person, under ${WEEK_READ_MAX.paragraph} characters. No placeholder, no quotation marks.`),
      based_on: basedOn('this paragraph'),
      quote_from: z.string().nullable().describe('A candidate this paragraph cites whose people say its point most directly, where a real voice would help the reader; code prints one of their quotes after the paragraph. At most two paragraphs point to one; null otherwise.'),
    })).describe(`What happened: the week told as ONE story in two or three paragraphs, weaving the findings together (how they connect, what they add up to). Never one paragraph per finding in turn, never a list.`),
    implications: z.array(z.object({
      implication: z.string().describe(`What the week as a whole says about the company's business, at most ${WEEK_READ_MAX.implicationSentences} short sentences, under ${WEEK_READ_MAX.implication} characters. Intelligence, never an instruction: never "should", "could", "needs to", "consider" or "an opportunity".`),
      based_on: basedOn('this implication'),
    })).describe(`What it means for the company: two or three implications, each following from the week's evidence, at most ${WEEK_READ_MAX.implications}.`),
    new_this_week: z.array(z.object({
      candidate: z.string().describe('The id of a candidate marked "First heard this week: yes". No other.'),
      sentence: z.string().describe(`One or two short sentences on what this conversation is about, under ${WEEK_READ_MAX.newItem} characters. Never the word "new".`),
    })).describe('Conversations first heard this week: only candidates marked "First heard this week: yes". Empty when none is marked so.'),
    watch: z.array(z.object({
      question: z.string().describe(`An open question the week raised, as a short clause starting with "Whether", grounded in what people said this week, under ${WEEK_READ_MAX.watch} characters. Never a forecast, a direction or advice.`),
      based_on: basedOn('this question'),
    })).describe(`Worth watching next week: one or two open questions, at most ${WEEK_READ_MAX.watchItems}.`),
    week_in_one_line: z.string().describe(`The week's headline claim, one sentence of plain words under ${WEEK_READ_MAX.weekLine} characters: what the week adds up to. A claim, not a topic and not a list. No placeholder.`),
    standing: z.array(z.object({
      subject_id: z.string().describe('The subject id as listed, e.g. "S3".'),
      sentence: z.string().describe(`One plain sentence on what the market says about this subject this month, naming the things people talk about, under ${WEEK_READ_MAX.standing} characters. Never its size, its rank, a change or a comparison. No placeholder.`),
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

/** How a candidate's first hearing reads to the writer: first heard this week
 *  (it may go under new_this_week), earlier this month (it may not), or
 *  nothing where it was heard before this month. */
function heardLine(c: PoolCandidate, window: WeekPool['window']): string {
  if (firstHeardThisWeek(c, window)) return '  First heard this week: yes'
  return c.isNew ? '  First heard earlier this month (not this week)' : ''
}

export function buildWeekReadPrompts(a: WeekWriterArgs): { system: string; user: string; subjects: WriterSubject[] } {
  const month = longMonth(a.pool.month)
  const subjects = writerSubjects(a.standing)
  const co = a.company
  // The front page's own words for what the market is (market-frame.ts): the
  // people worldwide buying and talking about what the company sells, not
  // only its customers.
  const sells = WHAT_THEY_SELL[a.clientId ?? a.pool.clientId]
  const what = sells ? `${sells} like ${co}'s` : `what ${co} sells`
  const system = [
    `You are the consumer researcher at ${co}. Every week you write a short report on ${co}'s market for everyone at ${co}: what people in the market said this week, how it hangs together, and what it means for ${co}. The market is the people worldwide buying and talking about ${what}, not only ${co}'s own customers. It is read in the inbox, on a phone, in about three minutes, and it must read as a report worth forwarding: one account of the week with a point to it, not a list of topics.`,
    '',
    'What you are given, in the user message:',
    '- The week\'s candidates (C1, C2 and so on), best evidenced first: themes the market talked about this week. Each has its label and description, the kinds of comment behind it (praise, objections, questions and so on) and the kind most of them were, whether its evidence can carry a finding alone, the subject it is part of where it is one, whether it was first heard this week, and paraphrases of what people said. The paraphrases are notes, not quotations: never put them in quotation marks and never present them as anyone\'s words.',
    `- The subjects ${co} follows (S1, S2 and so on), with the themes inside each this month and paraphrases of what people said about it.`,
    '- Last week\'s headlines, where there was a read last week.',
    '',
    'What you write, in this order. Work out the findings first: the report is built on them.',
    '',
    `1. findings: the week's separate findings, ONE IDEA EACH, the detailed list a reader opens after the report. A finding is a claim about the market that one or more candidates support: cite them in based_on. Every sentence in a finding must be traceable to the labels, descriptions and notes of the candidates it cites, and to nothing else.`,
    `  - Fewer findings is fine. Two findings that each stand on their own evidence make a better week than four where two are stretched. Never more than ${WEEK_FINDINGS_MAX}.`,
    '  - Each candidate says whether its evidence can carry a finding alone. One that cannot becomes a finding only beside another candidate that says the SAME thing in other words (two phrasings of one complaint, or one question seen from both sides). Never cite a second candidate just to give a finding enough evidence: a candidate about comfort and one about pockets are two ideas, and a finding that joins them is one nobody can stand behind. A thin candidate with no such twin is not a finding; the story may still mention it beside a finding it bears on.',
    '  - One idea per finding. A finding about straps and back padding is not also about the price, or about one brand\'s range. Never join two ideas into one finding ("comfort, and price too", "the same holds for brand X"): write two findings, or leave the weaker one out.',
    '  - Each candidate supports at most one finding. Order does not matter; code orders the findings by the evidence behind them.',
    '  - headline: one claim about the market or the buyer, and no broader than the cited candidates show. If they are about straps and back padding, the headline is about straps and back padding, not about "what earns the price" or "travel bags" in general. Never a topic ("Airport security") and never an instruction ("Show the opening").',
    '  - saw: what people said this week about this idea, developed rather than listed: the concrete things they name, and how they put it.',
    '  - means: why it matters in this market, in plain terms. Intelligence, not advice.',
    '  - quote_from: the cited candidate whose voices say this finding most directly. Code prints the real quote that best fits what you wrote, chosen from the cited candidates\' voices; your choice breaks a tie.',
    '',
    `2. story: "What happened", the week told as ONE story in two or three paragraphs (at most ${WEEK_READ_MAX.storyParagraphs}).`,
    '  - Open with what the week was about. Then show how the findings connect: the same buyer at the same moment in a purchase, one cause behind two complaints, one test people apply to everything they look at. End on what they add up to. Each paragraph moves the story on. Never one paragraph per finding in turn, never a list in prose ("First… Second…"), never a recap of the headlines.',
    '  - Build it from your findings\' candidates. A candidate that is not a finding may appear only as a detail inside a paragraph that also rests on a finding\'s candidates. Cite in based_on every candidate a paragraph draws on; a paragraph that rests on no finding is deleted.',
    `  - quote_from: at most ${WEEK_READ_MAX.storyQuotes} paragraphs point to a voice, where hearing one would help the reader: the id of a candidate that paragraph cites whose people say its point most directly. Code prints a real quote from that candidate after the paragraph. Otherwise null. Never write a quotation yourself.`,
    '',
    `3. implications: "What it means for ${co}", two or three lines (at most ${WEEK_READ_MAX.implications}), each at most two short sentences. What the week, taken as a whole, says about ${co}'s business: how its products are judged and compared, what makes its price acceptable or not, what its buyers need to see, where its rivals stand in the buyer's mind. Intelligence, not instructions: say what is true about the business, never what ${co} should do. Never "should", "could", "needs to", "must", "consider", "make sure", "an opportunity", and never an imperative. Each rests on the week's candidates (based_on) and follows from them, not from general knowledge about the category.`,
    '',
    `4. new_this_week: conversations first heard this week. ONLY candidates marked "First heard this week: yes", at most ${WEEK_READ_MAX.newItems}; for each, one or two short sentences on what it is about. When no candidate is marked so, the list is empty: never present anything else as first heard. Do not write the word "new": code prints the heading.`,
    '',
    `5. watch: "Worth watching next week", one or two open questions the week raised (at most ${WEEK_READ_MAX.watchItems}). Each is a short clause starting with "Whether", about something people said this week, e.g. "Whether buyers who ask for exact shades keep naming the same ones". Never a forecast ("will", "likely", "expect", "set to"), never a direction, never advice. Cite based_on.`,
    '',
    `6. week_in_one_line: the week's headline claim in one sentence of plain words, under ${WEEK_READ_MAX.weekLine} characters: what the week adds up to, the one thing a reader should remember. A claim, not a topic, and not a list of three things.`,
    '',
    '7. standing: for each listed subject, one plain sentence on what the market says about it this month, from its themes and notes, naming the things people talk about. Leave out a subject whose material says nothing. Never its size, its rank, a change or a comparison: code prints those beside your sentence.',
    '',
    'House style:',
    `- Plain language, for a busy person at ${co} reading on a phone. Short sentences. Concrete nouns: the thing people name (the straps, the laptop sleeve, the zips, the colour, the price) in the market's own words. No consultant abstractions: never "a fit problem", "legible", "positioning", "is tested against", "lens", "value proposition", "use case", "consideration", "resonates", "narrative", "friction", "ecosystem", "landscape", "journey". Name the thing instead.`,
    `- A research report, not a memo: the analytical third person ("buyers describe", "owners report", "people ask", "${co} is compared"), claims rather than hedges. Never "we", "our", "us" or "you"; never address the reader. No headings, no bullet points inside a field, no exclamation marks, no greeting, no sign-off.`,
    '- Name products, brands and themes plainly. Never name a person or an account.',
    '- The market only. Never mention how anything was found, gathered, collected, searched, read, counted or checked. Never mention data, sources, samples, coverage, searches, updates, platforms, this service, a tool, a model, AI or Verbatim, and never write "this read", "this report", "this week\'s read" or "this brief". Never explain why something is not said or cannot be compared: if something cannot be said, leave it out. A sentence that does any of this is deleted before anyone reads it.',
    '- Never say how big a theme is or how it ranks against another ("the main complaint", "the top concern", "the biggest theme", "more than"): code orders the findings and prints their counts.',
    '- You have NO numbers. Never type a digit: not in a date, a size, a capacity or a product name ("the larger Allpa", not "the Allpa 35L"). Where a count is the point, write its placeholder exactly as listed under Figures, e.g. "[[c2_week]] videos"; only in a finding\'s saw, at most one in a finding, and most findings need none, because code prints each finding\'s counts beside it. A placeholder means exactly what its label says. A placeholder anywhere else deletes its sentence.',
    // The intensity half of the shared rule; its second line is about Pass
    // handles and a field this schema does not have, so the ids line below
    // says the same thing for this call's own handles.
    noDashes(CALIBRATED_PROSE_RULE.split('\n')[0]),
    '- Never write an id (C2, S1) in prose; ids belong only in based_on, quote_from, candidate and subject_id.',
    noDashes(noDirectionRule('week_read')),
    `- The rule above is a word list, and it deletes a sentence for these words even where they describe a product rather than a movement ("lower back", "a flat base", "a double zip", "a drop test", "the gains of a hip belt"): ${DELETED_WORDS.join(', ')}. Say it another way ("the small of the back", "a base that stands", "two zips").`,
    '- "New": code marks what was first heard this week and prints the heading for it. Never write "new" about a theme, a subject or a concern yourself.',
    a.previous ? '- Continuity: last week\'s headlines are listed. Where the week carries one of them still, a finding or the story may say the concern continues; that is not a claim that anything moved, so never say it is more or less than last week and never compare the two weeks.' : null,
    '- No dashes between clauses (no em dash, no en dash, no spaced hyphen); use a comma, a colon or a full stop.',
    '',
    'An example of the register, for a different company and market (coffee machines); do not reuse its content:',
    '- A finding. Too broad, two ideas joined: "Machines earn their price when they are easy to live with". One idea, written right: headline "Owners judge a machine by how long the daily clean takes"; saw "Owners describe the clean in detail: the drip tray, the milk wand, and how often the machine asks to be descaled. Those who need a brush or a tablet every week complain about it, even when they like the coffee.\\n\\nBuyers ask about the clean before they ask about the taste."; means "The clean is the cost owners feel every day. It decides whether they still praise the machine a year after buying it.". The price doubt would be a second finding of its own, if its candidates carry it.',
    '- A story paragraph: "The week\'s talk was about living with a machine rather than choosing one. Owners described the daily clean in detail, the drip tray, the milk wand and the descale, and they judged the price in the same terms: by how long a machine keeps working and what it asks of them each morning. For these owners the machine is the routine around the cup, and the coffee is only part of it."',
    '- An implication: "The machine is judged a year after purchase, on upkeep and lifespan, as much as on the first cup." Not: "The company should show the clean in its videos."',
    '- A watch line: "Whether owners who complain about descaling name the tablets or the time it takes."',
    '- A week line: "Owners judged their machines this week by the upkeep they live with, not by the coffee."',
  ].filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n')

  const figureLines = Object.entries(a.figures).map(([k, f]) => `- [[${k}]]: ${f.label}`)

  const candidates = a.pool.candidates.map((c) => {
    const subject = c.subjectId ? a.standing.find((f) => f.subjectId === c.subjectId)?.name ?? null : null
    const kinds = c.kinds.length
      ? c.kinds.map((k) => (k === c.dominantKind ? `${kindWord(k)} (most)` : kindWord(k))).join(', ')
      : c.dominantKind ? `${kindWord(c.dominantKind)} (most)` : 'not recorded'
    return [
      `${c.id}: "${c.label}"`,
      c.description ? `  Description: ${c.description}` : '',
      `  Kinds of comment: ${kinds}`,
      `  Evidence: ${standsAlone(c) ? 'enough to carry a finding alone' : 'too little to carry a finding alone'}`,
      subject ? `  Part of the subject: ${subject}` : '',
      heardLine(c, a.pool.window),
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

  const firstHeard = a.pool.candidates.filter((c) => firstHeardThisWeek(c, a.pool.window)).map((c) => c.id)
  const user = [
    `Company: ${co}`,
    `The week: the latest seven days, in ${month}.`,
    a.previous && a.previous.headlines.length
      ? `Last week's headlines:\n${a.previous.headlines.map((h) => `- ${h}`).join('\n')}`
      : 'Last week: no read.',
    figureLines.length ? `Figures (placeholders; you do not know their values):\n${figureLines.join('\n')}` : 'Figures: none.',
    `Candidates:\n${candidates.join('\n\n') || '- none'}`,
    firstHeard.length
      ? `First heard this week: ${firstHeard.join(', ')}. Only these may go under new_this_week.`
      : 'First heard this week: none. new_this_week is empty.',
    subjectLines.length ? `Subjects ${co} follows:\n${subjectLines.join('\n\n')}` : `Subjects ${co} follows: none with anything said this month.`,
  ].join('\n\n')
  return { system, user, subjects }
}
