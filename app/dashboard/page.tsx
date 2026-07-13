import Link from 'next/link'
import { getSessionContext } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { categoryTint, SENTIMENT_TIER_BADGE } from '@/lib/ui-colors'
import { sentimentTier, SENTIMENT_TIER_LABEL, SENTIMENT_TIER_RULE, glossaryRule } from '@/lib/calibration'
import { CalibrationLegend } from '@/components/calibration-legend'
import { DetailOverlay } from '@/components/detail-overlay'
import { Quotes } from '@/components/quotes'
import { rankByTheme, fetchQuotesByAudience, createQuotePicker, bucketByAudienceId, scopeToClientVoices, type ThemeBucketRow } from '@/lib/quotes'

// Dashboard — the state snapshot ("Where do we stand?", Redesign Spec §2), NOT
// this week's news (that's the report's job) and no longer the pipeline readout
// it used to be. Four bands: deep-green welcome hero + human coverage line ·
// three where-you-stand stat cards, each with a small server-rendered chart
// (sentiment split · share of conversation · audience mood) · "what your market
// is talking about" (top-3 themes, editorial numerals, each routing to Voice) ·
// the single best-grounded recommendation. Themes prefer the persisted `themes`
// table (Pass B labels + first_seen "New" badges, populated from the 2026-07-06
// run onward) and degrade gracefully to slug-level grouping of audience_insights
// on older runs. Desktop-first. Chart hues validated (dataviz six checks):
// green #2E8B5E (bg-chart-2) · amber (warning) · terracotta (negative) · clay,
// with recessive sand (bg-input) for neutral/rest — legends + tooltips supply
// the required secondary encoding. Client-facing rules apply: no run ids, no
// scraped/analysed KPIs, no pipeline jargon — including empty states.

/** One entity bucket of run_summary.share_of_voice (Step 2a's output). */
interface SovEntry {
  videos: number
  pct_videos: number
}

/** The state numbers, straight from run_summary — the numbers rule: displayed
 *  values come from the pipeline's computed snapshot, never re-derived here. */
interface RunSummaryRow {
  total_videos: number | null
  total_comments: number | null
  /** Videos/comments gathered by this run only (null on pre-2026-07-09 rows). */
  period_videos: number | null
  period_comments: number | null
  share_of_voice: Record<string, SovEntry> | null
  sentiment_drivers: { video_sentiment_counts?: Record<string, number>; videos_judged?: number } | null
}

/** A Step 2c owned-account event (Owned-Data-Plan) — candidate for the one-thing slot. */
interface AccountEventRow {
  severity: number
  explained: boolean
  magnitude_label: string
  explanation: string | null
  hero_quote: string | null
}

interface AudienceInsight {
  id: string
  category: string
  theme: string
  description: string
  strength_score: number | null
  emotion: string | null
}

interface ThemeRow {
  label: string
  description: string | null
  category: string
  member_themes: string[]
  evidence_count: number
  strength_score: number | null
  first_seen: boolean
}

/** A dashboard-ready theme, from either the themes table or the slug fallback. */
interface TopTheme {
  label: string
  description: string
  category: string
  memberThemes: string[]
  evidenceLabel: string
  isNew: boolean
}

