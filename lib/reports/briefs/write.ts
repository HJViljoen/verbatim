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
export const BRIEF_PROMPT_VERSION = 'monthly_brief_v2'

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
  subject: 150,
} as const

/** Ideas the call drafts at most. */
export const IDEAS_ASKED_MAX = 6

// ---- What each reader acts on ---------------------------------------------------------------

/** Who reads each brief, and what they act on: the ideas call's basis for a
 *  home, and the brief call's reader. */
export const READER: Readonly<Record<BriefRole, string>> = {
  sales: 'the sales team, who talk to buyers and to the people who recommend, fit, stock or pay for the product: who buys and who decides, what makes people buy or hold back, what they ask before they buy, what tips them into buying, the route to buy, and the rivals they weigh',
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
    `- The analytical third person ("buyers ask", "owners report", "people under ${company}'s posts praise"), claims rather than hedges. Never "we", "our", "us" or "you"; never address the reader. No headings, no bullet points inside a field, no exclamation marks. Never open two sentences in a row with the same words.`,
    '- Say whose talk it is where it matters: buyers of other brands, owners of a named rival, people under the company\'s own posts. Name brands and products plainly. Never name a person or an account.',
    '- The market only. Never mention how anything was found, gathered, collected, searched, read, counted or checked. Never mention research, data, sources, samples, coverage, searches, updates, platforms, evidence, a reading, this service, a tool, a model, AI or Verbatim, and never write "this brief", "this report" or "this month\'s brief". Never say how sure anything is, and never say what is unclear, unsettled or missing: if something cannot be said, leave it out. A sentence that does any of this is deleted before anyone reads it.',
    '- NO TIME COMPARISONS. Everything here is what people said across the months named, read as one body of talk. Never compare one month with another or with "earlier", "before", "the past" or "last month"; never say anything is "now" so, "no longer" so, "increasingly", "settling", "shifting", "becoming", "emerging", "for the first time" or "new". Never write "first brief". A sentence that does is deleted.',
    '- Never say how big a thing is or how it ranks against another ("the main complaint", "the top concern", "more than"): code prints the counts.',
    '- NOTHING UNMEASURED. What is read is what people wrote in comments. Never claim a ranking or ownership of talk ("owns", "leads", "the largest share"), a comparison with no base ("more than"), a sale won or lost ("wins the sale", "loses buyers", "makes the sale"), the order people ask in ("before they ask about price", "they start with"), or anything viewers do with a post (stay, keep watching, share it, stop scrolling, a post that drives comments). Say what the comments say: "comments ask for", "people praise", "people complain that". A sentence that does is deleted.',
    '- Never use "still", "current", "currently", "finally", "anymore" or "nowadays": say "owners", "people who wear one", "the one they own".',
    '- Write product and model names exactly as the points write them, hyphens included. Write "trade-off".',
    '- A brand is described only from points about that brand: a rival only from points about the rival, the company only from points about the company. Talk about the whole market is never pinned on one brand.',
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

/** A field an item carries besides its title, text and detail. */
interface FieldSpec {
  key: string
  describe: string
  kind: 'text' | 'bool'
  /** Characters, for a text field. */
  max?: number
}

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
  /** Characters each field may run to: the canvas's measure for this part's
   *  page (a field the page draws in a narrow column is short). */
  caps?: { title?: number; text?: number; detail?: number }
  /** The part opens with a lead (the canvas draws one on this page): always
   *  written where the part has items, since a page without the lead its
   *  canvas draws does not print (deck.ts `PAGE_NEEDS`). */
  lead?: number
  /** A second paragraph the part's page draws under its lead, written on the
   *  same terms. */
  note?: { describe: string; max: number }
  /** Fields this part's items carry besides title, text and detail. */
  extra?: readonly FieldSpec[]
}

const capOf = (p: PartSpec, field: 'title' | 'text' | 'detail'): number => p.caps?.[field] ?? BRIEF_MAX[field]

const item = (p: PartSpec) => z.object({
  title: z.string().describe(`${p.title} Under ${capOf(p, 'title')} characters, or "" where the part has none.`),
  text: z.string().describe(`${p.text} Under ${capOf(p, 'text')} characters.`),
  detail: z.string().describe(`${p.detail} Under ${capOf(p, 'detail')} characters, or "".`),
  ...Object.fromEntries((p.extra ?? []).map((f) => [f.key, f.kind === 'bool'
    ? z.boolean().describe(f.describe)
    : z.string().describe(`${f.describe} Under ${f.max ?? BRIEF_MAX.detail} characters, or "".`)])),
  based_on: z.array(z.string()).describe('The point ids it rests on, e.g. ["G4"]. At least one.'),
})

