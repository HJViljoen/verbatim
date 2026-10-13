import type { SupabaseClient } from '@supabase/supabase-js'

import { topContent } from '../pages/v2/content'
import { topMoves } from '../pages/v2/moves'
import { topProducts } from '../pages/v2/products'
import { topVoices } from '../pages/v2/voices'
import { readingHandle } from '../reading/read'
import type { Scope } from '../renderables/types'
import type { WeekReadData } from '../written/types'
import { weeklyReadLines, type LineTops, type WeeklyReadLine } from './weekly-read-lines'

// The level-1 email's page lines, read when the snapshot is built (depth v2,
// T11b; Phase 4 fix round): EACH PAGE'S OWN `top<Page>()`, the reader the
// Dashboard's tile calls, so the line is the tile (lib/reports/weekly-read-
// lines.ts). Until the fix round the build read its own small versions, and
// two of them drifted from their pages: products ranked without the client's
// audience and ignored PRODUCT_READINGS_ENABLED, the advice list was not
// folded by its vectors as Your moves folds it (`waitingAdvice`), and Voices
// had no line at all.
//
// THE BUILD'S CONTEXT. A route handler, no session: the admin client is both
// the tenant's client and the reading handle's (the export path's shape,
// lib/reports/build.ts), and every top reader filters by the client id it is
// handed. The memoised reads (lib/reading/memo.ts) are scoped to that client,
// so the four tops share their month, runs and rivals as the Dashboard's do.
// Your moves' short list makes the page's embedding call (cached per server,
// a fraction of a cent, five seconds at most, unmerged on a failure).
//
// Each top on its own: a page whose read fails, or whose table is not in this
// database yet (the products migration, `post_ideas`), loses its line and
// nothing else; a top that answers an empty or switched-off state gives no
// line either.

/** A failed read loses its line, never the build. */
function soft<T>(what: string, p: Promise<T>): Promise<T | null> {
  return p.catch((e: unknown) => {
    console.error(`[weekly-read lines] ${what}: ${e instanceof Error ? e.message : String(e)}`)
    return null
  })
}

/** Each page's tile data, as the Dashboard reads it, on the build's client. */
export async function loadLineTops(admin: SupabaseClient, clientId: string): Promise<LineTops> {
  const reading = readingHandle(clientId, admin)
  const scope: Scope = { supabase: admin, reading, clientId, params: {} }
  const [voices, products, content, moves] = await Promise.all([
    soft('voices', topVoices({ supabase: admin, clientId, reading })),
    soft('products', topProducts({ supabase: admin, clientId, reading })),
    soft('content', topContent(scope)),
    // No one decides from an email: the tile's Accept and Not for us are off.
    soft('moves', topMoves(scope, { canDecide: false })),
  ])
  return { voices, products, content, moves }
}

/** Every page's line for one run's snapshot. Never throws. */
export async function loadWeeklyReadLines(
  admin: SupabaseClient,
  a: { clientId: string; runId: string; read: WeekReadData },
  tops: (admin: SupabaseClient, clientId: string) => Promise<LineTops> = loadLineTops,
): Promise<WeeklyReadLine[]> {
  try {
    return weeklyReadLines(await tops(admin, a.clientId))
  } catch (e) {
    console.error(`[weekly-read lines] ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}
