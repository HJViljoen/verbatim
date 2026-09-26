import { SEALAND_CLIENT_ID } from '../lib/config'
import { assertProject, modeLine, parseScriptArgs } from '../lib/ops/market-first-args'
import {
  evidenceMap, isMissingObject, monthVideosFromExport, readConfigChanges, readExportFile, readKeywordRows, readMonthVideos,
  readProvenanceFile, readProvenanceTable, readRuns, readVerdicts, readVideos, snapshotOf, type Pages, type ProvenanceExportFile,
} from '../lib/provenance/load'
import type { ProvenanceSnapshot } from '../lib/provenance/reconstruct'
import {
  firstSearched, gatherHealth, gathersOf, isOutside, median, oneReachRowEach, populations, unchangedSearches, type MonthVideo,
  type ReachRowPlan,
} from '../lib/provenance/searches'
import { changeInSpan, changesFromLog, isSearchSurface, type OurChange } from '../lib/reading/comparability'
import { laterMonthOf } from '../lib/reading/pairs'
import { createAdminClient, selectAll } from '../lib/supabase-admin'

// Were two months read the same way? The measured inputs of the month-pair
// judge (market-first decision D, plan §4.2 PairRow, WP1.4; Heinrich's third
// --apply paste on Wed 30 Sep, then again on Mon 5 and Mon 12 Oct after each run).
//
// For each pair (default (Jul, Aug) and (Aug, Sep)) it writes, with --apply
// --project <ref>, one `month_pair_comparability` row, append-only (the newest
// computed_at wins), holding:
//   - search-outside, per month: the videos NOT surfaced by any search that ran
//     unchanged through both months (lib/provenance/searches.ts), over the
//     CATEGORY, the population themes are grouped in and the one the research
//     states its figures over (206 of 625, GC F29); the market's figures are
//     printed beside them;
//   - each change of ours in the span that is not a search change, with its
//     reach per month over both populations (`population` on each entry, as
//     lib/reading/comparability.ts reads it): the relevance-gate fix (the
//     month's videos a gate verdict admitted unjudged, source 'default') and
//     attribution v3 (the month's videos first stored after it, whose filing it
//     decided). Any other change of ours in the span has no measure here; it
//     is printed, and the judge counts it as 10% (it refuses);
//   - depth: the median dated comments a video in each month's market
//     (market_month_depth's figure);
//   - gather health per month: gathers run, partial or failed, and planned
//     searches not run (each run's config_snapshot);
//   - late capture: the earlier month's category comments first captured after
//     it ended (GC F30: August 4,923 of 10,188 on staging);
// and one `config_change_reach` row per measured change, month and population,
// once even where two pairs share the month (lib/provenance/searches.ts
// oneReachRowEach). A row identical to the newest one held is not written
// again.
//
// READ THROUGH the later month's latest update, found exactly as the judge
// finds it (lib/reading/pairs.ts laterMonthOf: completed or partial runs by
// completed_at), so the row is read while that is still the latest update and
// reads as unmeasured after the next one. The searches are those of every
// gather up to that update.
//
// A PAIR IS REFUSED when no update has read its later month yet (no gather on
// or after its first day): so no (Sep, Oct) row can be written on 30 Sep. A
// later month still in progress IS measured: the judge refuses a so-far month
// by itself (rule 1).
//
// READ-ONLY BY DEFAULT and never prompts. A staging dry run takes --export and
// --provenance where MF1 is not applied, and --gate-fix-at / --attribution-at
// stand in for the change rows log-tracking-eras writes.
//
//   node --env-file=.env.local --import tsx scripts/measure-comparability.ts --project <ref> \
//     [--pairs 2026-07:2026-08,2026-08:2026-09] [--prod-snapshot <file>] [--staging-export <file>] \
//     [--export <file>] [--provenance <file>] [--gate-fix-at <ISO>] [--attribution-at <ISO>] [--apply]

const NAME = 'measure-comparability'
export const METHOD_VERSION = 'mf1_v1'
const CODE_REACH_METHOD = 'code_change_v1'
type Population = 'market' | 'category'

