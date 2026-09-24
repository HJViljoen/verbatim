import type { SupabaseClient } from '@supabase/supabase-js'

import { ASK_THEMES_PER_CLAIM } from '../config'
import { fmtInt, shortDate } from '../format'
import { rows as readRows } from '../pages/read'
import { createCitedQuotePicker, fetchQuotesByAudience } from '../quotes'
import type { Quote } from '../renderables/types'
import type { Scope } from '../renderables/types'
import { isMissingColumnError } from '../supabase-admin'
import type { Counted } from '../reading/verdicts'
import type { AskSummary, ClaimResult, Verdict as ClaimVerdict } from './types'

// "Plans re-checked" — the card Market names absent twice (Phase 1 Block D, D4).
//
// THE FEATURE ALREADY EXISTS; IT IS ON THE WRONG PAGE. `plan_checks` is
// written by /api/agent's document mode, re-tested against every update by
// `lib/ask/reevaluate.ts`, and read by /dashboard/agent/[id]. Market — the
// decision surface — says "Plans re-checked are not built yet" in two places
// while three checks and eight re-evaluations sit in the database. This module
// is the reading half: the uploaded plan, its claims with their verdicts, what
// moved since it was uploaded, and the floor a verdict stands on.
//
// WHAT IS REFUSED HERE, AND WHY.
//
// "held for 2 updates" (the mock's phrase, and `market.plans.moved`). An update
// is not a period — a period is dated by the comment (AGENTS.md) — and worse,
// on this data the claim the phrase makes is not true. Measured on production
// 2026-09-18 across all eight stored re-evaluations: claim C1 of Össur's plan
// went contradicts → silent → contradicts → silent on four consecutive
// re-readings. The honest form is what `movedSinceUpload` builds: the DATE the
// verdict last changed, and how many READINGS have carried it since — which on
// that claim is one, every time, and says so.
//
// "Verdict floor 5 videos per claim" (`market.plans.footer`). There is no such
// number anywhere in the engine. The rule `validateVerdicts` actually enforces
// is that a supported or contradicted verdict must have at least one QUOTABLE
// comment behind it — "supported with nothing to show is the shape a bluff
// takes" — and a claim that cannot clear that reads untested. The footer prints
// that rule, from the constant, with a test that pins the constant to the
// engine's own behaviour rather than to this comment.

/** How many stored plans the card shows. Both tenants hold one or two today;
 *  this caps the day somebody uploads twenty, and bounds the quote resolution
 *  below with it. */
export const PLAN_CARDS_SHOWN = 2

/**
 * The floor a non-silent verdict stands on: at least this many quotable
 * comments behind it.
 *
 * ONE, NOT FIVE. `validateVerdicts` (lib/ask/verdicts.ts) drops a supported or
 * contradicted verdict to `silent` when `quotable.length` is zero and at no
 * other count — so the floor IS one, and `plan-cards.test.ts` proves it by
 * running the engine's own validator at zero and at one rather than by
 * asserting this line.
 */
export const PLAN_VERDICT_FLOOR = 1

export const PLAN_FLOOR_LINE =
  `A claim reads as supported or contradicted only where at least ${fmtInt(PLAN_VERDICT_FLOOR)} real comment stands behind it ` +
  'and we can show you the words. Everything else reads untested.'

/** The hold this card does not have — the same shape as MK5's `CLAIMS_CAVEAT`,
 *  for the same reason and on harder evidence. */
export const PLAN_HOLD_CAVEAT =
  'Each claim is read fresh against every update. A verdict that moved last time can move back, and nothing here is held ' +
  'across two updates before it is printed.'

