import type { SupabaseClient } from '@supabase/supabase-js'
import { rows } from './read'

// The themed update — shared by every page loader that shows themes.
//
// A page anchors on the latest CLOSED update, but the theme pass can fail on
// an update that otherwise completed (2026-09-10: a database hang left the
// newest update with zero theme rows while the registry held 163 confirmed
// themes). Reading themes for the anchor run then renders the whole theme
// half of a page empty and tells the client their themes "land with your next
// update" — untrue, they were read last update and are still the best read we
// have. So theme-dependent reads anchor on their own run: the newest closed
// update that actually produced themes. Every other read stays on the latest
// update.
//
// `themes` is fully replaced each run and its rows carry the run's identity,
// so the presence of a row IS the evidence that the run themed.

export interface ThemedRunRow {
  run_id: string | null
  /** Anything monotonic with time — a theme row's `created_at`, or the update's date. */
  created_at?: string | null
}

/** The newest update among `rows` that produced themes, skipping in-flight
 *  ones (an update writes its theme rows before it closes, so an unfinished
 *  update can already have some and must not become the themed update).
 *  Rows with no date rank oldest; on a tie the later row wins, which keeps a
 *  caller's own ordering meaningful. Null when no update has themes. */
export function pickThemedRunId(rows: ThemedRunRow[], runningIds: readonly string[] = []): string | null {
  let bestId: string | null = null
  let bestAt = ''
  for (const row of rows) {
    const runId = row.run_id
    if (!runId || runningIds.includes(runId)) continue
    const at = row.created_at ?? ''
    if (bestId === null || at >= bestAt) {
      bestId = runId
      bestAt = at
    }
  }
  return bestId
}

/** One round trip for the same rule: the DB orders and takes the newest theme
 *  row, `pickThemedRunId` states what that row means. For a loader that already
 *  holds every update's theme rows, call `pickThemedRunId` directly instead. */
export async function fetchThemedRunId(
  supabase: SupabaseClient,
  clientId: string,
  runningIds: readonly string[] = [],
): Promise<string | null> {
  let q = supabase.from('themes').select('run_id, created_at').eq('client_id', clientId)
  if (runningIds.length) q = q.not('run_id', 'in', `(${runningIds.join(',')})`)
  const res = await q.order('created_at', { ascending: false }).limit(1)
  return pickThemedRunId(rows<ThemedRunRow>(res, 'themedRun.themes'), runningIds)
}
