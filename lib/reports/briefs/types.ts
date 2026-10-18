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

/** A brief as its snapshot stores it, which a tenant's session can read:
 *  what was held and what it cost are the operator's, kept in the
 *  service-role `monthly_briefs` row (`held`, `cost_usd`), never here. */
export type StoredBriefData = Omit<MonthlyBriefData, 'held' | 'costUsd'>

/** The brief less what only the operator reads. Pure. */
export function storedBrief(d: MonthlyBriefData): StoredBriefData {
  const { held: _held, costUsd: _cost, ...stored } = d
  return stored
}

/** A stored monthly brief (a `report_snapshots` row's data): the viewer, the
 *  render route and a share link tell it apart by this, as the other
 *  artefacts that share kind 'report' are told apart inside `data`. */
export const isMonthlyBriefData = (x: unknown): x is StoredBriefData => {
  if (!x || typeof x !== 'object') return false
  const d = x as Partial<StoredBriefData>
  return d.kind === 'monthly_brief' && d.version === 1 && isBriefRole(d.role) && Array.isArray(d.sections) && Array.isArray(d.findings) && !!d.inShort
}

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
  /** Counted on enough videos, not makers talking to makers, not a label. */
  usable: boolean
  /** The research scrub replaced its sentence with a theme label. */
  labelOnly?: boolean
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
  /** A status word code owns (say vs hear), or the line naming another
   *  brief ("Argued in the Marketing brief", "Also in the Sales brief"). */
  tag?: string
  /** What a tagged item names in another brief: the idea its finding argues,
   *  or that brief's item (its `itemKey`). The set keeps a tag only where
   *  what it names prints there (compose.ts `footnotesOnlyPrinted`). */
  named?: { brief: BriefRole; idea: string } | { brief: BriefRole; item: string }
  /** The distinct counted videos behind it, and who they are about. Absent on
   *  a code line that rests on a count of its own. */
  videos?: number
  who?: AboutPart[]
  basedOn?: string[]
  /** The distinct counted videos behind it (the repeat checks read these). */
  videoIds?: string[]
  /** Code's numbers for an item the deck draws as a bar or a table row (a
   *  format's share, a subject's level, a brand's share of talk): measured,
   *  never prose, and printed beside the words `text` already says them in. */
  measure?: BriefMeasure
  /** A short label beside the title, as the canvas draws one: a buyer who
   *  mostly does not buy ("Mostly makes, rarely buys"), the job a rival is
   *  bought for ("Bought for travel utility"), the idea a brand stands for
   *  ("A travel tool with personality"). The writer's, scrubbed. */
  pill?: string
  /** Drawn quieter, as the canvas draws the Maker and the makers' question:
   *  a buyer who mostly does not buy, a question people ask who make their
   *  own. */
  muted?: boolean
  /** A buyer's columns on the canvas's buyer card: what they want, what stops
   *  them, what moves them, and the line "For a sale". The writer's. */
  persona?: { want?: string; stops?: string; moves?: string; forSale?: string }
  /** Says and hears: what the market does with the company's claim (the
   *  canvas's status pill). The writer's choice of five. */
  status?: SayHearStatus
  /** The company's own card among the rivals' ("{company} (you)"). */
  you?: boolean
  /** A real voice printed with this item (a trigger moment's, a rival's, a
   *  subject's): code's pick. */
  quote?: BriefQuote | null
  /** ADDITIVE (the October canvas): the item's own page in the app, a path
   *  (`/dashboard/market/subjects/<id>?period=month&month=2026-10`), drawn
   *  as a link against the app's address. */
  href?: string
  /** ADDITIVE (the October canvas): where the item's words were written,
   *  where it is not this brief's writer: `week_read` for a subject's own
   *  read on Market (its headline and what it means). */
  slot?: 'week_read'
}

