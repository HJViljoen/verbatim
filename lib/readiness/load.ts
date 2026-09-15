import { embeddingCoverage } from '../agent/retrieve'
import { YOUTUBE_REFRESH_NIGHTLY_CAP } from '../config'
import { CONFIG_CHANGES_TABLE, isMissingConfigLog } from '../config-log'
import { parseSubreddits, subredditKey } from '../gather/subreddits'
import { isMissingBookkeepingColumn } from '../pipeline/run-bookkeeping'
import { isMissingMonthlyReading } from '../reading/monthly'
import { TABLE_DENOMINATORS } from '../reading/types'
import { isMissingRecDecisions, REC_DECISIONS_TABLE } from '../rec-decisions'
import { SHARE_BAND } from '../report-bands'
import { YOUTUBE_REFRESH_DUE_DAYS } from '../retention/youtube-refresh'
import { type createAdminClient, selectAll } from '../supabase-admin'
import type {
  CommunityInput,
  MonthCountRow,
  ReadinessInputs,
  RivalInput,
  UpdateInput,
} from './types'

// Reading the readiness inputs (Phase 0 WP10). Service role throughout: three
// of the thirteen rows read tables a tenant session cannot see at all —
// `gate_verdicts` is superadmin-only by policy, and the change log and the
// decision ledger are written by the service role and read under RLS the page's
// operator is not inside when viewing another workspace.
//
// THREE MIGRATIONS ARE APPLIED BY HAND, so this module's job is as much about
// what is NOT there as what is. Every read that touches an object those
// migrations add is guarded by that object's own narrow test, and a miss
// becomes a null or a `false` the page prints as "not recorded yet" — never an
// exception, because the page exists to help decide whether to apply them.

/** How many of the most recent updates the delivery row prints. */
export const RECENT_UPDATES = 8

/** The audience a video belongs to, as the rest of the product spells it
 *  (`lib/pipeline/metrics.ts` entityOf): the client first, then each tracked
 *  rival, then everyone else. */
function trackedAudiences(rivalNames: readonly string[]): string[] {
  return ['client', ...rivalNames.map((n) => `competitor:${n}`), 'industry-other']
}

const dayOf = (iso: string): string => iso.slice(0, 10)

async function headCount(
  build: () => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
  const { count } = await build()
  return count ?? 0
}

type Admin = ReturnType<typeof createAdminClient>

/** Is the delivery record's bookkeeping there? One cheap probe rather than a
 *  failed wide read: `selectAll` flattens a PostgREST error into a plain Error
 *  and the 42703 code goes with it, so the column test has to see the raw
 *  error object. */
async function slotsAreRecorded(admin: Admin): Promise<boolean> {
  const { error } = await admin.from('pipeline_runs').select('scheduled_for, stalled').limit(1)
  return !isMissingBookkeepingColumn(error)
}

async function loadUpdates(admin: Admin, clientId: string, withBookkeeping: boolean): Promise<UpdateInput[]> {
  type Row = {
    id: string; status: string; started_at: string; completed_at: string | null
    scheduled_for?: string | null; stalled?: boolean | null
  }
  // Newest first, with the id as the tiebreaker so a page break cannot skip or
  // repeat a row when two updates share a start instant. Both column lists are
  // written out because the client's own types read the string: a variable
  // there types every row as a parser error.
  const rows = await selectAll<Row>(() => {
    const table = admin.from('pipeline_runs')
    const q = withBookkeeping
      ? table.select('id, status, started_at, completed_at, scheduled_for, stalled')
      : table.select('id, status, started_at, completed_at')
    return q.eq('client_id', clientId)
      .order('started_at', { ascending: false })
      .order('id', { ascending: false })
  })
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    scheduledFor: r.scheduled_for ?? null,
    stalled: r.stalled ?? null,
  }))
}

/** The stored monthly reading, or null when its migration has not landed and
 *  nothing has been written down month by month. */
async function loadMonths(admin: Admin, clientId: string): Promise<MonthCountRow[] | null> {
  try {
    type Row = { month: string; audience: string; videos: number; comments: number }
    const rows = await selectAll<Row>(() =>
      admin.from(TABLE_DENOMINATORS).select('month, audience, videos, comments').eq('client_id', clientId)
        .order('month', { ascending: true })
        .order('audience', { ascending: true }))
    return rows.map((r) => ({ month: r.month, audience: r.audience, videos: r.videos, comments: r.comments }))
  } catch (e) {
    if (isMissingMonthlyReading(e)) return null
    throw e
  }
}

/** Each tracked rival's own accounts, and what has come of them. Read as rows
 *  rather than counted per rival so one query answers for every rival and the
 *  arithmetic stays where it can be seen. */
