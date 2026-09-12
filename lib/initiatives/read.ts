import { selectAll } from '../supabase-admin'
import { rows as readRows } from '../pages/read'
import { shortDate } from '../format'
import { measureInitiative, initiativeLine, wentTheirWay, type InitiativeVerdict, type ObservationPoint } from './measure'
import { toInitiative, type InitiativeDbRow, type InitiativeDirection } from './types'

// The read behind the Dashboard's initiatives tile (WP7c). Tile-ready by the
// time it leaves here — a snapshot stores what the renderer consumes, so an
// export in October shows the same line it showed in September.
//
// Two round trips, never per-initiative: one for the declarations, one for
// every theme observation since the earliest of them. The second is the
// denominator's read as well as the numerator's — share is measured against
// ALL of an update's theme evidence, so the totals have to come from the same
// query, not from a second one that could be scoped differently.

export interface InitiativeTileRow {
  id: string
  title: string
  direction: InitiativeDirection
  competitorName: string | null
  startedLabel: string
  /** Share per update since it was declared — the sparkline. */
  series: number[]
  /** The calibrated sentence ("Up 2.3 points since 12 Aug · 4 updates"). */
  line: string
  verdict: InitiativeVerdict
  /** Whether the movement went the way they said they wanted. Null on flat/too early. */
  theirWay: boolean | null
  latestShare: number | null
  sentimentDelta: number | null
}

export interface InitiativesData {
  rows: InitiativeTileRow[]
  /** Active initiatives in all — `rows` is capped for the tile. */
  total: number
}

/** Rows on the tile; the rest are counted in the meta line. */
export const INITIATIVE_ROWS_SHOWN = 4

interface ObservationRow {
  theme_id: string
  run_id: string | null
  run_date: string | null
  created_at: string
  evidence_count: number | null
  dominant_sentiment_impact: string | null
}

/** Every active initiative, measured. Empty (not null) when none is declared —
 *  the tile says so in its own words. */
export async function loadInitiatives(
  // The untyped Supabase client (AGENTS.md), session or admin per the scope.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clientId: string,
): Promise<InitiativesData> {
  // Through `rows()`: a failed read and "nothing declared" are the same empty
  // tile, and only the server log can tell them apart. The tile degrades, the
  // failure is said out loud.
  const declared = await supabase
    .from('initiatives')
    .select('id, title, goal, registry_ids, competitor_name, direction, started_at, status, created_at')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  const initiatives = readRows<InitiativeDbRow>(declared, 'initiatives.declared').map(toInitiative).filter((i) => i.registryIds.length > 0)
  if (initiatives.length === 0) return { rows: [], total: 0 }

  const earliest = initiatives.map((i) => i.startedAt).sort()[0]

  // selectAll: a client's observations run to hundreds per update and this read
  // spans every update since the oldest initiative was declared, so a bare
  // select would silently cap at 1000 — and a capped read here does not just
  // lose rows, it shrinks the DENOMINATOR and inflates every share on the tile.
  const observations = await selectAll<ObservationRow>(() =>
    supabase
      .from('theme_observations')
      .select('theme_id, run_id, run_date, created_at, evidence_count, dominant_sentiment_impact')
      .eq('client_id', clientId)
      .gte('run_date', earliest)
      .order('id'),
  )

  const totalByRun: Record<string, number> = {}
  const byTheme = new Map<string, ObservationPoint[]>()
  for (const o of observations) {
    if (!o.run_id || !o.run_date) continue
    totalByRun[o.run_id] = (totalByRun[o.run_id] ?? 0) + Math.max(0, o.evidence_count ?? 0)
    const point: ObservationPoint = {
      runId: o.run_id,
      runDate: o.run_date,
      createdAt: o.created_at,
      evidenceCount: o.evidence_count ?? 0,
      sentiment: o.dominant_sentiment_impact,
    }
    const arr = byTheme.get(o.theme_id) ?? []
    arr.push(point)
    byTheme.set(o.theme_id, arr)
  }

  const rows = initiatives.map((i) => {
    const mine = i.registryIds.flatMap((id) => byTheme.get(id) ?? [])
    const m = measureInitiative(mine, totalByRun, i.startedAt)
    const startedLabel = shortDate(i.startedAt)
    return {
      id: i.id,
      title: i.title,
      direction: i.direction,
      competitorName: i.competitorName,
      startedLabel,
      series: m.points.map((p) => p.share),
      line: initiativeLine(m, startedLabel),
      verdict: m.verdict,
      theirWay: wentTheirWay(m, i.direction),
      latestShare: m.latestShare,
      sentimentDelta: m.sentimentDelta,
    }
  })

  return { rows: rows.slice(0, INITIATIVE_ROWS_SHOWN), total: rows.length }
}
