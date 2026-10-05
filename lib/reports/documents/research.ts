import type { SupabaseClient } from '@supabase/supabase-js'
import { answerQuestion, loadAskFrame, type AskFrame } from '../../agent/answer'
import { askAllowList, measureAnswer, scrubThreadAnswer, type AnswerMeasure } from '../../agent/measure'
import { outcomeOf, type AgentOutcome } from '../../agent/types'
import { AGENT_MOVEMENT_MONTHS, DOCUMENT_RESEARCH_PARALLEL, directionWordsFor } from '../../config'
import { monthStartOf, prevMonth } from '../../reading/month-key'
import { loadMonthSeries } from '../../reading/read'
import type { MonthSeries } from '../../reading/series'
import { quoteRef } from '../../renderables/quotes-freeze'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '../../rivals'
import type { ResearchQuestion } from './questions'

/**
 * The research job: the researcher's questions, asked of the Consumer
 * Intelligence Agent one wave at a time. Each answer keeps the agent's own
 * sentences (grounded points, with the insight ids and conversation counts
 * the engine computed), the judgement, and the quotes AS REFS with their
 * words kept only in memory for the picker; nothing here is stored. The
 * engine's calls go to ai_call_log (persist: true), no thread is written.
 *
 * Two errors are not answers: a workspace with no searchable index (the
 * agent's own distinct message) blocks the build, and a run that has not
 * completed does too. Anything else marks that one question failed and the
 * others go on: a brief with six answers beats no brief.
 */

export interface ResearchQuote {
  ref: string
  /** In memory only; frozen to '' the moment it is stored. */
  text: string
  commentId: string | null
  videoId: string | null
  /** The cache's reading, in memory only and on exactly the same terms as
   *  `text`: stripped at the step boundary with the words, and resolved back
   *  onto the ref by `resolveQuotes` before the document is composed. Typed
   *  here because `pickQuote` both FILTERS and RENDERS on it (item 8) — a
   *  quote that loses its reading between the agent and the page is a
   *  translated voice silently dropped from every finding. */
  lang?: string | null
  english?: string | null
}

export interface ResearchPoint {
  /** G3: the index the writer cites. Numbered across all answers. */
  id: string
  text: string
  insightIds: string[]
  themeLabels: string[]
  /** The registry ids behind `themeLabels`, the only cross-run key: what the
   *  measurement reads (WP3.9). Optional: an answer carried before it has
   *  none, and is measured against nothing. */
  registryIds?: string[]
  /** The scrubbers emptied this point's own sentence and `text` is the
   *  product's own finding in its place where it was measured, empty where it
   *  was not (`groundedFallback`). */
  replaced?: boolean
  conversationCount: number
  quotes: ResearchQuote[]
  questionId: string
}

export interface ResearchAnswer {
  question: ResearchQuestion
  answer: string
  outcome: AgentOutcome | 'failed' | 'unasked'
  grounded: ResearchPoint[]
  judgement: { text: string; basedOn: string[] }[]
  silent: boolean
  conversationCount: number
  costUsd: number
  ms: number
  error?: string
}

export class BuildBlockedError extends Error {}