async function loadRivals(
  admin: Admin, clientId: string, names: readonly string[],
  handles: Record<string, Record<string, string>>, now: number,
): Promise<RivalInput[]> {
  type Row = { id: string; competitor_name: string | null; scraped_at: string | null; analyzed_run_id: string | null }
  const owned = await selectAll<Row>(() =>
    admin.from('videos').select('id, competitor_name, scraped_at, analyzed_run_id')
      .eq('client_id', clientId).eq('source', 'competitor_owned').order('id', { ascending: true }))

  const recentFrom = now - 30 * 86_400_000
  return names.map((name) => {
    const mine = owned.filter((v) => v.competitor_name === name)
    return {
      name,
      handlePlatforms: Object.entries(handles[name] ?? {}).filter(([, h]) => Boolean(h)).map(([p]) => p).sort(),
      captured: mine.length,
      capturedRecently: mine.filter((v) => v.scraped_at != null && Date.parse(v.scraped_at) >= recentFrom).length,
      analysed: mine.filter((v) => v.analyzed_run_id != null).length,
    }
  })
}

/** The watched communities, with what each has actually produced. `videos`
 *  rows carry the community in `account_name` in four shapes, so both sides of
 *  the join go through `subredditKey`. */
async function loadCommunities(
  admin: Admin, clientId: string, subreddits: unknown,
): Promise<{ communities: CommunityInput[]; reddit: { postsStored: number; postsFromUnconfigured: number } }> {
  const entries = parseSubreddits(subreddits)
  const posts = await selectAll<{ id: string; account_name: string | null }>(() =>
    admin.from('videos').select('id, account_name')
      .eq('client_id', clientId).eq('platform', 'reddit').order('id', { ascending: true }))

  const stored = new Map<string, number>()
  for (const p of posts) {
    const key = subredditKey(p.account_name ?? '')
    if (!key) continue
    stored.set(key, (stored.get(key) ?? 0) + 1)
  }
  const configured = new Set(entries.map((e) => e.name))
  return {
    communities: entries.map((e) => ({
      name: e.name,
      status: e.status,
      probed: Boolean(e.probe),
      postsStored: stored.get(e.name) ?? 0,
    })),
    reddit: {
      postsStored: posts.length,
      postsFromUnconfigured: posts.filter((p) => {
        const key = subredditKey(p.account_name ?? '')
        return key === '' || !configured.has(key)
      }).length,
    },
  }
}

/** The oldest batch of YouTube comments and the day it falls due to be read
 *  again. Four small reads rather than one aggregate: PostgREST has no
 *  `min(coalesce(...))`, and paging 17,000 comment rows to find one date would
 *  be the most expensive thing on the page. */
async function loadRetentionCohort(admin: Admin, clientId: string): Promise<{ cohortDay: string | null; cohortRows: number }> {
  const yt = () => admin.from('comments').select('id', { count: 'exact', head: true })
    .eq('client_id', clientId).eq('platform', 'youtube')

  const [refreshed, never] = await Promise.all([
    admin.from('comments').select('refreshed_at').eq('client_id', clientId).eq('platform', 'youtube')
      .not('refreshed_at', 'is', null).order('refreshed_at', { ascending: true }).limit(1).maybeSingle(),
    admin.from('comments').select('created_at').eq('client_id', clientId).eq('platform', 'youtube')
      .is('refreshed_at', null).order('created_at', { ascending: true }).limit(1).maybeSingle(),
  ])
  const candidates = [
    (refreshed.data?.refreshed_at as string | undefined) ?? null,
    (never.data?.created_at as string | undefined) ?? null,
  ].filter((d): d is string => Boolean(d)).sort()
  const oldest = candidates[0] ?? null
  if (!oldest) return { cohortDay: null, cohortRows: 0 }

  const day = dayOf(oldest)
  const from = `${day}T00:00:00.000Z`
  const to = new Date(Date.parse(from) + 86_400_000).toISOString()
  const [a, b] = await Promise.all([
    headCount(() => yt().gte('refreshed_at', from).lt('refreshed_at', to)),
    headCount(() => yt().is('refreshed_at', null).gte('created_at', from).lt('created_at', to)),
  ])
  return { cohortDay: day, cohortRows: a + b }
}

