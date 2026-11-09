import { ASK_REEVALUATE_MAX_CHECKS } from '../config'
import { fetchInsightsByIds } from '../quotes'
import { callOptionsWithin } from '../statements/measure'
import { isMissingColumnError } from '../supabase-admin'
import { judgePass, verdictPass } from './engine'
import { diffVerdicts, holdVerdicts, summarise } from './verdicts'
import type { ClaimResult, ExtractedClaim } from './types'

// Re-test stored plans against each new run.
//
// This is the point of storing a check at all. A plan checked once is a study;
// a plan re-tested every week against fresh conversation is a live document,
// and "assumption 4 moved from untested to contradicted" is the thing worth
// coming back for.
//
// The claims are REUSED, never re-extracted. Re-reading the document with a
// model would let the claim list and its refs shift between runs, and then
// "assumption 4 moved" would be comparing two different assumption 4s. The
// document is fixed; only the conversation moves.

export interface ReevaluationResult {
  planCheckId: string
  title: string | null
  moved: { ref: string; claim: string; from: string; to: string }[]
  summary: { supported: number; contradicted: number; untested: number }
  costUsd: number
  /** The judgement was written again on this reading and stored with it.
   *  False where it was not asked for, not started, failed or came back
   *  empty: the page then prints the last one written, with its own date. */
  judged: boolean
}

/** A judgement rewrite's call cap. The upload's took 14 to 22 s on Össur. */
export const PLAN_JUDGE_CALL_CAP_MS = 60_000

interface CheckRow {
  id: string
  title: string | null
  claims: ClaimResult[]
}

/**
 * Re-evaluate every stored check for a client against a run.
 *
 * Bounded by ASK_REEVALUATE_MAX_CHECKS: each check costs a synthesis call, and
 * a tenant with fifty saved plans should not quietly add fifty calls to every
 * run. Oldest checks fall out of the sweep first — a plan nobody has revisited
 * in months is not the one they are steering by.
 */
