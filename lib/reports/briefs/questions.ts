import { marketPhrase } from '../documents/questions'
import type { ResearchQuestion } from '../documents/questions'
import type { BriefRole, SectionKey } from './types'
import { BRIEF_ROLES } from './types'

// The research questions, one set per department (pure). Point 3 of the
// rebuild: the 30 Sep drafts shared half their questions across briefs (the
// per-rival question had the same wording in three, and the run's concerns
// were asked in every one), so every brief retrieved the same loudest
// material. Here no question is asked twice, the run's concerns are not
// asked at all, and the rivals are asked about from each reader's own angle:
//  · sales: what each rival is BOUGHT for, and what wins or loses it the sale;
//  · marketing: what each rival is KNOWN for, in people's own words;
//  · leadership: where the company comes out ahead of them, and behind;
//  · content: not at all (what works in the market's videos is counted in code).
//
// Each question names the section it feeds, so the writer is handed its own
// material and a section is only ever written from the question asked for it.
//
// TENANT-GENERAL. `{market}` is the document engine's own phrase for what the
// tenant sells ("products like Össur's (prosthetic leg, …)"), built from its
// industry keywords; no question names a product category.

export interface BriefQuestion extends ResearchQuestion {
  role: BriefRole
  /** The section the answer feeds. */
  section: SectionKey
}

/** Rivals one question names at most: a question naming every tracked rival
 *  would scope retrieval to all of their videos and read like a list. */
export const RIVALS_PER_QUESTION = 4

interface QuestionSpec {
  key: string
  section: SectionKey
  /** `{market}`, `{company}` and `{rivals}` are filled in. */
  text: string
  /** Asked only where the tenant has rivals to name. */
  needsRivals?: boolean
  /** The wording where there are no rivals; absent means the question is not asked. */
  withoutRivals?: string
}

const SPECS: Readonly<Record<BriefRole, readonly QuestionSpec[]>> = {
  sales: [
    { key: 'who', section: 'sales.buyers', text: 'Who is looking to buy {market}: what situation are they in, and what do they need it to do for them?' },
    { key: 'stops', section: 'sales.stops', text: 'What stops people from buying {market}, or makes them hesitate before they commit?' },
    { key: 'settle', section: 'sales.settle', text: 'What do people ask, or want settled, before they choose {market}?' },
    { key: 'trigger', section: 'sales.triggers', text: 'What makes people decide it is time to buy or replace {market}: the event or the moment?' },
    { key: 'rivals', section: 'sales.rivals', needsRivals: true, text: 'What do people buy {rivals} for: what job is each one bought to do, what wins it the sale, and what makes buyers pass on it?' },
    { key: 'care', section: 'sales.care', text: 'Which words and claims used to sell {market} do buyers question, push back on, or ask to see proved?' },
  ],
  marketing: [
    { key: 'believe', section: 'marketing.believe', text: 'What do people already believe about {market} before anyone tells them anything, and which claims about it do they doubt or argue with?' },
    { key: 'notice', section: 'marketing.words', text: 'What makes people stop on, share, or argue about a post to do with {market}, and how do they describe what they like and what goes wrong in their own words?' },
    { key: 'recall', section: 'marketing.recall', text: 'What do people say about {company} itself: what do they remember it for, what do they credit it with, and what do they hold against it?' },
    { key: 'claims', section: 'marketing.say_hear', text: 'When {company} talks about what it stands for and what its products do, what do people say back?' },
    { key: 'rivals', section: 'marketing.rivals', needsRivals: true, text: 'How are {rivals} talked about: what is each brand known for in people\'s own words, and what do people say each one stands for?' },
  ],
  content: [
    { key: 'asked', section: 'content.questions', text: 'What do people ask about {market} that nobody in the conversation answers?' },
    { key: 'watch', section: 'content.watch', text: 'What do people say about the videos and posts about {market} themselves: what they came for, what kept them watching, and what lost them?' },
    { key: 'more', section: 'content.more', text: 'What do people say they want to see or be shown more of about {market}?' },
    { key: 'wrong', section: 'content.confusion', text: 'What do people get wrong about {market}, and where does the confusion start?' },
  ],
  leadership: [
    { key: 'weigh', section: 'leadership.weigh', text: 'What do people weigh when they choose {market}, which of those things do they treat as settled, and what keeps them with one brand or moves them to another?' },
    { key: 'stand', section: 'leadership.shares', text: 'How is {company} talked about next to {rivals}: on what do people rate it ahead of them, and on what behind?', withoutRivals: 'How is {company} talked about next to the other choices people consider: on what do they rate it ahead, and on what behind?' },
    { key: 'risk', section: 'leadership.risks', text: 'What do people say that could cost a company selling {market} demand or reputation: complaints about this kind of product, doubts about the claims made for it, or reasons to choose something else?' },
  ],
}

/** "A, B and C". */
export function nameList(names: readonly string[]): string {
  const n = names.filter(Boolean)
  if (n.length <= 1) return n[0] ?? ''
  return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`
}

export interface QuestionContext {
  company: string
  industryKeywords: readonly string[]
  /** The rivals worth naming, most talked about first (the caller ranks them
   *  by the month's videos and drops the ones with nothing to say). */
  rivals: readonly string[]
}

/** One role's questions, filled in. Pure. */
export function briefQuestions(role: BriefRole, ctx: QuestionContext): BriefQuestion[] {
  const market = marketPhrase(ctx.company, [...ctx.industryKeywords])
  const rivals = ctx.rivals.slice(0, RIVALS_PER_QUESTION)
  const out: BriefQuestion[] = []
  for (const s of SPECS[role]) {
    const template = rivals.length === 0 && s.needsRivals ? null : rivals.length === 0 && s.text.includes('{rivals}') ? s.withoutRivals ?? null : s.text
    if (!template) continue
    const text = template
      .replace(/\{market\}/g, market)
      .replace(/\{company\}/g, ctx.company)
      .replace(/\{rivals\}/g, nameList(rivals))
    out.push({
      id: `${role}.${s.key}`,
      text,
      purpose: template.includes('{rivals}') ? 'competitor' : 'anchor',
      role,
      section: s.section,
    })
  }
  return out
}

/** Every role's questions, in role order. Pure. */
export function allBriefQuestions(ctx: QuestionContext): BriefQuestion[] {
  return BRIEF_ROLES.flatMap((r) => briefQuestions(r, ctx))
}

/** The sections a role's research feeds (for the tests and the workings). */
export const sectionsAsked = (role: BriefRole): SectionKey[] => SPECS[role].map((s) => s.section)