/** What the market does with one of the company's claims (Says and hears). */
export type SayHearStatus = 'heard_back' | 'not_echoed' | 'heard_as_values' | 'tested' | 'confused'
export const SAY_HEAR_STATUSES: readonly SayHearStatus[] = ['heard_back', 'not_echoed', 'heard_as_values', 'tested', 'confused']

export interface BriefMeasure {
  /** A share, 0 to 100, of the group's base. */
  pct?: number
  /** A format's median engagement, in percent, where enough were rated. */
  median?: number | null
  /** The median's band clears the category's median video (the canvas sets
   *  it in ink rather than muted). */
  above?: boolean
  /** The company's own posts of this format, of `ownOf`. */
  own?: number | null
  ownOf?: number | null
  /** The month's first tracked rival's videos of this format, of `rivalOf`. */
  rival?: number | null
  rivalOf?: number | null
  /** A brand's share of the month's comments and of its videos, 0 to 100. */
  comments?: number
  videos?: number
}

/** One share bar of "Where {company} stands against its rivals": the company,
 *  its rivals together and the rest, each a share of the same base. */
export interface ShareBar {
  client: number
  rivals: number
  rest: number
  /** "Sealand 1.1% · its five rivals 3.1% · the rest of the category 95.7%". */
  line: string
}

export interface BriefSection {
  key: SectionKey
  title: string
  /** One or two sentences that open the section. */
  lead?: string
  groups: { label?: string; items: BriefItem[]; lines?: string[]; base?: string }[]
  /** What the section's numbers are shares of, said once (code's). */
  base?: string
  /** The muted line under the title where code writes it from counts ("Four
   *  kinds of people talk about…", "Patterns here describe…"). */
  sub?: string
  /** Sentences code wrote from counts (shares, formats). */
  lines?: string[]
  quote?: BriefQuote | null
  /** Real voices the section is made of ("In its own words", "Words to
   *  borrow"): short quotes, code's picks. */
  voices?: BriefQuote[]
  /** A second paragraph under the lead (where the confusion starts). The
   *  writer's. */
  note?: string
  /** One line under the items (the rivals' "Also in the set", the subjects'
   *  "Also following"). */
  also?: string
  /** The market's own words, in groups of short chips (In its own words). */
  chips?: { label: string; words: string[] }[]
  /** A grey panel of labelled lines ("What makes them stop, share and argue").
   *  Each row's `title` is its label, `text` its line. */
  panel?: { title: string; rows: BriefItem[] }
  /** What people did in the comments, the market's top kinds, and the mood
   *  (Where the market stands): code's counts. */
  kinds?: { base: string; rows: { label: string; pct: number }[] }
  mood?: { base: string; rows: { mood: string; label: string; pct: number }[] }
  /** The company, its rivals and the rest as shares of the month's comments
   *  and videos (Where {company} stands against its rivals): code's counts. */
  shares?: { comments: ShareBar; videos: ShareBar | null }
  /** Each brand's own posts published in the month, and how many drew five or
   *  more comments (How rivals are heard): code's counts. */
  posts?: { title: string; rows: { name: string; you: boolean; posts: number; five: number; pct: number }[] }
  /** The company's position in one line (What holds so far): the writer's. */
  position?: BriefItem | null
  /** The rival whose column a table carries beside the company's (Hooks and
   *  formats that work). */
  rival?: string
  // ---- ADDITIVE: the October canvas's pages read from the app (18 Oct) ----
  /** The page's own page in the app: the link at its foot ("Open October on
   *  Market →"), a path drawn against the app's address. */
  link?: { href: string; text: string }
  /** The muted line at the page's foot, beside its link (code's words). */
  foot?: string
  /** Voices' groups for the month (Who is in your market; Who is buying). */
  people?: BriefPeople
  /** Your moves: the advice waiting, the moves dated, the record. */
  moves?: BriefMoves
  /** Your products in the conversation. */
  products?: BriefProducts
  /** Who gets named without being asked. */
  named?: BriefNamed
  /** What to post next. */
  ideas?: BriefIdeas
  /** Hooks and formats, on Content's measure. */
  hooks?: BriefHooks
}