/** The parts each role writes, in print order. Each part's caps are its
 *  canvas page's measure (the "Monthly briefs" boards), so a part's items fit
 *  the page the canvas draws for them. */
export const PARTS: Readonly<Record<BriefRole, readonly PartSpec[]>> = {
  sales: [
    {
      key: 'buyers', ask: 'Who is buying: the kinds of person in the market, by their situation and what they need. A buyer may be the person who uses the product, or a professional, a shop or a payer who chooses it for them: say which, from the points. Include a kind of person who talks about the product and mostly does not buy it, where the points show one, and mark it.',
      title: 'A short name for this kind of person, a noun for who they are ("Researcher", "Commuter", "Gift buyer").', text: 'Who they are and what they are trying to do, in one or two sentences.', detail: '""',
      max: 4, from: ['sales.who'], caps: { title: 24, text: 170, detail: 10 },
      extra: [
        { key: 'want', kind: 'text', max: 240, describe: 'What they want from the product, and why it matters to them.' },
        { key: 'stops', kind: 'text', max: 240, describe: 'What makes them hesitate or stall.' },
        { key: 'moves', kind: 'text', max: 240, describe: 'What moves them to act.' },
        { key: 'for_sale', kind: 'text', max: 190, describe: 'For a sale: what this kind of person needs answered or shown before they buy, in one or two sentences; for a person who mostly does not buy, say so plainly.' },
        { key: 'buys', kind: 'bool', describe: 'true where the points show this kind of person buys the product; false where they mostly make their own, watch or admire rather than buy.' },
        { key: 'status', kind: 'text', max: 30, describe: 'Only where buys is false: a short status in the points\' terms ("Mostly makes, rarely buys"); "" otherwise.' },
      ],
    },
    { key: 'deciders', ask: 'Who else is in the decision: the professionals who recommend or fit it, the shops that sell it, and whoever pays for it, with what people say about each. Only who the points name.', title: 'Who they are, in a few plain words.', text: 'The part they play, and what people say about them.', detail: '""', max: 4, from: ['sales.deciders'], caps: { title: 32, text: 190, detail: 10 } },
    { key: 'stops', ask: 'What stops them: the objections and hesitations before buying.', title: 'The objection, in a few plain words.', text: 'What people say holds them back, concretely.', detail: '""', max: 5, from: ['sales.stops'], caps: { title: 32, text: 190, detail: 10 } },
    { key: 'settle', ask: 'What they want settled first: what buyers want settled before choosing.', title: '""', text: 'The thing to settle as a short phrase that names it and its detail ("What it is made from, and how the parts are joined." or "Whether it holds up in daily use."), never a full question.', detail: '""', max: 5, from: ['sales.settle'], caps: { text: 100, detail: 10 } },
    { key: 'triggers', ask: 'What tips them into buying: the events and moments that make people buy.', title: 'The moment, in a few plain words.', text: 'What happens and how people describe it.', detail: '""', max: 5, from: ['sales.who', 'sales.trigger'], caps: { title: 28, text: 170, detail: 10 } },
    {
      key: 'rivals', ask: 'Who buyers compare the company with: one entry per tracked rival, only from points about that rival\'s products in this market, the job it is bought for, what buyers praise and where they push back. Never a rival from general knowledge, and never a complaint about the whole market pinned on one rival.',
      title: 'The rival\'s name, exactly as listed.', text: 'What buyers praise it for, concretely.', detail: 'Where buyers push back on it, or "".',
      max: 3, from: ['sales.rivals'], caps: { title: 40, text: 180, detail: 160 },
      extra: [{ key: 'job', kind: 'text', max: 30, describe: 'The job it is bought for, in two to five words, without "Bought for" ("long trips", "everyday carry").' }],
    },
    { key: 'care', ask: 'Language to handle with care: words and claims used to sell this kind of product that buyers question or push back on.', title: 'The words or claim, as sellers use them, in lower case.', text: 'What buyers already think of them, in one short sentence.', detail: '""', max: 5, from: ['sales.care'], caps: { title: 30, text: 90, detail: 10 } },
  ],
  marketing: [
    { key: 'believe', ask: 'What the market already believes about this kind of product before anyone tells it anything.', title: '""', text: 'One belief, said plainly.', detail: '""', max: 5, from: ['marketing.believe'], caps: { text: 180, detail: 10 } },
    { key: 'doubt', ask: 'What it doubts: the claims it argues with or wants proved.', title: '""', text: 'One doubt, said plainly and concretely.', detail: '""', max: 4, from: ['marketing.believe', 'marketing.notice'], caps: { text: 180, detail: 10 } },
    { key: 'recall', ask: 'How the company is remembered: what people praise and criticise the company itself for, only from points about the company.', title: 'One of: "Praised for", "Criticised for".', text: 'What people say, concretely.', detail: '""', max: 4, from: ['marketing.recall', 'marketing.claims'], caps: { text: 190, detail: 10 } },
    {
      key: 'rivals', ask: 'How the rivals are heard: one entry per tracked rival, only from points about that rival in this market, the idea it stands for in people\'s own terms and what it is known for.',
      title: 'The rival\'s name, exactly as listed.', text: 'What it is known for, in the market\'s terms.', detail: '""',
      max: 3, from: ['marketing.rivals'], caps: { title: 40, text: 150, detail: 10 },
      extra: [{ key: 'idea', kind: 'text', max: 36, describe: 'The idea it stands for, in two to six words ("A tool with personality").' }],
    },
  ],
  content: [
    {
      key: 'questions', ask: 'The questions people ask and nobody answers, in the audience\'s own framing.', title: '""', text: 'The question as a viewer asks it, starting with What, Which, How, Where, Will, Does, Is or Can, ending with a question mark.', detail: 'What is behind it, in one short sentence.',
      max: 8, from: ['content.asked'], caps: { text: 90, detail: 90 },
      extra: [{ key: 'from_makers', kind: 'bool', describe: 'true where the question comes from people who make their own rather than buy; false otherwise.' }],
    },
    { key: 'praise', ask: 'What viewers come for: what the comments praise and respond to in the videos and posts themselves.', title: 'What earns a response, in a few plain words.', text: 'What the comments say about it.', detail: '""', max: 3, from: ['content.watch'], caps: { title: 26, text: 110, detail: 10 }, lead: 200 },
    { key: 'complain', ask: 'What loses them: what the comments complain about in the videos and posts themselves.', title: 'What they complain about, in a few plain words.', text: 'What the comments say about it.', detail: '""', max: 3, from: ['content.watch'], caps: { title: 26, text: 110, detail: 10 } },
    { key: 'more', ask: 'What people want to be shown: what the comments ask to see more of.', title: 'What they want shown, in a few plain words.', text: 'What exactly they ask to see.', detail: '""', max: 5, from: ['content.more'], caps: { title: 24, text: 110, detail: 10 } },
    { key: 'confusion', ask: 'Where the confusion starts: what people get wrong and what leads them to it.', title: 'The confusion, in a few plain words.', text: 'What people get wrong, concretely.', detail: '""', max: 5, from: ['content.wrong'], caps: { title: 26, text: 160, detail: 10 }, lead: 220, note: { describe: 'Where the confusion starts, in one or two plain sentences.', max: 220 } },
  ],
  leadership: [
    { key: 'weigh', ask: 'What buyers weigh when they choose, and which of those they treat as settled.', title: 'The thing weighed, in a few plain words.', text: 'What people say about it, in one short sentence.', detail: '""', max: 5, from: ['leadership.weigh'], caps: { title: 26, text: 75, detail: 10 }, lead: 230 },
    { key: 'stay', ask: 'What holds people with a brand.', title: 'The reason, in a few plain words.', text: 'What people say.', detail: '""', max: 3, from: ['leadership.weigh', 'leadership.stand'], caps: { title: 26, text: 100, detail: 10 } },
    { key: 'move', ask: 'What moves people to another brand.', title: 'The reason, in a few plain words.', text: 'What people say.', detail: '""', max: 3, from: ['leadership.weigh', 'leadership.stand'], caps: { title: 26, text: 100, detail: 10 } },
    { key: 'risks', ask: 'The risks, in business terms: what people say that could cost the company demand or reputation. A risk that is one of the month\'s ideas argued in another brief is named in one sentence and not argued again.', title: 'The risk, as a short claim.', text: 'Why it is a risk to demand or reputation, from what people say, in at most three sentences.', detail: '""', max: 2, from: ['leadership.risk', 'leadership.stand'], caps: { title: 70, text: 330, detail: 10 } },
    { key: 'decisions', ask: 'Questions for the business: the open questions the month\'s talk puts to the executive team, each a direct question that starts with Which, What, How, Does, Is or Can and ends with a question mark, about the business and grounded in what people said. A question, never advice, and never "should".', title: '""', text: 'The question.', detail: '""', max: 4, from: ['leadership.weigh', 'leadership.stand', 'leadership.risk'], caps: { text: 140, detail: 10 } },
  ],
}

