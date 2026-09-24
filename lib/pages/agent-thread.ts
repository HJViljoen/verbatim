import type { SupabaseClient } from '@supabase/supabase-js'
import { anchorClaims, type Segment } from '../ask/anchor'
import { createCitedQuotePicker, fetchQuotesByAudience, fetchQuoteTextsByCommentId } from '../quotes'
import { quoteRef } from '../renderables/quotes-freeze'
import type { Quote, Scope, Slide } from '../renderables/types'
import { resolveCitations, type CitationMeta } from '../evidence-cite'
import { AGENT_MOVEMENT_MONTHS, ASK_THEMES_PER_CLAIM, directionWordsFor } from '../config'
import { fmtInt, monthName, shortDate, weekdayDate } from '../format'
import { row, rows as readRows } from './read'
import { isMissingColumnError } from '../supabase-admin'
import type { ClaimResult, Judgement, AskSummary } from '../ask/types'
import { loadPlanChecks, PLAN_VERDICT_LABEL, type PlanCheckCard } from '../ask/plan-cards'
import { JUDGEMENT_HEADING, NEAREST_HEADING, type AgentAnswer } from '../agent/types'
import { askBasisLine, loadIndexFacts, type AskBasis } from '../agent/basis'
import {
  answerFallback,
  askAllowList,
  loadNotAnswered,
  measureAnswer,
  scrubThreadAnswer,
  type AnswerMeasure,
  type NotAnswered,
} from '../agent/measure'
import { loadMonthSeries } from '../reading/read'
import { monthStartOf, prevMonth } from '../reading/month-key'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '../rivals'
import { detailHref } from '../shell/bar'
import { surface } from '../nav'
import type { MethodNoteData } from '../../components/print/method-note'

// The agent thread as a page module (Reports & Exports T11, 2026-08-29) —
// what app/dashboard/agent/[id]/page.tsx used to compute inline, as tile-ready
// data the app page, the print route and a snapshot share.
//
// Stored answers carry comment IDS, not words: the words are resolved here,
// through insight_evidence, so an erased comment stops resolving everywhere
// at once. Every quote travels as { ref, text } (c:<comment> or v:<video>),
// and the evidence appendix — platform · date · link per quote — is numbered
// here so the answer's superscripts and the appendix agree.

export type AgentParams = { thread?: string }

export interface ThreadQuote extends Quote {
  commentId: string | null
  videoId: string | null
  /** Appendix number, assigned across the whole thread. */
  n: number
}

export interface ThreadAnswer extends Omit<AgentAnswer, 'grounded'> {
  /** `replaced` is a point whose own sentence the scrubbers emptied: `text` is
   *  the product's reading in its place and says so in words, never a blank. */
  grounded: (Omit<AgentAnswer['grounded'][number], 'quotes'> & { quotes: ThreadQuote[]; replaced?: boolean })[]
  /**
   * What the scrubbers removed from THIS answer's prose (D8, mock-gap D13).
   *
   * `answer` and every `grounded[].text` above are the SCRUBBED strings: a
   * sentence in which the model typed a figure of its own is gone, and so is
   * one naming a direction no verdict earned. The quotes are untouched — they
   * are the commenter's own words and travel as their own nodes.
   *
   * The counters are here rather than only in `ai_call_log` because a reader
   * has to be able to tell a short answer from a scrubbed one, and because a
   * prompt that starts leaking should be visible on the surface it leaks onto.
   * Absent on an answer measured against nothing at all.
   */
  scrub?: { dropped: number; droppedDigits: number; droppedDirection: number; magnitude: number; leaked: boolean }
  /** What the product says in place of an answer the scrubbers emptied —
   *  composed from the same verdicts, and saying that it was. Null whenever
   *  `answer` survived. */
  fallback?: string | null
}

export interface Turn {
  question: string
  askedAt: string
  answer: ThreadAnswer | null
  /** The agent's prose when a turn has no structured result. */
  prose: string | null
  outcome: string | null
  /** When the update THIS answer was answered against started (AS3). Null for a
   *  turn with no answer, and for one whose run has since been deleted. */
  updateAt: string | null
}

/** A Quote itself (ref + text at the top level), so the freeze/resolve walk
 *  drops an erased voice from the appendix as it does from the answer. */
export interface Citation extends Quote, CitationMeta {
  n: number
}

export interface DocumentCheck {
  sourceFilename: string | null
  /** What the reader is told about the READING — clipped, or past the page
   *  limit. Null when the whole document was read, and null where the column
   *  that stores it has not been applied yet. */
  notice: string | null
  claims: ClaimResult[]
  summary: AskSummary
  judgement: Judgement[]
  quotesByClaim: Record<string, Quote[]>
  segments: Segment[]
  anchored: string[]
}

/**
 * The attached-plan chip, above the ask box (`ask.plan.chip`).
 *
 * READ THROUGH THE SHARED LOADER, not through a second query of its own
 * (Block D wave 2, E-ask). Ask used to run its own `plan_checks` /
 * `plan_check_evaluations` pair here while `lib/ask/plan-cards.ts` ran another
 * for Market's card, and the two could disagree about which plan is "the"
 * plan and about what its verdicts are — Ask's read `plan_checks.claims`, the
 * column written once at upload and never written back, where the card reads
 * the newest re-evaluation (`currentReading`, and on production Össur's C1 has
 * moved four times since its upload). One loader, one answer.
 *
 * `moved` keeps its name and changes its RULE: see `AskHistoryRow.claimCrossed`.
 */
