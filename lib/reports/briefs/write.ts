import { z } from 'zod'

import { aboutName, marketLabelsOf, type AboutPart } from '../../brands/labels'
import { FRAMED, DIRECTION_WORDS } from '../../calibration'
import { longMonth } from '../../format'
import { CALIBRATED_PROSE_RULE, noDirectionRule } from '../../pipeline/prose-rules'
import type { StandingFact } from '../../written/types'
import { monthsPhrase } from '../../written/month'
import { noDashes } from '../documents/scrub'
import type { CompanyContext } from '../../written/company'
import type { BriefQuestion } from './questions'
import type { AllocatedIdea, BriefRole, GroundedPoint } from './types'
import { BRIEF_LENS, BRIEF_NAME, BRIEF_ROLES } from './types'

// The two calls' prompts and schemas (pure).
//
// THE IDEAS CALL reads every department's grounded research at once and names
// the month's distinct ideas, each with the reader who acts on it. Code
// allocates them (allocate.ts). One reader of everything is what stops the
// four briefs from each finding the same loudest material on their own.
//
// THE BRIEF CALL, once per department, develops the ideas homed there into
// findings and writes the role's own sections from that role's research. It
// is told the month's other ideas by headline only, and that another brief
// argues them.
//
// WHAT REACHES A MODEL: the research's paraphrases (the Ask agent's grounded
// points, already scrubbed against the measurement), how widely each was heard
// in WORDS, who the talk was about by NAME, the company's own claims in
// paraphrase, the tracked subjects with their themes and Pass A notes. Never a
// comment's words, never a number, never a person's name. The house style is
// the week read's (lib/written/write.ts): plain, literal, the analytical third
// person, intelligence not advice, no digits, no dashes, and §0a: the market
// only, nothing about how anything was found.

export const IDEAS_PROMPT_VERSION = 'brief_ideas_v1'
export const BRIEF_PROMPT_VERSION = 'monthly_brief_v1'

/** Field caps, in characters, and list lengths. Compose and scrub hold the
 *  writer to every one. */
export const BRIEF_MAX = {
  headline: 90,
  summary: 700,
  summarySentences: 4,
  saw: 900,
  means: 450,
  practice: 200,
  practiceItems: 2,
  title: 60,
  text: 320,
  detail: 260,
  lead: 320,
  items: 6,
  questions: 8,
  subject: 200,
} as const

/** Ideas the call drafts at most. */
export const IDEAS_ASKED_MAX = 6

// ---- What each reader acts on ---------------------------------------------------------------

/** Who reads each brief, and what they act on: the ideas call's basis for a
 *  home, and the brief call's reader. */
export const READER: Readonly<Record<BriefRole, string>> = {
  sales: 'the sales team, who talk to buyers: what makes people buy or hold back, what they ask before they buy, what tips them into buying, the route to buy, and the rivals they weigh in the sale',
  marketing: 'the marketing team, who decide what the company says: what the market already believes and doubts, how the company and its claims are heard, the words people use, and what each rival is known for',
  content: 'the people who make the videos and posts: what people ask and do not get answered, what they want to be shown, what holds or loses them in a video, and where they get things wrong',
  leadership: 'the executive team, who decide where the company puts its attention and money: where the market and the company stand, demand and reputation, and the risks to the business',
}

// ---- Material, in words -------------------------------------------------------------------------

/** How widely a point was heard, in words: the writer has no numbers. */
export function heardWord(videos: number): string {
  if (videos >= 15) return 'heard widely'
  if (videos >= 5) return 'heard on several videos'
  if (videos >= 3) return 'heard on a few videos'
  return 'barely heard'
}

/** Who a point's talk was about, by name, most first: the client, the rivals,
 *  the rest of the market. */
export function whoWords(who: readonly AboutPart[], company: string, noun: string | null): string {
  const market = marketLabelsOf(noun).inline
  const names = who.filter((p) => p.videos > 0).map((p) => (p.about === 'market' ? market : p.about === 'client' ? `${company}'s own posts and talk about ${company}` : aboutName(p.about, { client: company }) ?? ''))
  return names.filter(Boolean).join('; ') || market
}

/** The months a point was heard in, as words. */
export function monthsWords(monthVideoIds: Readonly<Record<string, readonly string[]>>): string {
  const months = Object.entries(monthVideoIds).filter(([, v]) => v.length > 0).map(([m]) => m).sort()
  return months.length ? monthsPhrase(months) : ''
}

