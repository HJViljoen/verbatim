import type { SupabaseClient } from '@supabase/supabase-js'
import { chunk } from '../chunk'
import { selectAll } from '../supabase-admin'
import { EMBEDDING_MODEL, estimateCost } from '../config'
import { embedTexts, embedInput, EMBED_BATCH, EMBED_INPUT_VERSION } from './cluster'
import { logAiCall, type AiLogArgs } from './ai-log'

// Keep audience_insights.embedding current from inside the run, instead of
// from a script somebody has to remember.
//
// The column is the Verbatim Agent's only retrieval index: match_insights()
// filters `embedding is not null`, so an insight with no vector is invisible to
// every question ever asked about it. Pass A's insert names ten columns and not
// this one, so every insight is born NULL, and lib/agent/answer.ts only checks
// whether the index is EMPTY — a tenant at 27% coverage is answered with "your
// customers do not mention this" and no warning. On 2026-09-15 that was 3,536
// of 6,001 live rows across the two tenants.
//
// WHY A STEP OF ITS OWN, and not inside Pass A. A backlog row's video is never
// re-selected: decideAnalysis returns `unchanged` for a video whose
// analyzed_run_id is already current, so an embed inside `pass-a:N-of-M` would
// only ever see what that batch just wrote and could never drain what is
// already there. Only a read of "everything still NULL" reaches the backlog.
//
// WHY NOT HANG IT OFF A2, which already computes these exact vectors for the
// whole live population every run and throws them away (cluster.ts:246, same
// embedInput). Because `themes:<bucket>` is the tightest step in the pipeline —
// `themes:industry-other` spent 183 s of a 300 s cap on its one merge call on
// Össur's 2026-09-13 run, 149 s on Sealand's, and was retried three times in
// one run on 2026-09-10 — and it is one of the few steps with NO per-step
// catch, so a write failure there fails the whole run. Re-embedding costs
// $0.0048 for both tenants' entire corpus. Buying back half a cent by putting a
// write on the one step that cannot afford it is the wrong trade. Reading A2's
// vectors instead of recomputing them is a Phase 1 optimisation.
//
// THE BUDGET, written down because nothing else in this file bounds it. The
// step is deliberately uncapped: it embeds whatever is still NULL, and the
// biggest that has ever been is a whole tenant's corpus. Sized against the
// 300 s route cap, in-region:
//   read      ~1–3 s for 1,400–2,100 rows (measured from ZA; less from dub1)
//   embed     one request per 512 insights — 3 for Össur's backlog, 5 for
//             Sealand's, ~7 for a whole 3,100-row corpus
//   write     ~1 s per 100-row body (the measured cost of the 100-chunk vector
//             insert in themes.ts) — 15, 21 and ~32 bodies respectively
// So ~60 s for the largest case that exists today, and the worst case that
// COULD exist is a Pass A prompt-version bump, which AGENTS.md warns re-reads
// the whole corpus: every row NULL again, i.e. exactly that ~60 s, per tenant.
// The cap binds at roughly ten times today's corpus. When it does, the fix is
// the `limit` option below plus a default — not a new step — because the work
// is already idempotent: whatever is left is still NULL next run.

/** Rows per RPC call. Two constraints, and the second is the one that binds.
 *  The write body: a 1536-float vector is ~19.3 kB of JSON (measured across
 *  both tenants), so 100 rows is a ~1.9 MB body — the size lib/pipeline/themes.ts
 *  settled on after a ~10 MB statement spent 13.4 s in Postgres and died 57014
 *  on the 2026-09-13 run. The statement clock: PostgREST logs in as
 *  `authenticator`, whose role config carries `statement_timeout = 8s`, and
 *  SET ROLE service_role does not lift it — so every RPC call has eight
 *  seconds, and each written row is an HNSW index insert (the vector index on
 *  audience_insights), not a plain UPDATE. Measured on the 2026-09-15 backfill:
 *  100-row chunks landed 1,224 Össur rows and then died 57014 ("canceling
 *  statement due to statement timeout"), and every Sealand chunk died on the
 *  first call, alone on the database. 25 rows is ~0.5 MB and well inside the
 *  clock; the whole 3,536-row backlog is ~142 requests at this size, still
 *  under a minute of Postgres. */
export const EMBED_WRITE_CHUNK = 25