/** A short group of the market's own words, as the schema asks for it. */
const wordsGroup = (what: string, max: number) => z.object({
  words: z.array(z.string()).describe(`${what} Each one to four words, in lower case, as the points put them; at most ${max}. Only words a cited point uses.`),
  based_on: z.array(z.string()).describe('The point ids the words come from. At least one.'),
})
const line = (what: string, max: number) => z.object({
  text: z.string().describe(`${what} Under ${max} characters, or "" where the points do not show it.`),
  based_on: z.array(z.string()).describe('The point ids it rests on.'),
})

/** What the writer writes for the role's canvas components beyond its parts
 *  (In its own words, the company's own card, Also in the set, What each
 *  brand is heard for, the position in one line). */
export const EXTRA_MAX = {
  callIt: 14, praiseWords: 8, problemWords: 10, word: 28,
  ownWordsLead: 240, panel: 120, alsoSet: 200, youIdea: 36, youText: 150,
  heardFor: 5, phrase: 32, position: 90, short: 32,
} as const

export function briefSchema(role: BriefRole) {
  const parts: Record<string, z.ZodTypeAny> = {}
  for (const p of PARTS[role]) parts[p.key] = z.object({
    ...(p.lead ? { lead: z.string().describe(`One or two sentences that open this part: they sum up the items below and make no claim the items do not make. Always written where the part has items; "" only where it has none. Under ${p.lead} characters.`) } : {}),
    ...(p.note ? { note: z.string().describe(`${p.note.describe} Only what the items and their points say. Always written where the part has items; "" only where it has none. Under ${p.note.max} characters.`) } : {}),
    items: z.array(item(p)).describe(`${p.ask} At most ${p.max}; fewer is fine; leave out what the points do not carry.`),
  })
  const extra: Record<string, z.ZodTypeAny> = {}
  if (role === 'sales') {
    extra.also_set = line('Also in the set: the other brands buyers place in the same decision, named only as the points name them, and what they compare them on, in one sentence.', EXTRA_MAX.alsoSet)
  }
  if (role === 'marketing') {
    extra.own_words = z.object({
      call_it: wordsGroup('What people call the product.', EXTRA_MAX.callIt),
      praise: wordsGroup('How they praise it.', EXTRA_MAX.praiseWords),
      problem: wordsGroup('The problem it solves, in their words.', EXTRA_MAX.problemWords),
      lead: z.string().describe(`One sentence on how people describe the problem the product solves, in their terms: it sums up the problem words and makes no claim they do not make. Always written where the problem words are given; "" only where they are not. Under ${EXTRA_MAX.ownWordsLead} characters.`),
      stop_on: line('What the comments single out and react to on sight.', EXTRA_MAX.panel),
      share: line('What people say they pass on to others or tag someone in, only where the points say so.', EXTRA_MAX.panel),
      argue: line('What the comments argue over.', EXTRA_MAX.panel),
    }).describe('In its own words: the market\'s own words for the product, its praise and its problem, and what the comments react to, pass on and argue over. Only from the points of "In the comments on posts about…".')
    extra.you = z.object({
      idea: z.string().describe(`The idea the company itself stands for in the market's talk, in two to six words. Under ${EXTRA_MAX.youIdea} characters, or "".`),
      text: z.string().describe(`What the company is known for, in the market's terms. Under ${EXTRA_MAX.youText} characters, or "".`),
      based_on: z.array(z.string()).describe('The point ids it rests on: points about the company only.'),
    }).describe('The company\'s own card beside the rivals\', only from points about the company.')
    extra.say_hear = z.array(z.object({
      claim: z.string().describe('The id of the company\'s claim as listed, e.g. "A2".'),
      status: z.enum(['heard_back', 'not_echoed', 'heard_as_values', 'tested', 'confused']).describe('What the market does with it: heard_back (people repeat it back), not_echoed (people talk about its subject and do not take the claim up), heard_as_values (it is heard as what the company stands for rather than about the product), tested (people test it against use or proof), confused (people are unsure what it refers to).'),
      heard: z.string().describe(`What comes back when people meet that claim, from the points, under 170 characters. Only from points about the claim's own subject (its initiative, its product, its certification): talk about the company's values in general answers a claim about values, never a specific claim such as a certification or a named initiative.`),
      based_on: z.array(z.string()).describe('The point ids it rests on. At least one.'),
    })).describe('What the company says, and what comes back: one entry per listed claim the points speak to, at most five. Leave out a claim the points do not speak to.')
  }
  if (role === 'leadership') {
    extra.subjects = z.array(z.object({
      subject: z.string().describe('The subject id as listed, e.g. "S2".'),
      sentence: z.string().describe(`One plain sentence on what people say about this subject in the month, naming the things they talk about, under ${BRIEF_MAX.subject} characters. Never its size, its rank or a change.`),
    })).describe('One per listed subject with notes; leave out a subject whose notes say nothing.')
    extra.heard_for = z.array(z.object({
      brand: z.string().describe('The company or a tracked rival, exactly as listed.'),
      phrase: z.string().describe(`What the brand is heard for, in two to five words. Under ${EXTRA_MAX.phrase} characters.`),
      based_on: z.array(z.string()).describe('The point ids it rests on: points about that brand only.'),
    })).describe(`What each brand is heard for: the company and each tracked rival the points speak about, at most ${EXTRA_MAX.heardFor}.`)
    extra.position = line('The company\'s position in one line: how the market holds the company, from points about the company.', EXTRA_MAX.position)
  }
  return z.object({
    findings: z.array(z.object({
      idea: z.string().describe('The idea id as listed, e.g. "I2".'),
      short: z.string().describe(`A short name for the finding in the contents, two to five words. Under ${EXTRA_MAX.short} characters.`),
      saw: z.string().describe(`What people said about this idea: the concrete things they name and how they put it, in two or three short paragraphs (a blank line between them). Under ${BRIEF_MAX.saw} characters.`),
      means: z.string().describe(`${BRIEF_LENS[role]}: why it matters to this reader, in plain words; intelligence, not advice. Under ${BRIEF_MAX.means} characters.`),
      practice: z.array(z.string()).describe(`In practice: at most ${BRIEF_MAX.practiceItems} short lines this reader can use, each a fact about the buyer or the market, never an instruction. May be empty. Each under ${BRIEF_MAX.practice} characters.`),
    })).describe('One per idea listed under "Your findings", in that order.'),
    ...parts,
    ...extra,
    in_short: z.string().describe(`In short: what the month says for this reader, in two to four plain sentences under ${BRIEF_MAX.summary} characters. It sums up this brief\'s findings and sections; it does not restate the other briefs\' ideas.`),
  })
}