export function pointLine(p: GroundedPoint, company: string, noun: string | null): string {
  const months = monthsWords(p.monthVideoIds)
  return `${p.id} (${heardWord(p.videoIds.length)}${months ? `, in ${months}` : ''}; about ${whoWords(p.who, company, noun)}): ${p.text}`
}

// ---- The house style, shared ----------------------------------------------------------------

const DELETED_WORDS: readonly string[] = DIRECTION_WORDS.filter((w) => !FRAMED.has(w))

function houseStyle(company: string): string[] {
  return [
    'House style:',
    `- Plain language for a busy person at ${company}. Short sentences. Concrete nouns: the thing people name, in the market's own words. No consultant abstractions: never "a fit problem", "legible", "positioning", "is tested against", "lens", "value proposition", "use case", "consideration", "resonates", "narrative", "friction", "ecosystem", "landscape", "journey", "funnel". Name the thing instead.`,
    '- Literal words, never an idiom or a figure of speech ("earns its place", "credible in the hand", "in the same breath"). Say the literal thing.',
    '- Open every paragraph and every item with its own subject ("Buyers", "Owners", "People under the company\'s posts"), never with "They", "This", "Also" or "It" pointing back, because a sentence before it may be deleted. Inside a paragraph, write normally and vary the sentences. A question is written as the person asks it.',
    `- The analytical third person ("buyers ask", "owners report", "people under ${company}'s posts praise"), claims rather than hedges. Never "we", "our", "us" or "you"; never address the reader. No headings, no bullet points inside a field, no exclamation marks.`,
    '- Say whose talk it is where it matters: buyers of other brands, owners of a named rival, people under the company\'s own posts. Name brands and products plainly. Never name a person or an account.',
    '- The market only. Never mention how anything was found, gathered, collected, searched, read, counted or checked. Never mention research, data, sources, samples, coverage, searches, updates, platforms, evidence, a reading, this service, a tool, a model, AI or Verbatim, and never write "this brief", "this report" or "this month\'s brief". Never say how sure anything is, and never say what is unclear, unsettled or missing: if something cannot be said, leave it out. A sentence that does any of this is deleted before anyone reads it.',
    '- NO TIME COMPARISONS. Everything here is what people said across the months named, read as one body of talk. Never compare one month with another or with "earlier", "before", "the past" or "last month"; never say anything is "now" so, "no longer" so, "increasingly", "settling", "shifting", "becoming", "emerging", "for the first time" or "new". Never write "first brief". A sentence that does is deleted.',
    '- Never say how big a thing is or how it ranks against another ("the main complaint", "the top concern", "more than"): code prints the counts.',
    '- You have NO numbers. Never type a digit, not in a size, a date or a product name, and never a number word for a count ("two in three", "dozens", "half of"). Code prints every count beside your words.',
    noDashes(CALIBRATED_PROSE_RULE.split('\n')[0]),
    noDashes(noDirectionRule('week_read')),
    `- The rule above is a word list, and it deletes a sentence for these words even where they describe a product rather than a movement: ${DELETED_WORDS.join(', ')}. Say it another way.`,
    '- Never write an id (G12, I2, A3, S1) in prose; ids belong only in based_on and the id fields.',
    '- No dashes between clauses (no em dash, no en dash, no spaced hyphen); use a comma, a colon or a full stop. British spelling.',
  ]
}

// ---- The ideas call ---------------------------------------------------------------------------

export interface IdeasArgs {
  company: string
  month: string
  noun: string | null
  points: readonly GroundedPoint[]
  questions: readonly BriefQuestion[]
  context: CompanyContext | null
}

export function ideasSchema() {
  return z.object({
    ideas: z.array(z.object({
      headline: z.string().describe(`One claim about the market or the buyer, no broader than its points show; never a topic, never an instruction. Plain words, under ${BRIEF_MAX.headline} characters, no full stop.`),
      based_on: z.array(z.string()).describe('The point ids it rests on, e.g. ["G4", "G17"]: points that say the same thing, from any department\'s questions. At least one. No point in two ideas.'),
      home: z.enum(['sales', 'marketing', 'content', 'leadership']).describe('The ONE reader who acts on this idea.'),
      second: z.enum(['sales', 'marketing', 'content', 'leadership', 'none']).describe('The next reader who would act on it, or "none".'),
      why: z.string().describe('One short sentence: what that reader does with it.'),
    })).describe(`The month's distinct ideas, strongest first, at most ${IDEAS_ASKED_MAX}.`),
  })
}

