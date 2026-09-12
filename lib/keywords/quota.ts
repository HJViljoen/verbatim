import { SUGGEST_HOURLY_LIMIT } from '../config'

/**
 * Per-user hourly cap on search-term suggestions (WP5, 2026-09-12).
 *
 * `suggestTerms` on onboarding is reachable by any signed-in account before it
 * has a tenant at all, so a per-tenant count (the shape lib/ask/quota.ts uses)
 * has nothing to count. Each call is one gpt-4.1-mini call with a bounded
 * prompt — cents an hour at this cap, and a loop cannot outrun it.
 *
 * Same crudeness as the Ask quota on purpose: a count of rows in a window, no
 * new infrastructure beyond one table, and a sentence rather than a bill when
 * it bites. The caller fails CLOSED when the count cannot be read — the
 * signup-gate posture, because an uncountable limiter is not a limiter.
 */
export type SuggestQuota = { ok: true; used: number } | { ok: false; message: string }

export function evaluateSuggestQuota(usedThisHour: number, limit = SUGGEST_HOURLY_LIMIT): SuggestQuota {
  if (usedThisHour >= limit) {
    return {
      ok: false,
      message: `That is ${limit} sets of suggestions in an hour, which is the limit. Try again shortly, or type the terms yourself.`,
    }
  }
  return { ok: true, used: usedThisHour }
}

/** One hour before `now`, as an ISO timestamp for the count query. */
export function hourAgoIso(now: Date): string {
  return new Date(now.getTime() - 3_600_000).toISOString()
}