/**
 * What the claims are counted over, and what the count is NOT.
 *
 * TWO FACTS, BECAUSE THE FIRST ONE ALONE IS FALSE. A claim's count is
 * cumulative over the corpus and is not month-scoped
 * (`ClaimResult.conversationCount` says so in its own docstring), so the basis
 * travels with the figure — D15. But the numerator is not a measurement over
 * that corpus either: `validateVerdicts` counts the distinct videos behind the
 * QUOTABLE insights of at most `ASK_THEMES_PER_CLAIM` shortlisted themes, so
 * what bounds it is the agent's retrieval and not the conversation. "41 of
 * 2,359" read as a measured share is wrong in the same way "412 videos in the
 * category, September" was two files over — D8, and `CONCLUSIONS_CORPUS_LINE`
 * on this very page. It is a FLOOR over a named population, and the sentence
 * says both.
 */
export const PLAN_CLAIM_BASIS =
  'A claim’s count is the videos we can show you a comment from, out of everything we have read for you, not out of one month. ' +
  'Each claim is read against the themes closest to it, so the count is a floor and not a full sweep.'

/** The same, where the corpus could not be counted — the denominator is absent
 *  rather than invented, and the count stands alone. See `planCard`. */
export const PLAN_CLAIM_BASIS_UNCOUNTED =
  'A claim’s count is the videos we can show you a comment from, read against the themes closest to that claim. ' +
  'We could not count how many videos we have read for you, so this count stands without its share.'

export const PLAN_EMPTY =
  'No plan has been checked for this workspace yet. Upload a campaign brief on Ask and it is re-read against every update.'

/** The mock's three words, which are also Ask's own
 *  (`lib/pages/agent-thread.ts` prints "n supported · n contradicted · n
 *  untested"). One vocabulary, not a fourth. */
export const PLAN_VERDICT_LABEL: Record<ClaimVerdict, string> = {
  echoes: 'Supported',
  contradicts: 'Contradicted',
  silent: 'Untested',
}

export interface PlanClaimRow {
  claim: string
  /** echoed | contradicted | silent — from plan_checks.claims. */
  verdict: string
  verdictLabel: string
  /**
   * The claim's count, with the corpus as its denominator.
   *
   * `n === 0` MEANS THERE IS NO DENOMINATOR, not a share of nothing: the
   * corpus head count failed, and a surface prints `k` alone there and never
   * "of 0". The card's `basis` says which of the two it is holding.
   */
  value: Counted
  quote: Quote | null
}

export interface PlanMovedRow {
  claim: string
  from: string
  to: string
  /** The dated sentence — "moved 13 Sep · 1 reading has carried it since".
   *  Never "held N updates"; see the module header. */
  on: string
}

export interface PlanCheckCard {
  planId: string
  title: string
  uploadedOn: string
  /** The update the printed verdicts were read on — `plan_check_evaluations
   *  .run_date` of the newest re-reading. Null where nothing has re-read the
   *  document since it was uploaded, in which case the verdicts ARE the
   *  upload's and `uploadedOn` is the date that matters. */
  checkedOn: string | null
  claims: PlanClaimRow[]
  summary: AskSummary
  /** What changed since the last check, from the stored re-evaluations. */
  moved: PlanMovedRow[]
  /** What every claim count here is a count of — D15, the basis travels. */
  basis: string
  /** The floor, printed from the constant. */
  floorLine: string
  /** The hold this card does not have. */
  caveat: string
  /** What the reader must be told about the READING of the document — clipped,
   *  or past the page limit. Null when the whole document was read, and null
   *  where M9.1's column is not applied here. */
  notice: string | null
  href: string
  empty: string | null
}

// ---- the pure half ------------------------------------------------------------

/** One stored re-evaluation, as much of it as this card needs. */
export interface PlanEvaluation {
  runDate: string
  createdAt: string
  moved: { ref: string; claim: string; from: string; to: string }[]
  /** The claims AS RE-READ on that update. Optional because a check nothing
   *  has re-read has none, and because a row written before this column was
   *  read here carries none either. */
  claims?: ClaimResult[] | null
  summary?: AskSummary | null
}