/** The bulk write. PostgREST cannot express "set a different value per row in
 *  one request" — PATCH with `.in()` sets ONE value for every match, and an
 *  upsert both fails NOT NULL on the proposed tuple and, worse, resurrects rows
 *  the prune deleted. supabase/migrations/20260915094000_insight_embedding.sql
 *  has the full argument. */
export const SET_EMBEDDINGS_RPC = 'set_insight_embeddings'

/** ai_call_log.pass for an embeddings request, and therefore the key that shows
 *  up in run_costs.by_pass — writeRunCosts derives that map straight off this
 *  column. Until now `text-embedding-3-small` had zero rows in the ledger
 *  across 12,821 calls: embedTexts never logged, so every embed the pipeline
 *  has ever paid for (A2, theme matching, Pass C, Pass D, Ask, the agent's own
 *  query vectors) is spend the ledger cannot see. This closes one of them. */
export const EMBED_PASS = 'embed'

/** Read from the LIVE population, as AGENTS.md requires population reads to be:
 *  the base table still holds rows a later run superseded but
 *  prune-stale-analysis has not yet deleted, and embedding those spends money
 *  on evidence that is about to vanish. */
export const EMBED_SOURCE_VIEW = 'audience_insights_current'

export interface EmbedCandidate {
  id: string
  theme: string
  description: string
}

/** One element of the RPC's jsonb argument. */
export interface EmbedPayloadRow {
  id: string
  embedding: number[]
}

export interface EmbedInsightsResult {
  /** Live insights with no vector, before any filtering. */
  candidates: number
  /** Candidates this call actually tried to embed (after the empty-description
   *  drop and any --limit). */
  attempted: number
  /** Vectors OpenAI returned. */
  embedded: number
  /** Rows the RPC reports it wrote. Lower than `embedded` means somebody else
   *  got there first or the row is gone — both fine, neither an error. */
  written: number
  /** Embeddings requests made — one ai_call_log row each. On a dry run, the
   *  number that would be made. */
  requests: number
  /** Estimated, from characters. The response carries real usage; embedTexts
   *  does not return it, and widening that signature would touch A2. */
  costUsd: number
  /** Set when the migration has not been applied yet: nothing read, nothing
   *  spent, nothing written. */
  skipped: 'migration' | null
  /** This call only read and priced: nothing went to OpenAI and nothing was
   *  written, ai_call_log included. The translate/ocr rule — a dry run leaves
   *  the tenant's tables exactly as it found them. */
  dryRun: boolean
}

export function emptyEmbedResult(): EmbedInsightsResult {
  return { candidates: 0, attempted: 0, embedded: 0, written: 0, requests: 0, costUsd: 0, skipped: null, dryRun: false }
}

// ---- Pure -------------------------------------------------------------------

/** Candidates worth spending on. A blank description leaves embedInput with a
 *  bare slug and two words of punctuation, which embeds to something that will
 *  match anything and mean nothing. Production has none of these today (0 on
 *  both tenants), so this is a guard, not a filter that does work. */
export function embeddable(rows: EmbedCandidate[]): EmbedCandidate[] {
  return rows.filter((r) => (r.description ?? '').trim().length > 0)
}

/** One embeddings request per chunk. Chunked HERE rather than leaving it to
 *  embedTexts, so that one OpenAI call is one logged ledger row — embedTexts
 *  chunks internally at the same size, so each call below makes exactly one
 *  request and its internal loop runs once. */
export function embedRequests(rows: EmbedCandidate[]): EmbedCandidate[][] {
  return chunk(rows, EMBED_BATCH)
}

/** Pair rows with their vectors, positionally. embedTexts sorts each response
 *  by the API's own index and appends chunk by chunk, so position is the
 *  contract — but a length mismatch means the pairing is already wrong, and
 *  writing a vector against the wrong insight is not a failure anyone would
 *  ever see. It throws. */
export function embedPayload(rows: EmbedCandidate[], vectors: number[][]): EmbedPayloadRow[] {
  if (rows.length !== vectors.length) {
    throw new Error(`embedPayload: ${vectors.length} vectors for ${rows.length} rows`)
  }
  return rows.map((r, i) => ({ id: r.id, embedding: vectors[i] }))
}

/** Split a payload into RPC-sized bodies. */
export function writeChunks(payload: EmbedPayloadRow[]): EmbedPayloadRow[][] {
  return chunk(payload, EMBED_WRITE_CHUNK)
}