export interface AskPlanChip {
  planId: string
  title: string
  uploadedOn: string
  /** How many claims the plan holds, and how they read on the newest
   *  re-reading. */
  claims: number
  summary: AskSummary
  /** Claims that crossed between supported and contradicted on the newest
   *  re-reading — what lights the flag. */
  crossed: number
  /** `crossed > 0`. Kept as a boolean because the chip is a yes/no. */
  moved: boolean
  href: string
}

export interface AgentThreadData {
  threadId: string
  kind: 'question' | 'document'
  title: string
  brand: string
  createdAt: string
  turns: Turn[]
  citations: Citation[]
  /** Questions the corpus did not speak to (silent answers), verbatim. */
  silentQuestions: string[]
  document: DocumentCheck | null
  /** What this thread was answered against — the index as it is NOW, with
   *  `updateAt` set to the newest answered turn's own update (AS3). A turn
   *  answered against an older update carries its own date in `Turn.updateAt`;
   *  the index facts are shared, because there is one index. */
  basis: AskBasis
  /**
   * The newest answered turn's MEASUREMENT (D8) — the levels with their own
   * denominators, the banded verdicts, the month series each chart is drawn
   * from, the figure table its prose may name and the caveats the registers
   * owe. Null when the monthly reading is not recorded for this workspace, or
   * when no turn here rests on a theme the months carry, which are two real
   * states and not an error.
   *
   * ONE MEASUREMENT PER THREAD, not one per turn: the findings of a follow-up
   * are the findings of the same conversation about the same months, and a
   * second measurement would be a second set of figure keys over one page.
   */
  measure: AnswerMeasure | null
  /** The wall-clock month's questions, its refusals and the workspace budget.
   *  Null only where the read failed. */
  notAnswered: NotAnswered | null
  /** The workspace's most recently checked plan, for the ask box's chip. */
  planChip: AskPlanChip | null
  /** The rail's "Earlier questions" tile. Null where the read failed. */
  history: AskHistory | null
  /** The rail's "What an answer draws on" `<dl>`. */
  draws: AskDrawRow[]
  /**
   * What the page bar prints. Ask's bar is `title` (lib/nav.ts) because nothing
   * on this surface is a reading of a month, so `context` is the ASK BASIS —
   * which update an answer is given against and how much of the corpus is
   * searchable — and never the month/still-filling context line the five
   * reading surfaces carry.
   */
  bar: { question: string; context: string }
  /** The "what an answer draws on" lines and where the record drawer opens.
   *  Exposed whatever `lib/nav.ts:hasRecord` says about Ask today. */
  record: { lines: string[]; href: string } | null
  method: MethodNoteData
}

/**
 * Where "The record →" opens the how-sound drawer from Ask.
 *
 * OVER THE PAGE THE READER IS ON. The drawer is a detail param, so the address
 * has to be the CURRENT one: pointed at Ask's index, opening the record from
 * inside a thread threw the reader back to the question list and lost the
 * answer they were reading. Whether the bar mounts the drawer at all is
 * `lib/nav.ts:hasRecord`'s answer and not this file's.
 */
export const askRecordHref = (threadId?: string | null): string =>
  detailHref(threadId ? `${surface('ask').href}/${threadId}` : surface('ask').href, {}, 'record')

/**
 * A finding's key on this page: the TURN it was written in, then the model's
 * own ref inside that turn.
 *
 * `GroundedPoint.id` is the model's ref and is stable WITHIN ONE ANSWER only
 * (lib/agent/types.ts; `enforce.ts` assigns `id: ref`) — every answer starts
 * again at "G1". Keyed on the ref alone a follow-up's first finding is dropped
 * as a duplicate of the first answer's, and the follow-up's prose is then
 * scrubbed against the FIRST answer's figure table and the FIRST answer's
 * verdicts. Two of the seven production threads that carry an answer are
 * multi-turn, so that is the normal case rather than an edge.
 *
 * The key is composed here and nowhere else, because a rendered point has to be
 * matched back to its `FindingMeasure` with the same string — by this file when
 * the scrubbers empty a point, and by wave 2 when it draws the chart.
 */
export const findingKey = (turnIndex: number, ref: string): string => `${turnIndex}:${ref}`

/** One finding per grounded point, in the answer's own order, carrying the
 *  registry ids that point rests on and keyed by the turn it was written in. */
export function answerFindings(turns: readonly Turn[]): { findingId: string; registryIds: string[] }[] {
  const out: { findingId: string; registryIds: string[] }[] = []
  const seen = new Set<string>()
  turns.forEach((t, i) => {
    for (const g of t.answer?.grounded ?? []) {
      const key = findingKey(i, g.id)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        findingId: key,
        registryIds: (g.themeRefs ?? []).map((r) => r.registryId).filter((r): r is string => Boolean(r)),
      })
    }
  })
  return out
}

/**
 * "What an answer draws on", in the reader's words.
 *
 * FOUR OF THE MOCK'S FIVE ROWS ARE NOT HERE, and each is left out for its own
 * reason rather than for want of a query. Updates-this-month, videos-analysed
 * and the language mix all live on `lib/reading/record.ts:loadRecordInputs`,
 * which is the record surface's loader and a far heavier read than this page
 * has any business doing; the tracking-changes row is `config_changes`, the
 * same. What is here is what this page already holds: the two facts the basis
 * line reads, plus the one count that makes "The record →" mean something.
 * Pure, so the sentences are argued in a test.
 */
