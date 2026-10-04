import type { AboutPart } from '../../brands/labels'

// The monthly department briefs (plan "Verbatim, writing back", T8, the
// rebuild Heinrich approved on 4 Oct): a full brief per department, written
// for the month that ended, for any tenant.
//
// WHAT THE REBUILD CHANGES, AND WHY (the 30 Sep dry drafts held five ideas in
// eleven printed findings, repeated across the four briefs):
//  1. ONE IDEA, ONE HOME. One call reads every department's research and names
//     the month's ideas; code allocates each to the brief whose reader acts on
//     it (`allocate.ts`). The other briefs name it in one line ("Also this
//     month, in the other briefs") and never argue it again.
//  2. THE ROLE SECTIONS CARRY THE DIFFERENCE AND ARE ALWAYS WRITTEN
//     (`sections.ts`): who is buying, what stops them, what tips them; what
//     the market believes and doubts, what the company says and what comes
//     back; the questions people ask, what works in the market's videos; where
//     the market stands, where the company stands, the risks.
//  3. DISTINCT RESEARCH QUESTIONS PER ROLE (`questions.ts`): no question is
//     shared, and each role asks about the rivals from its own angle.
//  4. §0a THROUGHOUT, and a scrub for time comparisons (`scrub.ts`): there is
//     no month-on-month basis yet, so nothing claims a change.
//  5. SHORTER: a finding or two and five or six role sections.
//
// CODE OWNS EVERY FACT. The writer sees research paraphrases (never a
// comment's words) and writes sentences; code decides which ideas exist,
// where each lives, which items print, every number, every quote and who each
// piece of talk is about. A quote is stored as a ref with `text: ''` and
// resolves at render (AGENTS.md: exports and reports freeze numbers, never
// words).

export type BriefRole = 'sales' | 'marketing' | 'content' | 'leadership'

export const BRIEF_ROLES: readonly BriefRole[] = ['sales', 'marketing', 'content', 'leadership']

export const BRIEF_NAME: Readonly<Record<BriefRole, string>> = {
  sales: 'Sales brief',
  marketing: 'Marketing brief',
  content: 'Content brief',
  leadership: 'Leadership brief',
}

/** What a finding's consequence is called, for each reader. */
export const BRIEF_LENS: Readonly<Record<BriefRole, string>> = {
  sales: 'What it means for a sale',
  marketing: 'What it means for the message',
  content: 'What it means for what to make',
  leadership: 'What it means for the business',
}

export const isBriefRole = (x: unknown): x is BriefRole => typeof x === 'string' && (BRIEF_ROLES as readonly string[]).includes(x)

/** A research point after code has grounded it in the comment evidence. */
export interface GroundedPoint {
  /** `G12`: numbered across every role's research, stable within one set. */
  id: string
  role: BriefRole
  /** The question it answers, e.g. `sales.stops`. */
  questionId: string
  /** The research's own paraphrase, after its scrub. Never a comment. */
  text: string
  insightIds: string[]
  /** Distinct videos with a citation that counts (market or the client's own
   *  posts, the read lane, no maker's video, no brand insider, the lenient
   *  gate), sorted. */
  videoIds: string[]
  /** The same videos by the month their counted comments are dated in. */
  monthVideoIds: Record<string, string[]>
  /** Who those videos are about, one brand per video. */
  who: AboutPart[]
  /** Videos on the read lane with any citation, makers' included, and of
   *  those the makers': the maker share's two halves. */
  seenVideos: number
  makerVideos: number
  /** Counted at all, and not a conversation of makers talking to makers. */
  usable: boolean
}

/** One of the month's ideas as the ideas call drafts it. */
export interface IdeaDraft {
  headline: string
  basedOn: string[]
  /** The reader the call says acts on it. */
  home: BriefRole | null
  /** The next reader, where the call named one. */
  second: BriefRole | null
}