export interface IdeasOutput {
  ideas: { headline: string; based_on: string[]; home: BriefRole; second: BriefRole | 'none'; why: string }[]
}

export function buildIdeasPrompts(a: IdeasArgs): { system: string; user: string } {
  const co = a.company
  const month = longMonth(a.month)
  const system = [
    `You are the consumer researcher at ${co}. Once a month you write four briefs, one for each department, about ${co}'s market: the people worldwide buying and talking about what ${co} sells, not only its own customers. Before writing them you decide the month's ideas and which department each belongs to, so that every idea is argued in exactly one brief.`,
    '',
    'The four readers:',
    ...BRIEF_ROLES.map((r) => `- ${r}: ${READER[r]}.`),
    '',
    'You are given every department\'s research for the month: points (G1, G2 and so on) under the question that produced them, each with how widely it was heard, the months it was heard in, and whose talk it was. The points are paraphrases, not quotations.',
    '',
    'What you write: the month\'s ideas, at most six.',
    '- An idea is ONE claim about the market or the buyer that its points support. Cite them in based_on: points that say the same thing, from whichever department\'s questions they came. Every word of the headline must be traceable to those points.',
    '- Distinct ideas. Two ideas never rest on the same point, and never say the same thing in other words. When several departments\' questions found the same thing, that is ONE idea, given to the one reader who acts on it.',
    '- One idea each. Never join two claims ("comfort, and price too"). Never frame a claim by what the market does NOT do unless a point says so: the contrast is a second claim.',
    '- Ideas that are heard widely and in more than one month come first. A point that is barely heard cannot carry an idea alone.',
    '- home: the ONE reader who acts on it. An idea about why people hold back from buying, or the route to buy, is sales\'. One about what people believe, how a claim or the company is heard, is marketing\'s. One about what people ask to be shown or what holds them in a video is content\'s. One about where the company stands against the alternatives, or a risk to demand or reputation, is leadership\'s. second: the next reader, or none.',
    '- Aim for at least one idea for each reader where the points carry one; never stretch a point to give a reader an idea.',
    `- headline: a claim, no broader than its points, under ${BRIEF_MAX.headline} characters, no full stop. Never a topic ("Airport security"), never an instruction ("Show the opening").`,
    ...houseStyle(co),
  ].join('\n')

  const byQuestion = a.questions.map((q) => {
    const pts = a.points.filter((p) => p.questionId === q.id && p.usable)
    if (pts.length === 0) return ''
    return [`${q.role}: "${q.text}"`, ...pts.map((p) => `  ${pointLine(p, co, a.noun)}`)].join('\n')
  }).filter(Boolean)
  const user = [
    `Company: ${co}`,
    `The month: ${month}. The talk below was written over the months each point names.`,
    `The research, by department and question:\n\n${byQuestion.join('\n\n') || '- none'}`,
    contextLines(co, a.context, null),
  ].filter(Boolean).join('\n\n')
  return { system, user }
}

// ---- The brief call ----------------------------------------------------------------------------

/** One part of a role's sections as the schema asks for it. */
interface PartSpec {
  /** The key in the writer's output. */
  key: string
  /** What the part is, in the reader's words, for the prompt. */
  ask: string
  /** What `title`, `text` and `detail` hold in this part. */
  title: string
  text: string
  detail: string
  max: number
  /** The question whose points this part is written from. */
  from: string[]
}

const item = (p: PartSpec) => z.object({
  title: z.string().describe(`${p.title} Under ${BRIEF_MAX.title} characters, or "" where the part has none.`),
  text: z.string().describe(`${p.text} Under ${BRIEF_MAX.text} characters.`),
  detail: z.string().describe(`${p.detail} Under ${BRIEF_MAX.detail} characters, or "".`),
  based_on: z.array(z.string()).describe('The point ids it rests on, e.g. ["G4"]. At least one.'),
})