/** Tokens, estimated from characters at the repo's usual 4:1. The embeddings
 *  response does carry `usage`, and this would be exact if embedTexts returned
 *  it; it does not, and widening it would reach into A2 — which this work
 *  package deliberately does not touch. ~60 tokens an insight measured on
 *  Össur, so the whole corpus is ~$0.005 and the error bar on the estimate is
 *  worth less than the change. Said out loud on the log row. */
export function embedTokenEstimate(texts: string[]): number {
  return Math.ceil(texts.reduce((n, t) => n + t.length, 0) / 4)
}

/** What one request costs, through MODEL_PRICING like every other pass, so a
 *  price change is one edit in lib/config.ts and not two. Embeddings bill input
 *  only, hence 0 completion tokens. */
export function embedCostUsd(texts: string[]): number {
  return estimateCost(EMBEDDING_MODEL, embedTokenEstimate(texts), 0)
}

/** The ledger row for one embeddings request.
 *
 *  `request` is a summary, not the inputs: the inputs ARE rows of
 *  audience_insights, and copying 512 descriptions into ai_call_log would
 *  duplicate the table they came from. */
export function embedCallLog(a: {
  clientId: string
  runId: string | null
  callIndex: number
  texts: string[]
  vectors: number[][]
  durationMs: number
  error: string | null
}): AiLogArgs {
  const tokens = embedTokenEstimate(a.texts)
  const chars = a.texts.reduce((n, t) => n + t.length, 0)
  return {
    clientId: a.clientId,
    runId: a.runId,
    pass: EMBED_PASS,
    callIndex: a.callIndex,
    model: EMBEDDING_MODEL,
    promptVersion: EMBED_INPUT_VERSION,
    request: { inputs: a.texts.length, chars, tokens_estimated: true },
    response: a.error === null ? { vectors: a.vectors.length, dimensions: a.vectors[0]?.length ?? 0 } : null,
    error: a.error,
    // Embeddings bill input only; completion_tokens is 0 so estimateCost lands
    // on inputPer1M alone.
    usage: { prompt_tokens: tokens, completion_tokens: 0 },
    durationMs: a.durationMs,
    validationStatus: a.error === null ? 'ok' : 'call_failed',
  }
}

/** Is this the error the write gets before its migration lands?
 *
 *  Migrations are applied by hand on this project, so a deploy CAN reach
 *  production first. Without this test the step throws on every attempt, burns
 *  its whole Inngest retry budget with backoff between attempts, and holds one
 *  of the account's five shared concurrency slots the entire time — for a write
 *  it was never going to be able to make. Same shape as
 *  `isMissingMonthlyReading` (WP3) and `isMissingBookkeepingColumn` (WP1):
 *  narrow, this function's own name only, never a blanket swallow. */