export function askRecordLines(basis: AskBasis, delivered: number | null): string[] {
  const lines: string[] = []
  lines.push(
    delivered == null
      ? 'How many updates have been delivered is not recorded here.'
      : delivered === 0
        ? 'No update has been delivered for this workspace yet.'
        : `${fmtInt(delivered)} ${delivered === 1 ? 'update' : 'updates'} delivered.`,
  )
  lines.push(
    basis.monthlyReadings == null
      ? 'The month-by-month reading has not been recorded for this workspace yet.'
      : basis.monthlyReadings === 0
        ? 'No month yet carries enough videos to compare on.'
        : basis.monthlyReadings === 1
          ? '1 monthly reading carries enough videos to compare on.'
          : `${fmtInt(basis.monthlyReadings)} monthly readings carry enough videos to compare on.`,
  )
  lines.push(
    basis.total == null || basis.embedded == null
      ? 'How much of the corpus a question can search is not recorded.'
      : basis.total === 0
        ? 'There is nothing to search yet.'
        : `${fmtInt(basis.embedded)} of ${fmtInt(basis.total)} findings are searchable.`,
  )
  return lines
}

// ── "What an answer draws on" — the rail's <dl> (Block D wave 2, E-ask) ──────

/** One row of the draws tile: the mono term and the fact beside it. */
export interface AskDrawRow {
  /** The `<dt>` — one word, the mock's own. */
  term: string
  /** The `<dd>`. Code's sentence, always; a row with nothing to say says so. */
  value: string
}

/**
 * The four facts Ask holds about what stands behind an answer.
 *
 * THE MOCK DRAWS FIVE ROWS AND THIS PRINTS FOUR, and the missing three are a
 * stated deviation rather than an oversight. Updates-this-month with its dates,
 * videos-analysed with its trailing median, the language mix and the
 * tracking-change count all live on `lib/reading/record.ts:loadRecordInputs` —
 * eight tenant-wide reads, on a page whose own loader already pays three
 * uncached counts per render (`lib/agent/basis.ts:loadIndexFacts` says so in
 * its own docstring, and the 16 September outage is what the docstring is
 * about). So the tile prints what this page ALREADY read, and "The record →"
 * in its footer is where the rest is: the record drawer is the surface those
 * facts belong to, and `lib/nav.ts:hasRecord` admits Ask precisely so it can
 * be opened from here.
 *
 * `Updates` is the ALL-TIME delivered count, not the mock's four-this-month,
 * and the row says "delivered" rather than "this month" so the two cannot be
 * read as each other. Pure, so the sentences are argued in a test.
 */
export function askDraws(basis: AskBasis, delivered: number | null): AskDrawRow[] {
  const months = basis.readingMonths ?? []
  const named = months.length ? ` · ${months.map((m) => monthName(m).split(' ')[0]).join(', ')}` : ''
  return [
    {
      term: 'Readings',
      value:
        basis.monthlyReadings == null
          ? 'not recorded for this workspace yet'
          : basis.monthlyReadings === 0
            ? 'no month yet carries enough videos to compare on'
            : `${fmtInt(basis.monthlyReadings)} monthly${named}`,
    },
    {
      term: 'Updates',
      value:
        delivered == null
          ? 'not recorded here'
          : delivered === 0
            ? 'none delivered yet'
            : `${fmtInt(delivered)} delivered`,
    },
    {
      term: 'Searchable',
      value:
        basis.total == null || basis.embedded == null
          ? 'not recorded'
          : basis.total === 0
            ? 'nothing to search yet'
            : `${fmtInt(basis.embedded)} of ${fmtInt(basis.total)} findings`,
    },
    {
      term: 'Indexed',
      value: basis.lastEmbeddedAt ? `as at ${shortDate(basis.lastEmbeddedAt)}` : 'when they were indexed is not recorded',
    },
  ]
}

// ── "Earlier questions" — the rail's history tile ────────────────────────────

/** One earlier thread, as the rail prints it. */
export interface AskHistoryRow {
  threadId: string
  /** The thread's title — `ask_extract_title`, a model slot. */
  title: string
  askedAt: string
  /**
   * A claim of the plan behind this thread CROSSED between supported and
   * contradicted on its newest re-reading.
   *
   * WHAT MAKES THE CHIP FIRE, DECIDED HERE (the brief asks for the decision and
   * for it to be stated). Not "any movement": 2–4 of about 15 claims flip
   * verdict weekly on both tenants, and most of those flips are to or from
   * UNTESTED — which means the retrieval did or did not surface a quotable
   * comment this update, not that the conversation changed its mind. A chip
   * that lights on every update is furniture. A claim that crosses between
   * supported and contradicted is the one movement that is a change of answer,
   * and on production 2026-09-18 that is rare enough to be worth a flag: of the
   * eight stored re-evaluations, Össur's C1 went contradicts → silent →
   * contradicts → silent and crossed ZERO times.
   *
   * THREE VALUES, NOT TWO. `false` means the plan behind this thread WAS
   * re-read and none of its claims crossed; NULL means we did not read that
   * plan. `loadPlanChecks` is capped at `PLAN_CARDS_SHOWN` and the row list is
   * the newest fifty threads, so a thread hanging off the third-newest plan has
   * no answer here — and rendering it as `false` would answer a question we did
   * not ask. Everywhere else on this surface absent and zero are kept apart
   * (`askDraws` prints "not recorded", `readingsMeta` prints "not recorded
   * here"); this field is no different. A thread with no plan at all is `false`
   * — there is nothing to cross, and that IS an answer.
   */
  claimCrossed: boolean | null
}