// ---- The October canvas's parts (the boards Heinrich approved, 18 Oct) ----------------
//
// What the pages code reads from the app carry: counts, the stored words the
// app prints (a group's description, a subject's read, an advice title, a post
// idea), and each item's own page. No commenter's words: a part holds no quote.

/** A verdict as a page prints it: its state and, where a comparison was
 *  drawn, the change and its band in points. A refused comparison is not
 *  stored at all (it prints nothing, T0a). */
export interface BriefVerdict {
  state: 'moved' | 'no_clear_change' | 'too_little_data' | 'baseline_forming'
  change: number | null
  band: number | null
}

/** One of Voices' groups in the month. */
export interface BriefGroup {
  /** The persona's key: its page's address. */
  key: string
  /** Stored Pass E prose (`pass_e_persona`): its name, its one line, and what
   *  it wants, what stops it and what tips it, whole. */
  name: string
  oneLiner: string
  wants: string
  stops: string
  tips: string
  /** The month's market videos its comments are on (Voices' count: the groups
   *  overlap, so never a share and never added up). */
  videos: number
  /** The READY subject most of its videos carry (ruling U6), on at least one.
   *  Null where none is. */
  top: { id: string; label: string; k: number; href: string } | null
  /** The company's products named in its videos (Your products' rule), most
   *  first; [] where none came up; null where Your products is off, or the
   *  month is not read for it. */
  products: { name: string; k: number; href: string }[] | null
  href: string
}

export interface BriefPeople {
  /** `YYYY-MM-01`. */
  month: string
  /** The market's videos in the month: every group's "of". */
  market: number
  /** Every group, the most videos first. */
  groups: BriefGroup[]
  /** The deck's, never stored: on Who is buying's last sheet, the groups no
   *  sheet holds (its foot names them). */
  rest?: Pick<BriefGroup, 'name' | 'videos' | 'href'>[]
}

/** A piece of advice waiting for a decision, as Your moves stores it. */
export interface BriefAdvice {
  lineageId: string
  /** `adviceTitle`: stored, `pass_d_b_recommendation`. */
  title: string
  /** `YYYY-MM-DD`: the day it was first raised. */
  firstMade: string
  /** What it would move: the conversation its evidence leads with (stored,
   *  `pass_b_theme`) and that conversation's videos in the month. */
  aim: { label: string; k: number | null; n: number | null; href: string | null } | null
  href: string
}

/** A month on a dated move's axis (`moveAxis`). */
export interface BriefMoveSlot {
  month: string
  /** Read: its videos of the market's; null where not drawn. */
  k: number | null
  n: number | null
  soFar: boolean
  /** Not drawn, and why (`MoveSlot.why`). */
  why: 'pending' | 'cut' | 'unread' | 'move' | 'unknown' | null
}

/** A move the company dated, read as Your moves reads it. */
export interface BriefMove {
  id: string
  /** The client's own words. */
  title: string
  kind: 'subject' | 'theme' | 'advice'
  /** `MOVE_STATUS_LABEL`'s word. */
  status: string
  /** `YYYY-MM-DD`. */
  day: string
  /** What it is read on: a subject's name or a conversation's label. */
  label: string | null
  labelHref: string | null
  slots: BriefMoveSlot[]
  /** The one sentence it earns (Your moves' `MoveSentence`), code's words. */
  sentence: string
  /** The comparison's verdict, where the earlier month may print beside the
   *  later. */
  verdict: BriefVerdict | null
  /** Why its empty months are empty (`axisLine`), or null. */
  axis: string | null
  href: string
}

