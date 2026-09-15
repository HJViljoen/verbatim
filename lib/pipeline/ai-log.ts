import type { createAdminClient } from '../supabase-admin'
import { ANALYSIS_MODEL, estimateCost } from '../config'
import { dbSafeJson, dbSafeText } from '../db-text'

// Shared ai_call_log writer for the single-call passes (B/C/D). One row per GPT
// call (invariant 4): request, response, tokens, cost, duration, validation
// status. Pass A keeps its own inline logger; this avoids duplicating it across
// the synthesis passes.

interface AiLogBase {
  clientId: string
  /** null for calls outside a pipeline run (a report cover). */
  runId: string | null
  pass: string
  callIndex: number
  /** Model the call ran on. Defaults to ANALYSIS_MODEL for older callers. */
  model?: string
  promptVersion: string
  response: unknown
  error: string | null
  usage: { prompt_tokens: number; completion_tokens: number }
  durationMs: number
  validationStatus: string
}

/** What went out, in whichever shape the call has.
 *
 *  A chat call has a system/user pair and stores both. An EMBEDDINGS request
 *  has neither: it carries an array of texts, and those texts are rows of
 *  audience_insights — copying 512 of them into the ledger would duplicate the
 *  table they were just read from, and the retention sweep that strips request
 *  bodies would then have two places to reach. So the embed writer hands over a
 *  `request` summary instead (lib/pipeline/embed-insights.ts).
 *
 *  A union rather than three optional fields, so a chat caller still cannot
 *  forget its prompt and nobody can pass both halves. */
type AiLogRequest =
  | { systemPrompt: string; userPrompt: string; request?: never }
  | { request: unknown; systemPrompt?: never; userPrompt?: never }

export type AiLogArgs = AiLogBase & AiLogRequest

export async function logAiCall(admin: ReturnType<typeof createAdminClient>, a: AiLogArgs): Promise<void> {
  const model = a.model ?? ANALYSIS_MODEL
  // The prompt and response snapshots are model-adjacent text, so they go
  // through dbSafeJson: one U+0000 in a response 400'd this insert on the
  // 2026-09-13 run (22P05), which silently cost the ledger a row of a call that
  // had already been paid for. lib/db-text.ts has the full story.
  const { error } = await admin.from('ai_call_log').insert({
    client_id: a.clientId,
    run_id: a.runId,
    pass: a.pass,
    call_index: a.callIndex,
    model,
    prompt_version: a.promptVersion,
    request: dbSafeJson(a.request !== undefined ? a.request : { system: a.systemPrompt, user: a.userPrompt }),
    response: dbSafeJson(a.response),
    error_message: a.error === null ? null : dbSafeText(a.error),
    prompt_tokens: a.usage.prompt_tokens,
    completion_tokens: a.usage.completion_tokens,
    cost_usd: estimateCost(model, a.usage.prompt_tokens, a.usage.completion_tokens),
    duration_ms: a.durationMs,
    validation_status: a.validationStatus,
  })
  // The ledger is not allowed to fail a pass — the spend already happened and
  // the caller's own write is the one that matters — but a swallowed 400 is how
  // the 2026-09-13 loss stayed invisible, so it is said out loud.
  if (error) console.warn(`[ai-log] ${a.pass} call ${a.callIndex} not logged: ${error.message}`)
}
