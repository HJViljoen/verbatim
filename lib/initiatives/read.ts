import { selectAll } from '../supabase-admin'
import { rows as readRows } from '../pages/read'
import { shortDate } from '../format'
import { measureInitiative, initiativeLine, wentTheirWay, type ObservationPoint, type RunInWindow } from './measure'
import { toInitiative, INITIATIVE_ROWS_SHOWN, EMPTY_INITIATIVES, type InitiativeDbRow, type InitiativesData } from './types'

// The read behind the Dashboard's initiatives tile (WP7c). Tile-ready by the
// time it leaves here — a snapshot stores what the renderer consumes, so an
// export in October shows the same line it showed in September.
//
// Three reads, never per-initiative: the declarations, the updates in the
// window, and every theme observation across those updates. The last is the
// denominator's read as well as the numerator's — a share measured against a
// total that came from a differently-scoped query is not a share.
//
// THE DENOMINATOR IS THE THEME'S OWN ENTITY GROUP, not the whole corpus. That
// is lib/calibration's oldest rule, stated in its own header: "group sizes
// differ 5×, so a corpus-wide share would bury every client theme under
// industry noise." It also settles a question a corpus-wide share answers
// wrongly — with every bucket in the denominator, a new competitor entering the
// tracked conversation drags every initiative's share downward while nothing
// has changed in the conversation the client is actually watching.

/** Updates the tile measures over. The sparkline is 64px wide and the reader is
 *  asking "since I declared it" — a year of weekly updates is neither drawable
 *  nor readable, and this read sits on the critical path of a page load. An
 *  initiative older than the window measures from the window's start and says
 *  how many updates it is reporting on. */
export const INITIATIVE_WINDOW_UPDATES = 12

interface ObservationRow {
  theme_id: string
  run_id: string | null
  run_date: string | null
  created_at: string
  evidence_count: number | null
  dominant_sentiment_impact: string | null
}

interface RunRow {
  id: string
  started_at: string | null
  status: string | null
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
    .select('id, title, goal, registry_ids, direction, started_at, status, created_at')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  const initiatives = readRows<InitiativeDbRow>(declared, 'initiatives.declared')
    .map(toInitiative)
    .filter((i) => i.registryIds.length > 0)
  if (initiatives.length === 0) return EMPTY_INITIATIVES

  // Everything below is the measurement, and `selectAll` THROWS on error — so
  // it is caught as one piece. This runs inside loadDashboard's third wave, and
  // a broken theme_observations read must cost the tile its numbers, not cost
  // every tenant with an initiative their whole Dashboard.
  try {
    // The window: the last N updates the client could have seen. Bounding on the
    // RUN rather than on `started_at` keeps the observation read a fixed size —
    // an initiative declared a year ago would otherwise walk ~28k rows, in ~28
    // sequential pages, on every page load.
    const { data: runData, error: runError } = await supabase
      .from('pipeline_runs')
      .select('id, started_at, status')
      .eq('client_id', clientId)
      .in('status', ['completed', 'partial'])
      .order('started_at', { ascending: false })
      .limit(INITIATIVE_WINDOW_UPDATES)
    if (runError) throw new Error(`pipeline_runs: ${runError.message}`)
    const runIds = ((runData ?? []) as RunRow[]).map((r) => r.id)
    if (runIds.length === 0) return { rows: [], total: initiatives.length }

    // selectAll on both: a client's observations run to hundreds per update
    // (Össur ~543) and the registry is past a thousand rows (Sealand 1,240), so
    // a bare select would cap at 1000 — and a capped read here does not merely
    // lose rows, it shrinks the DENOMINATOR and inflates every share on the tile.
    const [observations, registry] = await Promise.all([
      selectAll<ObservationRow>(() =>
        supabase
          .from('theme_observations')
          .select('theme_id, run_id, run_date, created_at, evidence_count, dominant_sentiment_impact')
          .eq('client_id', clientId)
          .in('run_id', runIds)
          .order('id'),
      ),
      selectAll<{ id: string; bucket: string }>(() =>
        supabase.from('theme_registry').select('id, bucket').eq('client_id', clientId).order('id'),
      ),
    ])
    const bucketOf = new Map(registry.map((r) => [r.id, r.bucket]))

    // Per-update totals PER BUCKET, plus each theme's own series.
    const totalByRun = new Map<string, Map<string, number>>()
    const runsInWindow = new Map<string, RunInWindow>()
    const byTheme = new Map<string, ObservationPoint[]>()
    for (const o of observations) {
      if (!o.run_id || !o.run_date) continue
      const bucket = bucketOf.get(o.theme_id)
      if (bucket) {
        const perBucket = totalByRun.get(o.run_id) ?? new Map<string, number>()
        perBucket.set(bucket, (perBucket.get(bucket) ?? 0) + Math.max(0, o.evidence_count ?? 0))
        totalByRun.set(o.run_id, perBucket)
      }
      // Every update that produced ANY theme — the list an initiative's zeroes
      // are drawn from. An update whose theme pass produced nothing at all is
      // absent on purpose: "we heard nothing from anyone" is not evidence that
      // this conversation stopped.
      const held = runsInWindow.get(o.run_id)
      if (!held || o.created_at > held.createdAt) {
        runsInWindow.set(o.run_id, { runId: o.run_id, runDate: o.run_date, createdAt: o.created_at })
      }
      const arr = byTheme.get(o.theme_id) ?? []
      arr.push({
        runId: o.run_id,
        runDate: o.run_date,
        createdAt: o.created_at,
        evidenceCount: o.evidence_count ?? 0,
        sentiment: o.dominant_sentiment_impact,
      })
      byTheme.set(o.theme_id, arr)
    }
    const runList = [...runsInWindow.values()]

    const rows = initiatives.map((i) => {
      const mine = i.registryIds.flatMap((id) => byTheme.get(id) ?? [])
      // The initiative's own entity groups — usually one. An initiative that
      // spans a client theme and a competitor theme is measured against both
      // groups together, which is the only reading in which its two halves add
      // up to one share.
      const buckets = [...new Set(i.registryIds.map((id) => bucketOf.get(id)).filter((b): b is string => !!b))]
      const denominators: Record<string, number> = {}
      for (const run of runList) {
        const perBucket = totalByRun.get(run.runId)
        denominators[run.runId] = buckets.reduce((sum, b) => sum + (perBucket?.get(b) ?? 0), 0)
      }
      const m = measureInitiative(mine, denominators, i.startedAt, runList)
      const startedLabel = shortDate(i.startedAt)
      return {
        id: i.id,
        title: i.title,
        direction: i.direction,
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
  } catch (e) {
    // The same bargain as `rows()` one read up: the tile degrades, the failure
    // is said out loud. `total` stays true — they ARE tracking these — so the
    // tile reads "3 tracked" with no lines rather than "track something".
    console.error(`[initiatives] measure: ${e instanceof Error ? e.message : String(e)}`)
    return { rows: [], total: initiatives.length }
  }
}
