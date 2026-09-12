import type { SessionContext } from '../auth'
import { selectAll } from '../supabase-admin'
import { recentUpdates, summariseTerms, type KeywordPerfRow, type TermSummary } from './value'

// Read side of the search-term performance card. keyword_performance carries a
// tenant SELECT policy (client_id = get_my_client_id()), so this runs on the
// session client and RLS is the gate — no admin client, no client_id filter
// needed beyond the one below for clarity.

/** Updates pooled by the Settings card. Eight is a quarter of weekly updates. */
export const PERFORMANCE_UPDATES = 8

interface DatedRow extends KeywordPerfRow {
  created_at: string
}

/** Every term's record over the client's last `updates` gathered updates. */
export async function loadTermPerformance(
  supabase: SessionContext['supabase'],
  clientId: string,
  updates = PERFORMANCE_UPDATES,
): Promise<{ rows: TermSummary[]; updates: number }> {
  // Two reads, because one bounded read cannot do this honestly: a flat
  // `.limit(n)` over the newest rows truncates the OLDEST update it includes
  // mid-run, and those half-counted found/kept numbers feed straight into the
  // review rule. So scan the ids first (two narrow columns, paginated by
  // selectAll per AGENTS.md), decide the window, then read only those updates.
  let ids: string[]
  try {
    const scan = await selectAll<{ run_id: string; created_at: string }>(() =>
      supabase
        .from('keyword_performance')
        .select('run_id, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        // Deterministic tiebreak: selectAll pages by range, and an unstable
        // order can hand back the same row twice and skip another.
        .order('id', { ascending: false }),
    )
    ids = [...new Set(recentUpdates(scan, updates).map((r) => r.run_id))]
  } catch (e) {
    console.error(`[settings] term performance window not read for ${clientId}: ${e instanceof Error ? e.message : String(e)}`)
    return { rows: [], updates: 0 }
  }
  if (ids.length === 0) return { rows: [], updates: 0 }

  try {
    const rows = await selectAll<DatedRow>(() =>
      supabase
        .from('keyword_performance')
        .select('run_id, platform, keyword, bucket, videos_found, gate_survived, eligible_videos, insights_contributed, created_at')
        .eq('client_id', clientId)
        .in('run_id', ids)
        .order('id', { ascending: false }),
    )
    return { rows: summariseTerms(rows), updates: ids.length }
  } catch (e) {
    console.error(`[settings] term performance not read for ${clientId}: ${e instanceof Error ? e.message : String(e)}`)
    return { rows: [], updates: 0 }
  }
}
