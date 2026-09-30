import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk } from '../chunk'
import { EMBEDDING_MODEL } from '../config'
import { logAiCall } from '../pipeline/ai-log'
import { cosine, embedTexts } from '../pipeline/cluster'
import { embedCostUsd, embedTokenEstimate } from '../pipeline/embed-insights'
import type { PoolCandidate, WeekPool } from './types'

// Which quote fits which written finding (T3b, 30 Sep).
//
// THE PROBLEM. A finding's quote came from the candidate the writer named
// (`quote_from`), first option first, so "Travel bags earn their price when
// carry and layout feel practical" printed "I second cotopaxi … both are
// solid": a real, gated voice, on the right theme, that did not illustrate
// the headline above it.
//
// THE RULE. Among the cited candidates' quote options (strict-gated,
// kind-matched, T1), the one whose INSIGHT sits closest to the finding as
// written: cosine similarity between an embedding of the finding (its
// headline and what it saw) and each option's insight embedding. The writer
// still never sees a comment's words, and neither does this: an option's
// vector is its insight's (Pass A's slug and paraphrase, the product's own
// `embedInput`), never the comment's. Compose takes the best-scoring option
// not printed yet; the writer's `quote_from` breaks ties and decides alone
// where nothing could be scored (lib/written/compose.ts `pickFindingQuote`).
//
// THE PRODUCT'S VECTORS, WHERE THEY EXIST. An insight's stored vector
// (`audience_insights.embedding`, written by the pipeline's embed-insights
// step with `EMBEDDING_MODEL` over `embedInput`) is read by id; an insight
// with none is embedded now, on the same model and formula, so every vector
// compared is comparable. The findings are embedded in the same request.
//
// AGENTS.md's rule on that column is about BULK reads and counts. This is an
// id-set lookup on the base table (the rule for id sets), bounded at
// `FIT_MAX_INSIGHTS` rows and typically a few dozen: the options of the
// candidates the written findings cite, never the corpus.
//
// THE STORY'S QUOTES TOO (v3). A paragraph of "What happened" that points to a
// candidate is measured the same way, on its own text, against that
// candidate's options, in the same request.
//
// FAIL-SOFT. Any error leaves `ran: false` and no scores, and compose falls
// back to the writer's order: a read that cannot measure fit still prints.
// Its cost is logged to `ai_call_log` as pass `week_read_fit` (not on a dry
// run, which writes nothing) and added to the read's cost.

export const WEEK_READ_FIT_PASS = 'week_read_fit'
/** The most option insights one read looks up or embeds. */
export const FIT_MAX_INSIGHTS = 120
/** Rows per vector read: a vector is ~20 KB as text. */
const VECTOR_CHUNK = 40

export interface QuoteFit {
  /** The finding's index in the writer's output → quote ref → similarity. */
  scores: Map<number, Map<string, number>>
  /** ADDITIVE (v3). The story paragraph's index in the writer's output →
   *  quote ref → similarity. Absent on a fit saved before v3. */
  story?: Map<number, Map<string, number>>
  /** Estimated from characters, as the product's embed step estimates it. */
  costUsd: number
  /** Option insights scored on their stored vector, and on one embedded now. */
  stored: number
  embedded: number
  /** Findings scored. */
  findings: number
  /** Story paragraphs scored (v3). */
  paragraphs?: number
  ran: boolean
  error?: string
}

export const noFit = (error?: string): QuoteFit => ({ scores: new Map(), story: new Map(), costUsd: 0, stored: 0, embedded: 0, findings: 0, paragraphs: 0, ran: false, ...(error ? { error } : {}) })

/** A finding as its fit is measured: the headline, then what it saw. */
export function findingText(f: { headline: string; saw: string }): string {
  const headline = f.headline.trim()
  const saw = f.saw.replace(/\s*\n+\s*/g, ' ').trim()
  return [headline && !/[.!?]$/.test(headline) ? `${headline}.` : headline, saw].filter(Boolean).join(' ')
}

/** A stored vector as numbers. PostgREST sends a pgvector as text ("[0.1,…]");
 *  a float array arrives as an array. Anything else is no vector. */
export function parseVector(v: unknown): number[] | null {
  let out: unknown = v
  if (typeof v === 'string') {
    try { out = JSON.parse(v) } catch { return null }
  }
  return Array.isArray(out) && out.length > 0 && out.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (out as number[]) : null
}

/** One written finding the fit is measured for. */
export interface FitFinding {
  /** Its index in the writer's output (compose's key). */
  index: number
  headline: string
  saw: string
  based_on: readonly string[]
}

/** One story paragraph the fit is measured for (v3): its text, against the
 *  options of the candidate it points to (`based_on` holds that one). */
export interface FitParagraph {
  index: number
  text: string
  based_on: readonly string[]
}

/** The options each finding may print, by the candidates it cites. Pure. */
export function optionsFor(pool: Pick<WeekPool, 'candidates'>, f: Pick<FitFinding, 'based_on'>): PoolCandidate['quoteOptions'] {
  const byId = new Map(pool.candidates.map((c) => [c.id.toUpperCase(), c]))
  const out: PoolCandidate['quoteOptions'] = []
  const seen = new Set<string>()
  for (const id of f.based_on) {
    const c = byId.get(String(id).trim().toUpperCase())
    for (const o of c?.quoteOptions ?? []) if (!seen.has(o.quote.ref)) { seen.add(o.quote.ref); out.push(o) }
  }
  return out
}

