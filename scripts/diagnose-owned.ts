import { createAdminClient } from '../lib/supabase-admin'
import { fetchOwnProfile, ownedCommentRefs, ownPostsInWindow, stampOwnedSource, OWN_POSTS_CEILING } from '../lib/gather/owned'
import { resolveGatherWindow, scrapeCommentsBatch } from '../lib/gather/gather'
import { COMMENT_THRESHOLD } from '../lib/config'
import { parseDiagnoseOwnedArgs, splitBackfillRows, unscrapedRefs, type KnownOwnedRow } from '../lib/gather/owned-backfill'
import type { Platform } from '../lib/gather/types'

/** Mirrors the pipeline's COMMENT_BATCH — one Apify actor run per video. */
const COMMENT_BATCH = 3

// Diagnostic for the owned-post ingestion (2026-08-16: the first scheduled run
// closed 'partial' and no owned rows ever landed for the real tenant). Replays
// the owned-posts step body OUTSIDE Inngest so the actual throw is visible.
// Read-only by default; --commit performs the real upsert.
//   node --env-file=.env.local --import tsx scripts/diagnose-owned.ts \
//     --client <uuid> --run <uuid> [--platform tiktok] [--period monthly]
//     [--since YYYY-MM-DD] [--commit [--comments [--rescrape]]]
//
// --since replaces the period-derived window (at most 30 days back) with an
// explicit start, for a backfill. On --commit a post already stored keeps its
// run_id (only new posts take --run), and --comments skips posts whose comments
// were already scraped unless --rescrape — see lib/gather/owned-backfill.ts.

async function main() {
  const { clientId, runId, platform: only, period: periodOverride, since, commit, comments, rescrape } =
    parseDiagnoseOwnedArgs(process.argv.slice(2))
  const admin = createAdminClient()

  const { data: cfg } = await admin
    .from('tracking_configs')
    .select('own_handles, report_period')
    .eq('client_id', clientId)
    .maybeSingle()
  const handles = (cfg?.own_handles ?? {}) as Record<string, string>
  const period = periodOverride || (cfg?.report_period as string | null) || 'weekly'
  // Same window the pipeline's owned step would have used, so a backfill lands
  // exactly the refs the run should have scraped — not a wider all-time sweep.
  // --since overrides it for a backfill past the period's reach.
  const window = since ? { since } : await resolveGatherWindow(clientId, runId, period)
  console.log(`own_handles: ${JSON.stringify(handles)}  report_period: ${period}  windowStart: ${window.since}${since ? ' (--since)' : ''}`)

  for (const [platform, handle] of Object.entries(handles)) {
    if (only && platform !== only) continue
    console.log(`\n=== ${platform} @${handle} ===`)
    if (!['tiktok', 'youtube', 'instagram'].includes(platform)) {
      console.log('  skipped (no owned-profile concept)')
      continue
    }

    let profile
    try {
      profile = await fetchOwnProfile(platform, handle, { clientId, runId }, window.since)
    } catch (e) {
      console.log(`  FETCH THREW: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    // Same census cut the pipeline step applies, so this prints the number the
    // run would store — not the raw read.
    profile.recentPosts = ownPostsInWindow(profile.recentPosts, window.since)
    console.log(`  followers=${profile.followers} postsCount=${profile.postsCount} inWindowPosts=${profile.recentPosts.length} (ceiling ${OWN_POSTS_CEILING})`)
    for (const p of [...profile.recentPosts].sort((a, b) => (a.upload_date ?? '').localeCompare(b.upload_date ?? ''))) {
      console.log(`    ${p.upload_date} ${p.video_id} ${p.content_format || '-'} comments=${p.comments_count} views=${p.views}`)
    }
    if (!profile.recentPosts.length) {
      console.log('  NO RECENT POSTS PARSED — nothing would be written, no error raised')
      continue
    }
    console.log(`  sample row: ${JSON.stringify(profile.recentPosts[0])}`)

    const { data: existing, error: exErr } = await admin
      .from('videos')
      .select('video_id, source, comments_count_at_scrape')
      .eq('client_id', clientId)
      .eq('platform', platform)
      .in('video_id', profile.recentPosts.map((p) => p.video_id))
    if (exErr) {
      console.log(`  EXISTING-CHECK ERROR: ${exErr.message}`)
      continue
    }
    const known = (existing ?? []) as (KnownOwnedRow & { source: string | null })[]
    const stuck = known.filter((k) => k.source === 'discovered').length
    console.log(`  already known: ${known.length}/${profile.recentPosts.length} → all ${profile.recentPosts.length} stamped source:'owned' (${stuck} of the known ones corrected off 'discovered')`)

    const refs = ownedCommentRefs(profile.recentPosts, {
      windowStart: window.since,
      threshold: platform === 'youtube' ? 1 : COMMENT_THRESHOLD,
    })
    const toScrape = unscrapedRefs(refs, known, rescrape)
    console.log(`  comment refs in window (threshold ${platform === 'youtube' ? 1 : COMMENT_THRESHOLD}): ${refs.length} — ${toScrape.length} never scraped${rescrape ? ' (--rescrape: all would be scraped)' : ''}`)

    if (!commit) {
      console.log('  (dry run — no write attempted)')
      continue
    }
    // Shares the pipeline's own source-stamping, deliberately — an inline copy
    // here drifted from the fix once already (2026-08-16) and re-reproduced the
    // 23502 it was supposed to prove fixed.
    const { fresh, refresh } = splitBackfillRows(stampOwnedSource(profile.recentPosts), known)
    let failed = false
    for (const part of [fresh, refresh]) {
      if (!part.length) continue
      const { error } = await admin.from('videos').upsert(part, { onConflict: 'client_id,platform,video_id' })
      if (error) {
        console.log(`  UPSERT ERROR: ${error.code} ${error.message}`)
        console.log(`  details: ${error.details}  hint: ${error.hint}`)
        failed = true
        break
      }
    }
    if (failed) continue
    console.log(`  upsert OK (${fresh.length} new under run ${runId}, ${refresh.length} refreshed keeping their run)`)

    if (!comments || !toScrape.length) continue
    // COSTS APIFY MONEY: one actor run per video, same as the pipeline.
    let scraped = 0
    for (let w = 0; w < toScrape.length; w += COMMENT_BATCH) {
      const batch = toScrape.slice(w, w + COMMENT_BATCH)
      try {
        const r = await scrapeCommentsBatch({
          clientId, runId, platform: platform as Platform, refs: batch, source: 'owned',
        })
        scraped += r.comments
        if (r.errors.length) console.log(`  comment batch ${w / COMMENT_BATCH + 1} errors: ${r.errors.join('; ')}`)
      } catch (e) {
        console.log(`  comment batch ${w / COMMENT_BATCH + 1} THREW: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    console.log(`  owned comments scraped: ${scraped}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
