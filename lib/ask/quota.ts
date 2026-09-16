import { ASK_DAILY_LIMIT, ASK_MONTHLY_CAP } from '../config'

/**
 * Per-tenant daily cap on Ask submissions.
 *
 * /api/ask is the first endpoint in this product where a logged-in user spends
 * real money on demand: three model calls, ~$0.35–0.50 for a large plan. With
 * no cap, one signed-in account submitting back to back is roughly $40/hour,
 * and twenty concurrent requests are far worse — Vercel will happily fan them
 * out and nothing in the code would notice.
 *
 * A daily count is deliberately crude. It needs no new infrastructure (the
 * rows are already there), it cannot be defeated by concurrency in a way that
 * matters at this scale, and the failure mode is a clear message rather than a
 * silent bill. A real rate limiter belongs with the self-serve motion, next to
 * the signup gate's Turnstile.
 */
export type QuotaCheck = { ok: true; used: number } | { ok: false; message: string }

export function evaluateQuota(usedToday: number, limit = ASK_DAILY_LIMIT): QuotaCheck {
  if (usedToday >= limit) {
    return {
      ok: false,
      message: `That is ${limit} checks today, which is the daily limit. It resets tomorrow — or tell us if you need more.`,
    }
  }
  return { ok: true, used: usedToday }
}

/** Start of the current UTC day, as an ISO timestamp for the count query. */
export function dayStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
}

// ── The monthly cap (Phase 1 WP21, decision B) ─────────────────────────────
//
// Ask opened to owners and admins, so the ceiling stopped being "how much will
// the operator spend" and became a per-tenant budget. Forty questions per
// workspace per calendar month, counted on `agent_messages` rows with
// `role = 'user'`.
//
// WHY THAT TABLE AND NOT THE LEDGER. `ai_call_log` knows the dollars and
// cannot tell a client's question from the document builder's research call:
// 141 of the 151 `agent_answer` rows in production are
// lib/reports/documents/research.ts asking itself up to eight questions a
// build, and the only field that separates them is the prompt body, which
// `strip-ai-call-bodies` nulls after 30 days — so a cap reading back to the 1st
// on the 31st reads rows whose discriminator is gone. It is also superadmin-
// only under RLS, so Settings could not print it, and it has no
// (client_id, created_at) index. `agent_messages` has the index already
// (client_id, role, created_at desc), is readable by the tenant
// (client_id = get_my_client_id()), and the row is written BEFORE the spend.
//
// WHAT COUNTS, decided rather than inherited (decision B): a client's question
// counts 1, a document check counts 1, a question the corpus was silent on
// counts 1 — it was asked, and silence is a first-class answer here — and the
// document builder's research questions count 0, because they are the cost of
// building a document the client asked for, not questions the client asked.
//
// THIS MONTH IS THE WALL CLOCK'S, and it is NOT the reading layer's month. A
// period in this product is dated by the comment (AGENTS.md); a budget is dated
// by the calendar on the wall. They are different months and the code must not
// share a clock between them, which is why this is eight lines here rather than
// an import of lib/reading/monthly.ts.

/** Start of the current UTC month, as an ISO timestamp for the count query. */
export function monthStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/** Human month, for the sentence a reader is shown: "September". */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** The month after this one, by name — what "it resets in" names. */
export function nextMonthName(now: Date): string {
  return MONTHS[(now.getUTCMonth() + 1) % 12]
}

/**
 * The cap, as a refusal or a permission.
 *
 * Hard at the line, with a sentence that says what the limit is, when it lifts
 * and that there is a person behind it. No pipeline jargon and no score: the
 * reader is being told about their own workspace's budget.
 */
export function evaluateMonthlyCap(
  usedThisMonth: number,
  limit = ASK_MONTHLY_CAP,
  now = new Date(),
): QuotaCheck {
  if (usedThisMonth >= limit) {
    return {
      ok: false,
      message: `That is ${limit} questions this month, which is the limit on this workspace. It starts again in ${nextMonthName(now)} — or tell us if you need more.`,
    }
  }
  return { ok: true, used: usedThisMonth }
}

/** What Settings prints. The count first, because a reader looking at this row
 *  wants to know how much is left rather than what the ceiling is. */
export function capLine(usedThisMonth: number, limit = ASK_MONTHLY_CAP): string {
  return `${usedThisMonth} of ${limit} questions asked`
}

/** The sentence under it. It names what counts, because a client who uploads a
 *  document and sees the number move by one should not have to work that out. */
export function capNote(usedThisMonth: number, limit = ASK_MONTHLY_CAP): string {
  const left = Math.max(0, limit - usedThisMonth)
  const room =
    left === 0
      ? 'There is no room left this month.'
      : `There ${left === 1 ? 'is' : 'are'} ${left} left this month.`
  return `A question counts one, and so does a document checked. ${room} It starts again on the 1st.`
}
