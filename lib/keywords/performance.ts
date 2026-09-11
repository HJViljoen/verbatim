import type { SessionContext } from '../auth'
import { recentUpdates, summariseTerms, type KeywordPerfRow, type TermSummary } from './value'

// Read side of the search-term performance card. keyword_performance carries a
// tenant SELECT policy (client_id = get_my_client_id()), so this runs on the
// session client and RLS is the gate — no admin client, no client_id filter
// needed beyond the one below for clarity.

/** Updates pooled by the Settings card. Eight is a quarter of weekly updates. */
export const PERFORMANCE_UPDATES = 8

/** Rows read at most. 15 terms x 4 platforms x 8 updates = 480; the ceiling is
 *  a bare .select()'s 1000-row cap, which this stays under by construction. */
const ROW_LIMIT = 1000

interface DatedRow extends KeywordPerfRow {
  created_at: string
}

/** Every term's record over the client's last `updates` gathered updates. */
export async function loadTermPerformance(
  supabase: SessionContext['supabase'],
  clientId: string,
  updates = PERFORMANCE_UPDATES,
): Promise<{ rows: TermSummary[]; updates: number }> {
  const { data, error } = await supabase
    .from('keyword_performance')
    .select('run_id, platform, keyword, bucket, videos_found, gate_survived, eligible_videos, insights_contributed, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(ROW_LIMIT)

  if (error || !data) return { rows: [], updates: 0 }
  const recent = recentUpdates(data as DatedRow[], updates)
  return { rows: summariseTerms(recent), updates: new Set(recent.map((r) => r.run_id)).size }
}