export async function runResearch(
  admin: SupabaseClient,
  args: {
    clientId: string
    companyName: string
    runId: string
    questions: ResearchQuestion[]
    budgetUsd: number
    parallel?: number
    /** The frame, read once for every question (WP3.9); read here when absent. */
    frame?: AskFrame
    now?: Date
    /** Log the engine's calls to ai_call_log (default). False only for a dry
     *  run that may write to no database (scripts/monthly-briefs.ts). */
    persist?: boolean
  },
): Promise<{ answers: ResearchAnswer[]; costUsd: number; stoppedForBudget: boolean; measure?: AnswerMeasure | null }> {
  const parallel = Math.max(1, args.parallel ?? DOCUMENT_RESEARCH_PARALLEL)
  const answers: ResearchAnswer[] = []
  let cost = 0
  let g = 0
  let stoppedForBudget = false
  const now = args.now ?? new Date()
  // ONE FRAME FOR THE WHOLE BUILD (WP3.9): the market scope reads the reading
  // month, the rivals and the subjects once, not once per question.
  const frame = args.frame ?? (await loadAskFrame(admin, args.clientId, now))

  for (let w = 0; w < args.questions.length; w += parallel) {
    if (cost >= args.budgetUsd) {
      stoppedForBudget = true
      for (const q of args.questions.slice(w)) answers.push(unasked(q))
      break
    }
    const wave = args.questions.slice(w, w + parallel)
    const results = await Promise.all(wave.map(async (q): Promise<ResearchAnswer> => {
      const started = Date.now()
      try {
        const a = await answerQuestion(admin, { clientId: args.clientId, companyName: args.companyName, question: q.text, runId: args.runId, allowNearest: false, persist: args.persist !== false, frame, now })
        return {
          question: q,
          answer: a.answer,
          outcome: outcomeOf(a),
          grounded: a.grounded.map((p) => ({
            id: '',
            text: p.text,
            insightIds: p.insightIds,
            themeLabels: p.themeRefs.map((t) => t.label),
            registryIds: p.themeRefs.map((t) => t.registryId).filter((r): r is string => Boolean(r)),
            conversationCount: p.conversationCount,
            quotes: p.quotes
              .map((qq) => ({ ref: qq.commentId ? quoteRef.comment(qq.commentId) : qq.videoId ? quoteRef.video(qq.videoId) : '', text: qq.text, commentId: qq.commentId, videoId: qq.videoId, lang: qq.lang, english: qq.english }))
              .filter((qq) => qq.ref),
            questionId: q.id,
          })),
          judgement: a.judgement.map((j) => ({ text: j.text, basedOn: j.basedOn })),
          silent: a.silent,
          conversationCount: a.grounded.reduce((n, p) => n + p.conversationCount, 0),
          costUsd: a.costUsd,
          ms: Date.now() - started,
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        if (/no searchable index|No completed run/i.test(message)) throw new BuildBlockedError(message)
        console.error(`[document research] ${q.id} failed:`, message)
        return { ...unasked(q), outcome: 'failed', error: message, ms: Date.now() - started }
      }
    }))
    for (const r of results) {
      // Grounded ids are numbered in question order so the writer's G-refs
      // are stable across a re-run with the same answers.
      for (const p of r.grounded) p.id = `G${++g}`
      // Judgement cites the agent's own per-answer ids (g1, g2); remap onto ours.
      const local = new Map<string, string>()
      cost += r.costUsd
      answers.push({ ...r, judgement: r.judgement.map((j) => ({ ...j, basedOn: j.basedOn.map((b) => local.get(b) ?? b) })) })
    }
  }
  // THE SAME MEASUREMENT AND DIRECTION SCRUB AS THE ASK PAGE (WP3.9; GA F37).
  // The brief path took the model's research prose straight to the writer: a
  // figure it typed and a direction word nothing earned went into the brief's
  // material unchecked. Measured off the same comment-dated months the thread
  // page reads, over the reading month, with the same judge; a read that fails
  // scrubs against nothing, which drops every figure and every direction
  // sentence rather than letting one through.
  const measure = await measureResearch(admin, args.clientId, answers, frame, now).catch((e: unknown) => {
    console.error(`[document research] measurement: ${(e as { message?: string })?.message ?? String(e)}`)
    return null
  })
  return { answers: scrubResearch(answers, measure ?? emptyMeasure(frame, now)), costUsd: cost, stoppedForBudget, measure }
}

/** A measurement of nothing, for the month the frame reads: every figure and
 *  every direction a model typed is dropped against it. */
function emptyMeasure(frame: AskFrame, now: Date): AnswerMeasure {
  return { month: monthStartOf(frame.reading?.month ?? now.toISOString()), findings: [], verdicts: [], figures: {}, caveats: [] }
}

/** Every grounded point's registry ids, keyed by the point's G id. */
export function researchFindings(answers: readonly ResearchAnswer[]): { findingId: string; registryIds: string[] }[] {
  return answers.flatMap((a) => a.grounded.map((p) => ({ findingId: p.id, registryIds: p.registryIds ?? [] })))
}

/** The measurement, read: the month series of the themes the points rest on,
 *  the client's and the category's, ending at the reading month. */
async function measureResearch(admin: SupabaseClient, clientId: string, answers: readonly ResearchAnswer[], frame: AskFrame, now: Date): Promise<AnswerMeasure> {
  const findings = researchFindings(answers)
  const ids = [...new Set(findings.flatMap((f) => f.registryIds))]
  const month = monthStartOf(frame.reading?.month ?? now.toISOString())
  let series: MonthSeries[] = []
  if (ids.length > 0) {
    let from = month
    for (let i = 1; i < AGENT_MOVEMENT_MONTHS; i++) from = prevMonth(from)
    const set = await loadMonthSeries(admin, clientId, { audiences: [CLIENT_AUDIENCE, INDUSTRY_AUDIENCE], objectKind: 'theme', objectIds: ids, from, to: month })
    if (set.substrate === 'seeded' && set.numeratorSubstrate === 'seeded') series = set.series
  }
  return measureAnswer({
    findings,
    series,
    month,
    pair: frame.pair,
    asOf: now.toISOString(),
    directionWords: directionWordsFor('agent.movement'),
    ownAudience: CLIENT_AUDIENCE,
    hasJudgement: answers.some((a) => a.judgement.length > 0),
  })
}

/**
 * Every research answer's prose, scrubbed against the measurement. Pure.
 *
 * The Ask page's rule, applied the same way (`scrubThreadAnswer`): a digit the
 * model typed drops its sentence, a direction word no verdict earned drops
 * its sentence, a point whose sentence goes is given the product's own
 * finding in its place where it was measured, and the quotes are never
 * touched. The allow-list is the
 * question and the theme labels, never the model's own prose.
 */
export function scrubResearch(answers: readonly ResearchAnswer[], measure: AnswerMeasure): ResearchAnswer[] {
  return answers.map((a) => {
    if (a.outcome === 'unasked' || a.outcome === 'failed') return a
    const allow = askAllowList([a.question.text, ...a.grounded.flatMap((p) => p.themeLabels)])
    const out = scrubThreadAnswer({ answer: a.answer, grounded: a.grounded }, measure, { keyOf: (p) => p.id, allow })
    return {
      ...a,
      answer: out.answer,
      grounded: out.grounded.map((p) => ({ ...p, ...(p.replaced ? { replaced: true } : {}) })),
    }
  })
}

const unasked = (q: ResearchQuestion): ResearchAnswer => ({
  question: q, answer: '', outcome: 'unasked', grounded: [], judgement: [], silent: false, conversationCount: 0, costUsd: 0, ms: 0,
})

/** Every grounded point across the answers, in G order. */
export const allPoints = (answers: ResearchAnswer[]): ResearchPoint[] => answers.flatMap((a) => a.grounded)
