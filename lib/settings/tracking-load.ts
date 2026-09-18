import type { SupabaseClient } from '@supabase/supabase-js'

import { CONFIG_CHANGES_TABLE, isMissingConfigLog, type ConfigChange } from '../config-log'
import { passAMinComments } from '../config'
import { parseSubreddits } from '../gather/subreddits'
import type { SubredditEntry } from '../gather/types'
import { computeSubredditRoi, type SubredditRoiRow } from '../pipeline/subreddit-roi'
import { monthStartOf } from '../reading/month-key'
import { loadCompetitors, type Competitor } from '../rivals'
import { selectAll } from '../supabase-admin'
import { loadTermPerformance } from '../keywords/performance'
import type { TermSummary } from '../keywords/value'
import { isMissingAffects } from './change-log'
import { GATE_SAMPLE, keptByCommunity, type KeptRate } from './reject-log'
import type { RivalCensusRow } from './rivals-view'
import { termDates, termYieldByMonth, type KeywordRunRow, type TermDate, type TermYield } from './terms'

/**
 * The reads behind Settings › Tracking (Phase 1 WP16, design ST2 and ST4).
 *
 * Everything runs on the session client except one read: every table here is
 * tenant-scoped already, and `gate_verdicts` becomes so with M8.
 *
 * THE PER-COMMUNITY KEPT-RATE IS THE EXCEPTION, AND M8 WOULD NEVER HAVE FIXED
 * IT. A community is `gate_verdicts.account_name`, and `account_name` is one of
 * the three columns M8 deliberately WITHHOLDS from `authenticated` — a
 * stranger's account beside the gate's words about their post. So a session
 * client is refused that column before M8 and after it, and the honest fix is
 * the one Settings › The record already makes for the reject log's excerpt: the
 * read moves to the service-role client, in a server component, after the
 * caller has checked canManageTenant. A member without that role reads the
 * table without the column, and the page says which it is.
 *
 * WHY THE REDDIT ROI IS COMPUTED HERE AND NOT STORED. `lib/pipeline/
 * subreddit-roi.ts` says it: per-subreddit survival is already captured in the
 * probe, and what is left — did this community's posts yield findings — is
 * fully derivable from rows we keep. The read is small (149 stored Reddit posts
 * on Össur, 292 on Sealand) and adding a table for it would be a migration to
 * avoid a join.
 */

export interface TrackingPageInputs {
  tenant: string
  plan: string | null
  config: Record<string, unknown> | null
  /** True when the tracking_configs read itself failed — a different answer
   *  from "this workspace has no configuration", and the page says which. */
  configFailed: boolean
  termDates: Map<string, TermDate>
  /** The shipped per-term record (found · kept · with comments · insights ·
   *  "worth reviewing"), pooled over updates. */
  performance: { rows: TermSummary[]; updates: number }
  /** The same terms on the update's own clock, month by month. */
  termYield: TermYield[]
  /** Updates the yield is pooled over. */
  gathers: number
  entries: SubredditEntry[]
  roi: SubredditRoiRow[]
  /** Per community, how much of what we looked at we kept. Null when the
   *  reader is not an owner or an admin: the community is the stranger's
   *  account the verdict was about, and M8 withholds that column from every
   *  tenant session. Not a "not shipped yet" — a "not yours to read". */
  communityKept: KeptRate[] | null
  rivals: Competitor[]
  census: RivalCensusRow[]
  /** The month the census's `publishedThisMonth` counts in, as a month start —
   *  what the rivals table's own-posts column is headed by. */
  censusMonth: string
}

/** The term-yield window: a quarter of weekly updates, the same number the
 *  performance card already pools over. */
export const TRACKING_GATHERS = 8

