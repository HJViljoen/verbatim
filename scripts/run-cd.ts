import { createAdminClient } from '../lib/supabase-admin'
import { computeMetrics } from '../lib/pipeline/metrics'
import { runStepA2 } from '../lib/pipeline/step-a2'
import { runPassC } from '../lib/pipeline/pass-c'
import { runPassD } from '../lib/pipeline/pass-d'
import { CLUSTER_SIMILARITY_THRESHOLD, EVIDENCE_FLOOR } from '../lib/config'
import type { ClusterMethod } from '../lib/pipeline/cluster'
import type { VideoRow, CommentRow } from '../lib/pipeline/types'

// CLI orchestrator for the back half of the analysis chain: Step A2 → Pass C →
// Pass D, over an existing Pass A run. Run with env loaded:
//   node --env-file=.env.local --import tsx scripts/run-cd.ts --run <id> [flags]
//
// Flags:
//   --run <uuid>      Pass A run id to aggregate + synthesise (required)
//   --client <uuid>   client_id (default: Ossur)
//   --platform <name> platform for the metrics corpus (default: tiktok)
//   --method <name>   embedding | string (A2 clustering; default: embedding)
//   --threshold <n>   A2 cosine merge threshold (default: config)
//   --floor <n>       A2 evidence floor (default: config; use 1 on thin/bucketed data)
//   --dry-run         assemble everything, no GPT calls / writes
//   --no-persist      run GPT calls but don't write C/D results to DB

const OSSUR = 'e52cac94-30e1-426a-9a36-31b11e0b30b6'

interface Args {
  clientId: string
  runId?: string
  platform: string
  method?: ClusterMethod
  threshold?: number
  floor?: number
  dryRun: boolean
  persist: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = { clientId: OSSUR, platform: 'tiktok', dryRun: false, persist: true }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = () => argv[++i]
    if (flag === '--run') a.runId = next()
    else if (flag === '--client') a.clientId = next()
    else if (flag === '--platform') a.platform = next()
    else if (flag === '--method') a.method = next() as ClusterMethod
    else if (flag === '--threshold') a.threshold = Number(next())
    else if (flag === '--floor') a.floor = Number(next())
    else if (flag === '--dry-run') a.dryRun = true
    else if (flag === '--no-persist') a.persist = false
    else throw new Error(`unknown flag: ${flag}`)
  }
  if (!a.runId) throw new Error('--run <uuid> is required')
  return a
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const method = args.method ?? 'embedding'
  const threshold = args.threshold ?? CLUSTER_SIMILARITY_THRESHOLD
  const floor = args.floor ?? EVIDENCE_FLOOR
  const persist = args.persist && !args.dryRun
  const admin = createAdminClient()
  console.log(`A2→C→D — run=${args.runId} client=${args.clientId} method=${method} threshold=${threshold} floor=${floor} persist=${persist}`)

  // Metrics corpus: client videos on the platform + their comments.
  const { data: vData, error: vErr } = await admin.from('videos').select('*').eq('client_id', args.clientId).eq('platform', args.platform)
  if (vErr) throw new Error(`load videos: ${vErr.message}`)
  const videos = (vData ?? []) as VideoRow[]
  const { data: cData, error: cErr } = await admin
    .from('comments')
    .select('id, client_id, run_id, platform, video_id, comment_id, author, text, likes')
    .eq('client_id', args.clientId)
    .in('video_id', videos.map((v) => v.video_id))
  if (cErr) throw new Error(`load comments: ${cErr.message}`)
  const comments = (cData ?? []) as CommentRow[]
  const metrics = computeMetrics(videos, comments)

  const { data: tc } = await admin
    .from('tracking_configs')
    .select('brand_keywords, competitor_names, industry_keywords')
    .eq('client_id', args.clientId)
    .maybeSingle()

  console.log('\nShare of voice:')
  for (const [bucket, e] of Object.entries(metrics.share_of_voice)) console.log(`  ${bucket}: ${e.videos} videos (${e.pct_videos}%)`)

  // Step A2.
  const a2 = await runStepA2({ clientId: args.clientId, runId: args.runId!, method, threshold, evidenceFloor: floor })
  console.log(`\nStep A2: ${a2.totalInsights} insights → ${a2.totalClusters} clusters → ${a2.themes.length} survive floor ${floor}`)
  for (const t of a2.themes) console.log(`  [${t.bucket} / ${t.category}] ${t.theme} · ${t.evidenceCount} videos · str ${t.strengthScore}`)

  // Pass C.
  const c = await runPassC({
    clientId: args.clientId,
    runId: args.runId!,
    themes: a2.themes,
    trackingConfig: tc ?? undefined,
    sov: metrics.share_of_voice,
    persist,
    dryRun: args.dryRun,
  })
  console.log(`\n=== PASS C — competitive insights (${c.inserted}) ===`)
  if (c.skippedReason) console.log(`  (skipped: ${c.skippedReason})`)
  for (const ci of c.competitiveInsights) {
    console.log(`  [${ci.category}${ci.competitor_name ? ` vs ${ci.competitor_name}` : ''}] ${ci.title} (${ci.impact_level})`)
    console.log(`     ${ci.finding}`)
  }
  if (c.rejectedRefs) console.log(`  (rejected theme refs: ${c.rejectedRefs})`)

  // Pass D.
  const d = await runPassD({
    clientId: args.clientId,
    runId: args.runId!,
    themes: a2.themes,
    competitiveInsights: c.competitiveInsights,
    sov: metrics.share_of_voice,
    persist,
    dryRun: args.dryRun,
  })
  console.log(`\n=== PASS D — market insights (${d.marketInsights.length}) ===`)
  for (const mi of d.marketInsights) {
    console.log(`  [${mi.insight_type}] ${mi.title} · conf ${mi.confidence_score} / opp ${mi.opportunity_score}`)
  }
  console.log(`\n=== PASS D — recommendations (${d.recommendations.length}) ===`)
  for (const r of d.recommendations) {
    console.log(`  [${r.type} · ${r.priority}] ${r.title}`)
  }
  if (d.rejectedRefs) console.log(`  (rejected refs: ${d.rejectedRefs})`)

  const totalCost = c.costUsd + d.costUsd
  console.log('\n=== SUMMARY ===')
  console.log(`pass C cost: $${c.costUsd.toFixed(5)} (${c.promptTokens}+${c.completionTokens} tok)`)
  console.log(`pass D cost: $${d.costUsd.toFixed(5)} (${d.promptTokens}+${d.completionTokens} tok)`)
  console.log(`total:       $${totalCost.toFixed(5)}`)
}

main().catch((e) => {
  console.error('A2→C→D failed:', e)
  process.exit(1)
})