export interface BriefPartItem {
  title: string
  text: string
  detail: string
  based_on: string[]
  [field: string]: unknown
}

export interface BriefPartOutput {
  lead: string
  note: string
  items: BriefPartItem[]
}

export interface BriefWordsGroup { words: string[]; based_on: string[] }
export interface BriefLineOutput { text: string; based_on: string[] }

export interface BriefOutput {
  findings: { idea: string; short?: string; saw: string; means: string; practice: string[] }[]
  in_short: string
  say_hear?: { claim: string; status?: string; heard: string; based_on: string[] }[]
  subjects?: { subject: string; sentence: string }[]
  also_set?: BriefLineOutput
  own_words?: { call_it?: BriefWordsGroup; praise?: BriefWordsGroup; problem?: BriefWordsGroup; lead?: string; stop_on?: BriefLineOutput; share?: BriefLineOutput; argue?: BriefLineOutput }
  you?: { idea: string; text: string; based_on: string[] }
  heard_for?: { brand: string; phrase: string; based_on: string[] }[]
  position?: BriefLineOutput
  [part: string]: unknown
}

/** The parts of an output, typed. */
export function partOf(o: BriefOutput, key: string): BriefPartOutput {
  const p = o[key] as Partial<BriefPartOutput> | undefined
  return { lead: p?.lead ?? '', note: p?.note ?? '', items: Array.isArray(p?.items) ? p!.items : [] }
}

