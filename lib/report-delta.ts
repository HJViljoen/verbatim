import type { createAdminClient } from './supabase-admin'
import type { CiSummary } from './pipeline/schemas'
import { proportionDelta, SENTIMENT_BAND, SHARE_BAND, type DeltaVerdict } from './report-bands'

// Week-over-week delta for the report's "what changed" block (Redesign Spec §7).
// Computed from run_summary rows — no genealogy: the previous row is simply the
// latest one dated before the current run's, except that PERIOD metrics skip a
// `skipGather` catch-up, which gathered no week to compare with (pickBaselines).
// Every field degrades to
// null independently, so a first report (no previous row) or a metric missing on
// either side hides just that line, never the report.

type Admin = ReturnType<typeof createAdminClient>

interface SovEntry {
  videos: number
  views: number
  pct_videos: number
}

/** One sentiment family as run_summary stores it (T0-8). */
export interface SentimentFamilyRow {
  positive: number | null
  neutral: number | null
  negative: number | null
  judged: number
}

export interface RunSummaryRow {
  run_id: string
  run_date: string
  period: string | null
  total_videos: number | null
  total_comments: number | null
  overall_sentiment_positive: string | number | null
  share_of_voice: Record<string, SovEntry> | null
  /** Period (this-run-only) metrics — preferred for deltas since 2026-07-09:
   *  diffing the cumulative columns compared all-time stocks, which damped
   *  toward zero as the corpus grew. Null on rows written before the split. */
  period_videos: number | null
  period_comments: number | null
  period_sentiment_positive: string | number | null
  period_share_of_voice: Record<string, SovEntry> | null
  /** Audience sentiment (Pass A full lane only) — the only family a client
   *  number may come from. Null on rows written before 2026-08-18, whose
   *  overall_sentiment_* blended audience with classify-meta framing. */
  audience_sentiment: SentimentFamilyRow | null
  period_audience_sentiment: SentimentFamilyRow | null
  consumer_intelligence_summary: CiSummary | null
}

const SUMMARY_COLS =
  'run_id, run_date, period, total_videos, total_comments, overall_sentiment_positive, share_of_voice, period_videos, period_comments, period_sentiment_positive, period_share_of_voice, audience_sentiment, period_audience_sentiment, consumer_intelligence_summary'

export interface ShareSide {
  /** Client's share of tracked videos, %. */
  client: number
  /** Videos in the client's own bucket — the numerator, for the floor. */
  clientVideos: number
  /** Videos in the whole tracked set — the denominator, for the floor and label. */
  totalVideos: number
  /** Largest tracked competitor by share, if any competitor is tracked. */
  competitor: { name: string; pct: number } | null
}

export interface RunDelta {
  /** The update the figures are measured against — the last one that gathered,
   *  which is not always the last one that ran (pickBaselines). */
  prevRunDate: string
  /** Audience-sentiment share, now vs the previous update, with the verdict
   *  that decides whether it may be shown as movement (T0-8). `judged` are the
   *  denominators the verdict rests on. */
  sentiment: { now: number; prev: number; verdict: DeltaVerdict; nowJudged: number; prevJudged: number } | null
  share: { now: ShareSide; prev: ShareSide; verdict: DeltaVerdict } | null
  /** Confirmed (multi-source) themes genuinely new this update. Null until the
   *  theme registry holds at least MIN_REGISTRY_OBSERVATIONS observations for
   *  the client — before that "new" is ~83-88% relabelling, not new themes. */
  newThemes: { count: number; labels: string[] } | null
  conversations: { now: number; prev: number } | null
}

/** A client needs this many registry observations before "N new themes" means
 *  anything: with one observation every theme is trivially first-seen, and the
 *  pre-registry label-embedding rule flagged 48 of 58 "new" themes that were
 *  relabels of existing ones. Seeded on the first run under THEME_REGISTRY, so
 *  the honest count starts at the second (Össur: 30 Aug). */
export const MIN_REGISTRY_OBSERVATIONS = 2

