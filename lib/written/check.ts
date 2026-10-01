import type { SupabaseClient } from '@supabase/supabase-js'

import { verdictPass } from '../ask/engine'
import type { CheckVerdict } from '../reports/documents/check'
import { asTimeout, isTimeout, UNTIMED_STEP, type CallBudget } from './deadline'

// The self-check (plan T3), the document engine's (lib/reports/documents/
// check.ts) pointed at the week: each finding's HEADLINE, as it would print,
// goes through the Ask engine's verdict pass against the run's own themes as
// if a client had asserted it. The conversation echoes it, is silent on it,
// or contradicts it; a contradicted finding is held (compose puts it in
// `held` with what the conversation says instead), and silent is ignored,
// because the theme-level check is coarser than the pool that produced the
// finding. The headline and not the paragraphs, for the reason check.ts gives:
// the headline is the claim the read makes.
//
// A pass that fails keeps every finding, unchecked: `ran` says so. `persist`
// false writes nothing to `ai_call_log` (the script's dry run).

export interface WeekCheck {
  /** Contradicted headline → what the conversation says instead. */
  contradicted: Map<string, string | null>
  verdicts: { headline: string; verdict: CheckVerdict }[]
  costUsd: number
  ran: boolean
}

export async function checkWeekRead(
  admin: SupabaseClient,
  args: {
    clientId: string; runId: string; companyName: string; headlines: readonly string[]; persist: boolean
    /** The step's time (lib/written/deadline.ts); outside the step, the cap. */
    budget?: CallBudget
  },
): Promise<WeekCheck> {
  const headlines = [...new Set(args.headlines.map((h) => h.trim()).filter(Boolean))]
  if (headlines.length === 0) return { contradicted: new Map(), verdicts: [], costUsd: 0, ran: true }
  // Capped, no SDK retry, and only where the step has time left: a call that
  // cannot start, or times out, fails the read (review M4), it is not a
  // silent pass. Any other failure keeps the findings unchecked, as before.
  const request = (args.budget ?? UNTIMED_STEP).optionsFor('check')
  try {
    const out = await verdictPass(admin, {
      clientId: args.clientId,
      runId: args.runId,
      companyName: args.companyName,
      claims: headlines.map((h, i) => ({ ref: `C${i + 1}`, claim: h, source: null })),
      persist: args.persist,
      request,
    })
    const byRef = new Map(out.claims.map((c) => [c.ref, c]))
    const verdicts = headlines.map((headline, i) => {
      const c = byRef.get(`C${i + 1}`)
      return { headline, verdict: (c?.verdict as CheckVerdict | undefined) ?? 'silent', theySay: c?.verdict === 'contradicts' ? c.theySay ?? null : null }
    })
    return {
      contradicted: new Map(verdicts.filter((v) => v.verdict === 'contradicts').map((v) => [v.headline, v.theySay])),
      verdicts: verdicts.map(({ headline, verdict }) => ({ headline, verdict })),
      costUsd: out.costUsd,
      ran: true,
    }
  } catch (e) {
    if (isTimeout(e)) throw asTimeout(e, 'check')
    console.error('[written/check] the verdict pass failed; findings kept unchecked:', e)
    return { contradicted: new Map(), verdicts: [], costUsd: 0, ran: false }
  }
}
