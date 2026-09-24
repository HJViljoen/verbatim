import { audienceOf } from '../lib/rivals'
import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { recordConfigChange, scriptActor, skipRetag } from '../lib/config-log'
import { classifyRelevance } from '../lib/gather/relevance'
import { parseSubreddits } from '../lib/gather/subreddits'
import type { GatherConfig } from '../lib/gather/types'

// Post-hoc relevance re-gate of a client's STORED corpus (teardown 2026-07-09
// §Run 1, defect 2): run 1 gathered with the pre-fix gate ("competitor content
// always relevant" + one giant truncating GPT call), so keyword homonyms
// polluted the stored corpus — Poler→pole dancing, Patagonia→the region/its
// marathons. This applies the FIXED gate (homonym rule, 60-video batches) to
// what's already in the DB and, with --apply, removes what the gate would never
// have let in: the video, its comments, its Pass A insights and their evidence.
// Aggregates (themes, market_insights, run_summary) are left alone — the
// analysis-only re-run regenerates them from the cleaned corpus.
//
// Dry-run by default: prints the would-drop list. DRY DOES NOT MEAN FREE —
// the gate's batched GPT call (lib/gather/relevance.ts, 60 videos a batch)
// happens BEFORE the --apply gate, because the would-drop list is its output.
// So a dry run spends the same OpenAI money an apply does, and the `gpt cost
// $x` it prints is what this run just cost, not what a later --apply would.
// Iterate on scripts/run-relevance.ts --method heuristic instead. The client's OWN videos
// (is_client) are reported but NEVER deleted — attribution already confirmed
// them as the company's; a gate drop there is a flag for human eyes, not a
// delete. Run with env loaded:
//   node --env-file=.env.local --import tsx scripts/regate-corpus.ts [--client <uuid>] [--apply]
//
// --apply leaves a config_changes row (surface 'regate'): how many videos,
// comments and findings went, including how many of them were a tracked
// rival's own posts. The command and what it spent ride on the actor label,
// not in the note — every member of the tenant can read this table. This is
// the most destructive operation an operator can run — the rows are gone, and
// a report already sent keeps citing comments that no longer exist — so the
// record of having run it is the least the log can carry.
//
// AND IT IS THE ONE THING THAT EMPTIES A FROZEN MONTH'S EVIDENCE (item 31a,
// 2026-09-18). month_evidence_refs promises that a frozen point can still be
// opened to WHICH videos it was read on, and the promise rests on videos never
// being deleted: the retention sweep TOMBSTONES a video the platform stopped
// serving, precisely because videos(id) cascades into the whole analysis
// (inngest/functions/retention.ts). This script deletes video rows outright, in
// dependency order, and nothing stales the frozen months that name them —
// month_evidence_refs' UPDATE guard would refuse a correction even if something
// tried. After a re-gate those points read "counted, not quotable" with no
// videos behind them either, and no run can put them back: a frozen month is
// never revisited. Weigh that against the corpus being wrong.

import { SEALAND_CLIENT_ID as SEALAND } from '../lib/config'