/** One segment of a proportional bar. Colour classes written in full for Tailwind. */
interface Segment {
  label: string
  count: number
  pct: number
  color: string
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const PLATFORM_NAMES: Record<string, string> = { tiktok: 'TikTok', youtube: 'YouTube', instagram: 'Instagram' }

/** "TikTok, YouTube & Instagram" */
function listNames(platforms: string[]): string {
  const names = platforms.map((p) => PLATFORM_NAMES[p] ?? cap(p))
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso))

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ detail?: string }>
}) {
  const sp = (await searchParams) ?? {}
  // Auth + tenant via the RLS-enforced session client. See lib/auth.ts.
  const { supabase, clientId } = await getSessionContext()

  // Anchor on the newest run WITH DATA: an in-flight run has no analysis rows
  // yet, so anchoring on it blanks the site for the duration of every run. The
  // page keeps serving the previous completed run until the new one closes;
  // the same guard keeps a mid-gather partial corpus out of the stats.
  const [{ data: client }, { data: tc }, { data: latestRun }, runningRes] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    supabase.from('tracking_configs')
      .select('brand_keywords, competitor_keywords, industry_keywords, platforms, report_day, report_period')
      .eq('client_id', clientId).maybeSingle(),
    supabase.from('pipeline_runs').select('id, started_at')
      .eq('client_id', clientId).in('status', ['completed', 'partial'])
      .order('started_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('pipeline_runs').select('id')
      .eq('client_id', clientId).eq('status', 'running'),
  ])
  const runningIds = ((runningRes.data ?? []) as { id: string }[]).map((r) => r.id)
  const notRunning = runningIds.length ? `(${runningIds.join(',')})` : null

  let vidQ = supabase.from('videos').select('run_id, scraped_at').eq('client_id', clientId)
  if (notRunning) vidQ = vidQ.not('run_id', 'in', notRunning)
  const { data: latestVid } = await vidQ.order('scraped_at', { ascending: false }).limit(1).maybeSingle()

  const brand = client?.company_name ?? 'Your brand'
  const keywordCount =
    (tc?.brand_keywords?.length ?? 0) + (tc?.competitor_keywords?.length ?? 0) + (tc?.industry_keywords?.length ?? 0)
  const nextUpdate =
    tc?.report_period === 'weekly' && tc?.report_day ? `next update ${cap(tc.report_day)}`
    : tc?.report_period === 'monthly' ? 'updates monthly'
    : null

  const runId = latestRun?.id as string | undefined
  const videoRunId = latestVid?.run_id as string | undefined

  if (!runId || !videoRunId) {
    return (
      <div className="space-y-8">
        <HeroBand line={null} />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Your first analysis {nextUpdate ? `lands with the ${nextUpdate.replace('next update ', '')} update` : 'is on its way'} — check back then.
          </CardContent>
        </Card>
      </div>
    )
  }

  // State snapshot + insight reads for the latest run, in parallel. Numbers come
  // from run_summary (the pipeline's corpus-computed snapshot) — never recounted
  // from videos/comments here, so every page shows the same figures.
  let themedQ = supabase.from('themes').select('run_id').eq('client_id', clientId)
  if (notRunning) themedQ = themedQ.not('run_id', 'in', notRunning)
  const [summaryRes, prevSummaryRes, aiRes, recRes, latestThemedRes, miRes, eventsRes] = await Promise.all([
    supabase.from('run_summary')
      .select('total_videos, total_comments, period_videos, period_comments, share_of_voice, sentiment_drivers')
      .eq('client_id', clientId).eq('run_id', runId).maybeSingle(),
    // The update before this one — every "since last update" delta self-gates
    // on this row existing, so first runs simply show no comparison.
    supabase.from('run_summary')
      .select('total_videos, total_comments, period_videos, period_comments, share_of_voice, sentiment_drivers')
      .eq('client_id', clientId).neq('run_id', runId)
      .order('run_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('audience_insights')
      .select('id, category, theme, description, strength_score, emotion')
      .eq('client_id', clientId).eq('run_id', runId),
    supabase.from('recommendations')
      .select('id, type, title, reasoning, priority, based_on, hero_quote')
      .eq('client_id', clientId).eq('run_id', runId),
    themedQ.order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('market_insights').select('id, evidence')
      .eq('client_id', clientId).eq('run_id', runId),
    supabase.from('account_events')
      .select('severity, explained, magnitude_label, explanation, hero_quote')
      .eq('client_id', clientId).eq('run_id', runId)
      .order('severity', { ascending: false }),
  ])

  const audienceInsights = (aiRes.data ?? []) as AudienceInsight[]
  const summary = (summaryRes.data ?? null) as RunSummaryRow | null
  const prevSummary = (prevSummaryRes.data ?? null) as RunSummaryRow | null
  const commentCount = Number(summary?.total_comments ?? 0)
  // New conversations gathered by this update — distinct from the all-time
  // corpus, so the coverage line never passes a cumulative total off as fresh.
  const newCommentCount = Number(summary?.period_comments ?? 0)

  // ---- Welcome hero coverage line (human terms, per spec) ----
  const lineParts = [
    keywordCount > 0 && tc?.platforms?.length
      ? `Tracking ${keywordCount} search terms across ${listNames(tc.platforms)}`
      : null,
    commentCount > 0
      ? newCommentCount > 0 && newCommentCount !== commentCount
        ? `${newCommentCount.toLocaleString('en-US')} new comments this update · ${commentCount.toLocaleString('en-US')} analysed to date`
        : `${commentCount.toLocaleString('en-US')} comments analysed to date`
      : null,
    latestVid?.scraped_at ? `data through ${shortDate(latestVid.scraped_at as string)}` : null,
    nextUpdate,
  ].filter(Boolean) as string[]

  // ---- Where you stand: sentiment split · share of conversation · mood ----
  const vsCounts = summary?.sentiment_drivers?.video_sentiment_counts ?? {}
  const sentimentCounts = {
    positive: Number(vsCounts.positive ?? 0),
    neutral: Number(vsCounts.neutral ?? 0),
    mixed: Number(vsCounts.mixed ?? 0),
    negative: Number(vsCounts.negative ?? 0),
  }
  const analysedCount =
    Number(summary?.sentiment_drivers?.videos_judged ?? 0) ||
    sentimentCounts.positive + sentimentCounts.neutral + sentimentCounts.mixed + sentimentCounts.negative
  const pctOf = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  const positiveShare = analysedCount > 0 ? pctOf(sentimentCounts.positive, analysedCount) : null
  // Calibrated sentiment word — fixed cutoffs on the measured split, never worded by the model.
  const sentTier = positiveShare != null
    ? sentimentTier(positiveShare, pctOf(sentimentCounts.negative, analysedCount))
    : null
  const sentimentSegments: Segment[] = (
    [
      { label: 'Positive', count: sentimentCounts.positive, color: 'bg-chart-2' },
      { label: 'Neutral', count: sentimentCounts.neutral, color: 'bg-input' },
      { label: 'Mixed', count: sentimentCounts.mixed, color: 'bg-warning' },
      { label: 'Negative', count: sentimentCounts.negative, color: 'bg-negative' },
    ] as const
  )
    .filter((s) => s.count > 0)
    .map((s) => ({ ...s, pct: pctOf(s.count, analysedCount) }))

  // Share of tracked conversation, straight from run_summary.share_of_voice.
  const sov = summary?.share_of_voice ?? {}
  const clientEntry = sov.client
  const clientShare = clientEntry ? Math.round(Number(clientEntry.pct_videos)) : null
  // Colour follows the entity: the brand is always green, competitors take the
  // earthy accents in volume order, the rest of the category stays recessive.
  const COMPETITOR_COLORS = ['bg-clay', 'bg-ochre', 'bg-plum', 'bg-slate'] as const
  const competitorSegs = Object.entries(sov)
    .filter(([key]) => key.startsWith('competitor:'))
    .sort((a, b) => b[1].videos - a[1].videos)
    .map(([key, e], i) => ({
      label: key.slice('competitor:'.length), count: e.videos, pct: Math.round(Number(e.pct_videos)),
      color: COMPETITOR_COLORS[Math.min(i, COMPETITOR_COLORS.length - 1)],
    }))
  const restEntry = sov['industry-other']
  const shareSegments: Segment[] = [
    ...(clientEntry ? [{ label: brand, count: clientEntry.videos, pct: Math.round(Number(clientEntry.pct_videos)), color: 'bg-chart-2' }] : []),
    ...competitorSegs,
    ...(restEntry ? [{ label: 'Rest of category', count: restEntry.videos, pct: Math.round(Number(restEntry.pct_videos)), color: 'bg-input' }] : []),
  ].filter((s) => s.count > 0)

  // ---- "Since last update" deltas + competitor reference point ----
  // Numbers rule: counted, denominated, comparable. The comparator is a real
  // reference (top competitor now; the previous update once one exists).
  const prevVs = prevSummary?.sentiment_drivers?.video_sentiment_counts ?? {}
  const prevJudged =
    Number(prevSummary?.sentiment_drivers?.videos_judged ?? 0) ||
    Number(prevVs.positive ?? 0) + Number(prevVs.neutral ?? 0) + Number(prevVs.mixed ?? 0) + Number(prevVs.negative ?? 0)
  const prevPositiveShare = prevSummary && prevJudged > 0 ? pctOf(Number(prevVs.positive ?? 0), prevJudged) : null
  const prevClientShare = prevSummary?.share_of_voice?.client
    ? Math.round(Number(prevSummary.share_of_voice.client.pct_videos))
    : null
  const sentimentDelta = positiveShare != null && prevPositiveShare != null ? positiveShare - prevPositiveShare : null
  const shareDelta = clientShare != null && prevClientShare != null ? clientShare - prevClientShare : null
  const topCompetitor = competitorSegs[0] ?? null

  const emotionCounts = new Map<string, number>()
  for (const i of audienceInsights) {
    if (i.emotion) emotionCounts.set(i.emotion, (emotionCounts.get(i.emotion) ?? 0) + 1)
  }
  const topEmotions = [...emotionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const maxEmotion = topEmotions[0]?.[1] ?? 0

  // ---- What your market is talking about: top 3 themes ----
  // Prefer the persisted themes table (Pass B labels + first_seen); fall back to
  // slug-level grouping of audience_insights for runs before it existed. "New"
  // badges only when an earlier themed run exists to compare against.
  let topThemes: TopTheme[] = []
  // Counted for the "how this update was built" funnel overlay.
  let themeTotal = 0
  let themeMultiSource = 0
  const themedRunId = latestThemedRes.data?.run_id as string | undefined
  if (themedRunId) {
    const [{ data: themeRows }, { data: earlier }] = await Promise.all([
      supabase.from('themes')
        .select('label, description, category, member_themes, evidence_count, strength_score, first_seen')
        .eq('client_id', clientId).eq('run_id', themedRunId),
      supabase.from('themes').select('id')
        .eq('client_id', clientId).neq('run_id', themedRunId).limit(1),
    ])
    const showNew = (earlier?.length ?? 0) > 0
    themeTotal = (themeRows ?? []).length
    themeMultiSource = ((themeRows ?? []) as ThemeRow[]).filter((t) => t.evidence_count >= 2).length
    topThemes = ((themeRows ?? []) as ThemeRow[])
      .sort((a, b) => b.evidence_count * (b.strength_score ?? 0) - a.evidence_count * (a.strength_score ?? 0))
      .slice(0, 3)
      .map((t) => ({
        label: t.label,
        description: t.description ?? '',
        category: t.category,
        memberThemes: t.member_themes,
        evidenceLabel: `in ${t.evidence_count} conversation${t.evidence_count === 1 ? '' : 's'}`,
        isNew: showNew && t.first_seen,
      }))
  } else {
    const bySlug = new Map<string, AudienceInsight[]>()
    for (const i of audienceInsights) {
      const arr = bySlug.get(i.theme)
      if (arr) arr.push(i)
      else bySlug.set(i.theme, [i])
    }
    topThemes = [...bySlug.values()]
      .map((group) => {
        const strongest = group.reduce((a, b) => (Number(b.strength_score ?? 0) > Number(a.strength_score ?? 0) ? b : a))
        return { group, strongest, score: group.length * Number(strongest.strength_score ?? 0) }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ group, strongest }) => ({
        label: cap(strongest.theme.replace(/_/g, ' ')),
        description: strongest.description,
        category: strongest.category,
        memberThemes: [strongest.theme],
        evidenceLabel: `${group.length} mention${group.length === 1 ? '' : 's'}`,
        isNew: false,
      }))
  }

  // ---- The one thing: top-priority, best-grounded recommendation — unless a
  // major explained event on the client's OWN account outranks it (code
  // ranking: severity 3 + explained takes the slot; anything less defers).
  const events = (eventsRes.data ?? []) as AccountEventRow[]
  const topEvent = events.find((e) => e.explained && e.severity >= 3) ?? null

  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const recs = (recRes.data ?? []) as {
    id: string; type: string; title: string; reasoning: string
    priority: string | null; based_on: { insight_ids?: string[] } | null; hero_quote: string | null
  }[]
  const oneThing = [...recs].sort(
    (a, b) =>
      (priorityRank[a.priority ?? 'low'] ?? 3) - (priorityRank[b.priority ?? 'low'] ?? 3) ||
      (b.based_on?.insight_ids?.length ?? 0) - (a.based_on?.insight_ids?.length ?? 0),
  )[0]

  // Evidence-led: lead the recommendation with the real voices behind it (shared
  // lib/quotes) — the pipeline's hero_quote where present, heuristic otherwise.
  // The "one thing" is a claim about the client, so the pool keeps client +
  // category voices only (entity-bucket scoping, teardown §Run 1 defect 1).
  let oneThingQuotes: string[] = []
  if (oneThing && !topEvent) {
    const marketInsights = (miRes.data ?? []) as { id: string; evidence: { supporting_theme_ids?: string[] } | null }[]
    const miEvidenceById = new Map(marketInsights.map((m) => [m.id, m.evidence]))
    const themeSlugById = new Map(audienceInsights.map((a) => [a.id, a.theme]))
    const { data: bucketData } = await supabase.from('themes')
      .select('bucket, supporting_insight_ids')
      .eq('client_id', clientId).eq('run_id', runId)
    const bucketById = bucketByAudienceId((bucketData ?? []) as ThemeBucketRow[])
    const supportIds: string[] = []
    for (const id of oneThing.based_on?.insight_ids ?? []) supportIds.push(...(miEvidenceById.get(id)?.supporting_theme_ids ?? []))
    const scopedIds = scopeToClientVoices(supportIds, bucketById)
    const claim = `${oneThing.title} ${oneThing.reasoning}`
    const pool = rankByTheme(scopedIds, claim, themeSlugById).slice(0, 120)
    const quotesByAudience = await fetchQuotesByAudience(supabase, pool)
    const pick = createQuotePicker(quotesByAudience, themeSlugById)
    oneThingQuotes = pick(scopedIds, 2, claim, oneThing.hero_quote)
  }

  // ---- "How this update was built" — the counted evidence funnel ----
  // Every row is a stored figure (tracking config, run_summary, themes) —
  // the credibility answer to "where do these numbers come from?".
  const funnelSteps = [
    keywordCount > 0 && tc?.platforms?.length
      ? { n: keywordCount, label: `search terms tracked across ${listNames(tc.platforms)}`, delta: null }
      : null,
    summary?.total_videos
      ? {
          n: Number(summary.total_videos), label: 'conversations gathered into your tracked corpus',
          delta: prevSummary?.total_videos ? Number(summary.total_videos) - Number(prevSummary.total_videos) : null,
        }
      : null,
    commentCount > 0
      ? { n: commentCount, label: 'comments analysed inside them', delta: prevSummary?.total_comments ? commentCount - Number(prevSummary.total_comments) : null }
      : null,
    summary?.period_videos
      ? {
          n: Number(summary.period_videos), label: 'conversations from this update’s period',
          delta: prevSummary?.period_videos ? Number(summary.period_videos) - Number(prevSummary.period_videos) : null,
        }
      : null,
    analysedCount > 0
      ? { n: analysedCount, label: 'conversations rated for sentiment', delta: prevJudged > 0 ? analysedCount - prevJudged : null }
      : null,
    themeTotal > 0 ? { n: themeTotal, label: 'themes heard across the conversation', delta: null } : null,
    themeMultiSource > 0 ? { n: themeMultiSource, label: 'confirmed by more than one conversation', delta: null } : null,
  ].filter(Boolean) as { n: number; label: string; delta: number | null }[]
  const showFunnel = sp.detail === 'funnel' && funnelSteps.length > 0

  // Keyword coverage for the funnel overlay — fetched only when it's open.
  // Keyword rows live on the run whose GATHER produced them, and analysis-only
  // re-runs skip gather, so anchor on the newest run that has rows.
  let keywordCoverage: { keyword: string; found: number; relevant: number }[] = []
  if (showFunnel) {
    const { data: kpRows } = await supabase.from('keyword_performance')
      .select('run_id, keyword, videos_found, gate_survived, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }).limit(400)
    const rows = (kpRows ?? []) as { run_id: string; keyword: string; videos_found: number; gate_survived: number }[]
    const latestKpRun = rows[0]?.run_id
    const byKeyword = new Map<string, { keyword: string; found: number; relevant: number }>()
    for (const r of rows.filter((r) => r.run_id === latestKpRun)) {
      const agg = byKeyword.get(r.keyword) ?? { keyword: r.keyword, found: 0, relevant: 0 }
      agg.found += r.videos_found
      agg.relevant += r.gate_survived
      byKeyword.set(r.keyword, agg)
    }
    keywordCoverage = [...byKeyword.values()].sort((a, b) => b.relevant - a.relevant)
  }

  return (
    <div className="space-y-8">
      <HeroBand
        line={lineParts.length ? lineParts.join(' · ') : null}
        detailHref={funnelSteps.length > 0 ? '/dashboard?detail=funnel' : null}
      />

      {/* This update, in counted figures — deltas appear once a previous update exists */}
      <StatBand
        tiles={[
          summary?.period_videos
            ? { n: Number(summary.period_videos), label: 'conversations this update', delta: prevSummary?.period_videos ? Number(summary.period_videos) - Number(prevSummary.period_videos) : null }
            : null,
          newCommentCount > 0
            ? { n: newCommentCount, label: 'new comments', delta: prevSummary?.period_comments ? newCommentCount - Number(prevSummary.period_comments) : null }
            : null,
          themeMultiSource > 0 ? { n: themeMultiSource, label: 'confirmed themes', delta: null } : null,
          (recRes.data ?? []).length > 0 ? { n: (recRes.data ?? []).length, label: 'recommendations', delta: null } : null,
        ].filter(Boolean) as StatTile[]}
      />

      {sentTier && (
        <CalibrationLegend items={topThemes.some((t) => t.isNew) ? ['conversations', 'sentiment', 'new'] : ['conversations', 'sentiment']} />
      )}

      {/* Where you stand */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="size-2 rounded-full bg-chart-2" aria-hidden />
              Sentiment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <div className="text-3xl font-bold text-positive">{positiveShare != null ? `${positiveShare}%` : '—'}</div>
              {sentTier && (
                <span title={SENTIMENT_TIER_RULE[sentTier]} className={`px-2 py-0.5 rounded-full text-xs font-medium ${SENTIMENT_TIER_BADGE[sentTier]}`}>
                  {SENTIMENT_TIER_LABEL[sentTier]}
                </span>
              )}
              <DeltaBadge delta={sentimentDelta} unit="pts" />
            </div>
            {sentimentSegments.length > 0 ? (
              <>
                <ProportionBar segments={sentimentSegments} of="conversations" />
                <BarLegend segments={sentimentSegments} />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">lands with the next update</p>
            )}
            {positiveShare != null && (
              <p className="text-xs text-muted-foreground">positive across {analysedCount} rated conversations</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="size-2 rounded-full bg-clay" aria-hidden />
              Share of tracked conversation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <div className="text-3xl font-bold">{clientShare != null ? `${clientShare}%` : '—'}</div>
              <DeltaBadge delta={shareDelta} unit="pts" />
            </div>
            {shareSegments.length > 0 ? (
              <>
                <ProportionBar segments={shareSegments} of="conversations" />
                <BarLegend segments={shareSegments} />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">no competitors tracked yet</p>
            )}
            {clientShare != null && <p className="text-xs text-muted-foreground">of the conversation you track is about {brand}</p>}
            {clientShare != null && topCompetitor && (
              <p className="text-xs text-muted-foreground">
                {clientShare >= topCompetitor.pct
                  ? `you lead the tracked brands — ${topCompetitor.label} follows at ${topCompetitor.pct}%`
                  : `${topCompetitor.label} leads the tracked brands at ${topCompetitor.pct}%`}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="size-2 rounded-full bg-plum" aria-hidden />
              Audience mood
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-3xl font-bold capitalize">{topEmotions[0] ? topEmotions[0][0] : '—'}</div>
            {topEmotions.length > 0 ? (
              <div className="space-y-1.5">
                {topEmotions.map(([emotion, n]) => (
                  <div key={emotion} className="flex items-center gap-2" title={`${cap(emotion)} · ${n} mention${n === 1 ? '' : 's'} this update`}>
                    <span className="w-20 shrink-0 text-xs capitalize text-muted-foreground">{emotion}</span>
                    {/* bar needs its own track: a % width on the row itself gets flex-shrunk
                        to the same leftover space for every row on narrow screens */}
                    <span className="min-w-0 flex-1" aria-hidden>
                      <span className="block h-2 rounded-full bg-chart-2" style={{ width: `${Math.max(8, (n / maxEmotion) * 100)}%` }} />
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{n}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">lands with the next update</p>
            )}
            {topEmotions.length > 0 && (
              <p className="text-xs text-muted-foreground">how often each feeling is mentioned this update</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* What your market is talking about */}
      {topThemes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            What your market is talking about
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {topThemes.map((t, i) => (
              <Link key={t.label} href={`/dashboard/voice?themes=${encodeURIComponent(t.memberThemes.join(','))}`} className="group">
                <Card className="h-full transition-colors group-hover:bg-muted/30">
                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-3">
                      <span className="text-3xl font-bold leading-none text-primary/25" aria-hidden>{i + 1}</span>
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${categoryTint(t.category)}`}>
                            {t.category.replace(/_/g, ' ')}
                          </span>
                          {t.isNew && (
                            <span title={glossaryRule('new')} className="px-2 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning">New</span>
                          )}
                        </div>
                        <CardTitle className="text-sm">{t.label}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {t.evidenceLabel} · <span className="text-primary">hear these voices →</span>
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* The one thing — a major explained event on the client's own account
          wins the slot; otherwise the best-grounded recommendation. */}
      {topEvent ? (
        <Card className="ring-2 ring-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">The one thing on your account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topEvent.hero_quote && <Quotes items={[topEvent.hero_quote]} />}
            <p className="text-xl font-bold">{topEvent.magnitude_label}</p>
            {topEvent.explanation && <p className="text-sm text-muted-foreground">{topEvent.explanation}</p>}
            <Link
              href="/dashboard/trends"
              className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              See what moved <span aria-hidden>→</span>
            </Link>
          </CardContent>
        </Card>
      ) : oneThing ? (
        <Card className="ring-2 ring-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">The one thing to act on</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Quotes items={oneThingQuotes} />
            <p className="text-xl font-bold">{oneThing.title}</p>
            <p className="text-sm text-muted-foreground">{oneThing.reasoning}</p>
            <Link
              href="/dashboard/market"
              className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              See the full picture <span aria-hidden>→</span>
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {/* "How this update was built" — counted provenance, one click off the hero */}
      {showFunnel && (
        <DetailOverlay closeHref="/dashboard">
          <div className="space-y-4 pr-6">
            <div>
              <h3 className="text-lg font-semibold">How this update was built</h3>
              <p className="text-xs text-muted-foreground">every figure below is counted from stored data — nothing is estimated</p>
            </div>
            <ol className="space-y-2.5 border-l-2 border-primary/20 pl-4">
              {funnelSteps.map((s) => (
                <li key={s.label} className="flex items-baseline gap-3">
                  <span className="w-16 shrink-0 text-right text-xl font-bold tabular-nums">{s.n.toLocaleString('en-US')}</span>
                  <span className="text-sm text-muted-foreground">
                    {s.label} {s.delta != null && <DeltaBadge delta={s.delta} />}
                  </span>
                </li>
              ))}
            </ol>
            {keywordCoverage.length > 0 && (
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-xs font-medium">What each search term brought in</p>
                {keywordCoverage.map((k) => (
                  <div key={k.keyword} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate">{k.keyword}</span>
                    <span className="flex shrink-0 items-center gap-2 tabular-nums text-muted-foreground">
                      <span className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span
                          className="block h-full rounded-full bg-primary/60"
                          style={{ width: `${k.found > 0 ? Math.max(4, Math.round((k.relevant / k.found) * 100)) : 0}%` }}
                        />
                      </span>
                      <span>{k.found} found · {k.relevant} relevant{k.found > 0 ? ` (${Math.round((k.relevant / k.found) * 100)}%)` : ''}</span>
                    </span>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">
                  counted when this update was gathered — relevance is the automated on-topic check every conversation must clear
                </p>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              a conversation is one video and the comments it sparked; themes are confirmed only when heard in more than one conversation
            </p>
          </div>
        </DetailOverlay>
      )}
    </div>
  )
}

interface StatTile { n: number; label: string; delta: number | null }

/** Bold counted figures for this update; each grows a delta once comparable. */
function StatBand({ tiles }: { tiles: StatTile[] }) {
  if (tiles.length < 2) return null
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.label} className="py-4">
          <CardContent className="space-y-0.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">{t.n.toLocaleString('en-US')}</span>
              <DeltaBadge delta={t.delta} />
            </div>
            <p className="text-xs text-muted-foreground">{t.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/** "Since last update" movement — renders nothing until a previous update exists. */
function DeltaBadge({ delta, unit }: { delta: number | null; unit?: string }) {
  if (delta == null) return null
  const suffix = unit ? ` ${unit}` : ''
  if (delta === 0) {
    return <span className="text-xs font-medium text-muted-foreground" title="no change since your last update">— unchanged</span>
  }
  return (
    <span
      title="movement since your last update"
      className={`text-xs font-semibold ${delta > 0 ? 'text-positive' : 'text-negative'}`}
    >
      {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString('en-US')}{suffix}
    </span>
  )
}

/** The deep-green welcome hero — the page's single stat-hero element. */
function HeroBand({ line, detailHref }: { line: string | null; detailHref?: string | null }) {
  return (
    <div className="stat-hero rounded-2xl px-6 py-8 sm:px-10 sm:py-12">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">What your market is saying</h1>
      {line && <p className="mt-3 text-sm text-[#CFE3D6]">{line}</p>}
      {detailHref && (
        <Link
          href={detailHref}
          scroll={false}
          className="mt-2 inline-block text-xs text-[#CFE3D6] underline decoration-[#CFE3D6]/50 underline-offset-4 hover:text-white"
        >
          How this update was built →
        </Link>
      )}
    </div>
  )
}

/** Proportional segmented bar with 2px surface gaps + per-segment tooltips. */
function ProportionBar({ segments, of }: { segments: Segment[]; of: string }) {
  return (
    <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
      {segments.map((s) => (
        <span
          key={s.label}
          className={`${s.color} first:rounded-l-full last:rounded-r-full`}
          style={{ width: `${Math.max(2, s.pct)}%` }}
          title={`${s.label} · ${s.count} ${of} (${s.pct}%)`}
        />
      ))}
    </div>
  )
}

/** Dot legend for a proportional bar — identity is never colour-alone. */
function BarLegend({ segments }: { segments: Segment[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {segments.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={`size-2 rounded-full ${s.color}`} aria-hidden />
          {s.label} {s.pct}%
        </span>
      ))}
    </div>
  )
}
