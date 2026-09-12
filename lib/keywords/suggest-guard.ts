import { createAdminClient } from '../supabase-admin'
import { evaluateSuggestQuota, hourAgoIso, type SuggestQuota } from './quota'

// The I/O half of the suggestion cap (WP5, 2026-09-12). quota.ts stays pure and
// tested; this counts and records. Shared by both callers — the onboarding
// action and the Settings one — so neither can be the unmetered way in.

/**
 * May this user ask for suggestions right now? Counts the user's calls in the
 * last rolling hour and records this one when it passes.
 *
 * Fails CLOSED: if the counter cannot be read or written — the table is not
 * there yet, the service role is unhappy — the answer is no. An uncountable
 * limiter is not a limiter, and this endpoint spends money on demand
 * (lib/signup-gate.ts takes the same posture for the same reason).
 */
export async function takeSuggestionSlot(userId: string, clientId: string | null): Promise<SuggestQuota> {
  const admin = createAdminClient()
  const denied = {
    ok: false as const,
    message: 'Suggestions are unavailable right now. Type the terms yourself, or try again later.',
  }

  const { count, error } = await admin
    .from('suggestion_calls')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', hourAgoIso(new Date()))
  if (error) {
    console.error(`[suggest] quota not readable for ${userId}: ${error.message}`)
    return denied
  }

  const verdict = evaluateSuggestQuota(count ?? 0)
  if (!verdict.ok) return verdict

  // Recorded BEFORE the model call, so a slow or failed call still costs a
  // slot. Over-counting an error is the safe direction here.
  const { error: writeErr } = await admin.from('suggestion_calls').insert({ user_id: userId, client_id: clientId })
  if (writeErr) {
    console.error(`[suggest] quota not recordable for ${userId}: ${writeErr.message}`)
    return denied
  }
  return verdict
}