const num = (v: string | number | null | undefined): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function loadRunSummary(
  admin: Admin,
  clientId: string,
  runId: string,
): Promise<RunSummaryRow | null> {
  const { data } = await admin
    .from('run_summary')
    .select(SUMMARY_COLS)
    .eq('client_id', clientId)
    .eq('run_id', runId)
    .maybeSingle()
  return (data as RunSummaryRow | null) ?? null
}

/** Client + top-competitor share out of a share_of_voice map. `totalVideos`
 *  is the map's own denominator (every bucket summed), so the label can state
 *  the n the share is out of and the band can apply a floor to it. */
export function readShare(sov: Record<string, SovEntry> | null): ShareSide | null {
  if (!sov || !sov.client) return null
  let competitor: ShareSide['competitor'] = null
  let totalVideos = 0
  for (const [key, entry] of Object.entries(sov)) {
    totalVideos += Number(entry?.videos ?? 0)
    if (!key.startsWith('competitor:')) continue
    const pct = num(entry?.pct_videos)
    if (pct == null) continue
    if (!competitor || pct > competitor.pct) competitor = { name: key.slice('competitor:'.length), pct }
  }
  const client = num(sov.client.pct_videos)
  if (client == null) return null
  return { client, clientVideos: Number(sov.client.videos ?? 0), totalVideos, competitor }
}

/** The sentiment family a row may be reported from: audience only, period
 *  layer when both sides have it. Null when either side predates the split —
 *  those rows blended framing into the number and are not comparable. The
 *  period layer compares against `periodPrev` (the last run that gathered),
 *  the cumulative fallback against the immediate previous — see pickBaselines. */
function audienceSides(current: RunSummaryRow, prev: RunSummaryRow, periodPrev: RunSummaryRow, usePeriod: boolean):
  { now: SentimentFamilyRow; prev: SentimentFamilyRow } | null {
  const nowRow = usePeriod ? current.period_audience_sentiment : current.audience_sentiment
  const prevRow = usePeriod ? periodPrev.period_audience_sentiment : prev.audience_sentiment
  if (!nowRow || !prevRow) return null
  if (nowRow.positive == null || prevRow.positive == null) return null
  return { now: nowRow, prev: prevRow }
}

/** Prior run_summary rows to consider when choosing a baseline. Deep enough
 *  to step over a run of catch-ups, shallow enough to stay one small query. */
export const BASELINE_LOOKBACK = 8

/**
 * The date the delta block may name as "since <date>".
 *
 * Every period figure is measured against `periodPrev` (the last run that
 * GATHERED), so when the whole block is period figures that is the honest date.
 * But each family falls back to its cumulative column when either side lacks the
 * period one, and those compare against `prevRow` — so a mixed block dated to
 * periodPrev would put a cumulative movement under the wrong baseline. Mixed
 * (or all-cumulative) therefore names the previous update, which is true of
 * every row: the period ones simply span a little more than the label says.
 */
export function deltaBaselineDate(
  prev: RunSummaryRow,
  periodPrev: RunSummaryRow,
  layers: { sentiment: boolean; share: boolean; conversations: boolean },
): string {
  const allPeriod = layers.sentiment && layers.share && layers.conversations
  return allPeriod ? periodPrev.run_date : prev.run_date
}

/**
 * The two baselines a delta is measured against.
 *
 * `prev` is simply the previous update — what the CUMULATIVE columns compare
 * to, since a stock is a stock however the run was dispatched.
 *
 * `periodPrev` is the most recent prior run that actually GATHERED. A
 * `skipGather: true` catch-up re-analyses what is already stored: it scrapes
 * no videos and re-attributes old comments, so its period columns are not a
 * week of anything. Össur's 6 Sep run was one (pipeline_runs.options =
 * {"runId":…,"skipGather":true}), and measuring 13 Sep against it produced
 * "+12.2 pt share of voice" and "−2,152 comments" — artefacts of the
 * baseline, not movement. Falls back to `prev` when every row in the lookback
 * skipped gather, so a client whose only history is catch-ups still gets a
 * delta rather than none.
 *
 * `priorDesc` is newest-first; `skippedGather` holds the run_ids whose
 * pipeline_runs.options set skipGather.
 */