export interface BriefMoves {
  /** `YYYY-MM-01`: the month the moves page reads. */
  month: string
  /** Every piece of advice waiting for a decision (folded as Your moves folds
   *  it), in its order; the page prints what fits. */
  waiting: BriefAdvice[]
  /** How many pieces wait, all of them (the page may print fewer). */
  waitingCount: number
  /** The moves dated, the one whose comparison prints first, then the
   *  newest. */
  moves: BriefMove[]
  /** Every piece of advice given, how many were decided, and since when. */
  record: { total: number; decided: number; since: string | null; href: string }
  /** Your moves' own page. */
  href: string
}

/** A standout on Your products, in code's words. */
export interface BriefStandout {
  kind: 'first' | 'gap' | 'general' | 'praised' | 'focus'
  /** The eyebrow ("Came up for the first time"). */
  label: string
  /** The product's or the category's name (the client's own catalogue). */
  name: string
  /** One sentence of code's, every figure counted. */
  text: string
  href: string
}

export interface BriefProducts {
  /** `YYYY-MM-01`. */
  month: string
  /** Products with a video in the month, of the catalogue's, and the videos
   *  about any of them or their categories (null where not read). */
  cameUp: number
  products: number
  videos: number | null
  /** The market's videos in the month. */
  market: number | null
  /** Each category, the most videos first: its videos, how many name one of
   *  the company's products, and those products, each with its videos and
   *  whether this is its first month with any (the shelf's rule). */
  categories: { id: string; name: string; videos: number; named: number; products: { name: string; videos: number; first: boolean; href: string }[]; href: string }[]
  standouts: BriefStandout[]
  href: string
}

export interface BriefNamedRow {
  label: string
  you: boolean
  /** Named unprompted: `k_organic` of `n_organic`. */
  named: { k: number; n: number }
  verdict: BriefVerdict | null
  /** Over every video naming it (`k_any`): praised, complained. */
  praised: { k: number; n: number } | null
  complained: { k: number; n: number } | null
  /** The READY subject most of its videos carry (U6). */
  top: { label: string; k: number; n: number } | null
  href: string
}

export interface BriefNamed {
  /** `YYYY-MM-01`. */
  month: string
  /** The month's market videos no brand search found: every row's "of". */
  base: number
  rows: BriefNamedRow[]
  /** Counted, and named unprompted in none of the month's videos. */
  notNamed: string[]
  href: string
}

export interface BriefIdea {
  id: string
  rank: number
  /** Stored, `post_idea`. */
  title: string
  /** Its market videos over the days the ideas read, of the market's then;
   *  and over the month beside it (decision 1: never the first alone). */
  read: { k: number; n: number } | null
  month: { k: number; n: number } | null
  /** Who asks: group names (decision 5), at most `GROUPS_SHOWN`. */
  groups: string[]
  /** Whether the company's posts touched on it (`OwnTouch`). */
  own: { state: 'touched' | 'none' | 'no_posts' | 'unread'; touched: number; posts: number; since: string }
  /** What they want to know: its sub-questions (stored, `post_idea`), the
   *  most videos first, and the videos they were grouped from. */
  asks: { label: string; videos: number }[]
  asksOf: number | null
  /** The format and opening code chose, with their multiples (on the
   *  question). */
  format: { label: string; multiple: number | null } | null
  opening: { label: string; multiple: number | null } | null
  href: string
}

export interface BriefIdeas {
  /** `YYYY-MM-01`: the month each idea's figure is printed beside. */
  month: string
  /** The days the ideas read their questions from. */
  read: { from: string; to: string; label: string }
  /** The first month of the company's posts the touch test read. */
  since: string
  /** Print the medical team line under every idea (`printsMedicalLine`). */
  medical: boolean
  ideas: BriefIdea[]
  /** The month's other question conversations not yet in the company's
   *  posts: their labels (stored, `pass_b_theme`) and videos in the month. */
  asked: { label: string; videos: number; href: string }[]
  /** Worth a reply's page, at the month. */
  replies: string
  href: string
}

export interface BriefHookRow {
  label: string
  /** The category's share of its videos with a value, 0 to 100. */
  share: number
  /** The company's own posts with it, and the rival's videos. */
  own: number | null
  rival: number | null
  /** Its response against a typical market video (the median against the
   *  market's median); null where too few were rated. */
  multiple: number | null
}