export interface AskHistory {
  rows: AskHistoryRow[]
  /**
   * How many rows were HELD when the tile was drawn — the list `shown` caps,
   * after the open thread is taken out. A fact about the tile, which is what
   * its meta slot has to be.
   *
   * IT REPLACED A COUNT OF THE MONTH, and the difference is the defect. The
   * meta used to be `thisMonth`: every question asked in the wall-clock month,
   * drawn or not. On the fixture that printed "3 this month" over rows dated
   * 13 Sep · 6 Sep · 20 Aug — a reader counting September rows in the list got
   * two, and the August row looked as if it fell inside the count. On a thread
   * page the two can never agree by construction, because the counted question
   * the reader is looking at is the one deliberately not drawn. The month's
   * asking is still stated on this page, once, by the tile whose month it is:
   * `NotAnswered.line` ("3 of 40 questions asked this month").
   */
  held: number
  /**
   * The oldest question this workspace holds, or null.
   *
   * EARLIEST EVIDENCE, NEVER A START DATE (D14). We do not know when a
   * workspace started asking; we know the oldest row we still hold, and the
   * word in the footer says exactly that.
   */
  earliest: string | null
  href: string
}

/** Where "All questions →" goes. */
export const ASK_INDEX_HREF = '/dashboard/agent'

/**
 * The history tile, from rows the loader fetched. Pure.
 *
 * `shown` caps the rail at the mock's three; `held` is how many rows there
 * were to draw from, so the meta can say what the tile is showing OF what.
 *
 * `exclude` is THE THREAD THE READER IS ON. "Earlier questions" listed the open
 * thread as its first row, linking to itself, 300px from the same question
 * rendered at 15px in the answer tile beside it. It is taken out of `held` as
 * well as out of `rows`: the tile is a list of where ELSE to go, and a
 * denominator that counted the row it refuses to draw would be the same
 * mismatch in smaller print.
 */
export function askHistory(
  rows: readonly { threadId: string; title: string; askedAt: string; claimCrossed?: boolean | null }[],
  shown = 3,
  exclude?: string | null,
): AskHistory {
  const ordered = [...rows].sort((a, b) => b.askedAt.localeCompare(a.askedAt))
  const drawn = exclude ? ordered.filter((r) => r.threadId !== exclude) : ordered
  return {
    rows: drawn.slice(0, shown).map((r) => ({
      threadId: r.threadId,
      title: r.title,
      askedAt: r.askedAt,
      // An EXPLICIT null survives as null — "we did not re-read that plan".
      // Omitted is `false`: a caller that says nothing is a thread with no plan
      // behind it, which has nothing to cross.
      claimCrossed: r.claimCrossed === null ? null : r.claimCrossed === true,
    })),
    held: drawn.length,
    // The oldest row we HOLD, off the rows handed in. The loader reads the
    // oldest separately, because the rail's own list is capped and the oldest
    // of fifty is not the oldest of five hundred.
    earliest: ordered.length ? ordered[ordered.length - 1].askedAt : null,
    href: ASK_INDEX_HREF,
  }
}

/**
 * Did a plan's claims cross between supported and contradicted?
 *
 * Reads `PlanCheckCard.moved`, whose `from`/`to` are already the reader's words
 * (`PLAN_VERDICT_LABEL`). Untested on either side is not a crossing — see
 * `AskHistoryRow.claimCrossed` for why that is the line.
 */
export function claimsCrossed(moved: readonly { from: string; to: string }[]): number {
  const sides = new Set([PLAN_VERDICT_LABEL.echoes, PLAN_VERDICT_LABEL.contradicts])
  return moved.filter((m) => sides.has(m.from) && sides.has(m.to) && m.from !== m.to).length
}

/** The newest checked plan as the ask box's chip, from the shared loader's
 *  cards. Null with no plan, which is most workspaces. Pure. */
export function askPlanChip(cards: readonly PlanCheckCard[]): AskPlanChip | null {
  const card = cards[0]
  if (!card) return null
  const crossed = claimsCrossed(card.moved)
  return {
    planId: card.planId,
    title: card.title,
    uploadedOn: card.uploadedOn,
    claims: card.claims.length,
    summary: card.summary,
    crossed,
    moved: crossed > 0,
    href: card.href,
  }
}

/**
 * The history tile's rows, and the oldest question we hold.
 *
 * TWO READS, BOTH TINY, and the second is why this is not a slice of the first:
 * the list is capped, and the oldest of the last fifty threads is not the
 * oldest thread. D14 is about exactly that — "since 6 Apr" has to be the
 * earliest EVIDENCE, and a date derived from a capped page is a date about our
 * paging.
 *
 * The plan crossings come off the same shared loader the chip uses, so a
 * thread's flag and the chip above it cannot disagree about what moved.
 */