/** The parts each role writes, in print order. */
export const PARTS: Readonly<Record<BriefRole, readonly PartSpec[]>> = {
  sales: [
    { key: 'buyers', ask: 'Who is buying: the kinds of buyer in the market, by their situation and what they need.', title: 'A short name for this kind of buyer, from their situation ("Students replacing a school bag").', text: 'Their situation and what they need the product to do.', detail: 'What they look for or worry about first, or "".', max: 4, from: ['sales.who'] },
    { key: 'stops', ask: 'What stops them: the objections and hesitations before buying.', title: 'The objection, in a few plain words.', text: 'What people say holds them back, concretely.', detail: '""', max: 5, from: ['sales.stops'] },
    { key: 'settle', ask: 'What they want settled first: the questions buyers put before choosing, in their own framing.', title: '""', text: 'The question as a buyer asks it, starting with What, Which, How, Where, Will, Does, Is or Can, ending with a question mark.', detail: 'What is behind the question, or "".', max: 6, from: ['sales.settle'] },
    { key: 'triggers', ask: 'What tips them into buying: the events and moments that make people buy now.', title: 'The moment, in a few plain words.', text: 'What happens and how people describe it.', detail: '""', max: 5, from: ['sales.who', 'sales.trigger'] },
    { key: 'rivals', ask: 'What each rival is bought for: one entry per tracked rival the points name, what job it is bought to do, what wins it the sale and what makes buyers pass on it. Only rivals the points name; never a rival from general knowledge.', title: 'The rival\'s name, exactly as listed.', text: 'What it is bought for, and what wins it the sale.', detail: 'What makes buyers pass on it, or "".', max: 4, from: ['sales.rivals'] },
    { key: 'care', ask: 'Language to handle with care: words and claims used to sell this kind of product that buyers question or push back on.', title: 'The words or claim, as sellers use them.', text: 'How buyers push back on them, and why.', detail: '""', max: 5, from: ['sales.care'] },
  ],
  marketing: [
    { key: 'believe', ask: 'What the market already believes about this kind of product before anyone tells it anything.', title: '""', text: 'One belief, said plainly.', detail: '""', max: 5, from: ['marketing.believe'] },
    { key: 'doubt', ask: 'What it doubts: the claims it argues with or wants proved.', title: '""', text: 'One doubt, said plainly.', detail: '""', max: 4, from: ['marketing.believe', 'marketing.notice'] },
    { key: 'words', ask: 'In its own words: what makes people stop on a post, what they share, what they argue about, and how they describe what they like and what goes wrong.', title: 'One of: "What stops them", "What they share", "What they argue about", "How they describe it".', text: 'What it is, in the market\'s terms.', detail: '""', max: 4, from: ['marketing.notice'] },
    { key: 'recall', ask: 'How the company is remembered: what people credit it with and what they hold against it.', title: 'One of: "Remembered for", "Held against it".', text: 'What people say, concretely.', detail: '""', max: 4, from: ['marketing.recall'] },
    { key: 'rivals', ask: 'How the rivals are heard: one entry per tracked rival the points name, what it is known for in people\'s own terms and what it is criticised for. Only rivals the points name.', title: 'The rival\'s name, exactly as listed.', text: 'What it is known for.', detail: 'What it is criticised for, or "".', max: 4, from: ['marketing.rivals'] },
  ],
  content: [
    { key: 'questions', ask: 'The questions people ask and nobody answers, in the audience\'s own framing.', title: '""', text: 'The question as a viewer asks it, starting with What, Which, How, Where, Will, Does, Is or Can, ending with a question mark.', detail: 'What is behind it.', max: 8, from: ['content.asked'] },
    { key: 'come', ask: 'What viewers come for in the videos and posts, and what keeps them.', title: 'What draws them, in a few plain words.', text: 'What people say about it.', detail: '""', max: 4, from: ['content.watch'] },
    { key: 'lose', ask: 'What loses them: what people complain about in the videos and posts themselves.', title: 'What loses them, in a few plain words.', text: 'What people say about it.', detail: '""', max: 3, from: ['content.watch'] },
    { key: 'more', ask: 'What people want to be shown: what they ask to see more of.', title: 'What they want shown, in a few plain words.', text: 'What exactly they ask to see.', detail: '""', max: 5, from: ['content.more'] },
    { key: 'confusion', ask: 'Where the confusion starts: what people get wrong and what leads them to it.', title: 'The confusion, in a few plain words.', text: 'What people get wrong and where it starts.', detail: '""', max: 5, from: ['content.wrong'] },
  ],
  leadership: [
    { key: 'stand', ask: 'Where the company stands against its rivals in people\'s talk: what they rate it ahead on, and what behind. Only from points that compare it with a rival or with the other choices people consider.', title: 'One of: "Ahead on", "Behind on".', text: 'What people say, naming the rival where a point does.', detail: '""', max: 4, from: ['leadership.stand'] },
    { key: 'weigh', ask: 'What buyers weigh when they choose, and which of those they treat as settled.', title: 'The thing weighed, in a few plain words.', text: 'What people say about it.', detail: '""', max: 5, from: ['leadership.weigh'] },
    { key: 'stay', ask: 'What keeps people with a brand.', title: 'The reason, in a few plain words.', text: 'What people say.', detail: '""', max: 3, from: ['leadership.weigh'] },
    { key: 'move', ask: 'What moves people to another brand.', title: 'The reason, in a few plain words.', text: 'What people say.', detail: '""', max: 3, from: ['leadership.weigh'] },
    { key: 'risks', ask: 'The risks, in business terms: what people say that could cost the company demand or reputation. A risk that is one of the month\'s ideas argued in another brief is named in one sentence and not argued again.', title: 'The risk, as a short claim.', text: 'Why it is a risk to demand or reputation, from what people say, in at most two sentences.', detail: '""', max: 3, from: ['leadership.risk', 'leadership.stand'] },
    { key: 'decisions', ask: 'Questions for the business: the open questions the month\'s talk puts to the executive team, each a direct question that starts with Which, What, How, Does, Is or Can and ends with a question mark, about the business and grounded in what people said. A question, never advice, and never "should".', title: '""', text: 'The question.', detail: '""', max: 4, from: ['leadership.weigh', 'leadership.stand', 'leadership.risk'] },
  ],
}