/**
 * The reading the card prints: the newest re-evaluation that carries one, and
 * the check's own first answer only where nothing has re-read it.
 *
 * WHY THIS IS NOT `plan_checks.claims`. That column is written once, when the
 * document is uploaded, and `lib/ask/reevaluate.ts` never writes it back — a
 * re-evaluation upserts `plan_check_evaluations` and leaves the original answer
 * in place for ever. So a card built off the check alone prints the verdicts of
 * the day the document was uploaded, while `PLAN_HOLD_CAVEAT` beside it says
 * each claim is read fresh against every update and the `moved` rows under it
 * name a transition the chips above them do not show. Measured on production
 * 2026-09-18: Össur's claim C1 went contradicts → silent → contradicts →
 * silent over four consecutive re-readings, so this is not a theoretical
 * staleness — it is wrong on the row that moved most, and the card is carried
 * to the quarterly review, which goes to people outside the workspace.
 */
export function currentReading(
  stored: readonly ClaimResult[],
  storedSummary: AskSummary | null,
  evaluations: readonly PlanEvaluation[],
): { claims: ClaimResult[]; summary: AskSummary | null; checkedOn: string | null } {
  const newest = [...evaluations]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .find((e) => Array.isArray(e.claims) && e.claims.length > 0)
  if (!newest) return { claims: [...stored], summary: storedSummary, checkedOn: null }
  return {
    claims: (newest.claims ?? []).filter((c) => c && typeof c.claim === 'string'),
    // The summary travels with the claims it counts. A re-evaluation that
    // stored claims and no summary gets one derived in `planCard`, never the
    // upload's — three numbers counting a different reading are worse than
    // none.
    summary: newest.summary ?? null,
    checkedOn: newest.runDate,
  }
}

/**
 * What has moved since the plan was uploaded, and how long it has held.
 *
 * THE LAST TRANSITION PER CLAIM, NOT THE LAST EVALUATION'S LIST. A claim that
 * moved three readings ago and has stood since is the interesting one, and
 * reading only the newest row would lose it; a claim that moved and moved back
 * is represented by its most recent move, so `to` is always the verdict the
 * claim carries now.
 *
 * `readings` counts the evaluations from the moving one to the newest,
 * inclusive — so a claim that moved on the latest reading has held for one,
 * which is the truth and the reason "held 2 updates" is not printed.
 */
export function movedSinceUpload(evaluations: readonly PlanEvaluation[]): PlanMovedRow[] {
  const ordered = [...evaluations].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const last = new Map<string, { at: number; claim: string; from: string; to: string }>()
  ordered.forEach((e, at) => {
    for (const m of e.moved ?? []) {
      if (!m?.ref) continue
      last.set(m.ref, { at, claim: m.claim, from: m.from, to: m.to })
    }
  })

  const out: PlanMovedRow[] = []
  for (const [, m] of last) {
    const readings = ordered.length - m.at
    const when = shortDate(ordered[m.at].runDate)
    out.push({
      claim: m.claim,
      from: PLAN_VERDICT_LABEL[m.from as ClaimVerdict] ?? m.from,
      to: PLAN_VERDICT_LABEL[m.to as ClaimVerdict] ?? m.to,
      on: `moved ${when} · ${fmtInt(readings)} ${readings === 1 ? 'reading has' : 'readings have'} carried it since`,
    })
  }
  return out.sort((a, b) => a.claim.localeCompare(b.claim))
}

export interface PlanCardInput {
  planId: string
  title: string | null
  sourceFilename: string | null
  uploadedOn: string
  notice: string | null
  claims: readonly ClaimResult[]
  summary: AskSummary | null
  evaluations: readonly PlanEvaluation[]
  /** Every video this workspace has analysed — the population a claim's count
   *  is drawn from. Null where it could not be read, in which case the row
   *  carries no denominator at all (`value.n === 0`). */
  corpusVideos: number | null
  quoteFor?: (claim: ClaimResult) => Quote | null
  href: string
}

