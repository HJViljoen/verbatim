import Link from 'next/link'
import { selectAll } from '@/lib/supabase-admin'
import { getSessionContext } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { categoryTint } from '@/lib/ui-colors'

// Dashboard — the state snapshot ("Where do we stand?", Redesign Spec §2), NOT
// this week's news (that's the report's job) and no longer the pipeline readout
// it used to be. Four bands: welcome + human coverage line · three
// where-you-stand stat cards · "what your market is talking about" (top-3
// themes, each routing to Voice) · the single best-grounded recommendation as
// the hero. Themes prefer the persisted `themes` table (Pass B labels +
// first_seen "New" badges, populated from the 2026-07-06 run onward) and
// degrade gracefully to slug-level grouping of audience_insights on older
// runs. Client-facing rules apply: no run ids, no scraped/analysed KPIs, no
// pipeline jargon — including empty states.

interface VideoRow {
  id: string
  is_client: boolean
  is_competitor: boolean
  competitor_name: string | null
  sentiment: string | null
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

export default async function DashboardPage() {
  // Auth + tenant via the RLS-enforced session client. See lib/auth.ts.
  const { supabase, clientId } = await getSessionContext()

  const [{ data: client }, { data: tc }, { data: latestRun }, { data: latestVid }] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    supabase.from('tracking_configs')
      .select('brand_keywords, competitor_keywords, industry_keywords, platforms, report_day, report_period')
      .eq('client_id', clientId).maybeSingle(),
    supabase.from('pipeline_runs').select('id, started_at')
      .eq('client_id', clientId).order('started_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('videos').select('run_id, scraped_at')
      .eq('client_id', clientId).order('scraped_at', { ascending: false }).limit(1).maybeSingle(),
  ])

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
      <div className="space-y-6">
        <WelcomeBand brand={brand} line={null} />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Your first analysis {nextUpdate ? `lands with the ${nextUpdate.replace('next update ', '')} update` : 'is on its way'} — check back then.
          </CardContent>
        </Card>
      </div>
    )
  }

  // Corpus + insight reads for the latest run, in parallel.
  const [videos, commentsRes, aiRes, recRes, latestThemedRes] = await Promise.all([
    selectAll<VideoRow>(() =>
      supabase.from('videos')
        .select('id, is_client, is_competitor, competitor_name, sentiment')
        .eq('client_id', clientId).eq('run_id', videoRunId)
        .order('id', { ascending: true }),
    ),
    supabase.from('comments').select('id', { head: true, count: 'exact' })
      .eq('client_id', clientId).eq('run_id', videoRunId),
    supabase.from('audience_insights')
      .select('id, category, theme, description, strength_score, emotion')
      .eq('client_id', clientId).eq('run_id', runId),
    supabase.from('recommendations')
      .select('id, type, title, reasoning, priority, based_on')
      .eq('client_id', clientId).eq('run_id', runId),
    supabase.from('themes').select('run_id')
      .eq('client_id', clientId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const audienceInsights = (aiRes.data ?? []) as AudienceInsight[]
  const commentCount = commentsRes.count ?? 0

  // ---- Welcome band coverage line (human terms, per spec) ----
  const lineParts = [
    keywordCount > 0 && tc?.platforms?.length
      ? `Tracking ${keywordCount} search terms across ${listNames(tc.platforms)}`
      : null,
    commentCount > 0 ? `${commentCount.toLocaleString('en-US')} conversations analysed` : null,
    latestVid?.scraped_at ? `data through ${shortDate(latestVid.scraped_at as string)}` : null,
    nextUpdate,
  ].filter(Boolean) as string[]

  // ---- Where you stand: sentiment · share of conversation · audience mood ----
  const analysed = videos.filter((v) => v.sentiment != null)
  const positiveShare = analysed.length > 0
    ? Math.round((analysed.filter((v) => v.sentiment === 'positive').length / analysed.length) * 100)
    : null

  const clientShare = videos.length > 0
    ? Math.round((videos.filter((v) => v.is_client).length / videos.length) * 100)
    : null
  const competitorCounts = new Map<string, number>()
  for (const v of videos) {
    if (!v.is_competitor) continue
    const name = v.competitor_name ?? 'competitors'
    competitorCounts.set(name, (competitorCounts.get(name) ?? 0) + 1)
  }
  const competitorShares = [...competitorCounts.entries()]
    .map(([name, n]) => `${name} ${Math.round((n / videos.length) * 100)}%`)
    .join(' · ')

  const emotionCounts = new Map<string, number>()
  for (const i of audienceInsights) {
    if (i.emotion) emotionCounts.set(i.emotion, (emotionCounts.get(i.emotion) ?? 0) + 1)
  }
  const topEmotions = [...emotionCounts.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e)

  // ---- What your market is talking about: top 3 themes ----
  // Prefer the persisted themes table (Pass B labels + first_seen); fall back to
  // slug-level grouping of audience_insights for runs before it existed. "New"
  // badges only when an earlier themed run exists to compare against.
  let topThemes: TopTheme[] = []
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
    topThemes = ((themeRows ?? []) as ThemeRow[])
      .sort((a, b) => b.evidence_count * (b.strength_score ?? 0) - a.evidence_count * (a.strength_score ?? 0))
      .slice(0, 3)
      .map((t) => ({
        label: t.label,
        description: t.description ?? '',
        category: t.category,
        memberThemes: t.member_themes,
        evidenceLabel: `across ${t.evidence_count} video${t.evidence_count === 1 ? '' : 's'}`,
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

  // ---- The one thing: top-priority, best-grounded recommendation ----
  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const recs = (recRes.data ?? []) as {
    id: string; type: string; title: string; reasoning: string
    priority: string | null; based_on: { insight_ids?: string[] } | null
  }[]
  const oneThing = [...recs].sort(
    (a, b) =>
      (priorityRank[a.priority ?? 'low'] ?? 3) - (priorityRank[b.priority ?? 'low'] ?? 3) ||
      (b.based_on?.insight_ids?.length ?? 0) - (a.based_on?.insight_ids?.length ?? 0),
  )[0]

  return (
    <div className="space-y-8">
      <WelcomeBand brand={brand} line={lineParts.length ? lineParts.join(' · ') : null} />

      {/* Where you stand */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard
          dot="bg-positive"
          label="Sentiment"
          value={positiveShare != null ? `${positiveShare}%` : '—'}
          sub={positiveShare != null ? 'positive across analysed conversations' : 'lands with the next update'}
          accent
        />
        <StatCard
          dot="bg-pine"
          label="Share of tracked conversation"
          value={clientShare != null ? `${clientShare}%` : '—'}
          sub={competitorShares ? `vs ${competitorShares}` : 'no competitors tracked yet'}
        />
        <StatCard
          dot="bg-plum"
          label="Audience mood"
          value={topEmotions[0] ? cap(topEmotions[0]) : '—'}
          sub={topEmotions.length > 1 ? `then ${topEmotions.slice(1, 3).join(' and ')}` : 'lands with the next update'}
        />
      </div>

      {/* What your market is talking about */}
      {topThemes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            What your market is talking about
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {topThemes.map((t) => (
              <Link key={t.label} href={`/dashboard/voice?themes=${encodeURIComponent(t.memberThemes.join(','))}`} className="group">
                <Card className="h-full transition-colors group-hover:bg-muted/30">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${categoryTint(t.category)}`}>
                        {t.category.replace(/_/g, ' ')}
                      </span>
                      {t.isNew && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning">New</span>
                      )}
                    </div>
                    <CardTitle className="text-sm mt-1.5">{t.label}</CardTitle>
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

      {/* The one thing */}
      {oneThing && (
        <Card className="stat-hero ring-0 border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[#CFE3D6]">The one thing to act on</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xl font-bold text-white">{oneThing.title}</p>
            <p className="text-sm text-[#CFE3D6]">{oneThing.reasoning}</p>
            <Link
              href="/dashboard/market"
              className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
            >
              See the full picture <span aria-hidden>→</span>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function WelcomeBand({ brand, line }: { brand: string; line: string | null }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">{brand} — what your market is saying</h1>
      {line && <p className="text-sm text-muted-foreground mt-1">{line}</p>}
    </div>
  )
}

function StatCard({ dot, label, value, sub, accent }: { dot: string; label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className={`size-2 rounded-full ${dot}`} aria-hidden />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold capitalize ${accent ? 'text-positive' : ''}`}>{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  )
}
