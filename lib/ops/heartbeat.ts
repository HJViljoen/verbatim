import type { SupabaseClient } from '@supabase/supabase-js'

// Writing the liveness beacon (WP2, 2026-09-11). See
// supabase/migrations/20260911120000_ops_heartbeats.sql for why it exists.
//
// Never throws, and the FACTORY is called inside the guard on purpose. Passing
// a ready-made client would evaluate createAdminClient() at the call site,
// outside this try — and it throws synchronously on a missing env var. That
// would have made the beacon able to kill the two things it watches: keep-warm
// (which the plan required could never fail) and, worse, the dispatcher's new
// FIRST step, turning the monitoring addition into a way to lose a morning's
// dispatch. A heartbeat is a side channel; it must not be able to break its host.

export async function touchHeartbeat(
  makeAdmin: () => SupabaseClient,
  name: string,
  detail?: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  try {
    const admin = makeAdmin()
    const { error } = await admin.from('ops_heartbeats').upsert(
      { name, last_seen_at: new Date().toISOString(), detail: detail ?? null },
      { onConflict: 'name' },
    )
    if (error) {
      console.warn(`[ops] heartbeat '${name}' not recorded: ${error.message}`)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.warn(`[ops] heartbeat '${name}' threw: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false }
  }
}
