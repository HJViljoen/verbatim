import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { bucketsAfterRetag, recordConfigChange, retagChange, scriptActor, skipRetag } from '../lib/config-log'
import { tagVideo, matchEntities, type VideoTags } from '../lib/gather/tagging'
import { attributeVideos, type AttributionMethod, type AttrCandidate } from '../lib/gather/attribution'
import { COMMENT_THRESHOLD, SEALAND_CLIENT_ID as SEALAND } from '../lib/config'
import type { GatherConfig } from '../lib/gather/types'

// Re-tag inspector — recomputes entity tags (is_client / is_competitor /
// competitor_name) over videos ALREADY in the DB, so the effect of CONTENT-based
// tagging is visible without any Apify spend. Shows three columns:
//   account-only (old)   — the SAME matcher with caption+hashtags blanked
//   content substring    — high-recall keyword match (includes homonym noise)
//   content + GPT (final)— substring candidates disambiguated by GPT
// Run with env loaded:
//   node --env-file=.env.local --import tsx scripts/run-tagging.ts [flags]
//
// Flags:
//   --client <uuid>    client_id (default: Sealand)
//   --platform <name>  restrict to one platform
//   --method <mode>    gpt (default) | substring  — disambiguation method
//   --write            persist the final tags (UPDATE changed rows)
//
// A2 derives buckets live from these flags, so after --write only A2/C/D re-run.
//
// TWO THINGS THIS SCRIPT LEARNED THE HARD WAY (WP2, 2026-09-15).
//
// 1. It never touches an OWNED or COMPETITOR_OWNED row. Those tags are an
//    IDENTITY stamped by account membership (lib/gather/owned.ts: "the
//    account's own read is the authority"), not a reading of content — and
//    re-judging them by content strips is_client from 37 of Sealand's 59 own
//    posts, because its handle `sealandgear` contains none of its brand
//    keywords. The script used not to read `source` at all.
// 2. --write leaves a config_changes row: method, before/after bucket counts,
//    rows moved, rows spared, cost. When this ran on 2026-09-09 it moved 253
//    Sealand videos and took 84 themes with them, and nothing anywhere recorded
//    that it had happened — `videos` has no updated_at, attribution is never
//    written to ai_call_log, and the script carries no run id. Whether that run
//    used --method gpt or --method substring is still unknowable, and the two
//    differ by up to 35x in rows touched.


interface Args { clientId: string; platform?: string; method: AttributionMethod; write: boolean }

function parseArgs(argv: string[]): Args {
  const a: Args = { clientId: SEALAND, method: 'gpt', write: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = () => argv[++i]
    if (flag === '--client') a.clientId = next()
    else if (flag === '--platform') a.platform = next()
    else if (flag === '--method') a.method = next() as AttributionMethod
    else if (flag === '--write') a.write = true
    else throw new Error(`unknown flag: ${flag}`)
  }
  return a
}

interface VideoRow {
  id: string
  video_id: string
  platform: string
  source: string | null
  account_name: string
  caption: string
  hashtags: string[]
  comments_count: number
  is_client: boolean
  is_competitor: boolean
  competitor_name: string | null
}

function bucket(t: VideoTags): string {
  if (t.is_client) return 'client'
  if (t.is_competitor) return `competitor:${t.competitor_name ?? 'unknown'}`
  return 'industry'
}

function tally(labels: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of labels) m.set(l, (m.get(l) ?? 0) + 1)
  return new Map([...m.entries()].sort((a, b) => b[1] - a[1]))
}

function printTally(title: string, m: Map<string, number>, total: number) {
  console.log(`  ${title}`)
  for (const [label, n] of m) {
    const pct = total ? Math.round((n / total) * 100) : 0
    console.log(`    ${label.padEnd(28)} ${String(n).padStart(4)}  (${pct}%)`)
  }
}