export function isMissingEmbeddingWrite(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!text.includes(SET_EMBEDDINGS_RPC)) return false
  // PGRST202 from PostgREST's schema cache, 42883 from Postgres itself.
  if (code && ['PGRST202', '42883'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

/** What the step prints. Calibrated for an operator log, not a client. */
export function embedSummary(r: EmbedInsightsResult): string {
  if (r.skipped === 'migration') return 'skipped: 20260915094000_insight_embedding.sql has not been applied yet'
  if (r.candidates === 0) return 'nothing to embed — every live insight already carries a vector'
  const skipped = r.attempted < r.candidates ? ` · ${r.candidates - r.attempted} skipped (no description)` : ''
  if (r.dryRun) {
    return `would embed ${r.attempted} of ${r.candidates} in ${r.requests} request(s), ~$${r.costUsd.toFixed(4)}${skipped}`
  }
  const skippedWrite = r.embedded - r.written
  return (
    `${r.written} of ${r.candidates} embedded in ${r.requests} request(s), ~$${r.costUsd.toFixed(4)}` +
    skipped +
    (skippedWrite > 0 ? ` · ${skippedWrite} already written or gone` : '')
  )
}

// ---- I/O --------------------------------------------------------------------

/** Every live insight of this tenant that still has no vector, oldest id first.
 *  `selectAll` because the backlog is past PostgREST's 1000-row cap on both
 *  tenants (1,449 and 2,087), with `id` as the stable order range paging needs. */
export async function loadEmbedCandidates(
  admin: SupabaseClient,
  clientId: string,
): Promise<EmbedCandidate[]> {
  return selectAll<EmbedCandidate>(() =>
    admin
      .from(EMBED_SOURCE_VIEW)
      .select('id, theme, description')
      .eq('client_id', clientId)
      .is('embedding', null)
      .order('id', { ascending: true }),
  )
}

/** Write one chunk. Returns how many rows the RPC says it actually changed. */
export async function writeEmbeddings(admin: SupabaseClient, rows: EmbedPayloadRow[]): Promise<number> {
  const { data, error } = await admin.rpc(SET_EMBEDDINGS_RPC, { p_rows: rows })
  if (error) throw error
  return Number(data ?? 0)
}

export interface EmbedInsightsOptions {
  clientId: string
  /** null outside a run (the backfill script). */
  runId: string | null
  /** Cap the number of rows embedded, for a cautious first apply. */
  limit?: number
  /** Read and price, send nothing, write nothing — ai_call_log included. The
   *  rule ocr.ts and translate.ts already hold themselves to: a dry run leaves
   *  the tenant's tables exactly as it found them. One code path rather than a
   *  second loop in the script, because a second loop is where the two drift. */
  dryRun?: boolean
}

/**
 * Embed every live insight of a tenant that has no vector yet, and write the
 * vectors back.
 *
 * Failure shape, deliberately two different things:
 *  - the migration is not applied → return `skipped: 'migration'`, having read
 *    nothing and spent nothing. A retry could not help.
 *  - anything else → STOP at the first failing chunk and throw, with the counts
 *    in the message. Pressing on past a failed write would spend the rest of
 *    the corpus's embeddings against a write path that is not working; and
 *    stopping is safe precisely because the work is idempotent — the RPC only
 *    touches rows whose embedding is still null, so a retry re-reads what is
 *    left and re-embeds only that. The rows already written stay written. This
 *    is the themes.ts rule ("stop at the first chunk error") with the retry
 *    story that rule assumes.
 */
export async function embedNullInsights(
  admin: SupabaseClient,
  opts: EmbedInsightsOptions,
): Promise<EmbedInsightsResult> {
  const out = emptyEmbedResult()
  out.dryRun = opts.dryRun === true

  // Ask the write path whether it exists BEFORE spending anything. An empty
  // array is a no-op that returns 0, and one round trip is cheaper than
  // embedding a whole corpus into a function that is not there yet. A dry run
  // asks too — "how much would this cost" is worth nothing next to "and it
  // would fail".
  try {
    await writeEmbeddings(admin, [])
  } catch (e) {
    if (!isMissingEmbeddingWrite(e)) throw e
    out.skipped = 'migration'
    return out
  }

  const candidates = await loadEmbedCandidates(admin, opts.clientId)
  out.candidates = candidates.length

  const eligible = embeddable(candidates)
  const todo = opts.limit && opts.limit > 0 ? eligible.slice(0, opts.limit) : eligible
  out.attempted = todo.length
  if (todo.length === 0) return out

  if (out.dryRun) {
    for (const request of embedRequests(todo)) {
      out.requests++
      out.costUsd += embedCostUsd(request.map((r) => embedInput(r)))
    }
    out.costUsd = Math.round(out.costUsd * 1e6) / 1e6
    return out
  }

  let callIndex = 0
  for (const request of embedRequests(todo)) {
    const texts = request.map((r) => embedInput(r))
    callIndex++
    const startedAt = Date.now()
    let vectors: number[][]
    try {
      vectors = await embedTexts(texts)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // Logged either way: ai_call_log is the ledger of what was SPENT, and a
      // request that failed after the tokens went out was still spent.
      await logAiCall(admin, embedCallLog({
        clientId: opts.clientId, runId: opts.runId, callIndex, texts, vectors: [],
        durationMs: Date.now() - startedAt, error: message,
      }))
      throw new Error(`embed-insights: request ${callIndex} failed after ${out.written} of ${out.attempted} written: ${message}`)
    }
    await logAiCall(admin, embedCallLog({
      clientId: opts.clientId, runId: opts.runId, callIndex, texts, vectors,
      durationMs: Date.now() - startedAt, error: null,
    }))
    out.requests++
    out.embedded += vectors.length
    out.costUsd += embedCostUsd(texts)

    for (const part of writeChunks(embedPayload(request, vectors))) {
      try {
        out.written += await writeEmbeddings(admin, part)
      } catch (e) {
        const message = (e as { message?: string }).message ?? String(e)
        throw new Error(`embed-insights: write failed after ${out.written} of ${out.attempted} rows: ${message}`)
      }
    }
  }

  out.costUsd = Math.round(out.costUsd * 1e6) / 1e6
  return out
}