export interface BriefHookTable {
  /** The category's videos with a value, the company's posts and the
   *  rival's videos with one. */
  of: number
  ownOf: number | null
  rivalOf: number | null
  rows: BriefHookRow[]
}

export interface BriefHooks {
  /** `YYYY-MM-01`. */
  month: string
  rival: string | null
  formats: BriefHookTable | null
  openings: BriefHookTable | null
  /** "Your posts in {month}": how many and where, the typical post's
   *  response, code's sentence about the mix, and the best post. */
  posts: {
    total: number
    byPlatform: { platform: string; posts: number }[]
    response: { multiple: number; rated: number } | null
    sentence: string | null
    best: { platform: string; date: string; format: string | null; multiple: number; href: string } | null
    href: string
  } | null
  /** What the response is, said once (Content's own words). */
  basis: string
  href: string
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
  /** The finding's short name for the contents ("The route to buy"), the
   *  writer's; the headline where it has none. */
  short?: string
  /** "Part of Buying & delivery, the biggest subject in your market: 23% of
   *  September's videos.": code's, where half or more of the finding's
   *  insights are members of one ready subject. */
  subjectLine?: string
  /** "What each brand is heard for" (the Leadership finding's chips): each
   *  brand with the idea it is heard for, the company last and dark. */
  heardFor?: { name: string; you: boolean; phrase: string }[]
}

export interface BriefFigure {
  value: string
  label: string
}

export type SectionKey =
  | 'sales.buyers' | 'sales.deciders' | 'sales.stops' | 'sales.settle' | 'sales.triggers' | 'sales.rivals' | 'sales.care'
  | 'marketing.believe' | 'marketing.words' | 'marketing.say_hear' | 'marketing.recall' | 'marketing.rivals'
  | 'content.questions' | 'content.formats' | 'content.watch' | 'content.more' | 'content.confusion' | 'content.borrow'
  | 'leadership.market' | 'leadership.shares' | 'leadership.weigh' | 'leadership.risks' | 'leadership.decisions' | 'leadership.holds'
  // The October canvas (18 Oct): the pages read from the app's own pages,
  // kept in `fromApp`, never in `sections`.
  | 'sales.groups' | 'marketing.products' | 'marketing.named' | 'content.ideas' | 'content.hooks'
  | 'leadership.subjects' | 'leadership.groups' | 'leadership.moves'

/** The October canvas's section keys: they live in `fromApp` alone. */
export const APP_SECTION_KEYS: readonly SectionKey[] = [
  'sales.groups', 'marketing.products', 'marketing.named', 'content.ideas', 'content.hooks',
  'leadership.subjects', 'leadership.groups', 'leadership.moves',
]

export interface MonthlyBriefData {
  version: 1
  kind: 'monthly_brief'
  role: BriefRole
  title: string
  company: string
  /** What the company sells, where the product has a noun for it ("bags"):
   *  the deck's "other bags in your market". Absent on a brief written before
   *  it was stored. */
  noun?: string | null
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
  /**
   * ADDITIVE (the October canvas, approved 18 Oct): the pages code reads from
   * the app's own pages (Market's subject reads, Voices' groups and brands,
   * Your products, Content's ideas and its measure, Your moves), each a
   * section of its own key. PRESENT, the deck draws the October canvas's page
   * set (deck.ts `OCTOBER_PAGES`); ABSENT (every brief stored before it), the
   * 12 Oct canvas's, exactly. Kept apart from `sections` so a deck from before
   * it, which knows none of these keys (its `PAGE_NEEDS` has no row for them
   * and would throw), draws a brief that has them as it always drew one.
   */
  fromApp?: BriefSection[]
  /** What was written and does not print, and why: the operator's, never a
   *  reader's. */
  held: { what: string; reason: string }[]
  promptVersion: string
  model: string
  costUsd: number
}