export function briefSchema(role: BriefRole) {
  const parts: Record<string, z.ZodTypeAny> = {}
  for (const p of PARTS[role]) parts[p.key] = z.object({
    lead: z.string().describe(`One or two sentences that open this part, or "" where the items say it all. Under ${BRIEF_MAX.lead} characters.`),
    items: z.array(item(p)).describe(`${p.ask} At most ${p.max}; fewer is fine; leave out what the points do not carry.`),
  })
  const extra: Record<string, z.ZodTypeAny> = {}
  if (role === 'marketing') {
    extra.say_hear = z.array(z.object({
      claim: z.string().describe('The id of the company\'s claim as listed, e.g. "A2".'),
      heard: z.string().describe(`What comes back when people meet that claim, from the points, under ${BRIEF_MAX.text} characters. Only from points about the claim's own subject (its initiative, its product, its certification): talk about the company's values in general answers a claim about values, never a specific claim such as a certification or a named initiative.`),
      based_on: z.array(z.string()).describe('The point ids it rests on. At least one.'),
    })).describe('What the company says, and what comes back: one entry per listed claim the points speak to. Leave out a claim the points do not speak to: code prints the ones the market does not take up.')
  }
  if (role === 'leadership') {
    extra.subjects = z.array(z.object({
      subject: z.string().describe('The subject id as listed, e.g. "S2".'),
      sentence: z.string().describe(`One plain sentence on what people say about this subject in the month, naming the things they talk about, under ${BRIEF_MAX.subject} characters. Never its size, its rank or a change.`),
    })).describe('One per listed subject with notes; leave out a subject whose notes say nothing.')
  }
  return z.object({
    findings: z.array(z.object({
      idea: z.string().describe('The idea id as listed, e.g. "I2".'),
      saw: z.string().describe(`What people said about this idea: the concrete things they name and how they put it, in two or three short paragraphs (a blank line between them). Under ${BRIEF_MAX.saw} characters.`),
      means: z.string().describe(`${BRIEF_LENS[role]}: why it matters to this reader, in plain words; intelligence, not advice. Under ${BRIEF_MAX.means} characters.`),
      practice: z.array(z.string()).describe(`In practice: at most ${BRIEF_MAX.practiceItems} short lines this reader can use, each a fact about the buyer or the market, never an instruction. May be empty. Each under ${BRIEF_MAX.practice} characters.`),
    })).describe('One per idea listed under "Your findings", in that order.'),
    ...parts,
    ...extra,
    in_short: z.string().describe(`In short: what the month says for this reader, in two to four plain sentences under ${BRIEF_MAX.summary} characters. It sums up this brief\'s findings and sections; it does not restate the other briefs\' ideas.`),
  })
}