export async function loadAskHistory(
  scope: Scope,
  /**
   * The plan cards, HANDED IN — never loaded here.
   *
   * `loadPlanChecks` is "FOUR READS, CAPPED" by its own docstring, and every
   * caller of this function also needs the cards for the ask box's chip. When
   * this loaded its own, Ask paid eight reads where four would do, twice per
   * render, on both routes — the read shape AGENTS.md legislates against, on a
   * page whose own loader docstring was written against the 16 September
   * outage. A PROMISE is accepted as well as an array so the caller can hand in
   * the one it already has in flight: it joins the `Promise.all` below rather
   * than serialising behind it, so the fix costs no round trip.
   */
  cardsIn: readonly PlanCheckCard[] | Promise<readonly PlanCheckCard[]>,
  limit = 50,
): Promise<AskHistory> {
  // The thread the reader is ON, off the same param the loader reads. Not
  // drawn in the rail; still counted in the month (`askHistory`).
  const openThread = (scope.params as AgentParams | undefined)?.thread ?? null
  const supabase = scope.supabase as SupabaseClient
  const { clientId } = scope
  const [listRes, oldestRes, cards] = await Promise.all([
    supabase
      .from('agent_threads')
      .select('id, title, created_at, plan_check_id')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('agent_threads')
      .select('created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    cardsIn,
  ])
  const list = readRows<{ id: string; title: string | null; created_at: string; plan_check_id: string | null }>(
    listRes,
    'askHistory.threads',
  )
  const crossedByPlan = new Map(cards.map((c) => [c.planId, claimsCrossed(c.moved) > 0]))
  const history = askHistory(
    list.map((t) => ({
      threadId: t.id,
      title: t.title ?? 'A question you asked',
      askedAt: t.created_at,
      // A thread with NO plan has nothing to cross — that is `false`, an
      // answer. A thread whose plan is not among the cards we read has no
      // answer at all, and says so with null rather than with a `false` that
      // reads as "its claims held" (`AskHistoryRow.claimCrossed`).
      claimCrossed: !t.plan_check_id ? false : crossedByPlan.get(t.plan_check_id) ?? null,
    })),
    3,
    openThread,
  )
  const oldest = row<{ created_at: string }>(oldestRes, 'askHistory.oldest')
  return { ...history, earliest: oldest?.created_at ?? history.earliest }
}

/** `n` months before `month`, as a month start. */
function monthsBack(month: string, n: number): string {
  let m = monthStartOf(month)
  for (let i = 0; i < n; i++) m = prevMonth(m)
  return m
}

export async function loadAgentThread(scope: Scope): Promise<AgentThreadData | null> {
  const supabase = scope.supabase as SupabaseClient
  const clientId = scope.clientId
  const id = (scope.params as AgentParams).thread
  if (!id) return null

  const [threadRes, messagesRes, clientRes] = await Promise.all([
    // RLS already scopes to the tenant; the explicit client_id filter makes a
    // cross-tenant id a miss rather than an empty page.
    supabase.from('agent_threads').select('id, kind, title, plan_check_id, created_at').eq('id', id).eq('client_id', clientId).maybeSingle(),
    supabase.from('agent_messages').select('id, role, content, result, outcome, created_at, run_id').eq('thread_id', id).order('created_at', { ascending: true }),
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
  ])
  const thread = row<{ id: string; kind: string; title: string; plan_check_id: string | null; created_at: string }>(threadRes, 'agentThread.thread')
  if (!thread) return null
  type MessageRow = { id: string; role: string; content: string; result: AgentAnswer | null; outcome: string | null; created_at: string; run_id: string | null }
  const messages = readRows<MessageRow>(messagesRes, 'agentThread.messages')
  const client = row<{ company_name: string | null }>(clientRes, 'agentThread.client')
  const brand = client?.company_name ?? 'Your brand'

  // Words for the stored comment ids, through insight_evidence (see header).
  const commentIds = messages.flatMap((m) => (m.result?.grounded ?? []).flatMap((g) => g.quotes.map((q) => q.commentId).filter((c): c is string => Boolean(c))))
  const quoteTextP = commentIds.length ? fetchQuoteTextsByCommentId(supabase, commentIds) : Promise.resolve(new Map<string, string>())
  quoteTextP.catch(() => {})
  // Where each quoted voice was said (the appendix): the refs are known from
  // the stored answers before any text resolves, so the comments → videos join
  // goes out now, alongside the words — not as a wave of its own afterwards.
  const citeRefs = messages.flatMap((m) => (m.result?.grounded ?? []).flatMap((g) => g.quotes.map((q) => ({ commentId: q.commentId, videoId: q.videoId }))))
  const metaP = citeRefs.length ? resolveCitations(supabase, citeRefs) : Promise.resolve(new Map<string, CitationMeta>())
  metaP.catch(() => {})

  // AS3's index facts and the dates of the updates these answers were given
  // against. Both go out with the wave above rather than after it: round trips
  // are the cost on this database, not rows.
  const factsP = loadIndexFacts(supabase, clientId)
  factsP.catch(() => {})
  const runIds = [...new Set(messages.map((m) => m.run_id).filter((r): r is string => Boolean(r)))]
  const runsP = runIds.length
    ? supabase.from('pipeline_runs').select('id, started_at').eq('client_id', clientId).in('id', runIds)
    : Promise.resolve({ data: [], error: null })

  // D8's four reads, all of them functions of the tenant alone, so they leave
  // with the wave above rather than after it. Every one is small: a head count,
  // one plan row, one month of message rows, and the month series for the
  // themes THIS thread already rests on (never the whole registry, and never a
  // rival's audience — see lib/agent/measure.ts).
  const deliveredP = supabase
    .from('pipeline_runs')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
  // THE PLAN COMES THROUGH THE SHARED LOADER (E-ask; see `AskPlanChip`). This
  // was two hand-rolled reads that could disagree with Market's card about
  // which plan is the plan and about how its claims read; it is now the one
  // loader both surfaces call, capped at `PLAN_CARDS_SHOWN`, and a failure is
  // a missing chip rather than a missing page — the chip is an affordance.
  const plansP = loadPlanChecks(scope).catch(() => [] as PlanCheckCard[])
  const notAnsweredP = loadNotAnswered(scope).catch(() => null)
  // ONE WAVE OF PLAN READS, not two. `plansP` is already in flight for the
  // chip; the history's crossings read the same cards rather than starting a
  // second identical wave beside it.
  const historyP = loadAskHistory(scope, plansP).catch(() => null)

  const storedRegistryIds = [
    ...new Set(
      messages.flatMap((m) =>
        (m.result?.grounded ?? []).flatMap((g) =>
          (g.themeRefs ?? []).map((r) => r.registryId).filter((r): r is string => Boolean(r)),
        ),
      ),
    ),
  ]
  // THE AXIS ENDS AT THE MONTH THIS THREAD WAS ANSWERED IN, and not at today's.
  //
  // The months are the COMMENT's either way — that is what the reading layer
  // holds and nothing here changes it. What this decides is WHICH of them the
  // answer is measured against, and "today" was wrong: a thread answered in
  // June, opened in September, printed September's figures under June's prose
  // and had June's sentences scrubbed against September's verdicts. The answer
  // was written against a June update and can only be checked against what
  // June's conversation says. Capped at the current month, because a clock that
  // ran ahead is not a month anyone can read.
  const answeredAt = [...messages].reverse().find((m) => m.role === 'agent' && m.result)?.created_at ?? null
  const thisMonth = monthStartOf(new Date().toISOString())
  const answeredMonth = answeredAt ? monthStartOf(answeredAt) : thisMonth
  const readMonth = answeredMonth > thisMonth ? thisMonth : answeredMonth
  const seriesP = storedRegistryIds.length
    ? loadMonthSeries(scope.reading.client, scope.reading.clientId, {
        audiences: [CLIENT_AUDIENCE, INDUSTRY_AUDIENCE],
        objectKind: 'theme',
        objectIds: storedRegistryIds,
        from: monthsBack(readMonth, AGENT_MOVEMENT_MONTHS - 1),
        to: readMonth,
      }).catch(() => null)
    : Promise.resolve(null)

  // A document thread wraps a plan_check; its quotes resolve from stored
  // insight ids — no quote text is kept in either table.
  let document: DocumentCheck | null = null
  if (thread.kind === 'document' && thread.plan_check_id) {
    const check = row<{
      claims: ClaimResult[] | null
      summary: AskSummary | null
      judgement: Judgement[] | null
      input_text: string | null
      source_filename: string | null
      notice: string | null
    }>(await (async () => {
      const columns = 'claims, summary, judgement, input_text, source_filename'
      const read = (cols: string) => supabase
        .from('plan_checks')
        .select(cols)
        .eq('id', thread.plan_check_id as string)
        .eq('client_id', clientId)
        .maybeSingle()
      const withNotice = await read(`${columns}, notice`)
      // `notice` arrives with its own migration and a deploy can land first.
      // Narrow by name, the embeddingCoverage precedent: any other failure of
      // this read is still a failure, and the whole document check must not
      // disappear because one column is not there yet.
      return isMissingColumnError(withNotice.error, 'notice') ? await read(columns) : withNotice
    })(), 'agentThread.planCheck')
    if (check) {
      const claims = (check.claims ?? []) as ClaimResult[]
      const allIds = [...new Set(claims.flatMap((c) => (c.insightIds ?? []).slice(0, ASK_THEMES_PER_CLAIM)))]
      const byAudience = allIds.length ? await fetchQuotesByAudience(supabase, allIds) : new Map()
      const pick = createCitedQuotePicker(byAudience, new Map())
      const quotesByClaim: Record<string, Quote[]> = {}
      for (const c of claims) {
        if (c.verdict === 'silent' || !c.insightIds?.length) continue
        quotesByClaim[c.ref] = pick(c.insightIds.slice(0, ASK_THEMES_PER_CLAIM), 2, `${c.claim}. ${c.theySay ?? ''}`)
      }
      // Every claim is anchored, including untested ones; non-silent first so
      // a shared sentence goes to the claim that earns a mark.
      const ordered = [...claims.filter((c) => c.verdict !== 'silent'), ...claims.filter((c) => c.verdict === 'silent')]
      const { segments, anchored } = anchorClaims((check.input_text as string) ?? '', ordered)
      document = {
        sourceFilename: (check.source_filename as string | null) ?? null,
        notice: (check.notice as string | null) ?? null,
        claims,
        summary: (check.summary ?? { supported: 0, contradicted: 0, untested: 0 }) as AskSummary,
        judgement: (check.judgement ?? []) as Judgement[],
        quotesByClaim,
        segments,
        anchored: [...anchored],
      }
    }
  }

  const quoteText = await quoteTextP
  const runStartedAt = new Map(
    readRows<{ id: string; started_at: string | null }>(await runsP, 'agentThread.runs')
      .map((r) => [r.id, r.started_at]),
  )

  // Turns: each user message with the agent message that answered it.
  const turns: Turn[] = []
  let n = 0
  const cited: { ref: string; commentId: string | null; videoId: string | null; text: string; n: number }[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role !== 'user') continue
    const reply = messages[i + 1]?.role === 'agent' ? messages[i + 1] : null
    let answer: ThreadAnswer | null = null
    if (reply?.result) {
      const grounded = reply.result.grounded.map((g) => ({
        ...g,
        quotes: g.quotes
          .map((q) => ({ ...q, text: q.text || (q.commentId ? quoteText.get(q.commentId) ?? '' : '') }))
          .filter((q) => q.text)
          .map((q) => {
            n += 1
            const ref = q.commentId ? quoteRef.comment(q.commentId) : quoteRef.video(q.videoId as string)
            cited.push({ ref, commentId: q.commentId, videoId: q.videoId, text: q.text, n })
            return { ref, text: q.text, commentId: q.commentId, videoId: q.videoId, n }
          }),
      }))
      answer = { ...reply.result, grounded }
    }
    turns.push({
      question: m.content,
      askedAt: m.created_at,
      answer,
      prose: reply && !reply.result ? reply.content : null,
      outcome: reply?.outcome ?? null,
      // The REPLY's run where there is one, and the submission's own where
      // there is not: a document check writes its run on the user row and never
      // replies with an agent message, so keying on the reply alone told a
      // reader that nothing had been read for their workspace.
      updateAt: (() => {
        const rid = reply?.run_id ?? m.run_id
        return rid ? runStartedAt.get(rid) ?? null : null
      })(),
    })
  }

  const meta = await metaP
  const citations: Citation[] = cited.map((c) => {
    const m = meta.get(c.ref)
    return { n: c.n, ref: c.ref, text: c.text, platform: m?.platform ?? null, date: m?.date ?? null, href: m?.href ?? null, commentLevel: m?.commentLevel ?? false }
  })

  const facts = await factsP
  // The newest answered turn's update leads the thread. An unanswered thread
  // has no update to name and the line says nothing has been read yet, which is
  // the honest reading of a thread with no answer in it.
  const newestUpdateAt = [...turns].reverse().find((t) => t.updateAt)?.updateAt ?? null

  const silentQuestions = turns.filter((t) => t.answer?.silent).map((t) => t.question)
  const platforms = [...new Set(citations.map((c) => c.platform).filter((p): p is string => !!p))]
  // FINDINGS, WHICH IS WHAT THEY ARE AND WHAT THIS PAGE CALLS THEM. The set is
  // `insightIds` — `audience_insights` rows — and the note under every printed
  // slide used to name the table: "Findings rest on N distinct audience
  // insights". "insight" is in neither THIRTEEN_WORDS nor GLOSSARY, and one
  // file over `lib/agent/basis.ts` composes this same page's AS3 line as "N of
  // M findings searchable", with a docblock at `:136` explaining exactly that
  // choice. So the bar said `findings` and the PDF footer said `audience
  // insights`, for one object.
  const findings = new Set(turns.flatMap((t) => (t.answer?.grounded ?? []).flatMap((g) => g.insightIds)))

  // ── D8 · the measurement, and the scrub it licenses ──────────────────────
  //
  // THE ORDER MATTERS AND IS THE WHOLE RULE. The measurement is taken FIRST,
  // off the comment-dated months; the prose is scrubbed AGAINST it. A figure
  // the model typed survives only as a `[[key]]` this table holds, and a
  // direction word only for an object one of these verdicts earned one for —
  // which, on this surface, is possible at all because `agent.movement` is the
  // one reader flag that is true. Measured against nothing, the table is empty
  // and the rules delete every figure and every direction, which is what the
  // prompts have asked for in words since WP7 and nothing has enforced.
  const set = await seriesP
  const seeded = set != null && set.substrate === 'seeded' && set.numeratorSubstrate === 'seeded'
  const measure = measureAnswer({
    findings: answerFindings(turns),
    series: seeded ? (set as NonNullable<typeof set>).series : [],
    month: readMonth,
    directionWords: directionWordsFor('agent.movement'),
    ownAudience: CLIENT_AUDIENCE,
    hasJudgement: turns.some((t) => (t.answer?.judgement.length ?? 0) > 0),
  })
  const fallback = answerFallback(measure)
  // The thread's own inputs, never its output: the client's questions and the
  // theme labels the answer rests on. A product name with a digit in it
  // ("3R78", "L5999") is a NAME, and without this every sentence carrying one
  // dropped whole — on Ossur, the tenant the allow-list was written for.
  //
  // NOT the thread's title: that is model-written (`ask_extract_title` is a
  // slot in PROSE_POLICY), and a model that can seed its own allow-list has no
  // rule. The questions are the client's own words; the theme labels are the
  // sanctioned source `allowTokens` was written against ("a run's own inputs —
  // theme labels and descriptions, the tenant's claims, its product names").
  const allow = askAllowList([
    ...turns.map((t) => t.question),
    ...turns.flatMap((t) => (t.answer?.grounded ?? []).flatMap((g) => (g.themeRefs ?? []).map((r) => r.label))),
  ])
  turns.forEach((t, i) => {
    if (!t.answer) return
    // `findingKey` on both ends: a point that loses its sentence finds its own
    // measurement, never the neighbouring turn's.
    const scrubbed = scrubThreadAnswer(t.answer, measure, { keyOf: (g) => findingKey(i, g.id), allow })
    t.answer = {
      ...t.answer,
      answer: scrubbed.answer,
      grounded: scrubbed.grounded,
      scrub: scrubbed.scrub,
      // Only where the model's own sentences are gone: an answer that survived
      // needs no substitute, and printing one beside it would read as a second
      // opinion rather than as a replacement. Both renderers print this INSTEAD
      // OF `answer` — an emptied head used to render as a blank paragraph,
      // which is a worse artefact than the prose it replaced.
      fallback: scrubbed.answer.trim() === '' ? fallback : null,
    }
  })

  const planChip = askPlanChip(await plansP)

  const deliveredRes = (await deliveredP) as { count: number | null; error: unknown }
  const delivered = deliveredRes.error ? null : deliveredRes.count ?? null
  const basis: AskBasis = { updateAt: newestUpdateAt, ...facts }

  return {
    threadId: id,
    kind: thread.kind === 'document' ? 'document' : 'question',
    title: (thread.title as string | null) ?? turns[0]?.question ?? 'Question',
    brand,
    createdAt: thread.created_at as string,
    turns,
    citations,
    silentQuestions,
    document,
    basis,
    // NULL MEANS "nothing measured AND nothing owed". A thread with no month
    // rows behind it still owes the interpretation caveat wherever the model
    // argued, so a measurement carrying only caveats is still a measurement.
    measure: measure.findings.length || measure.caveats.length ? measure : null,
    notAnswered: await notAnsweredP,
    planChip,
    history: await historyP,
    draws: askDraws(basis, delivered),
    bar: { question: surface('ask').question ?? '', context: askBasisLine(basis, { short: true }) },
    record: { lines: askRecordLines(basis, delivered), href: askRecordHref(id) },
    method: {
      company: brand,
      period: `Asked ${weekdayDate(thread.created_at as string)}`,
      platforms,
      videos: null,
      comments: citations.length || null,
      note: document
        ? `${document.summary.supported} supported · ${document.summary.contradicted} contradicted · ${document.summary.untested} untested.`
        : findings.size > 0
          ? `Every quoted voice is a real comment, listed in the appendix. This answer rests on ${findings.size} distinct findings; our own reading is marked as such.`
          : 'Nothing in the conversation analysed related to what was asked.',
    },
  }
}