/**
 * One card, from rows the loader fetched.
 *
 * THE COUNT CARRIES ITS DENOMINATOR AND ITS BOUND. `ClaimResult
 * .conversationCount` is a bare number on Ask today ("9 conversations"), and a
 * level with no "of N" is a score, which this product does not show. The
 * denominator is the whole analysed corpus, because every video the count
 * names is in it — but the numerator is bounded by the agent's retrieval, not
 * by the conversation, so the share is a FLOOR and `basis` says so. See
 * `PLAN_CLAIM_BASIS`.
 *
 * WHERE THE CORPUS COULD NOT BE READ there is no denominator: `value.n` is 0,
 * the basis line says the corpus could not be counted, and the surface prints
 * the count alone. The previous fallback used the claim's own k as its n,
 * which printed "14 of 14" — a 100% share of everything read, invented out of
 * a failed head count and worse than the bare number it replaced.
 */
export function planCard(input: PlanCardInput): PlanCheckCard {
  // THE NEWEST RE-READING, NOT THE UPLOAD'S ANSWER. See `currentReading`.
  const current = currentReading(input.claims, input.summary, input.evaluations)
  const claims: PlanClaimRow[] = current.claims.map((c) => ({
    claim: c.claim,
    verdict: c.verdict,
    verdictLabel: PLAN_VERDICT_LABEL[c.verdict] ?? c.verdict,
    value: {
      k: c.conversationCount,
      n: input.corpusVideos != null && input.corpusVideos >= c.conversationCount ? input.corpusVideos : 0,
    } satisfies Counted,
    quote: c.verdict === 'silent' ? null : input.quoteFor?.(c) ?? null,
  }))

  const summary: AskSummary = current.summary ?? {
    supported: current.claims.filter((c) => c.verdict === 'echoes').length,
    contradicted: current.claims.filter((c) => c.verdict === 'contradicts').length,
    untested: current.claims.filter((c) => c.verdict === 'silent').length,
  }

  return {
    planId: input.planId,
    // The document's own name leads: a client recognises "Summer 2026/27
    // campaign brief.pdf" and not a model-written title of it.
    title: input.sourceFilename?.trim() || input.title?.trim() || 'An uploaded plan',
    uploadedOn: input.uploadedOn,
    checkedOn: current.checkedOn,
    claims,
    summary,
    moved: movedSinceUpload(input.evaluations),
    basis: input.corpusVideos != null ? PLAN_CLAIM_BASIS : PLAN_CLAIM_BASIS_UNCOUNTED,
    floorLine: PLAN_FLOOR_LINE,
    caveat: PLAN_HOLD_CAVEAT,
    notice: input.notice,
    href: input.href,
    empty: claims.length === 0 ? 'Nothing in this plan could be read as a claim to check.' : null,
  }
}

// ---- the loader ---------------------------------------------------------------

interface CheckRow {
  id: string
  title: string | null
  source_filename: string | null
  created_at: string
  claims: ClaimResult[] | null
  summary: AskSummary | null
  notice?: string | null
}

interface EvaluationRow {
  plan_check_id: string
  run_date: string
  created_at: string
  moved: { ref: string; claim: string; from: string; to: string }[] | null
  /** The re-read verdicts. The whole reason the card is not built off
   *  `plan_checks.claims`; see `currentReading`. */
  claims: ClaimResult[] | null
  summary: AskSummary | null
}

/**
 * The plans this workspace has had checked, newest first.
 *
 * FOUR READS, CAPPED. The checks (limit `PLAN_CARDS_SHOWN`), their stored
 * re-evaluations, the threads that hold them so each card has an address, and
 * one quote pass over the claims that earned a verdict. Nothing here is a loop
 * and nothing pages: a tenant holds one or two of these.
 *
 * `notice` is read optionally, the `agentThread.planCheck` precedent: M9.1
 * carries the column and a deploy can land before the migration, so a failure
 * NAMING that column re-reads without it and any other failure is still a
 * failure.
 */