function parseArgs(argv: string[]): { clientId: string; apply: boolean } {
  const args = { clientId: SEALAND as string, apply: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.clientId = argv[++i]
    else if (argv[i] === '--apply') args.apply = true
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  return args
}

interface StoredVideo {
  id: string
  platform: string
  video_id: string
  source: string | null
  account_name: string
  caption: string | null
  hashtags: string[] | null
  is_client: boolean
  is_competitor: boolean
  competitor_name: string | null
  comments_count: number | null
}

const chunk = <T,>(xs: T[], n: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

async function main() {
  const { clientId, apply } = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  const { data: tc, error: tcErr } = await admin
    .from('tracking_configs').select('*').eq('client_id', clientId).maybeSingle()
  if (tcErr || !tc) throw new Error(`tracking_config: ${tcErr?.message ?? 'none'}`)
  const config: GatherConfig = {
    brand_keywords: tc.brand_keywords ?? [],
    competitor_keywords: tc.competitor_keywords ?? [],
    competitor_names: tc.competitor_names ?? [],
    industry_keywords: tc.industry_keywords ?? [],
    exclude_terms: tc.exclude_terms ?? [],
    platforms: tc.platforms ?? ['tiktok', 'youtube', 'instagram'],
    max_videos: tc.max_videos ?? 25,
    comment_depth: tc.comment_depth ?? 50,
    report_period: tc.report_period ?? 'weekly',
    own_handles: tc.own_handles ?? {},
    subreddits: parseSubreddits(tc.subreddits),
  }

  const videos = (await selectAll<StoredVideo>(() =>
    admin.from('videos')
      .select('id, platform, video_id, source, account_name, caption, hashtags, is_client, is_competitor, competitor_name, comments_count')
      .eq('client_id', clientId).order('id', { ascending: true }),
  ))
  console.log(`client ${clientId} · ${videos.length} stored videos · mode: ${apply ? 'APPLY' : 'dry-run'}\n`)

  const candidates = videos.map((v) => ({ video_id: v.video_id, account_name: v.account_name, caption: v.caption ?? '', hashtags: v.hashtags ?? [] }))
  const { verdicts, costUsd } = await classifyRelevance(candidates, { method: 'gpt', config })
  const dropped = videos.filter((v) => verdicts.get(v.video_id)?.relevant === false)
  const clientFlagged = dropped.filter((v) => v.is_client)
  const deletable = dropped.filter((v) => !v.is_client)
  // Only is_client rows are spared, so a RIVAL's own post — captured by the
  // census, its tag an identity rather than a reading (lib/gather/owned.ts) —
  // is deleted with everything else. Whether it should be is a product call and
  // is left alone here; the record of what went must still name it.
  const identityStamped = deletable.filter((v) => skipRetag(v.source))
  const fromAccounts = [
    identityStamped.filter((v) => v.source === 'competitor_owned').length,
    identityStamped.filter((v) => v.source === 'owned').length,
  ]
  const accountSentence = [
    fromAccounts[0] ? `${fromAccounts[0]} posted by a tracked rival's own account` : '',
    // 13 rows read source 'owned' with is_client false today, so this half is
    // not hypothetical: an own-account post can sit in the deletable set.
    fromAccounts[1] ? `${fromAccounts[1]} posted by an account of yours` : '',
  ].filter(Boolean).join(' and ')

  const byReason = new Map<string, StoredVideo[]>()
  for (const v of deletable) {
    const key = `${verdicts.get(v.video_id)?.reason}`
    byReason.set(key, [...(byReason.get(key) ?? []), v])
  }
  console.log(`gate verdict: DROP ${dropped.length}/${videos.length} (gpt cost $${costUsd.toFixed(3)})\n`)
  for (const [reason, vs] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`— ${vs.length}× ${reason}`)
    for (const v of vs.slice(0, 4)) console.log(`    [${v.platform}/${audienceOf(v)}] ${v.account_name}: ${(v.caption ?? '').replace(/\s+/g, ' ').slice(0, 80)}`)
    if (vs.length > 4) console.log(`    … +${vs.length - 4} more`)
  }
  if (clientFlagged.length) {
    console.log(`\n⚠ ${clientFlagged.length} is_client video(s) flagged by the gate — NOT deleted, review by hand:`)
    for (const v of clientFlagged) console.log(`    [${v.platform}] ${v.account_name}: ${verdicts.get(v.video_id)?.reason}`)
  }
  if (!deletable.length) {
    console.log('\nnothing to delete.')
    return
  }

  // Count the blast radius (insights + comments) before touching anything.
  const uuidChunks = chunk(deletable.map((v) => v.id), 120)
  let insightIds: string[] = []
  for (const ids of uuidChunks) {
    const rows = await selectAll<{ id: string }>(() =>
      admin.from('audience_insights').select('id').in('source_video_id', ids).order('id', { ascending: true }))
    insightIds = insightIds.concat(rows.map((r) => r.id))
  }
  let commentCount = 0
  const byPlatform = new Map<string, string[]>()
  for (const v of deletable) byPlatform.set(v.platform, [...(byPlatform.get(v.platform) ?? []), v.video_id])
  for (const [platform, vids] of byPlatform) {
    for (const ids of chunk(vids, 120)) {
      const { count } = await admin.from('comments')
        .select('id', { head: true, count: 'exact' })
        .eq('client_id', clientId).eq('platform', platform).in('video_id', ids)
      commentCount += count ?? 0
    }
  }
  console.log(`\nblast radius: ${deletable.length} videos · ${commentCount} comments · ${insightIds.length} insights (+ their evidence rows)`)
  if (identityStamped.length) {
    console.log(`  ⚠ ${identityStamped.length} of those are account-owned rows (own / rival census), whose tag is an identity, not a reading:`)
    for (const v of identityStamped.slice(0, 10)) console.log(`      ${v.source} [${v.platform}] @${v.account_name}`)
    if (identityStamped.length > 10) console.log(`      … +${identityStamped.length - 10} more`)
  }

  if (!apply) {
    console.log('\ndry-run — nothing deleted. Re-run with --apply to remove the rows above.')
    return
  }

  // Delete in dependency order: evidence → insights → comments → videos.
  for (const ids of chunk(insightIds, 120)) {
    const { error } = await admin.from('insight_evidence').delete().in('audience_insight_id', ids)
    if (error) throw new Error(`delete insight_evidence: ${error.message}`)
  }
  for (const ids of chunk(insightIds, 120)) {
    const { error } = await admin.from('audience_insights').delete().in('id', ids)
    if (error) throw new Error(`delete audience_insights: ${error.message}`)
  }
  for (const [platform, vids] of byPlatform) {
    for (const ids of chunk(vids, 120)) {
      const { error } = await admin.from('comments').delete()
        .eq('client_id', clientId).eq('platform', platform).in('video_id', ids)
      if (error) throw new Error(`delete comments: ${error.message}`)
    }
  }
  for (const ids of uuidChunks) {
    const { error } = await admin.from('videos').delete().in('id', ids)
    if (error) throw new Error(`delete videos: ${error.message}`)
  }
  const logged = await recordConfigChange(admin, {
    clientId,
    surface: 'regate',
    field: null,
    before: { videos: videos.length },
    after: { videos: videos.length - deletable.length },
    // The command line and the spend ride on the label; the note is the
    // sentence, and every member of the tenant can read it.
    actor: scriptActor(`scripts/regate-corpus.ts --apply · OpenAI $${costUsd.toFixed(5)}`),
    rowsAffected: deletable.length,
    note:
      `re-checked every stored video against the tracking settings in force and removed the ones that ` +
      `should never have been collected: ${deletable.length} video(s), ${commentCount} comment(s) and the ` +
      `${insightIds.length} finding(s) drawn from them. ` +
      `${clientFlagged.length} of your own video(s) were flagged and kept.` +
      (accountSentence ? ` Of the video(s) removed, ${accountSentence}.` : ''),
  })
  console.log(logged ? 'change log: recorded.' : 'change log: NOT recorded (see the error above).')
  console.log('applied. Stale aggregates (themes/insights/run_summary) will be regenerated by the analysis-only re-run.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