const trim = (s: string, n: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

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

  console.log('Tracking config:')
  console.log(`  brand_keywords:    ${JSON.stringify(config.brand_keywords)}`)
  console.log(`  competitor_names:  ${JSON.stringify(config.competitor_names)}`)
  console.log('')

  const rows = await selectAll<VideoRow>(() => {
    let q = admin
      .from('videos')
      .select('id, video_id, platform, source, account_name, caption, hashtags, comments_count, is_client, is_competitor, competitor_name')
      .eq('client_id', args.clientId)
    if (args.platform) q = q.eq('platform', args.platform)
    return q.order('id', { ascending: true })
  })

  // GPT attribution over all rows (industry videos skip GPT internally).
  const candidates: AttrCandidate[] = rows.map((r) => ({
    video_id: r.video_id,
    account_name: r.account_name,
    caption: r.caption,
    hashtags: r.hashtags,
  }))
  if (args.method === 'gpt') {
    // The call below is unconditional and sits far above the dry-run return, so
    // a "dry" inspection has already spent the money by the time it prints.
    console.log(
      `! --method gpt asks OpenAI about every substring candidate among ${rows.length} videos, and it does that\n` +
      '  BEFORE it knows whether you asked to write. --method substring is the free path.\n',
    )
  }
  console.log(`Attributing ${rows.length} videos (method=${args.method})…\n`)
  const { tags: finalTags, costUsd, gptJudged } = await attributeVideos(candidates, { method: args.method, config })

  const account: string[] = []
  const substring: string[] = []
  const final: string[] = []
  const finalCb: string[] = []
  const gptRejected: { row: VideoRow; from: string }[] = [] // substring tagged it, GPT demoted to industry
  const dual: VideoRow[] = []
  const changed: { row: VideoRow; tag: VideoTags; index: number }[] = []
  const spared: VideoRow[] = []   // own / rival-owned posts: identity, not a reading
  const bucketsBefore: string[] = []

  for (const [index, r] of rows.entries()) {
    const aTag = tagVideo({ account_name: r.account_name, caption: '', hashtags: [] }, config)
    const sTag = tagVideo(r, config)
    const fTag = finalTags.get(r.video_id) ?? { is_client: false, is_competitor: false, competitor_name: null }
    account.push(bucket(aTag))
    substring.push(bucket(sTag))
    final.push(bucket(fTag))
    if (r.comments_count >= COMMENT_THRESHOLD) finalCb.push(bucket(fTag))

    const m = matchEntities(r, config)
    if (m.brand && m.competitors.length > 0) dual.push(r)
    if (bucket(sTag) !== 'industry' && bucket(fTag) === 'industry') gptRejected.push({ row: r, from: bucket(sTag) })

    const stored = bucket({ is_client: r.is_client, is_competitor: r.is_competitor, competitor_name: r.competitor_name })
    const moves =
      fTag.is_client !== r.is_client ||
      fTag.is_competitor !== r.is_competitor ||
      fTag.competitor_name !== r.competitor_name
    bucketsBefore.push(stored)
    if (moves && skipRetag(r.source)) spared.push(r)
    else if (moves) changed.push({ row: r, tag: fTag, index })
  }

  console.log(`=== BUCKET DISTRIBUTION — ${rows.length} videos${args.platform ? ` (${args.platform})` : ''} ===`)
  printTally('account-only (old):', tally(account), rows.length)
  console.log('')
  printTally('content substring:', tally(substring), rows.length)
  console.log('')
  printTally('content + GPT (final):', tally(final), rows.length)

  console.log(`\n=== COMMENT-BEARING ONLY (>= ${COMMENT_THRESHOLD} comments — what feeds Pass A) — ${finalCb.length} videos ===`)
  printTally('content + GPT (final):', tally(finalCb), finalCb.length)

  console.log(`\n=== GPT REJECTIONS — substring tagged, GPT demoted to industry (homonym catches): ${gptRejected.length} ===`)
  for (const { row, from } of gptRejected.slice(0, 25)) {
    console.log(`  ${from.padEnd(24)} ← [${row.platform}] @${row.account_name}: "${trim(row.caption, 80)}"`)
  }
  if (gptRejected.length > 25) console.log(`  … +${gptRejected.length - 25} more`)

  console.log(`\n=== FINAL non-industry — sample (eyeball correctness) ===`)
  for (const r of rows) {
    const t = finalTags.get(r.video_id)
    if (t && (t.is_client || t.is_competitor)) {
      console.log(`  ${bucket(t).padEnd(24)} [${r.platform}] @${r.account_name} (${r.comments_count} cmts): "${trim(r.caption, 70)}"`)
    }
  }

  console.log('\n=== SUMMARY ===')
  console.log(`videos:                 ${rows.length}`)
  console.log(`dual-mention (brand+competitor in content): ${dual.length}  ← multi-tag candidates (filed under client)`)
  console.log(`gpt-judged:             ${gptJudged}`)
  console.log(`gpt rejected (noise):   ${gptRejected.length}`)
  console.log(`rows whose tags change: ${changed.length}`)
  console.log(`own / rival-owned rows left alone: ${spared.length}  ← identity from the account, not from the caption`)
  console.log(`attribution cost:       $${costUsd.toFixed(5)}`)
  if (spared.length) {
    for (const r of spared.slice(0, 10)) {
      console.log(`    ${r.source} [${r.platform}] @${r.account_name}: "${trim(r.caption, 60)}"`)
    }
    if (spared.length > 10) console.log(`    … +${spared.length - 10} more`)
  }

  if (!args.write) {
    console.log('\n(dry — no writes. Re-run with --write to persist.)')
    return
  }

  console.log(`\nWriting ${changed.length} updated tags…`)
  let ok = 0
  const errs: string[] = []
  // What actually landed, row by row. The loop keeps going past a failure, so
  // the distribution this records has to be built from the writes that
  // succeeded — a re-tag that intends 253 moves and lands 243 must not log a
  // corpus in which all 253 moved.
  const applied = new Map<number, string>()
  for (const { row, tag, index } of changed) {
    const { error: uErr } = await admin
      .from('videos')
      .update({ is_client: tag.is_client, is_competitor: tag.is_competitor, competitor_name: tag.competitor_name })
      .eq('id', row.id)
    if (uErr) errs.push(`${row.video_id}: ${uErr.message}`)
    else { ok++; applied.set(index, bucket(tag)) }
  }
  console.log(`updated ${ok}/${changed.length}${errs.length ? `; ${errs.length} errors:\n  ${errs.slice(0, 10).join('\n  ')}` : ''}`)

  // The record the 2026-09-09 re-tag never left. Counts, not row ids: what a
  // reader of a moved number needs is which buckets grew and which shrank.
  const logged = await recordConfigChange(admin, retagChange({
    clientId: args.clientId,
    actor: scriptActor(`scripts/run-tagging.ts --write --method ${args.method}${args.platform ? ` --platform ${args.platform}` : ''}`),
    method: args.method,
    before: Object.fromEntries(tally(bucketsBefore)),
    after: Object.fromEntries(tally(bucketsAfterRetag(bucketsBefore, applied))),
    rowsAffected: ok,
    skipped: spared.length,
    costUsd,
    note: args.platform ? `${args.platform} only` : undefined,
  }))
  console.log(logged ? 'change log: recorded.' : 'change log: NOT recorded (see the error above).')
}

main().catch((e) => {
  console.error('Tagging inspector failed:', e)
  process.exit(1)
})