export async function reevaluatePlanChecks(
  admin: ReturnType<typeof import('../supabase-admin').createAdminClient>,
  args: {
    clientId: string; runId: string; runDate: string; companyName: string
    /**
     * Write "What I'd take from that" again on each new reading (Heinrich,
     * 9 Nov), every call ending by this instant (ms since the epoch; null, no
     * clock). Absent, no judgement is written: the weekly step asks for it,
     * an operator's script does not.
     */
    judgeBy?: number | null
  },
): Promise<ReevaluationResult[]> {
  const { clientId, runId, runDate, companyName } = args

  // Limit in the query, not after: paging a tenant's whole history of stored
  // documents to use three of them grows with usage, in the pipeline hot path.
  const { data: rows } = await admin
    .from('plan_checks')
    .select('id, title, claims')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(ASK_REEVALUATE_MAX_CHECKS)
  const checks = (rows ?? []) as CheckRow[]
  if (!checks.length) return []

  const out: ReevaluationResult[] = []
  /** Each check's reading as stored this run, for its judgement. */
  const written = new Map<string, ClaimResult[]>()
  for (const check of checks) {
    const stored = Array.isArray(check.claims) ? check.claims : []
    const claims: ExtractedClaim[] = stored
      .filter((c) => c && typeof c.ref === 'string' && typeof c.claim === 'string')
      .map((c) => ({ ref: c.ref, claim: c.claim }))
    if (!claims.length) continue

    // The baseline is the most recent EVALUATION if one exists, else the answer
    // stored with the check itself — so the first re-evaluation compares
    // against the original reading rather than against nothing.
    // Excluding THIS run matters: the step retries, and a retry that found its
    // own half-written row as the baseline would diff the run against itself,
    // produce an empty `moved`, and overwrite the real one. The upsert makes
    // the write idempotent; without this the DIFF is not.
    // Ordered by created_at, not run_date — run_date is a date, so two runs on
    // one day would tie.
    const { data: prevEval } = await admin
      .from('plan_check_evaluations')
      .select('claims')
      .eq('plan_check_id', check.id)
      .neq('run_id', runId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const previous: ClaimResult[] = Array.isArray((prevEval as { claims?: ClaimResult[] } | null)?.claims)
      ? ((prevEval as { claims: ClaimResult[] }).claims)
      : stored

    let result
    try {
      result = await verdictPass(admin, { clientId, runId, companyName, claims })
    } catch (e) {
      // One bad check must not stop the rest, and must not fail the run.
      console.error(`[ask-reevaluate] check ${check.id} failed: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }

    // THE HOLD (walkthrough item 5): a re-reading proposes, and a verdict
    // changes only where the evidence behind it moved (`holdVerdicts`). The
    // videos behind both readings are resolved here; a read that fails falls
    // back to the insight ids, which can only count MORE evidence as new, so
    // the worst a failure does is let one change through as before.
    // AND THE HOLD CAN NEVER COST THE CHECK: a throw anywhere in it (a stored
    // claim of an unexpected shape) prints the fresh reading, which is exactly
    // what this step wrote before the hold, rather than failing the step into
    // retries that would pay for every check's verdict call again.
    let claimsHeld: ClaimResult[]
    try {
      const videosOf = await videoResolver(admin, [...previous, ...result.claims])
      claimsHeld = holdVerdicts(previous, result.claims, videosOf)
    } catch (e) {
      console.error(`[ask-reevaluate] hold skipped for ${check.id}, the fresh reading is printed: ${e instanceof Error ? e.message : String(e)}`)
      claimsHeld = result.claims
    }
    const summary = summarise(claimsHeld)
    const moved = diffVerdicts(previous, claimsHeld)

    const { error } = await admin.from('plan_check_evaluations').upsert(
      {
        plan_check_id: check.id,
        client_id: clientId,
        run_id: runId,
        run_date: runDate,
        claims: claimsHeld,
        summary,
        moved,
      },
      { onConflict: 'plan_check_id,run_id' },
    )
    if (error) {
      console.error(`[ask-reevaluate] write failed for ${check.id}: ${(error as { message?: string }).message ?? error}`)
      continue
    }

    out.push({ planCheckId: check.id, title: check.title, moved, summary, costUsd: result.costUsd, judged: false })
    written.set(check.id, claimsHeld)
  }

  if (args.judgeBy !== undefined && written.size > 0) await rewriteJudgements(admin, { clientId, runId, companyName, by: args.judgeBy }, written, out)
  return out
}

/**
 * "What I'd take from that", written again on each reading just stored
 * (Heinrich, 9 Nov: the upload's judgement reasoned from verdicts that have
 * since moved). AFTER every check's verdicts, so the verdict calls start when
 * they always did, and side by side, at most `ASK_REEVALUATE_MAX_CHECKS`
 * calls, each ending by `by`. Stored on the reading's own row
 * (`plan_check_evaluations.judgement`), so the upload's and every earlier
 * week's stay as written.
 *
 * NEVER A BLANK, NEVER A FAILED RUN. A call that fails, times out or comes
 * back with nothing stores nothing, and the page prints the last judgement
 * written, with its own date. Without the column (its migration not applied)
 * nothing is called, so nothing is spent on a judgement that cannot be kept.
 * Nothing in here throws.
 */
async function rewriteJudgements(
  admin: ReturnType<typeof import('../supabase-admin').createAdminClient>,
  ctx: { clientId: string; runId: string; companyName: string; by: number | null },
  written: ReadonlyMap<string, ClaimResult[]>,
  out: ReevaluationResult[],
): Promise<void> {
  try {
    const probe = await admin.from('plan_check_evaluations').select('judgement').eq('client_id', ctx.clientId).limit(1)
    if (probe.error) {
      console.warn(isMissingColumnError(probe.error, 'judgement')
        ? '[ask-reevaluate] judgement not rewritten: plan_check_evaluations.judgement is not applied yet'
        : `[ask-reevaluate] judgement not rewritten: ${(probe.error as { message?: string }).message ?? probe.error}`)
      return
    }
  } catch (e) {
    console.warn(`[ask-reevaluate] judgement not rewritten: ${e instanceof Error ? e.message : String(e)}`)
    return
  }
  await Promise.all([...written].map(async ([planCheckId, claims]) => {
    try {
      const request = callOptionsWithin(ctx.by, Date.now(), PLAN_JUDGE_CALL_CAP_MS)
      if (!request) {
        console.warn(`[ask-reevaluate] judgement not rewritten for ${planCheckId}: too little of the step left`)
        return
      }
      const judged = await judgePass(admin, { clientId: ctx.clientId, runId: ctx.runId, companyName: ctx.companyName, claims, request })
      const row = out.find((r) => r.planCheckId === planCheckId)
      if (row) row.costUsd += judged.costUsd
      if (!judged.ok || judged.judgement.length === 0) return
      const { error } = await admin.from('plan_check_evaluations')
        .update({ judgement: judged.judgement })
        .eq('plan_check_id', planCheckId).eq('run_id', ctx.runId)
      if (error) {
        console.error(`[ask-reevaluate] judgement write failed for ${planCheckId}: ${(error as { message?: string }).message ?? error}`)
        return
      }
      if (row) row.judged = true
    } catch (e) {
      console.error(`[ask-reevaluate] judgement not rewritten for ${planCheckId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }))
}

/**
 * The videos behind a claim's evidence, for the hold. One read per check, over
 * the base table (a plan check's ids are protected from pruning, so they
 * resolve). Fail-soft: a read that fails keys each claim on its insight ids.
 */
async function videoResolver(
  admin: ReturnType<typeof import('../supabase-admin').createAdminClient>,
  claims: readonly ClaimResult[],
): Promise<(c: ClaimResult) => ReadonlySet<string>> {
  const ids = [...new Set(claims.flatMap((c) => c.insightIds ?? []))]
  let videoOf = new Map<string, string>()
  if (ids.length > 0) {
    try {
      const rows = await fetchInsightsByIds<{ id: string; source_video_id: string | null }>(admin, ids, 'id, source_video_id')
      videoOf = new Map(rows.filter((r) => r.source_video_id).map((r) => [r.id, r.source_video_id as string]))
    } catch (e) {
      console.error(`[ask-reevaluate] evidence videos unread, holding on insight ids: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return (c) => new Set((c.insightIds ?? []).map((id) => videoOf.get(id) ?? `insight:${id}`))
}
