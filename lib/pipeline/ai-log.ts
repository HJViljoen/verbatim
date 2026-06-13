import type { createAdminClient } from '../supabase-admin'
import { ANALYSIS_MODEL, estimateCost } from '../config'

// Shared ai_call_log writer for the single-call passes (C/D). One row per GPT
// call (invariant 4): request, response, tokens, cost, duration, validation
// status. Pass A keeps its own inline logger; this avoids duplicating it across
// Pass C and Pass D.

export interface AiLogArgs {
  clientId: string
  runId: string
  pass: string
  callIndex: number
  promptVersion: string
  systemPrompt: string
  userPrompt: string
  response: unknown
  error: string | null
  usage: { prompt_tokens: number; completion_tokens: number }
  durationMs: number
  validationStatus: string
}

export async function logAiCall(admin: ReturnType<typeof createAdminClient>, a: AiLogArgs): Promise<void> {
  await admin.from('ai_call_log').insert({
    client_id: a.clientId,
    run_id: a.runId,
    pass: a.pass,
    call_index: a.callIndex,
    model: ANALYSIS_MODEL,
    prompt_version: a.promptVersion,
    request: { system: a.systemPrompt, user: a.userPrompt },
    response: a.response,
    error_message: a.error,
    prompt_tokens: a.usage.prompt_tokens,
    completion_tokens: a.usage.completion_tokens,
    cost_usd: estimateCost(ANALYSIS_MODEL, a.usage.prompt_tokens, a.usage.completion_tokens),
    duration_ms: a.durationMs,
    validation_status: a.validationStatus,
  })
}