const monthStart = (m: string): string => `${m.slice(0, 7)}-01`
function nextMonthStart(m: string): string {
  const d = new Date(`${monthStart(m)}T00:00:00Z`)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
}
const iso = (day: string): string => `${day}T00:00:00.000Z`

interface CodeEntry { change_id: string; surface: string; population: Population; prev: { k: number; n: number }; curr: { k: number; n: number } }

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), {
    name: NAME,
    values: ['pairs', 'prod-snapshot', 'staging-export', 'export', 'provenance', 'gate-fix-at', 'attribution-at'],
    defaultClient: SEALAND_CLIENT_ID,
  })
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  console.log(modeLine(args, NAME))
  // Each pair once, for the same reason as the reach rows: one insert cannot
  // hold a primary key twice.
  const pairs = [...new Map((args.values.pairs ?? '2026-07:2026-08,2026-08:2026-09').split(',').map((p) => {
    const [a, b] = p.split(':').map((m) => monthStart(m.trim()))
    if (!(a < b)) throw new Error(`${NAME}: --pairs ${p} is not an earlier:later month pair`)
    return [`${a}|${b}`, [a, b] as const] as const
  })).values()]
  const admin = createAdminClient()
  const pages: Pages = { n: 0 }

  const exportFile: ProvenanceExportFile | null = args.values.export ? readExportFile(args.values.export, args.clientId) : null
  const snapshots: ProvenanceSnapshot[] = []
  if (args.values['prod-snapshot']) snapshots.push(snapshotOf(readExportFile(args.values['prod-snapshot'], args.clientId), 'snapshot'))
  if (args.values['staging-export']) snapshots.push(snapshotOf(readExportFile(args.values['staging-export'], args.clientId), 'staging'))

  const [changes, videos, verdicts, kp, runs] = await Promise.all([
    readConfigChanges(admin, args.clientId, pages),
    readVideos(admin, args.clientId, pages),
    readVerdicts(admin, args.clientId, pages),
    readKeywordRows(admin, args.clientId, pages),
    readRuns(admin, args.clientId, pages),
  ])
  const gathers = gathersOf(kp, runs)
  if (gathers.length === 0) throw new Error(`${NAME}: this client has no gather at all. Nothing to measure.`)
  // The updates, as the judge reads them (lib/reading/read.ts loadUpdateRuns):
  // completed or partial runs, by completed_at.
  const updates = runs
    .filter((r) => (r.status === 'completed' || r.status === 'partial') && r.completed_at)
    .map((r) => ({ id: r.id, finishedAt: r.completed_at as string }))
  const provenance = args.values.provenance
    ? readProvenanceFile(args.values.provenance)
    : await readProvenanceTable(admin, args.clientId, pages)
  if (provenance == null) console.log('  video_provenance is not there (MF1 not applied): first-found terms are not used; pass --provenance <plan file>')
  const evidence = evidenceMap({ videos, provenance, snapshots, verdicts })
  const firstSeen = new Map(videos.map((v) => [v.id, v.first_seen]))
  const admittedUnjudged = new Set(verdicts.filter((v) => v.kept && v.source === 'default').map((v) => `${v.platform}\u0000${v.video_id}`))
  const unjudgedIds = new Set(videos.filter((v) => admittedUnjudged.has(`${v.platform}\u0000${v.video_id}`)).map((v) => v.id))
  const firstTermDate = firstSearched(gathers)

  // Our changes; the two code changes may be stood in for on a dry run.
  const ours: OurChange[] = changesFromLog(changes)
  for (const [surface, flag] of [['gate_rule', 'gate-fix-at'], ['attribution', 'attribution-at']] as const) {
    const at = args.values[flag]
    if (!at || ours.some((c) => c.surface === surface)) continue
    if (args.apply) throw new Error(`${NAME}: --${flag} stands in for a missing ${surface} row on a dry run only; run log-tracking-eras --apply first`)
    ours.push({ id: `(dry run: ${surface})`, surface, changedAt: new Date(at).toISOString(), note: null, affects: ['market', 'themes', 'brands', 'lens'] })
  }

  const monthSets = new Map<string, MonthVideo[]>()
  const monthSet = async (m: string): Promise<MonthVideo[]> => {
    const held = monthSets.get(m)
    if (held) return held
    const fromDb = exportFile ? null : await readMonthVideos(admin, args.clientId, m, pages)
    const set = fromDb ?? (exportFile ? monthVideosFromExport(exportFile, m) : null)
    if (set == null) throw new Error(`${NAME}: market_month_videos is not there (MF1 not applied) and no --export was given.`)
    monthSets.set(m, set)
    return set
  }

  const now = new Date().toISOString()
  const pairRows: Record<string, unknown>[] = []
  const planned: ReachRowPlan[] = []
  for (const [prev, month] of pairs) {
    // The later month's latest update, exactly as the judge finds it
    // (laterMonthOf): the row is read only while this is still that update.
    const later = laterMonthOf(month, now, updates)
    const update = later.latestUpdateRunId ? updates.find((u) => u.id === later.latestUpdateRunId)! : null
    // The searches that update read: every gather up to its finish.
    const lastGather = update ? gathers.filter((g) => g.at <= update.finishedAt).at(-1) ?? null : null
    console.log(`\n(${prev.slice(0, 7)}, ${month.slice(0, 7)}), read through the update ${update?.id ?? '(none)'}${update ? ` of ${update.finishedAt}` : ''}; last gather ${lastGather?.runId ?? '(none)'}`)
    if (!update || !lastGather || !gathers.some((g) => g.at >= iso(month) && g.at <= update.finishedAt)) {
      console.log(`  REFUSED: no update has read ${month.slice(0, 7)} yet (no gather on or after its first day); no row`)
      continue
    }
    const sets = { prev: populations(await monthSet(prev)), curr: populations(await monthSet(month)) }
    const unchanged = unchangedSearches(gathers, iso(prev), lastGather.runId)
    const outside = (vs: readonly MonthVideo[]) => vs.filter((v) => isOutside(v, evidence.get(v.id), unchanged))
    const side = (which: 'prev' | 'curr', pop: Population) => {
      const vs = sets[which][pop]
      return { k: outside(vs).length, n: vs.length }
    }
    const searchOutside = { prev: side('prev', 'category'), curr: side('curr', 'category') }
    const marketOutside = { prev: side('prev', 'market'), curr: side('curr', 'market') }
    console.log(`  searches unchanged through both months: ${[...new Set([...unchanged].map((k) => k.split('\u0000')[1]))].sort().join(', ') || '(none)'}`)
    console.log(`  outside, category: ${prev.slice(0, 7)} ${searchOutside.prev.k} of ${searchOutside.prev.n} · ${month.slice(0, 7)} ${searchOutside.curr.k} of ${searchOutside.curr.n}`)
    console.log(`  outside, market:   ${prev.slice(0, 7)} ${marketOutside.prev.k} of ${marketOutside.prev.n} · ${month.slice(0, 7)} ${marketOutside.curr.k} of ${marketOutside.curr.n}`)
    // The breakdown the research states its figures in: outside videos found
    // only by terms first searched on or after each of our search changes in
    // the span, and those whose first-found terms were overwritten.
    const searchChanges = ours.filter((c) => isSearchSurface(c.surface) && changeInSpan(c, prev, month))
    for (const which of ['prev', 'curr'] as const) {
      const out = outside(sets[which].category)
      const parts = [...new Set(searchChanges.map((c) => c.changedAt.slice(0, 10)))].sort().map((day) => {
        const only = out.filter((v) => {
          const e = [...(evidence.get(v.id) ?? [])]
          return e.length > 0 && e.every((t) => (firstTermDate.get(t) ?? '') >= iso(day))
        }).length
        return `only terms first searched from ${day}: ${only}`
      })
      const ambiguous = out.filter((v) => provenance?.get(v.id)?.method === 'ambiguous').length
      console.log(`    ${which === 'prev' ? prev.slice(0, 7) : month.slice(0, 7)} category outside ${out.length}: ${[...parts, `first terms overwritten (ambiguous): ${ambiguous}`].join(' · ')}`)
    }

    // The changes of ours that are not search changes, each measured or named.
    const codeChanges: CodeEntry[] = []
    for (const c of ours.filter((x) => !isSearchSurface(x.surface) && changeInSpan(x, prev, month))) {
      const touchedBy = c.surface === 'gate_rule'
        ? (v: MonthVideo) => unjudgedIds.has(v.id)
        : c.surface === 'attribution'
          ? (v: MonthVideo) => (firstSeen.get(v.id) ?? '') >= c.changedAt
          : null
      if (!touchedBy) {
        console.log(`  change ${c.id} · ${c.changedAt.slice(0, 16)} · ${c.surface}: not measured here (the judge counts it as a tenth: refused)`)
        continue
      }
      for (const pop of ['market', 'category'] as const) {
        const e: CodeEntry = {
          change_id: c.id, surface: c.surface, population: pop,
          prev: { k: sets.prev[pop].filter(touchedBy).length, n: sets.prev[pop].length },
          curr: { k: sets.curr[pop].filter(touchedBy).length, n: sets.curr[pop].length },
        }
        codeChanges.push(e)
        planned.push({ change_id: c.id, month: prev, population: pop, videos_touched: e.prev.k, videos_in_month: e.prev.n, read_through_run: update.id })
        planned.push({ change_id: c.id, month, population: pop, videos_touched: e.curr.k, videos_in_month: e.curr.n, read_through_run: update.id })
      }
      const [mk, cat] = codeChanges.slice(-2)
      console.log(`  change ${c.id} · ${c.changedAt.slice(0, 16)} · ${c.surface}: ${month.slice(0, 7)} ${mk.curr.k} of ${mk.curr.n} market, ${cat.curr.k} of ${cat.curr.n} category · ${prev.slice(0, 7)} ${mk.prev.k} of ${mk.prev.n} market, ${cat.prev.k} of ${cat.prev.n} category`)
    }

    const depth = { prev: median(sets.prev.market.map((v) => v.dated)), curr: median(sets.curr.market.map((v) => v.dated)) }
    const health = [gatherHealth(gathers, prev), gatherHealth(gathers, month)]
    const catKeys = new Set(videos.filter((v) => sets.prev.category.some((x) => x.id === v.id)).map((v) => `${v.platform}\u0000${v.video_id}`))
    const comments = await selectAll<{ platform: string; video_id: string; created_at: string }>(() =>
      admin.from('comments').select('platform, video_id, created_at').eq('client_id', args.clientId)
        .gte('comment_date', iso(prev)).lt('comment_date', iso(nextMonthStart(prev))).order('id'),
    )
    pages.n += Math.max(1, Math.ceil(comments.length / 1000))
    const ofCat = comments.filter((c) => catKeys.has(`${c.platform}\u0000${c.video_id}`))
    const late = { month: prev, comments: ofCat.filter((c) => c.created_at >= iso(nextMonthStart(prev))).length, of: ofCat.length }
    console.log(`  depth (median dated comments a market video): ${prev.slice(0, 7)} ${depth.prev ?? '-'} · ${month.slice(0, 7)} ${depth.curr ?? '-'}`)
    console.log(`  gathers: ${health.map((h) => `${h.month.slice(0, 7)} ${h.runs} run, ${h.partial} partial or failed, ${h.searches_short} searches short${h.unplanned ? ` (${h.unplanned} without a plan to check)` : ''}`).join(' · ')}`)
    console.log(`  late capture: ${late.comments} of ${prev.slice(0, 7)}'s ${late.of} category comments were first captured after it ended`)

    pairRows.push({
      client_id: args.clientId, prev_month: prev, month,
      search_outside_prev: searchOutside.prev.k, videos_prev: searchOutside.prev.n,
      search_outside_curr: searchOutside.curr.k, videos_curr: searchOutside.curr.n,
      code_changes: codeChanges,
      depth_prev_median: depth.prev, depth_curr_median: depth.curr,
      gather: health.map(({ month: m, runs: r, partial, searches_short }) => ({ month: m, runs: r, partial, searches_short })),
      late_capture: late,
      read_through_run: update.id, method_version: METHOD_VERSION,
    })
  }

  // Adjacent pairs share a month, so a change inside both spans (the gate fix
  // and attribution v3, dated late in September, fall inside (Jul, Aug) and
  // (Aug, Sep)) is planned for August twice: one row per change, month and
  // population, or the insert fails on the primary key (oneReachRowEach).
  const finishedAt = (id: string | null) => updates.find((u) => u.id === id)?.finishedAt ?? null
  const reachRows = oneReachRowEach(planned, finishedAt)
  const folded = planned.length - reachRows.length
  const foldedNote = folded > 0 ? ` (${folded} repeats of a month two pairs share, folded)` : ''

  if (!args.apply) {
    console.log(`\nread-only: nothing written (${pairRows.length} pair rows and ${reachRows.length} reach rows planned${foldedNote}) · reads: ${pages.n} pages · at ${now}`)
    return
  }

  // Apply: skip what is already held exactly as it would be written.
  type HeldPair = Record<string, unknown> & { prev_month: string; month: string; computed_at: string }
  let heldPairs: HeldPair[]
  let heldReach: { change_id: string; month: string; population: string; videos_touched: number; videos_in_month: number; read_through_run: string | null }[]
  try {
    heldPairs = await selectAll<HeldPair>(() => admin.from('month_pair_comparability').select('*').eq('client_id', args.clientId).order('computed_at').order('month'))
    heldReach = await selectAll(() => admin.from('config_change_reach')
      .select('change_id, month, population, videos_touched, videos_in_month, read_through_run')
      .eq('client_id', args.clientId).order('computed_at').order('change_id'))
    pages.n += Math.max(1, Math.ceil(heldPairs.length / 1000)) + Math.max(1, Math.ceil(heldReach.length / 1000))
  } catch (e) {
    if (isMissingObject(e, 'month_pair_comparability') || isMissingObject(e, 'config_change_reach')) {
      throw new Error(`${NAME}: MF1's tables are not on ${args.project}. Apply MF1 first. Nothing written.`)
    }
    throw e
  }
  const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const newestPair = new Map<string, HeldPair>()
  for (const h of heldPairs) newestPair.set(`${String(h.prev_month).slice(0, 10)}|${String(h.month).slice(0, 10)}`, h)
  const freshPairs = pairRows.filter((r) => {
    const h = newestPair.get(`${r.prev_month}|${r.month}`)
    if (!h) return true
    return !(['search_outside_prev', 'videos_prev', 'search_outside_curr', 'videos_curr', 'read_through_run', 'method_version'] as const)
      .every((k) => h[k] === r[k]) || !sameJson(h.code_changes, r.code_changes) || !sameJson(h.late_capture, r.late_capture)
  })
  const newestReach = new Map<string, (typeof heldReach)[number]>()
  for (const h of heldReach) newestReach.set(`${h.change_id}|${h.month.slice(0, 10)}|${h.population}`, h)
  const freshReach = reachRows.filter((r) => {
    const h = newestReach.get(`${r.change_id}|${r.month}|${r.population}`)
    return !(h && h.videos_touched === r.videos_touched && h.videos_in_month === r.videos_in_month && h.read_through_run === r.read_through_run)
  })
  if (freshPairs.length > 0) {
    const { error } = await admin.from('month_pair_comparability').insert(freshPairs)
    if (error) throw new Error(`${NAME}: pair rows not written: ${error.message}`)
  }
  if (freshReach.length > 0) {
    const { error } = await admin.from('config_change_reach').insert(freshReach.map((r) => ({
      client_id: args.clientId, ...r, method: CODE_REACH_METHOD,
    })))
    if (error) throw new Error(`${NAME}: reach rows not written (the pair rows were): ${error.message}`)
  }
  console.log(`\nAPPLIED: ${freshPairs.length} pair rows, ${freshReach.length} reach rows (${pairRows.length - freshPairs.length} and ${reachRows.length - freshReach.length} already held as they are${foldedNote}) · reads: ${pages.n} pages`)
}

if (process.argv[1]?.endsWith('measure-comparability.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