async function loadChangeLog(client: SupabaseClient, clientId: string): Promise<ConfigChange[]> {
  const probe = await client.from(CONFIG_CHANGES_TABLE).select('id').limit(1)
  if (isMissingConfigLog(probe.error)) return []
  if (probe.error) throw probe.error
  // Both column lists written out: a variable in `.select()` types every row
  // as a parser error (lib/readiness/load.ts states the rule).
  try {
    return await selectAll<ConfigChange>(() =>
      client.from(CONFIG_CHANGES_TABLE)
        .select('id, client_id, changed_at, surface, field, before, after, actor_kind, actor_user_id, actor_label, run_id, source, rows_affected, note, affects_audiences, affects_months')
        .eq('client_id', clientId)
        .eq('surface', 'terms')
        .order('changed_at', { ascending: true })
        .order('id', { ascending: true }),
    )
  } catch (error) {
    // M1's two columns may not be applied yet, and a term's date does not need
    // them (change-log.ts isMissingAffects).
    if (!isMissingAffects(error)) throw error
    const rows = await selectAll<Omit<ConfigChange, 'affects_audiences' | 'affects_months'>>(() =>
      client.from(CONFIG_CHANGES_TABLE)
        .select('id, client_id, changed_at, surface, field, before, after, actor_kind, actor_user_id, actor_label, run_id, source, rows_affected, note')
        .eq('client_id', clientId)
        .eq('surface', 'terms')
        .order('changed_at', { ascending: true })
        .order('id', { ascending: true }),
    )
    return rows.map((r) => ({ ...r, affects_audiences: null, affects_months: null }))
  }
}