/** A part's caps, for compose's scrub. */
export function partCaps(role: BriefRole, key: string): { title: number; text: number; detail: number; lead: number; note: number } {
  const p = PARTS[role].find((x) => x.key === key)
  return {
    title: p ? capOf(p, 'title') : BRIEF_MAX.title,
    text: p ? capOf(p, 'text') : BRIEF_MAX.text,
    detail: p ? capOf(p, 'detail') : BRIEF_MAX.detail,
    lead: p?.lead ?? BRIEF_MAX.lead,
    note: p?.note?.max ?? BRIEF_MAX.lead,
  }
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
  // The leads the canvas draws for this role, each required where its part
  // has items: a page without the lead its canvas draws does not print.
  const leads = [
    ...parts.filter((p) => p.lead).map((p) => (p.note ? `${p.key}.lead and ${p.key}.note` : `${p.key}.lead`)),
    ...(role === 'marketing' ? ['own_words.lead'] : []),
  ]
  const system = [
    `You are the consumer researcher at ${co}. You are writing the ${BRIEF_NAME[role]} for ${month}, read by ${READER[role]}. ${co}'s market is the people worldwide buying and talking about what ${co} sells, not only its own customers. The brief is intelligence about that market for this reader, not a memo and not advice.`,
    '',
    'What you are given: the findings this brief argues (I1, I2: a headline and the points behind it), the month\'s other ideas (argued in other briefs, by headline only), this department\'s research (points G1, G2 and so on, under the question that produced them, each with how widely it was heard, when, and whose talk it was), and context about the company. The points are paraphrases, not quotations: never put them in quotation marks and never present them as anyone\'s words.',
    '',
    'What you write, in this order:',
    `1. findings: one per listed finding, in order. The headline is fixed. short: the finding's name in the contents, two to five words. saw: what people said about it, developed rather than listed, the concrete things they name and how they put it, every sentence traceable to the finding's points. means: "${BRIEF_LENS[role]}", why it matters to this reader. practice: at most ${BRIEF_MAX.practiceItems} short lines, each a fact about the buyer or the market the reader can use, never an instruction; often none.`,
    `2. The sections, each from its own question's points: ${parts.map((p) => `${p.key} (${p.ask})`).join('; ')}. Every field has its own length: keep to it, because each is printed in a column of that size.`,
    ...(role === 'sales' ? ['   also_set: the other brands buyers place in the same decision as the tracked rivals, and what they compare them on, in one sentence, only brands the points name.'] : []),
    ...(role === 'marketing' ? [
      '   own_words: the market\'s own words, from the points of "In the comments on posts about…": what people call the product, how they praise it and the problem it solves, as short groups of words the points use (never a word they do not); one sentence on how they describe the problem; and what the comments react to on sight (stop_on), what people say they pass on or tag someone in (share) and what they argue over (argue), each "" where the points do not show it.',
      '   you: the idea the company itself stands for, and what it is known for, only from points about the company.',
      '   say_hear: what comes back when people meet each of the company\'s own claims (listed as A1, A2), with what the market does with it (status), only where the points speak to it. A claim is the company\'s own voice, not evidence about the market.',
    ] : []),
    ...(role === 'leadership' ? [
      '   subjects: one sentence per subject the company follows (S1, S2), on what people say about it, from its notes.',
      '   heard_for: what the company and each tracked rival is heard for, in two to five words each, each only from points about that brand.',
      '   position: the company\'s position in one line, only from points about the company.',
    ] : []),
    '3. in_short: two to four sentences on what the month says for this reader, from this brief\'s findings and sections only: never a point that is not in them, never a point that is barely heard, and never the other briefs\' ideas.',
    '',
    'Rules for the sections:',
    '- Write every item the points carry, up to each part\'s maximum: the sections are where this brief differs from the other three, so a part with points under its question is never left empty. Every item cites in based_on the points it rests on and says nothing they do not say. Where several points say the same thing, write ONE item citing them all: an item that rests on more voices is stronger. Code decides which items have enough behind them to print; never leave one out because you judge it thin.',
    '- ONE IDEA, ONE HOME: the month\'s other ideas are argued in other briefs, and code names each of them for the reader in a line of its own. Never mention them, never refer to another brief, section or team ("elsewhere", "other briefs", "covered separately"), and never develop their argument here. A section item may still name a question, an objection or a moment that bears on one, in its own words and in one or two sentences, without arguing it.',
    '- Never restate this brief\'s own findings in its sections: an item adds what a finding does not say.',
    ...(leads.length ? [`- The leads (${leads.join(', ')}) are always written where their part has items: one or two sentences that sum up the items under them, in the market's terms, making no claim the items do not make (no new fact, no new brand, nothing the items' points do not carry). Never use a lead to list other ideas or to sum up the brief.`] : []),
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