export function pickBaselines(
  priorDesc: RunSummaryRow[],
  skippedGather: ReadonlySet<string>,
): { prev: RunSummaryRow; periodPrev: RunSummaryRow } | null {
  const prev = priorDesc[0]
  if (!prev) return null
  return { prev, periodPrev: priorDesc.find((r) => !skippedGather.has(r.run_id)) ?? prev }
}

/** The start of a run's calendar day, as the comparable prefix of its
 *  timestamp. Exported for the test that pins the same-day rule. */
export function dayFloor(runDate: string): string {
  return runDate.slice(0, 10)
}

export async function computeRunDelta(
  admin: Admin,
  clientId: string,
  current: RunSummaryRow,
): Promise<RunDelta | null> {
  // "The previous update" means a previous DAY, not merely an earlier moment.
  // run_date is a timestamptz, so `.lt(run_date)` alone also matches a rerun
  // from earlier the same morning — and then every delta on the report is
  // measured against a few hours of the same week rather than against the last
  // one, which reads as "nothing changed". Cutting on the calendar day keeps a
  // same-day rerun out while still finding yesterday's run.
  const { data: priors } = await admin
    .from('run_summary')
    .select(SUMMARY_COLS)
    .eq('client_id', clientId)
    .lt('run_date', dayFloor(current.run_date))
    .order('run_date', { ascending: false })
    .limit(BASELINE_LOOKBACK)
  const priorRows = (priors ?? []) as RunSummaryRow[]
  if (!priorRows.length) return null

  // Period metrics may not compare against a catch-up that gathered nothing
  // (pickBaselines). A failed or unsupported filter leaves the set empty,
  // which is the old behaviour — the safe direction.
  const { data: skipped } = await admin
    .from('pipeline_runs')
    .select('id')
    .in('id', priorRows.map((r) => r.run_id))
    .eq('options->>skipGather', 'true')
  const baselines = pickBaselines(priorRows, new Set(((skipped ?? []) as { id: string }[]).map((r) => r.id)))
  if (!baselines) return null
  const { prev: prevRow, periodPrev } = baselines

  // Sentiment: audience family only, period layer when both sides carry it.
  // A verdict, not a raw difference — floors (>= 100 judged per side) and a
  // 2xSE band keep re-judgment jitter and population changes out of the arrow.
  // Which families compare against `periodPrev` (the last run that gathered) and
  // which fall back to a cumulative column measured against `prevRow`. Hoisted
  // out of audienceSides because the block's "since <date>" depends on all three
  // (deltaBaselineDate).
  const usePeriodSentiment = current.period_audience_sentiment != null && periodPrev.period_audience_sentiment != null
  const sides = audienceSides(current, prevRow, periodPrev, usePeriodSentiment)
  const sentiment = sides
    ? {
        now: sides.now.positive as number,
        prev: sides.prev.positive as number,
        nowJudged: sides.now.judged,
        prevJudged: sides.prev.judged,
        verdict: proportionDelta(
          {
            nowPct: sides.now.positive as number, nowN: sides.now.judged,
            prevPct: sides.prev.positive as number, prevN: sides.prev.judged,
          },
          SENTIMENT_BAND,
        ),
      }
    : null

  const usePeriodShare = current.period_share_of_voice != null && periodPrev.period_share_of_voice != null
  const shareNow = readShare(usePeriodShare ? current.period_share_of_voice : current.share_of_voice)
  const sharePrev = readShare(usePeriodShare ? periodPrev.period_share_of_voice : prevRow.share_of_voice)

  // "New themes" is only honest once theme identity is durable. Two gates:
  // the previous run must have had themes at all, AND the registry must hold
  // MIN_REGISTRY_OBSERVATIONS observations for this client — the pre-registry
  // label-match rule counted relabels as new (48 of 58 measured).
  let newThemes: RunDelta['newThemes'] = null
  const [{ data: prevTheme }, observedEnough] = await Promise.all([
    admin.from('themes').select('id')
      .eq('client_id', clientId).eq('run_id', prevRow.run_id).limit(1).maybeSingle(),
    registryObservedEnough(admin, clientId),
  ])
  if (prevTheme && observedEnough) {
    const { data: fresh } = await admin
      .from('themes')
      .select('label')
      .eq('client_id', clientId)
      .eq('run_id', current.run_id)
      .eq('first_seen', true)
      .eq('single_source', false)
      // Widest-heard first, so the two labels named in the email are the two
      // that most people actually raised (Tier 1).
      .order('rank_score', { ascending: false, nullsFirst: false })
      .order('strength_score', { ascending: false })
    const rows = (fresh ?? []) as { label: string }[]
    newThemes = { count: rows.length, labels: rows.slice(0, 2).map((r) => r.label) }
  }

  const usePeriodConv = current.period_comments != null && periodPrev.period_comments != null
  const convNow = num(usePeriodConv ? current.period_comments : current.total_comments)
  const convPrev = num(usePeriodConv ? periodPrev.period_comments : prevRow.total_comments)

  return {
    prevRunDate: deltaBaselineDate(prevRow, periodPrev, {
      sentiment: usePeriodSentiment, share: usePeriodShare, conversations: usePeriodConv,
    }),
    sentiment,
    share:
      shareNow && sharePrev
        ? {
            now: shareNow, prev: sharePrev,
            verdict: proportionDelta(
              {
                nowPct: shareNow.client, nowN: shareNow.totalVideos, nowK: shareNow.clientVideos,
                prevPct: sharePrev.client, prevN: sharePrev.totalVideos, prevK: sharePrev.clientVideos,
              },
              SHARE_BAND,
            ),
          }
        : null,
    newThemes,
    conversations: convNow != null && convPrev != null ? { now: convNow, prev: convPrev } : null,
  }
}