// ── print pagination (pure) ───────────────────────────────────────────────

export const GROUNDED_PER_SLIDE = 2
export const CITATIONS_PER_SLIDE = 9
export const SEGMENT_CHARS_PER_SLIDE = 2600

/** Split the document's segments into slide-sized runs (never inside a
 *  marked span). Returns index ranges into `segments`. */
export function documentPages(segments: Segment[], chars = SEGMENT_CHARS_PER_SLIDE): [number, number][] {
  const pages: [number, number][] = []
  let start = 0
  let count = 0
  for (let i = 0; i < segments.length; i++) {
    count += segments[i].text.length
    if (count >= chars && i + 1 > start) {
      pages.push([start, i + 1])
      start = i + 1
      count = 0
    }
  }
  if (start < segments.length || pages.length === 0) pages.push([start, segments.length])
  return pages
}

export function agentThreadSlides(d: AgentThreadData): Slide[] {
  const slides: Slide[] = []
  if (d.document) {
    const pages = documentPages(d.document.segments)
    pages.forEach((_, p) => slides.push({ title: p === 0 ? `The brief, checked${d.document?.sourceFilename ? ` · ${d.document.sourceFilename}` : ''}` : 'The brief, checked (continued)', keys: [`agent.doc:${p}`], layout: 'single' }))
    for (let c = 0; c < Math.ceil(d.document.claims.length / GROUNDED_PER_SLIDE); c++) slides.push({ title: c === 0 ? 'Claim by claim' : 'Claim by claim (continued)', keys: [`agent.claims:${c}`], layout: 'single' })
    if (d.document.judgement.length) slides.push({ title: JUDGEMENT_HEADING, keys: ['agent.judgement'], layout: 'single' })
    return slides
  }
  d.turns.forEach((t, i) => {
    const grounded = t.answer?.grounded.length ?? 0
    const parts = Math.max(1, Math.ceil(grounded / GROUNDED_PER_SLIDE))
    for (let p = 0; p < parts; p++) slides.push({ title: i === 0 ? d.title : `Follow-up ${i}`, keys: [`agent.turn:${i}:${p}`], layout: 'single' })
    if (t.answer && (t.answer.nearest.length || t.answer.judgement.length)) slides.push({ title: `${NEAREST_HEADING}, and ${JUDGEMENT_HEADING.charAt(0).toLowerCase()}${JUDGEMENT_HEADING.slice(1)}`, keys: [`agent.turn:${i}:more`], layout: 'single' })
  })
  for (let c = 0; c < Math.ceil(d.citations.length / CITATIONS_PER_SLIDE); c++) slides.push({ title: c === 0 ? 'Evidence: every quoted voice' : 'Evidence (continued)', keys: [`agent.citations:${c}`], layout: 'single' })
  if (d.silentQuestions.length) slides.push({ title: 'Nothing in the data speaks to this', keys: ['agent.silent'], layout: 'single' })
  return slides
}
