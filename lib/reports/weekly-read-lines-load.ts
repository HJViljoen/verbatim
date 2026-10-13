import type { SupabaseClient } from '@supabase/supabase-js'

import { adviceShortlist } from '../pages/advice-shortlist'
import { buildAdviceRows, type RecCopy } from '../pages/market-surface'
import { loadPostIdeas } from '../post-ideas/types'
import { isMissingProductsSchema, loadMonthProductReadings, loadProductCatalogue } from '../products/types'
import { scrubProse } from '../prose/scrub'
import { isMissingRecDecisions, REC_DECISIONS_TABLE, type RecDecision } from '../rec-decisions'
import { CLIENT_AUDIENCE } from '../rivals'
import { selectAll } from '../supabase-admin'
import type { WeekReadData } from '../written/types'
import { movesTop, productsTop, weeklyReadLines, type ContentTop, type MovesTop, type ProductsTop, type WeeklyReadLine } from './weekly-read-lines'

// The level-1 email's page lines, read when the snapshot is built (depth v2,
// T11b): what each page leads with at that moment, handed to the pure builder
// (lib/reports/weekly-read-lines.ts). One small read per page, each on its
// own: a page whose read fails, or whose table is not in this database yet
// (the products migration, `post_ideas`), loses its line and nothing else.
// Wave 2b swaps each read below for that page's `top<Page>()`.
//
// Voices has no read here yet: a group's month count is a read of every
// persona insight's evidence (`loadGroupSubjects`), too heavy to run on every
// send for one line; `topVoices()` will hand it in.

/** A failed read loses its line, never the build. */
function soft<T>(what: string, p: Promise<T>): Promise<T | null> {
  return p.catch((e: unknown) => {
    console.error(`[weekly-read lines] ${what}: ${e instanceof Error ? e.message : String(e)}`)
    return null
  })
}

/** Content: the run's first post idea, its title through the written read's
 *  scrub (no digit the model typed, no direction word, no talk about the
 *  method), so it prints as prose. */
export async function readContentTop(admin: SupabaseClient, clientId: string, runId: string): Promise<ContentTop | null> {
  const ideas = await loadPostIdeas(admin, clientId, runId)
  const first = ideas.find((i) => i.rank === 1) ?? ideas[0]
  if (!first) return null
  const title = scrubProse('week_read', first.title).text.trim()
  return title ? { rank: first.rank, title, registryId: first.registry_id } : null
}

/** Your products: the product named in the most of the market's videos in
 *  the month. None without a catalogue or before the migration. */
export async function readProductsTop(admin: SupabaseClient, clientId: string, month: string): Promise<ProductsTop | null> {
  const catalogue = await loadProductCatalogue(admin, clientId)
  if (catalogue.state !== 'ready') return null
  try {
    const rows = await loadMonthProductReadings(admin, clientId, [month])
    const names = new Map(catalogue.catalogue.products.map((p) => [p.id, p.name]))
    return productsTop({ month, rows, names, clientAudience: CLIENT_AUDIENCE })
  } catch (e) {
    if (isMissingProductsSchema(e)) return null
    throw e
  }
}

/** Your moves: the first undecided piece of advice on the short list (the
 *  ledger's order, the current recommendation first). */
export async function readMovesTop(admin: SupabaseClient, clientId: string): Promise<MovesTop | null> {
  const [copies, decisions] = await Promise.all([
    selectAll<RecCopy>(() =>
      admin.from('recommendations')
        .select('id, lineage_id, title, type, status, priority, created_at, run_id')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
    ),
    selectAll<RecDecision>(() =>
      admin.from(REC_DECISIONS_TABLE)
        .select('id, lineage_id, status, decided_at')
        .eq('client_id', clientId)
        .order('decided_at', { ascending: false })
        .order('id', { ascending: false }),
    ).catch((error: unknown) => {
      if (isMissingRecDecisions(error)) return null
      throw error
    }),
  ])
  const rows = buildAdviceRows(copies, decisions)
  return movesTop(rows, adviceShortlist(rows, null).lineages)
}

/** Every page's line for one run's snapshot. Never throws. */
export async function loadWeeklyReadLines(
  admin: SupabaseClient,
  a: { clientId: string; runId: string; read: WeekReadData },
): Promise<WeeklyReadLine[]> {
  const month = a.read.month
  const [products, content, moves] = await Promise.all([
    soft('products', readProductsTop(admin, a.clientId, month)),
    soft('content', readContentTop(admin, a.clientId, a.runId)),
    soft('moves', readMovesTop(admin, a.clientId)),
  ])
  return weeklyReadLines({ month, read: a.read, voices: null, products, content, moves })
}
