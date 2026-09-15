import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { matchThemes, type IncomingTheme, type RegistryEntry } from '../lib/pipeline/theme-registry'
import { audienceFold } from '../lib/rivals'
import { EVIDENCE_FLOOR, OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../lib/config'

// The theme-key back-test (WP2, item 3, 2026-09-18). READ-ONLY: it never
// writes, never calls a model, and takes no --apply. Every figure quoted in
// lib/pipeline/theme-registry.ts, lib/pipeline/clustering.ts and the WP2 status
// note comes out of this file, so a later reader can re-run the measurement
// instead of trusting a comment. (The first version of it lived in a scratchpad
// and the numbers drifted into the comments within a day; that is why it is in
// the repo.)
//
//   node --env-file=.env.local --import tsx scripts/theme-key-backtest.ts
//   … --client <uuid>        one tenant instead of both
//
// WHAT IT MEASURES. `themes` is replaced per (client, run) but never pruned, so
// the retained rows are a full record of every run's clustering: the cluster's
// insight ids, its video ids, its label and the registry entry it was assigned.
// That is enough to replay identity assignment under either key.
//
// Three readings, because they answer three different questions:
//
//   transitions  For each consecutive pair of themed runs, rebuild a registry
//                from the OLDER run's rows and match the NEWER run's themes
//                against it. This is the real thing: one run of corpus drift,
//                a fresh clustering, and the two keys scored side by side.
//   cutover      Registry as M2's backfill leaves it (the newest themes row per
//                registry_id), matched by the LATEST run's themes — printed on
//                two bases, because they differ roughly twofold and a figure
//                quoted without saying which is not a figure:
//                  excl. latest  the backfill run one step behind, so the
//                                reading carries a run of corpus drift. This is
//                                the proxy for what a real next run meets.
//                  self-match    the backfill including the latest run, whose
//                                newest claim for most entries IS the run being
//                                matched. A ceiling no real run reaches.
//   bump         A Pass A prompt-version bump re-reads the whole corpus in one
//                run, so every audience_insights id is re-minted: the insight
//                arm scores exactly zero and the video column IS the carry.
//                Printed on both cutover bases, for the same reason.
//
// The weak band is inert here: no embeddings are loaded, so `cosine` is absent
// and rule 2 cannot fire on either arm. Both keys are therefore judged on
// membership alone, which is the comparison that matters.

interface ThemeRow {
  id: string
  run_id: string
  bucket: string
  label: string | null
  registry_id: string | null
  supporting_insight_ids: string[] | null
  supporting_video_ids: string[] | null
  created_at: string
}

interface Args { clientIds: string[] }

function parseArgs(argv: string[]): Args {
  const args: Args = { clientIds: [OSSUR_CLIENT_ID, SEALAND_CLIENT_ID] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.clientIds = [argv[++i]]
  }
  return args
}

/** One registry entry per identity in a set of themes rows, newest row wins —
 *  the same rule as M2's backfill, and the same rule the live registry follows
 *  (the entry holds the membership of the run that last claimed it).
 *
 *  `real` picks which identity: with it, only rows that actually carry a
 *  registry_id, which is what M2's backfill fills and therefore the only honest
 *  input to a cutover reading. Without it, a row with no registry_id stands in
 *  as its own entry — the registry did not exist before 2026-08-17 and the two
 *  corpus-wide re-reads that matter most are older than it, so the transitions
 *  are measured as if it had. */
function registryFrom(rows: ThemeRow[], real = false): RegistryEntry[] {
  const byId = new Map<string, RegistryEntry>()
  for (const r of rows) {
    if (real && !r.registry_id) continue
    byId.set(r.registry_id ?? r.id, {
      id: r.registry_id ?? r.id,
      bucket: r.bucket,
      member_insight_ids: r.supporting_insight_ids ?? [],
      member_video_ids: r.supporting_video_ids ?? [],
      embedding: null,
      status: 'active',
      canonical_label: r.label ?? '',
    })
  }
  return [...byId.values()]
}

/** The incoming side. `remint` is the prompt bump: every insight id replaced by
 *  one that exists nowhere in the registry, which is exactly what Pass A does
 *  to the whole corpus when its prompt version moves. */
function incomingFrom(rows: ThemeRow[], remint = false): IncomingTheme[] {
  return rows.map((r, i) => ({
    key: String(i),
    bucket: r.bucket,
    memberInsightIds: remint
      ? (r.supporting_insight_ids ?? []).map((_, j) => `reminted:${i}:${j}`)
      : (r.supporting_insight_ids ?? []),
    memberVideoIds: r.supporting_video_ids ?? [],
    label: r.label ?? '',
    embedding: null,
  }))
}

interface Reading {
  themes: number
  insight: number
  video: number
  rescued: number
  lost: number
  different: number
  aboveFloor: number
  aboveFloorInsight: number
  aboveFloorVideo: number
  aboveFloorDifferent: number
}

/** Score one (registry, incoming) pair under both keys. The insight-only run is
 *  the same matcher with the video sets stripped from BOTH sides, which is
 *  byte-for-byte what the matcher did before 2026-09-18. */
function compare(registry: RegistryEntry[], incoming: IncomingTheme[], rows: ThemeRow[]): Reading {
  const opts = { bucketKey: audienceFold }
  const withVideo = matchThemes(incoming, registry, opts)
  const insightOnly = matchThemes(
    incoming.map((t) => ({ ...t, memberVideoIds: [] })),
    registry.map((e) => ({ ...e, member_video_ids: [] })),
    opts,
  )
  const r: Reading = {
    themes: incoming.length, insight: 0, video: 0, rescued: 0, lost: 0, different: 0,
    aboveFloor: 0, aboveFloorInsight: 0, aboveFloorVideo: 0, aboveFloorDifferent: 0,
  }
  for (let i = 0; i < incoming.length; i++) {
    const a = insightOnly[i].themeId
    const b = withVideo[i].themeId
    // Above the floor is the population the key claims to improve: the themes
    // the product will show at all.
    const above = (rows[i].supporting_video_ids ?? []).length >= EVIDENCE_FLOOR
    if (a) r.insight++
    if (b) r.video++
    if (!a && b) r.rescued++
    if (a && !b) r.lost++
    if (a && b && a !== b) r.different++
    if (above) {
      r.aboveFloor++
      if (a) r.aboveFloorInsight++
      if (b) r.aboveFloorVideo++
      if (a && b && a !== b) r.aboveFloorDifferent++
    }
  }
  return r
}

const row = (label: string, r: Reading) =>
  `  ${label.padEnd(30)} ${String(r.themes).padStart(5)} ${String(r.insight).padStart(7)} ${String(r.video).padStart(6)} ` +
  `${String(r.rescued).padStart(8)} ${String(r.lost).padStart(5)} ${String(r.different).padStart(10)} ` +
  `${String(r.aboveFloorInsight).padStart(6)} → ${String(r.aboveFloorVideo).padEnd(5)} ${String(r.aboveFloorDifferent).padStart(5)}`

const HEADER =
  `  ${'transition'.padEnd(30)} ${'themes'.padStart(5)} ${'insight'.padStart(7)} ${'video'.padStart(6)} ` +
  `${'rescued'.padStart(8)} ${'lost'.padStart(5)} ${'different'.padStart(10)} ${'above floor'.padStart(14)} ${'diff'.padStart(5)}`

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  for (const clientId of args.clientIds) {
    const rows = await selectAll<ThemeRow>(() =>
      admin.from('themes')
        .select('id, run_id, bucket, label, registry_id, supporting_insight_ids, supporting_video_ids, created_at')
        .eq('client_id', clientId).order('created_at', { ascending: true }).order('id', { ascending: true }),
    )
    const runs: string[] = []
    const byRun = new Map<string, ThemeRow[]>()
    for (const r of rows) {
      const arr = byRun.get(r.run_id)
      if (arr) arr.push(r)
      else { byRun.set(r.run_id, [r]); runs.push(r.run_id) }
    }
    const dateOf = (runId: string) => (byRun.get(runId)![0].created_at ?? '').slice(0, 10)

    console.log(`\n=== ${clientId} — ${rows.length} retained theme rows over ${runs.length} themed runs`)
    console.log(HEADER)
    for (let i = 1; i < runs.length; i++) {
      const older = byRun.get(runs[i - 1])!
      const newer = byRun.get(runs[i])!
      console.log(row(`${dateOf(runs[i - 1])} → ${dateOf(runs[i])}`, compare(registryFrom(older), incomingFrom(newer), newer)))
    }

    // The cutover. Two bases, and the difference between them is the whole of
    // the ambiguity: the registry M2 leaves BEHIND the latest run (its newest
    // claim is the run before, so the reading carries a run of drift), and the
    // registry M2 leaves INCLUDING it, whose newest claim for most entries is
    // the very run being matched — a self-match, and therefore a ceiling that
    // no real run will reach.
    const latest = byRun.get(runs[runs.length - 1])!
    const behind = registryFrom(rows.filter((r) => r.run_id !== runs[runs.length - 1]), true)
    const backfilled = registryFrom(rows, true)
    console.log(row(`cutover (M2 reg., excl. latest)`, compare(behind, incomingFrom(latest), latest)))
    console.log(row(`cutover (M2 reg., self-match)`, compare(backfilled, incomingFrom(latest), latest)))

    // The bump, on both of those bases. A prompt-version bump re-mints every
    // insight id, so the insight arm scores 0 by construction and the video
    // column below IS the carry.
    console.log(row(`bump (M2 reg., excl. latest)`, compare(behind, incomingFrom(latest, true), latest)))
    console.log(row(`bump (M2 reg., self-match)`, compare(backfilled, incomingFrom(latest, true), latest)))
  }
  console.log('\n(read-only; no writes, no model calls. "above floor" is insight → video, then re-assignments.)')
}

main().catch((e) => { console.error(e); process.exit(1) })
