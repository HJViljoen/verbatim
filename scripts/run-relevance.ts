import { createAdminClient } from '../lib/supabase-admin'
import { classifyRelevance, type RelevanceMethod, type RelevanceCandidate } from '../lib/gather/relevance'
import { COMMENT_THRESHOLD } from '../lib/config'
import type { GatherConfig } from '../lib/gather/types'

// Inspector for the relevance gate — runs it over videos ALREADY in the DB so the
// effect (and the comment-scrape it would have saved) is visible without any
// Apify spend or writes. Mirrors run-a2.ts. Run with env loaded:
//   node --env-file=.env.local --import tsx scripts/run-relevance.ts [flags]
//
// Flags:
//   --client <uuid>    client_id (default: Ossur)
//   --platform <name>  restrict to one platform
//   --method <mode>    heuristic | gpt (default: gpt)
//   --min-comments <n> only judge videos with >= n comments_count (default: COMMENT_THRESHOLD)

const OSSUR = 'e52cac94-30e1-426a-9a36-31b11e0b30b6'

interface Args { clientId: string; platform?: string; method: RelevanceMethod; minComments: number; prune: boolean }

function parseArgs(argv: string[]): Args {
  const a: Args = { clientId: OSSUR, method: 'gpt', minComments: COMMENT_THRESHOLD, prune: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = () => argv[++i]
    if (flag === '--client') a.clientId = next()
    else if (flag === '--platform') a.platform = next()
    else if (flag === '--method') a.method = next() as RelevanceMethod
    else if (flag === '--min-comments') a.minComments = Number(next())
    else if (flag === '--prune') a.prune = true
    else throw new Error(`unknown flag: ${flag}`)
  }
  return a
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  let q = admin
    .from('videos')
    .select('id, video_id, platform, account_name, caption, hashtags, comments_count')
    .eq('client_id', args.clientId)
    .gte('comments_count', args.minComments)
  if (args.platform) q = q.eq('platform', args.platform)
  const { data, error } = await q
  if (error) throw new Error(`load videos: ${error.message}`)

  const rows = (data ?? []) as (RelevanceCandidate & { id: string; platform: string; comments_count: number })[]
  console.log(`Relevance gate — method=${args.method} · ${rows.length} videos with >= ${args.minComments} comments (comment-scrape candidates)\n`)

  const { data: tc } = await admin
    .from('tracking_configs')
    .select('brand_keywords, competitor_keywords, competitor_names, industry_keywords, platforms')
    .eq('client_id', args.clientId)
    .maybeSingle()
  const config = {
    brand_keywords: tc?.brand_keywords ?? [],
    competitor_keywords: tc?.competitor_keywords ?? [],
    competitor_names: tc?.competitor_names ?? [],
    industry_keywords: tc?.industry_keywords ?? [],
    platforms: tc?.platforms ?? [],
    max_videos: 0,
    comment_depth: 0,
    report_period: 'monthly',
  } as GatherConfig

  const { verdicts, costUsd } = await classifyRelevance(rows, { method: args.method, config })

  const kept = rows.filter((r) => verdicts.get(r.video_id)?.relevant !== false)
  const dropped = rows.filter((r) => verdicts.get(r.video_id)?.relevant === false)

  console.log(`=== DROPPED (${dropped.length}) — would NOT be comment-scraped ===`)
  for (const r of dropped) {
    const v = verdicts.get(r.video_id)
    console.log(`  [${r.platform}] ${r.account_name} (${r.comments_count} cmts) — ${v?.reason} [${v?.source}]`)
  }

  console.log(`\n=== KEPT (${kept.length}) — sample ===`)
  for (const r of kept.slice(0, 12)) {
    console.log(`  [${r.platform}] ${r.account_name} (${r.comments_count} cmts)`)
  }
  if (kept.length > 12) console.log(`  … +${kept.length - 12} more`)

  console.log('\n=== SUMMARY ===')
  console.log(`candidates:           ${rows.length}`)
  console.log(`dropped (noise):      ${dropped.length}  (${rows.length ? Math.round((dropped.length / rows.length) * 100) : 0}%)`)
  console.log(`kept (signal):        ${kept.length}`)
  console.log(`comment-scrapes saved: ${dropped.length} Apify actor runs`)
  console.log(`gate cost:            $${costUsd.toFixed(5)} (one batched call)`)

  if (!args.prune) {
    console.log('\n(no --prune; nothing deleted. Re-run with --prune to remove the dropped videos + their comments.)')
    return
  }
  if (dropped.length === 0) {
    console.log('\nnothing to prune.')
    return
  }

  // Destructive: remove gate-dropped (off-category) videos, their comments, and
  // any insights from them. Scoped per-video; the kept (signal) corpus is untouched.
  console.log(`\nPruning ${dropped.length} off-category videos + their comments…`)
  let delVideos = 0
  let delComments = 0
  let delInsights = 0
  const errs: string[] = []
  for (const r of dropped) {
    const { count: c } = await admin
      .from('comments')
      .delete({ count: 'exact' })
      .eq('client_id', args.clientId)
      .eq('platform', r.platform)
      .eq('video_id', r.video_id)
    delComments += c ?? 0
    const { count: ic } = await admin
      .from('audience_insights')
      .delete({ count: 'exact' })
      .eq('source_video_id', r.id)
    delInsights += ic ?? 0
    const { error: vErr, count: vc } = await admin.from('videos').delete({ count: 'exact' }).eq('id', r.id)
    if (vErr) errs.push(`${r.video_id}: ${vErr.message}`)
    else delVideos += vc ?? 0
  }
  console.log(
    `deleted: ${delVideos} videos · ${delComments} comments · ${delInsights} insights` +
      (errs.length ? `; ${errs.length} errors:\n  ${errs.slice(0, 10).join('\n  ')}` : ''),
  )
}

main().catch((e) => {
  console.error('Relevance inspector failed:', e)
  process.exit(1)
})