/** Everything the thirteen rows are computed from, for one workspace. */
export async function loadReadiness(admin: Admin, clientId: string, now: Date = new Date()): Promise<ReadinessInputs> {
  const nowIso = now.toISOString()

  const [{ data: client }, { data: tc }] = await Promise.all([
    admin.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    admin.from('tracking_configs')
      .select('brand_keywords, competitor_keywords, industry_keywords, exclude_terms, competitor_names, competitor_handles, subreddits, report_period, updated_at')
      .eq('client_id', clientId).maybeSingle(),
  ])

  const rivalNames = ((tc?.competitor_names as string[] | null) ?? []).filter(Boolean)
  const handles = (tc?.competitor_handles as Record<string, Record<string, string>> | null) ?? {}

  const analysed = () => admin.from('videos').select('id', { count: 'exact', head: true })
    .eq('client_id', clientId).not('analyzed_run_id', 'is', null).neq('platform', 'reddit')
  const gate = () => admin.from('gate_verdicts').select('id', { count: 'exact', head: true }).eq('client_id', clientId)
  const recs = () => admin.from('recommendations').select('id', { count: 'exact', head: true }).eq('client_id', clientId)

  const slotsRecorded = await slotsAreRecorded(admin)

  const [
    rivals, community, embeddings, months, updates,
    readCount, speech, translated, onScreenText, unflagged,
    gateRows, gateKept, gateFirst,
    schedules, changeLog, recTotal, recLineage, decisions, cohort,
  ] = await Promise.all([
    loadRivals(admin, clientId, rivalNames, handles, now.getTime()),
    loadCommunities(admin, clientId, tc?.subreddits),
    embeddingCoverage(admin, clientId),
    loadMonths(admin, clientId),
    loadUpdates(admin, clientId, slotsRecorded),
    headCount(analysed),
    headCount(() => analysed().eq('analyzed_with_transcript', true)),
    headCount(() => analysed().eq('analyzed_with_translation', true)),
    headCount(() => analysed().eq('analyzed_with_ocr', true)),
    headCount(() => analysed().is('analyzed_with_transcript', null)),
    headCount(gate),
    headCount(() => gate().eq('kept', true)),
    admin.from('gate_verdicts').select('created_at').eq('client_id', clientId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle(),
    admin.from('report_schedules').select('name, active, recipients, last_sent_at').eq('client_id', clientId)
      .order('created_at', { ascending: true }),
    loadChangeLog(admin, clientId),
    headCount(recs),
    headCount(() => recs().not('lineage_id', 'is', null)),
    loadDecisionCount(admin, clientId),
    loadRetentionCohort(admin, clientId),
  ])

  return {
    tenant: (client?.company_name as string | undefined) ?? 'this workspace',
    now: nowIso,
    rivals,
    terms: {
      brand: ((tc?.brand_keywords as string[] | null) ?? []).length,
      competitor: ((tc?.competitor_keywords as string[] | null) ?? []).length,
      industry: ((tc?.industry_keywords as string[] | null) ?? []).length,
      exclude: ((tc?.exclude_terms as string[] | null) ?? []).length,
      updatedAt: (tc?.updated_at as string | undefined) ?? null,
    },
    communities: community.communities,
    reddit: community.reddit,
    embeddings: {
      embedded: embeddings.embedded,
      total: embeddings.total,
      lastEmbeddedAt: embeddings.lastEmbeddedAt,
    },
    // No subjects table, no subject column, no code — the concept does not
    // exist yet, which is a different answer from "none named".
    subjectSet: { defined: null },
    monthly: months === null ? null : { months, tracked: trackedAudiences(rivalNames) },
    reads: {
      analysed: readCount,
      speech,
      translated,
      onScreenText,
      unflagged,
      gateRows,
      gateKept,
      gateFirstAt: (gateFirst.data?.created_at as string | undefined) ?? null,
    },
    updates,
    slotsRecorded,
    delivery: {
      period: (tc?.report_period as string | undefined) ?? 'weekly',
      schedules: ((schedules.data as { name: string; active: boolean; recipients: string[] | null; last_sent_at: string | null }[] | null) ?? [])
        .map((s) => ({
          name: s.name,
          active: Boolean(s.active),
          recipients: (s.recipients ?? []).length,
          lastSentAt: s.last_sent_at,
        })),
    },
    changeLog,
    recommendations: { total: recTotal, withLineage: recLineage, decisions },
    retention: {
      ...cohort,
      nightlyCap: YOUTUBE_REFRESH_NIGHTLY_CAP,
      dueAfterDays: YOUTUBE_REFRESH_DUE_DAYS,
    },
    floor: SHARE_BAND.minN,
    recentUpdates: RECENT_UPDATES,
  }
}

async function loadChangeLog(admin: Admin, clientId: string): Promise<ReadinessInputs['changeLog']> {
  const { count, error } = await admin.from(CONFIG_CHANGES_TABLE)
    .select('id', { count: 'exact', head: true }).eq('client_id', clientId)
  if (isMissingConfigLog(error)) return { available: false, rows: 0, firstLoggedAt: null, lastChangeAt: null }
  if (error) throw error

  const [first, last] = await Promise.all([
    admin.from(CONFIG_CHANGES_TABLE).select('changed_at').eq('client_id', clientId)
      .order('changed_at', { ascending: true }).limit(1).maybeSingle(),
    admin.from(CONFIG_CHANGES_TABLE).select('changed_at').eq('client_id', clientId)
      .order('changed_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  return {
    available: true,
    rows: count ?? 0,
    firstLoggedAt: (first.data?.changed_at as string | undefined) ?? null,
    lastChangeAt: (last.data?.changed_at as string | undefined) ?? null,
  }
}

/** Decisions the client has recorded, or null when nothing can record one yet. */
async function loadDecisionCount(admin: Admin, clientId: string): Promise<number | null> {
  const { count, error } = await admin.from(REC_DECISIONS_TABLE)
    .select('id', { count: 'exact', head: true }).eq('client_id', clientId)
  if (isMissingRecDecisions(error)) return null
  if (error) throw error
  return count ?? 0
}