/** An idea after allocation: one home, its evidence, and why it went there. */
export interface AllocatedIdea {
  /** `I1`…, in evidence order. */
  id: string
  headline: string
  home: BriefRole
  /** Where it went: the call's choice, moved for the cap, or moved so a brief
   *  that would have had no finding has one. */
  placed: 'asked' | 'cap' | 'fill'
  points: string[]
  videos: number
  /** Distinct counted videos by month, oldest first. */
  months: { month: string; videos: number }[]
  /** The share of the idea's points each role's research produced. */
  affinity: Record<BriefRole, number>
}

export interface Allocation {
  ideas: AllocatedIdea[]
  /** Idea ids per brief, in evidence order. */
  byRole: Record<BriefRole, string[]>
  /** Ideas that do not print, and why (never shown to a reader). */
  held: { headline: string; reason: string }[]
}

/** A quote as the brief stores it: the ref and where it was heard. */
export interface BriefQuote {
  ref: string
  text: ''
  /** `YYYY-MM-DD`. */
  date: string | null
  platform: string | null
  /** Who the talk is about: the client, a rival, or the market. */
  about: AboutPart['about']
  /** Under the client's own post (rather than naming the client elsewhere). */
  ownPost: boolean
  /** The language it was written in, where it is not English. */
  lang: string | null
}

/** One printed item of a role section. */
export interface BriefItem {
  /** A short label ("Price that has to earn its keep"), where the section has
   *  one per item. */
  title?: string
  text: string
  /** A second line (a rival's pushback, what is behind a question). */
  detail?: string
  /** A status word code owns (say vs hear). */
  tag?: string
  /** The distinct counted videos behind it, and who they are about. Absent on
   *  a code line that rests on a count of its own. */
  videos?: number
  who?: AboutPart[]
  basedOn?: string[]
}

export interface BriefSection {
  key: SectionKey
  title: string
  /** One or two sentences that open the section. */
  lead?: string
  groups: { label?: string; items: BriefItem[]; lines?: string[] }[]
  /** Sentences code wrote from counts (shares, formats). */
  lines?: string[]
  quote?: BriefQuote | null
  /** Real voices the section is made of ("In its own words", "Words to
   *  borrow"): short quotes, code's picks. */
  voices?: BriefQuote[]
}

export interface BriefFinding {
  ideaId: string
  headline: string
  /** The idea's points (`G` ids). */
  basedOn: string[]
  saw: string[]
  means: string
  practice: string[]
  /** "Heard in August and September": the months its counted videos fall in. */
  months: { month: string; videos: number }[]
  videos: number
  who: AboutPart[]
  quotes: BriefQuote[]
}

export interface BriefFigure {
  value: string
  label: string
}

export type SectionKey =
  | 'sales.buyers' | 'sales.stops' | 'sales.settle' | 'sales.triggers' | 'sales.rivals' | 'sales.care'
  | 'marketing.believe' | 'marketing.words' | 'marketing.say_hear' | 'marketing.recall' | 'marketing.rivals'
  | 'content.questions' | 'content.formats' | 'content.watch' | 'content.more' | 'content.confusion' | 'content.borrow'
  | 'leadership.market' | 'leadership.shares' | 'leadership.weigh' | 'leadership.risks' | 'leadership.decisions'

export interface MonthlyBriefData {
  version: 1
  kind: 'monthly_brief'
  role: BriefRole
  title: string
  company: string
  /** The month the brief is about, `YYYY-MM-01`. */
  month: string
  /** The months the evidence behind its findings was written in. */
  heardMonths: string[]
  inShort: {
    summary: string
    figures: BriefFigure[]
    /** The month's other ideas, one line each, with the brief that argues it. */
    also: { headline: string; brief: BriefRole }[]
  }
  findings: BriefFinding[]
  sections: BriefSection[]
  /** What was written and does not print, and why: the operator's, never a
   *  reader's. */
  held: { what: string; reason: string }[]
  promptVersion: string
  model: string
  costUsd: number
}