/**
 * Has the client's theme registry been observed by at least
 * MIN_REGISTRY_OBSERVATIONS distinct runs? Registry off, table empty or read
 * unreadable all answer no, which keeps "new themes" hidden — the safe
 * direction.
 *
 * Walks the distinct run ids by keyset — each step asks for the smallest
 * run_id greater than the last — and stops the moment the answer is yes: at
 * most MIN_REGISTRY_OBSERVATIONS reads of one row each, whatever the table
 * holds. What it replaces was a bare `.select('run_id')` capped at 1,000 with
 * no order, over a table holding 2,386 rows (Össur) and 2,654 (Sealand), so
 * the distinct-run count was computed over an arbitrary thousand of them. It
 * spans two runs today only by luck of the volumes: Sealand's last update
 * wrote 1,053 observations on its own, and a single run filling that window
 * would answer "one run" and silently drop the "N new themes" line from the
 * email subject — the one number the only report this product has ever sent
 * led with.
 */
async function registryObservedEnough(
  admin: Admin,
  clientId: string,
  min: number = MIN_REGISTRY_OBSERVATIONS,
): Promise<boolean> {
  const nextAfter = () =>
    admin
      .from('theme_observations')
      .select('run_id')
      .eq('client_id', clientId)
      .not('run_id', 'is', null)
      .order('run_id', { ascending: true })
      .limit(1)
  let after: string | null = null
  for (let seen = 0; seen < min; seen++) {
    // Cast, not inferred: the cursor feeds the next query's filter and the
    // filter's result would then define the cursor, which TypeScript reads as
    // circular.
    const query = after ? nextAfter().gt('run_id', after) : nextAfter()
    const { data, error } = (await query) as { data: { run_id: string }[] | null; error: { message: string } | null }
    if (error) {
      console.error(`[report-delta] counting registry observations: ${error.message}`)
      return false
    }
    const next: string | undefined = (data ?? [])[0]?.run_id
    if (!next) return false
    after = next
  }
  return true
}