/** Similarities, from the vectors. An option whose insight has no vector is
 *  left unscored. Pure. */
export function scoreFit<T extends { index: number; based_on: readonly string[]; vector: number[] }>(
  pool: Pick<WeekPool, 'candidates'>,
  findings: readonly T[],
  insightVectors: ReadonlyMap<string, number[]>,
): Map<number, Map<string, number>> {
  const out = new Map<number, Map<string, number>>()
  for (const f of findings) {
    const scores = new Map<string, number>()
    for (const o of optionsFor(pool, f)) {
      const v = insightVectors.get(o.insightId)
      if (v && v.length === f.vector.length) scores.set(o.quote.ref, cosine(f.vector, v))
    }
    out.set(f.index, scores)
  }
  return out
}

export interface FitDeps {
  embed: (texts: string[]) => Promise<number[][]>
}

/**
 * How well each cited option fits each written finding, and each story
 * paragraph's options fit that paragraph (v3). Reads the option insights'
 * stored vectors, embeds the findings, the paragraphs (and any insight with
 * none) in one request, and logs that request where `log` is true. Never
 * throws.
 */
export async function fitQuotes(
  admin: SupabaseClient,
  a: {
    clientId: string
    runId: string
    pool: Pick<WeekPool, 'candidates'>
    findings: readonly FitFinding[]
    /** Story paragraphs that point to a candidate (v3). */
    story?: readonly FitParagraph[]
    log: boolean
  },
  deps: Partial<FitDeps> = {},
): Promise<QuoteFit> {
  const embed = deps.embed ?? embedTexts
  const findings = a.findings.filter((f) => f.headline.trim() && optionsFor(a.pool, f).length > 0)
  const story = (a.story ?? []).filter((p) => p.text.trim() && optionsFor(a.pool, p).length > 0)
  if (findings.length === 0 && story.length === 0) return { ...noFit(), ran: true }
  try {
    // The option insights, in the findings' order then the paragraphs', bounded.
    const textOf = new Map<string, string>()
    for (const t of [...findings, ...story]) for (const o of optionsFor(a.pool, t)) if (!textOf.has(o.insightId) && textOf.size < FIT_MAX_INSIGHTS) textOf.set(o.insightId, o.insightText)
    const ids = [...textOf.keys()]

    const stored = new Map<string, number[]>()
    for (const part of chunk(ids, VECTOR_CHUNK)) {
      const res = await admin.from('audience_insights').select('id, embedding').eq('client_id', a.clientId).in('id', part)
      if (res.error) throw new Error(`fit vectors: ${res.error.message}`)
      for (const r of (res.data ?? []) as { id: string; embedding: unknown }[]) {
        const v = parseVector(r.embedding)
        if (v) stored.set(String(r.id), v)
      }
    }

    const missing = ids.filter((id) => !stored.has(id))
    const texts = [...findings.map(findingText), ...story.map((p) => p.text.replace(/\s*\n+\s*/g, ' ').trim()), ...missing.map((id) => textOf.get(id) ?? '')]
    const startedAt = Date.now()
    const vectors = await embed(texts)
    if (vectors.length !== texts.length) throw new Error(`fit: ${vectors.length} vectors for ${texts.length} texts`)
    const costUsd = embedCostUsd(texts)
    if (a.log) {
      await logAiCall(admin, {
        clientId: a.clientId,
        runId: a.runId,
        pass: WEEK_READ_FIT_PASS,
        callIndex: 1,
        model: EMBEDDING_MODEL,
        promptVersion: 'week_read_fit_v1',
        // A summary, never the texts: the insight texts are rows of
        // audience_insights, and the findings are stored in week_reads.
        request: { findings: findings.length, paragraphs: story.length, insights: missing.length, chars: texts.reduce((n, t) => n + t.length, 0), tokens_estimated: true },
        response: { vectors: vectors.length, dimensions: vectors[0]?.length ?? 0, stored_vectors: stored.size },
        error: null,
        usage: { prompt_tokens: embedTokenEstimate(texts), completion_tokens: 0 },
        durationMs: Date.now() - startedAt,
        validationStatus: 'ok',
      }).catch((e) => console.warn('[week_read_fit] log failed:', e))
    }

    const insightVectors = new Map(stored)
    const offset = findings.length + story.length
    missing.forEach((id, i) => insightVectors.set(id, vectors[offset + i]))
    const scores = scoreFit(a.pool, findings.map((f, i) => ({ ...f, vector: vectors[i] })), insightVectors)
    const storyScores = scoreFit(a.pool, story.map((p, i) => ({ ...p, vector: vectors[findings.length + i] })), insightVectors)
    return { scores, story: storyScores, costUsd, stored: stored.size, embedded: missing.length, findings: findings.length, paragraphs: story.length, ran: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.warn('[week_read_fit] the quotes could not be fitted; the writer\'s order decides:', message)
    return noFit(message)
  }
}