export interface BriefPartOutput {
  lead: string
  items: { title: string; text: string; detail: string; based_on: string[] }[]
}

export interface BriefOutput {
  findings: { idea: string; saw: string; means: string; practice: string[] }[]
  in_short: string
  say_hear?: { claim: string; heard: string; based_on: string[] }[]
  subjects?: { subject: string; sentence: string }[]
  [part: string]: unknown
}

/** The parts of an output, typed. */
export function partOf(o: BriefOutput, key: string): BriefPartOutput {
  const p = o[key] as BriefPartOutput | undefined
  return { lead: p?.lead ?? '', items: Array.isArray(p?.items) ? p!.items : [] }
}

export interface BriefArgs {
  role: BriefRole
  company: string
  month: string
  noun: string | null
  /** The ideas this brief argues. */
  ideas: readonly AllocatedIdea[]
  /** The month's other ideas, by headline, with the brief that argues each. */
  others: readonly { headline: string; brief: BriefRole }[]
  /** Every grounded point (the brief's own research, and its ideas' points
   *  wherever they came from). */
  points: readonly GroundedPoint[]
  questions: readonly BriefQuestion[]
  context: CompanyContext | null
  /** Tracked rivals that may be named. */
  rivals: readonly string[]
  /** Marketing: the company's claims, as A1, A2…. */
  claims?: readonly { id: string; claim: string }[]
  /** Leadership: the subjects, as S1, S2…. */
  subjects?: readonly { id: string; fact: StandingFact }[]
}

