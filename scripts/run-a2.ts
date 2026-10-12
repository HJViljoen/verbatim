import { runStepA2, loadGroupedInsights } from '../lib/pipeline/step-a2'
import { clusterInsightsWithCentroids, similarityMatrix, type ClusterMethod } from '../lib/pipeline/cluster'
import { mergeClusterLabels } from '../lib/pipeline/theme-merge'
import { createAdminClient } from '../lib/supabase-admin'
import { CLUSTER_SIMILARITY_THRESHOLD, EVIDENCE_FLOOR, MERGE_CHUNK_MAX, OSSUR_CLIENT_ID as OSSUR, THEME_MERGE_STEP_BUDGET_MS } from '../lib/config'

// CLI inspector for Step A2 (theme aggregation). Run with env loaded:
//   node --env-file=.env.local --import tsx scripts/run-a2.ts --run <id> [flags]
//
// Flags:
//   --run <uuid>         analysis run id to aggregate (required)
//   --client <uuid>      client_id (default: Ossur)
//   --method <name>      embedding | string (default: embedding)
//   --threshold <n>      cosine merge threshold for embedding (default: config)
//   --floor <n>          min distinct supporting videos to survive (default: config)
//   --no-merge           skip the LLM label-merge pass (A/B against raw clustering)
//   --merge-model <m>    model for the merge pass (default: config SYNTHESIS_MODEL)
//   --debug              print the per-group pairwise similarity matrix and exit
//                        (use this to tune --threshold against real data)
//   --bucket <name>      ONE bucket, timed the way its `themes:<bucket>` step
//                        is: load, cluster, merge (in parts over
//                        MERGE_CHUNK_MAX), against THEME_MERGE_STEP_BUDGET_MS
//                        counted from the start of the load, with the step's
//                        last-attempt fail-soft so a failed part is reported
//                        rather than thrown. Writes NOTHING (no ai_call_log
//                        row, no theme). Production reads: the run row (the
//                        probe), then the loader (no embedding column).
//                        Spends one embeddings pass over the bucket and its
//                        merge calls.


interface Args {
  clientId: string
  runId?: string
  method?: ClusterMethod
  threshold?: number
  floor?: number
  noMerge: boolean
  mergeModel?: string
  debug: boolean
  bucket?: string
}

function parseArgs(argv: string[]): Args {
  const args: Args = { clientId: OSSUR, noMerge: false, debug: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--run') args.runId = next()
    else if (a === '--client') args.clientId = next()
    else if (a === '--method') args.method = next() as ClusterMethod
    else if (a === '--threshold') args.threshold = Number(next())
    else if (a === '--floor') args.floor = Number(next())
    else if (a === '--no-merge') args.noMerge = true
    else if (a === '--merge-model') args.mergeModel = next()
    else if (a === '--debug') args.debug = true
    else if (a === '--bucket') args.bucket = next()
    else throw new Error(`unknown flag: ${a}`)
  }
  if (!args.runId) throw new Error('--run <uuid> is required')
  return args
}

async function debugMatrix(clientId: string, runId: string, threshold: number) {
  const { groups } = await loadGroupedInsights(clientId, runId)
  console.log(`\nSimilarity matrix — threshold ${threshold} (pairs >= it merge)\n`)
  for (const g of groups) {
    if (g.insights.length < 2) {
      console.log(`[${g.bucket}] 1 insight: ${g.insights[0].theme} — (singleton)`)
      continue
    }
    console.log(`[${g.bucket}] ${g.insights.length} insights:`)
    g.insights.forEach((ins, i) => console.log(`  ${i + 1}. ${ins.theme} (${ins.category})`))
    const m = await similarityMatrix(g.insights)
    for (let i = 0; i < g.insights.length; i++) {
      for (let j = i + 1; j < g.insights.length; j++) {
        const sim = m[i][j]
        const mark = sim >= threshold ? ' <= MERGE' : ''
        console.log(`     ${i + 1}~${j + 1}  ${sim.toFixed(3)}${mark}`)
      }
    }
    console.log('')
  }
}

/** The `themes:<bucket>` step's body, unpersisted and timed by phase. Mirrors
 *  runStepA2Bucket → processGroup (load, cluster with centroids, merge under
 *  the step's deadline) without the roll-up, which is pure and quick. */