async function loadTermYield(client: SupabaseClient, clientId: string): Promise<{ rows: TermYield[]; gathers: number }> {
  // Two reads, for the reason lib/keywords/performance.ts gives: a flat limit
  // truncates the oldest update mid-way and half-counted found/kept numbers
  // are worse than none.
  const scan = await selectAll<{ run_id: string; created_at: string }>(() =>
    client.from('keyword_performance').select('run_id, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }),
  )
  const ids: string[] = []
  for (const r of scan) {
    if (!ids.includes(r.run_id)) ids.push(r.run_id)
    if (ids.length >= TRACKING_GATHERS) break
  }
  if (ids.length === 0) return { rows: [], gathers: 0 }
  const rows = await selectAll<KeywordRunRow>(() =>
    client.from('keyword_performance')
      .select('keyword, videos_found, gate_survived, created_at')
      .eq('client_id', clientId)
      .in('run_id', ids)
      .order('id', { ascending: false }),
  )
  return { rows: termYieldByMonth(rows), gathers: ids.length }
}

async function loadRoi(client: SupabaseClient, clientId: string): Promise<SubredditRoiRow[]> {
  const videos = await selectAll<{ id: string; platform: string; account_name: string | null; comments_count: number | null }>(() =>
    client.from('videos').select('id, platform, account_name, comments_count')
      .eq('client_id', clientId).eq('platform', 'reddit')
      .order('id', { ascending: false }),
  )
  if (videos.length === 0) return []
  // The CURRENT analysis of each post, through the view — never
  // `eq('run_id')`, which means "produced by this run" (AGENTS.md).
  const insights = await selectAll<{ source_video_id: string | null }>(() =>
    client.from('audience_insights_current').select('source_video_id')
      .eq('client_id', clientId)
      .in('source_video_id', videos.map((v) => v.id)),
  )
  return computeSubredditRoi(
    videos.map((v) => ({ id: v.id, platform: v.platform, account_name: v.account_name, comments: v.comments_count ?? 0 })),
    insights,
    passAMinComments('reddit'),
  )
}

async function loadCommunityKept(admin: SupabaseClient | null, clientId: string): Promise<KeptRate[] | null> {
  // No admin client means the caller is not an owner or an admin, and the
  // column that names the community is not theirs to read. Null, and the page
  // says so — never a rate computed from a column that came back refused.
  if (!admin) return null
  // Bounded, and explicitly: a bare select caps at a thousand SILENTLY
  // (AGENTS.md), and this table grows by several hundred rows an update. The
  // rate is over the most recent GATE_SAMPLE Reddit judgements, and the caller
  // is told when that is fewer than everything.
  const { data, error } = await admin.from('gate_verdicts')
    .select('platform, keyword, kept, source, created_at, account_name')
    .eq('client_id', clientId).eq('platform', 'reddit')
    .order('id', { ascending: false })
    .limit(GATE_SAMPLE)
  if (error) return null
  return keptByCommunity((data ?? []).map((r) => ({
    platform: r.platform as string,
    keyword: (r.keyword as string | null) ?? null,
    kept: Boolean(r.kept),
    source: (r.source as string) ?? 'gpt',
    createdAt: (r.created_at as string) ?? '',
    accountName: (r.account_name as string | null) ?? null,
  })))
}

/**
 * Every post read off a rival's own profile, per rival per platform.
 *
 * THREE TALLIES OFF ONE READ. `captured` and `read` are all-time and are the
 * handle check (rivals-view.ts's own docblock); `publishedThisMonth` is a
 * PERIOD figure and is dated by `videos.upload_date`, the post's own date —
 * the one clock an own-post count may be on, and never the run's. Adding
 * `upload_date` to a select this page already makes is what keeps the rivals
 * table's new column at zero extra queries.
 */
async function loadCensus(client: SupabaseClient, clientId: string, month: string): Promise<RivalCensusRow[]> {
  const rows = await selectAll<{ competitor_name: string | null; platform: string; analyzed_run_id: string | null; upload_date: string | null }>(() =>
    client.from('videos').select('competitor_name, platform, analyzed_run_id, upload_date')
      .eq('client_id', clientId).eq('source', 'competitor_owned')
      .order('id', { ascending: false }),
  )
  const acc = new Map<string, RivalCensusRow>()
  for (const r of rows) {
    const name = r.competitor_name ?? ''
    if (!name) continue
    const key = `${name}|${r.platform}`
    const row = acc.get(key) ?? { competitorName: name, platform: r.platform, captured: 0, read: 0, publishedThisMonth: 0 }
    row.captured++
    if (r.analyzed_run_id) row.read++
    // A post with no upload_date cannot be dated by the post and is not in the
    // month — under-counting rather than mis-dating.
    if (r.upload_date && monthStartOf(r.upload_date) === month) row.publishedThisMonth++
    acc.set(key, row)
  }
  return [...acc.values()]
}

export async function loadTrackingPage(
  client: SupabaseClient,
  clientId: string,
  /** The service-role client, and ONLY when the caller has checked
   *  canManageTenant. It reads exactly one thing: the community a verdict was
   *  about (`gate_verdicts.account_name`), which no tenant session may read. */
  admin: SupabaseClient | null = null,
): Promise<TrackingPageInputs> {
  // WHICH MONTH THE OWN-POSTS COLUMN IS HEADED BY. The calendar month we are
  // in — a wall-clock answer to "what month is it", which is not the same as
  // dating a figure by the clock: the figure itself is dated by the post.
  const censusMonth = monthStartOf(new Date().toISOString())
  const [clientRead, configRead] = await Promise.all([
    client.from('clients').select('company_name, plan').eq('id', clientId).maybeSingle(),
    client.from('tracking_configs').select('*').eq('client_id', clientId).maybeSingle(),
  ])

  const config = (configRead.data ?? null) as Record<string, unknown> | null
  const [changes, yieldRows, performance, roi, communityKept, rivals, census] = await Promise.all([
    loadChangeLog(client, clientId),
    loadTermYield(client, clientId),
    loadTermPerformance(client, clientId, TRACKING_GATHERS),
    loadRoi(client, clientId),
    loadCommunityKept(admin, clientId),
    loadCompetitors(client, clientId),
    loadCensus(client, clientId, censusMonth),
  ])

  return {
    tenant: (clientRead.data?.company_name as string | undefined) ?? 'Your workspace',
    plan: (clientRead.data?.plan as string | undefined) ?? null,
    config,
    configFailed: configRead.error !== null,
    termDates: termDates(changes),
    performance,
    termYield: yieldRows.rows,
    gathers: yieldRows.gathers,
    entries: parseSubreddits(config?.subreddits),
    roi,
    communityKept,
    rivals,
    census,
    censusMonth,
  }
}