export async function loadPlanChecks(scope: Scope, corpusVideos: number | null = null): Promise<PlanCheckCard[]> {
  const supabase = scope.supabase as SupabaseClient
  const { clientId } = scope

  const columns = 'id, title, source_filename, created_at, claims, summary'
  const read = (cols: string) =>
    supabase.from('plan_checks').select(cols).eq('client_id', clientId)
      .order('created_at', { ascending: false }).limit(PLAN_CARDS_SHOWN)
  const first = await read(`${columns}, notice`)
  const checkRes = isMissingColumnError(first.error, 'notice') ? await read(columns) : first
  const checks = readRows<CheckRow>(checkRes, 'planCards.checks')
  if (checks.length === 0) return []

  const ids = checks.map((c) => c.id)
  const [evalRes, threadRes] = await Promise.all([
    supabase.from('plan_check_evaluations')
      .select('plan_check_id, run_date, created_at, moved, claims, summary')
      .eq('client_id', clientId).in('plan_check_id', ids)
      .order('created_at', { ascending: true }),
    supabase.from('agent_threads')
      .select('id, plan_check_id')
      .eq('client_id', clientId).in('plan_check_id', ids),
  ])
  const evaluations = readRows<EvaluationRow>(evalRes, 'planCards.evaluations')
  const threads = readRows<{ id: string; plan_check_id: string | null }>(threadRes, 'planCards.threads')
  const threadByCheck = new Map(threads.filter((t) => t.plan_check_id).map((t) => [t.plan_check_id as string, t.id]))

  const evalsByCheck = new Map<string, PlanEvaluation[]>()
  for (const e of evaluations) {
    const arr = evalsByCheck.get(e.plan_check_id) ?? []
    arr.push({
      runDate: e.run_date,
      createdAt: e.created_at,
      moved: e.moved ?? [],
      claims: Array.isArray(e.claims) ? e.claims : null,
      summary: e.summary ?? null,
    })
    evalsByCheck.set(e.plan_check_id, arr)
  }

  // ONE QUOTE PASS FOR EVERY CARD, not one per claim. The picker de-duplicates
  // across cards as it does across tiles, so a quote shown under one claim is
  // not shown again under another.
  const claimsOf = (c: CheckRow) => (c.claims ?? []).filter((x) => x && typeof x.claim === 'string')
  // THE QUOTES ARE RESOLVED AGAINST THE PRINTED READING, not the upload's. A
  // re-evaluation re-runs the whole verdict pass, so its claims carry their own
  // `insightIds` — the evidence behind the verdict the card shows. Fetching the
  // upload's ids would hand a chip from September a comment shortlisted in
  // August.
  const printed = (c: CheckRow) => currentReading(claimsOf(c), c.summary, evalsByCheck.get(c.id) ?? []).claims
  const insightIds = [
    ...new Set(
      checks.flatMap((c) =>
        printed(c)
          .filter((x) => x.verdict !== 'silent')
          .flatMap((x) => (x.insightIds ?? []).slice(0, ASK_THEMES_PER_CLAIM)),
      ),
    ),
  ]
  const byAudience = insightIds.length ? await fetchQuotesByAudience(supabase, insightIds) : new Map()
  const pick = createCitedQuotePicker(byAudience, new Map())
  const quoteFor = (c: ClaimResult): Quote | null => {
    if (!c.insightIds?.length) return null
    return pick(c.insightIds.slice(0, ASK_THEMES_PER_CLAIM), 1, `${c.claim}. ${c.theySay ?? ''}`)[0] ?? null
  }

  return checks.map((c) =>
    planCard({
      planId: c.id,
      title: c.title,
      sourceFilename: c.source_filename,
      uploadedOn: c.created_at,
      notice: c.notice ?? null,
      claims: claimsOf(c),
      summary: c.summary,
      evaluations: evalsByCheck.get(c.id) ?? [],
      corpusVideos,
      quoteFor,
      // A check with no thread behind it still has an address: Ask's own index,
      // which lists it. A dead link is worse than a general one.
      href: threadByCheck.has(c.id) ? `/dashboard/agent/${threadByCheck.get(c.id)}` : '/dashboard/agent',
    }),
  )
}