async function timeOneBucket(args: Args, method: ClusterMethod, threshold: number) {
  const s = (ms: number) => `${(ms / 1000).toFixed(1)} s`
  // The probe on the path the loader uses (PostgREST, not SQL — AGENTS.md:
  // either can be down alone). Slow or failing, the loader never runs.
  const probeAt = Date.now()
  const { data: run, error } = await createAdminClient()
    .from('pipeline_runs').select('id, client_id, status').eq('id', args.runId!).maybeSingle()
  const probeMs = Date.now() - probeAt
  if (error) throw new Error(`run read failed (PostgREST): ${error.message}`)
  if (probeMs > 3_000) throw new Error(`PostgREST probe took ${s(probeMs)}; no production read for 15 minutes (AGENTS.md)`)
  if (!run || run.client_id !== args.clientId) throw new Error(`run ${args.runId} is not this client's`)
  console.log(`PostgREST probe ${probeMs} ms; run ${run.id} is ${run.status}`)

  const startedAt = Date.now()
  const deadline = startedAt + THEME_MERGE_STEP_BUDGET_MS
  const { groups } = await loadGroupedInsights(args.clientId, args.runId!)
  const loadedAt = Date.now()
  const grp = groups.find((g) => g.bucket === args.bucket)
  if (!grp) throw new Error(`bucket "${args.bucket}" not in this corpus (have: ${groups.map((g) => g.bucket).join(', ')})`)
  const clustered = await clusterInsightsWithCentroids(grp.insights, { method, threshold })
  const clusteredAt = Date.now()
  console.log(`[${grp.bucket}] ${grp.insights.length} insights → ${clustered.clusters.length} clusters (load ${s(loadedAt - startedAt)}, embed + cluster ${s(clusteredAt - loadedAt)}); merge has ${s(deadline - clusteredAt)} left of ${s(THEME_MERGE_STEP_BUDGET_MS)}`)

  const m = await mergeClusterLabels({
    clientId: args.clientId, runId: args.runId!, bucket: grp.bucket, clusters: clustered.clusters, centroids: clustered.centroids,
    model: args.mergeModel, logCall: false, callIndex: 1, deadline, failSoft: true,
  })
  const doneAt = Date.now()

  console.log('\n=== ONE BUCKET, AS ITS STEP ===')
  console.log(`insights:          ${grp.insights.length}`)
  console.log(`clusters:          ${clustered.clusters.length} → ${m.clusters.length} after merge (MERGE_CHUNK_MAX ${MERGE_CHUNK_MAX})`)
  console.log(`merge calls:       ${m.chunks}, failed ${m.failedChunks}${m.skipped ? ' (whole bucket unmerged)' : ''}`)
  console.log(`merges applied:    ${m.applied.length}`)
  console.log(`groups rejected:   ${m.rejectedGroups}`)
  console.log(`tokens:            ${m.promptTokens} in, ${m.completionTokens} out`)
  console.log(`merge cost:        $${m.costUsd.toFixed(4)}`)
  console.log(`wall:              ${s(doneAt - startedAt)} of ${s(THEME_MERGE_STEP_BUDGET_MS)} (load ${s(loadedAt - startedAt)}, cluster ${s(clusteredAt - loadedAt)}, merge ${s(doneAt - clusteredAt)})`)
  for (const a of m.applied.slice(0, 15)) console.log(`  + ${a.members.join('  +  ')}  — ${a.reason}`)
  if (m.applied.length > 15) console.log(`  …and ${m.applied.length - 15} more`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const method = args.method ?? 'embedding'
  const threshold = args.threshold ?? CLUSTER_SIMILARITY_THRESHOLD
  const floor = args.floor ?? EVIDENCE_FLOOR
  console.log(`Step A2 — run=${args.runId} method=${method} threshold=${threshold} floor=${floor}`)

  if (args.debug) {
    await debugMatrix(args.clientId, args.runId!, threshold)
    return
  }
  if (args.bucket) {
    await timeOneBucket(args, method, threshold)
    return
  }

  const result = await runStepA2({
    clientId: args.clientId,
    runId: args.runId!,
    method,
    threshold,
    evidenceFloor: floor,
    merge: !args.noMerge,
    mergeModel: args.mergeModel,
  })

  if (result.mergesApplied.length) {
    console.log(`\n=== LABEL MERGES APPLIED — ${result.mergesApplied.length} (cost $${result.mergeCostUsd.toFixed(4)}) ===`)
    for (const m of result.mergesApplied) {
      console.log(`[${m.bucket}] ${m.members.join('  +  ')}`)
      console.log(`    ${m.reason}`)
    }
  }

  console.log(`\n=== SURVIVING THEMES (>= floor ${floor}) — ${result.themes.length} ===`)
  for (const t of result.themes) {
    const members = t.memberThemes.join(', ')
    console.log(
      `[${t.bucket} / ${t.category}] ${t.theme}  ·  ${t.evidenceCount} videos · strength ${t.strengthScore} · ${t.dominantEmotion}/${t.dominantSentimentImpact}`,
    )
    if (t.memberThemes.length > 1) console.log(`    merged: ${members}`)
  }

  console.log(`\n=== EARLY SIGNALS (below floor, kept + badged) — ${result.earlySignals.length} ===`)
  for (const t of result.earlySignals) {
    console.log(`[${t.bucket} / ${t.category}] ${t.theme}  ·  ${t.evidenceCount} video(s) · strength ${t.strengthScore}`)
  }

  console.log('\n=== SUMMARY ===')
  console.log(`insights in:       ${result.totalInsights}`)
  console.log(`clusters formed:   ${result.totalClusters}`)
  console.log(`survived floor:    ${result.themes.length}`)
  console.log(`early signals:     ${result.earlySignals.length}`)
}

main().catch((e) => {
  console.error('Step A2 failed:', e)
  process.exit(1)
})