export function buildBriefPrompts(a: BriefArgs): { system: string; user: string } {
  const co = a.company
  const role = a.role
  const month = longMonth(a.month)
  const parts = PARTS[role]
  const system = [
    `You are the consumer researcher at ${co}. You are writing the ${BRIEF_NAME[role]} for ${month}, read by ${READER[role]}. ${co}'s market is the people worldwide buying and talking about what ${co} sells, not only its own customers. The brief is intelligence about that market for this reader, not a memo and not advice.`,
    '',
    'What you are given: the findings this brief argues (I1, I2: a headline and the points behind it), the month\'s other ideas (argued in other briefs, by headline only), this department\'s research (points G1, G2 and so on, under the question that produced them, each with how widely it was heard, when, and whose talk it was), and context about the company. The points are paraphrases, not quotations: never put them in quotation marks and never present them as anyone\'s words.',
    '',
    'What you write, in this order:',
    `1. findings: one per listed finding, in order. The headline is fixed. saw: what people said about it, developed rather than listed, the concrete things they name and how they put it, every sentence traceable to the finding's points. means: "${BRIEF_LENS[role]}", why it matters to this reader. practice: at most ${BRIEF_MAX.practiceItems} short lines, each a fact about the buyer or the market the reader can use, never an instruction; often none.`,
    `2. The sections, each from its own question's points: ${parts.map((p) => `${p.key} (${p.ask})`).join('; ')}.`,
    ...(role === 'marketing' ? ['   say_hear: what comes back when people meet each of the company\'s own claims (listed as A1, A2), only where the points speak to it. A claim is the company\'s own voice, not evidence about the market.'] : []),
    ...(role === 'leadership' ? ['   subjects: one sentence per subject the company follows (S1, S2), on what people say about it, from its notes.'] : []),
    '3. in_short: two to four sentences on what the month says for this reader, from this brief\'s findings and sections only: never a point that is not in them, never a point that is barely heard, and never the other briefs\' ideas.',
    '',
    'Rules for the sections:',
    '- Write every item the points carry, up to each part\'s maximum: the sections are where this brief differs from the other three, so a part with points under its question is never left empty. Every item cites in based_on the points it rests on and says nothing they do not say. Where several points say the same thing, write ONE item citing them all: an item that rests on more voices is stronger. Code decides which items have enough behind them to print; never leave one out because you judge it thin.',
    '- ONE IDEA, ONE HOME: the month\'s other ideas are argued in other briefs, and code names each of them for the reader in a line of its own. Never mention them, never refer to another brief, section or team ("elsewhere", "other briefs", "covered separately"), and never develop their argument here. A section item may still name a question, an objection or a moment that bears on one, in its own words and in one or two sentences, without arguing it.',
    '- Never restate this brief\'s own findings in its sections: an item adds what a finding does not say.',
    '- A lead opens a part only where it adds something the items do not say; otherwise it is "". Never use a lead to list other ideas or to sum up the brief.',
    `- Rivals: name only the tracked rivals listed (${a.rivals.length ? a.rivals.join(', ') : 'none'}), and only where a point names them. Never describe a rival from general knowledge.`,
    `- Intelligence, not instructions: never "should", "could", "needs to", "must", "consider", "make sure", "an opportunity", never an imperative, and never tell ${co} what to do.`,
    ...houseStyle(co),
    '',
    'An example of the register, for a different company and market (coffee machines); do not reuse its content:',
    '- A finding: headline "Owners judge a machine by how long the daily clean takes"; saw "Owners describe the clean in detail: the drip tray, the milk wand, and how often the machine asks to be descaled. Those who need a brush or a tablet every week complain about it, even when they like the coffee.\\n\\nBuyers ask about the clean before they ask about the taste."; means "The clean is the cost owners feel every day, and it decides whether they still praise the machine after a year."; practice ["Buyers who ask about the descale have usually owned a machine before."].',
    '- A section item: title "A machine that will not fit"; text "Buyers measure the counter before they buy, and a tall water tank is the reason they give for passing on a model they otherwise like."',
  ].join('\n')

  const ideaLines = a.ideas.map((i) => [
    `${i.id}: "${i.headline}"`,
    ...i.points.map((id) => a.points.find((p) => p.id === id)).filter((p): p is GroundedPoint => p != null).map((p) => `  ${pointLine(p, co, a.noun)}`),
  ].join('\n'))
  const own = a.questions.filter((q) => q.role === role).map((q) => {
    const pts = a.points.filter((p) => p.questionId === q.id && p.usable)
    if (pts.length === 0) return ''
    return [`From "${q.text}" (${q.id}):`, ...pts.map((p) => `  ${pointLine(p, co, a.noun)}`)].join('\n')
  }).filter(Boolean)
  const subjects = (a.subjects ?? []).filter(({ fact }) => fact.calibration !== 'failed').map(({ id, fact }) => [
    `${id}: ${fact.name}`,
    fact.contents.length ? `  Themes inside it in the month: ${fact.contents.map((t) => `"${t}"`).join(', ')}` : '',
    fact.notes.length ? `  What people said, in paraphrase:\n${fact.notes.map((n) => `  - ${n}`).join('\n')}` : '',
  ].filter(Boolean).join('\n'))
  const user = [
    `Company: ${co}`,
    `The month: ${month}.`,
    a.ideas.length ? `Your findings (write one for each, in this order: ${a.ideas.map((i) => i.id).join(', ')}):\n${ideaLines.join('\n\n')}` : 'Your findings: none. findings is empty.',
    a.others.length ? `The month's other ideas, argued in other briefs (never argue them here):\n${a.others.map((o) => `- ${BRIEF_NAME[o.brief]}: ${o.headline}`).join('\n')}` : '',
    `This department's research:\n\n${own.join('\n\n') || '- none'}`,
    role === 'marketing' && a.claims?.length ? `${co}'s own claims (its voice, not the market's):\n${a.claims.map((c) => `- ${c.id}: ${c.claim}`).join('\n')}` : '',
    role === 'leadership' && subjects.length ? `Subjects ${co} follows:\n${subjects.join('\n\n')}` : '',
    contextLines(co, a.context, role === 'marketing' ? 'claims listed above' : null),
  ].filter(Boolean).join('\n\n')
  return { system, user }
}

/** The company context in words, without a number. */
export function contextLines(company: string, ctx: CompanyContext | null, claimsShown: string | null): string {
  if (!ctx) return ''
  const sells = [
    ctx.sells.noun ? `${company} sells ${ctx.sells.noun}.` : '',
    ctx.sells.description ? `In its own words, its market is: ${ctx.sells.description}` : '',
    ctx.sells.keywords.length ? `Its market is followed by these words: ${ctx.sells.keywords.join(', ')}.` : '',
  ].filter(Boolean)
  return [
    `About ${company} (context; none of this is what the market said):`,
    sells.length ? `- What ${company} sells: ${sells.join(' ')}` : '',
    claimsShown
      ? `- What ${company} says about itself: the ${claimsShown}.`
      : ctx.claims.length ? `- What ${company} says about itself in its own videos (its claims, in paraphrase):\n${ctx.claims.map((c) => `  - ${c}`).join('\n')}` : '',
  ].filter(Boolean).join('\n')
}
