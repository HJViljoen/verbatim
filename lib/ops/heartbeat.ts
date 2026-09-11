import type { SupabaseClient } from '@supabase/supabase-js'

// Writing the liveness beacon (WP2, 2026-09-11). See
// supabase/migrations/20260911120000_ops_heartbeats.sql for why it exists.
//
// Never throws. A heartbeat is a side channel: if the table is missing (the
// code deployed before the migration was applied) or the write fails, the
// function doing real work must carry on — the ops check will see a stale
// beacon and say so, which is exactly the outcome we want anyway.

export async function touchHeartbeat(
  admin: SupabaseClient,
  name: string,
  detail?: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  try {
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
