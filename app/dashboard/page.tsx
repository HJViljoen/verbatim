import { selectAll } from '@/lib/supabase-admin'
import { getSessionContext } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { accentTint, categoryTint, SENTIMENT_BADGE, greenForPct } from '@/lib/ui-colors'

// Dashboard — corpus + pipeline readout for the latest data. Rewired onto the
// v4.1 schema: per-video sentiment is now the text column `videos.sentiment`
// (positive|negative|neutral|mixed, null until a video is analysed), topics live
// in `videos.topics` (text[]), and audience questions come from `audience_insights`
// (category = 'question') rather than the dropped pre-v4.1 columns
// (positive_pct / common_questions / common_topics). Each section states *why*
// it's empty so the page works as a backend-health check. Same auth/data pattern
// as Market Intelligence.

interface VideoRow {
  id: string
  platform: string
  account_name: string
  video_url: string
  views: number | null
  likes: number | null
  engagement_rate: number | null
  is_competitor: boolean
  is_client: boolean
  sentiment: string | null
  classified_type: string | null
  topics: string[] | null
}

interface AudienceInsight {
  id: string
  category: string
  theme: string
  description: string
  strength_score: number | null
}

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(0)}K`
  : String(n)

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground italic">{children}</p>
}

export default async function DashboardPage() {
  // Auth + tenant + role via the RLS-enforced session client (the
  // .eq('client_id', …) filters below are now redundant but kept explicit).
  // Service-role is reserved for the pipeline + provisioning. See lib/auth.ts.
  const { supabase, clientId } = await getSessionContext()

  // Latest run — scopes the audience insights (videos carry their latest
  // classification in-place, so they're read corpus-wide, not run-scoped).
  const { data: latestRun } = await supabase
    .from('pipeline_runs').select('id, started_at, status')
    .eq('client_id', clientId).order('started_at', { ascending: false }).limit(1).maybeSingle()
  const runId = latestRun?.id as string | undefined

  const [all, { data: aiData }] = await Promise.all([
    selectAll<VideoRow>(() =>
      supabase.from('videos')
        .select('id, platform, account_name, video_url, views, likes, engagement_rate, is_competitor, is_client, sentiment, classified_type, topics')
        .eq('client_id', clientId).order('views', { ascending: false }).order('id', { ascending: true })),
    runId
      ? supabase.from('audience_insights')
          .select('id, category, theme, description, strength_score')
          .eq('client_id', clientId).eq('run_id', runId)
      : Promise.resolve({ data: [] as AudienceInsight[] }),
  ])

  const audienceInsights = (aiData ?? []) as AudienceInsight[]

  // ---- Stats ----
  const totalViews = all.reduce((s, v) => s + (Number(v.views) || 0), 0)
  const withEng = all.filter(v => Number(v.engagement_rate) > 0)
  const avgEngagement = withEng.length > 0
    ? (withEng.reduce((s, v) => s + Number(v.engagement_rate), 0) / withEng.length).toFixed(1)
    : '0'
  // Analysed = videos that have been through Pass A (sentiment is set). The gap
  // between all.length and analysed.length is the "scraped but not analysed" set.
  const analysed = all.filter(v => v.sentiment != null)
  const positiveShare = analysed.length > 0
    ? Math.round(analysed.filter(v => v.sentiment === 'positive').length / analysed.length * 100)
    : 0

  // ---- Sentiment by brand/competitor × platform (positive share) ----
  const sentimentGroups = [
    { label: 'Brand (TikTok)',       f: (v: VideoRow) => !v.is_competitor && v.platform === 'tiktok' },
    { label: 'Brand (YouTube)',      f: (v: VideoRow) => !v.is_competitor && v.platform === 'youtube' },
    { label: 'Competitor (TikTok)',  f: (v: VideoRow) => v.is_competitor  && v.platform === 'tiktok' },
    { label: 'Competitor (YouTube)', f: (v: VideoRow) => v.is_competitor  && v.platform === 'youtube' },
  ].map(({ label, f }) => {
    const group = all.filter(f).filter(v => v.sentiment != null)
    const pos = group.length > 0
      ? Math.round(group.filter(v => v.sentiment === 'positive').length / group.length * 100)
      : null
    return { label, pos, count: group.length }
  }).filter(g => g.count > 0)

  // ---- Audience questions (category = 'question') ----
  const questions = audienceInsights
    .filter(a => a.category === 'question')
    .sort((a, b) => (Number(b.strength_score) || 0) - (Number(a.strength_score) || 0))
    .slice(0, 5)

  // ---- Trending topics (videos.topics) ----
  const topicCounts: Record<string, number> = {}
  for (const v of all) for (const t of v.topics ?? []) topicCounts[t] = (topicCounts[t] ?? 0) + 1
  const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t)

  // ---- Content type performance (classified_type + engagement_rate) ----
  const typeMap: Record<string, { count: number; totalEng: number }> = {}
  for (const v of all) {
    if (!v.classified_type) continue
    typeMap[v.classified_type] ??= { count: 0, totalEng: 0 }
    typeMap[v.classified_type].count++
    typeMap[v.classified_type].totalEng += Number(v.engagement_rate) || 0
  }
  const contentTypes = Object.entries(typeMap)
    .map(([type, { count, totalEng }]) => ({ type, count, avgEng: (totalEng / count).toFixed(1) }))
    .sort((a, b) => Number(b.avgEng) - Number(a.avgEng))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {all.length} videos scraped · {analysed.length} analysed
          {latestRun && <> · latest run {String(runId).slice(0, 8)} · {latestRun.status}</>}
        </p>
      </div>

      {/* Stats row — first card is the filled hero, the rest carry a colour dot */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { label: 'Videos Scraped',    value: String(all.length),     sub: `${analysed.length} analysed`, hero: true },
          { label: 'Total Views',       value: fmt(totalViews),        sub: 'TikTok + YouTube', dot: 'bg-pine' },
          { label: 'Avg Engagement',    value: `${avgEngagement}%`,    sub: `${withEng.length} videos`, dot: 'bg-ochre' },
          { label: 'Overall Sentiment', value: analysed.length ? `${positiveShare}%` : '—', sub: analysed.length ? `positive · ${analysed.length} analysed` : 'no analysed videos', dot: 'bg-positive', accentValue: true },
        ].map(({ label, value, sub, hero, dot, accentValue }) =>
          hero ? (
            <Card key={label} className="stat-hero ring-0 border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-[#CFE3D6]">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white">{value}</div>
                {sub && <p className="text-xs text-[#CFE3D6] mt-1">{sub}</p>}
              </CardContent>
            </Card>
          ) : (
            <Card key={label}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <span className={`size-2 rounded-full ${dot}`} aria-hidden />
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${accentValue ? 'text-positive' : ''}`}>{value}</div>
                {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
              </CardContent>
            </Card>
          ),
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Top videos table */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Top Videos by Views</CardTitle></CardHeader>
          <CardContent>
            {all.length === 0 ? <Empty>No videos scraped for this client yet — gather has not run.</Empty> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs uppercase border-b">
                    {['Platform','Account','Views','Eng.','Sentiment','Type'].map(h => (
                      <th key={h} className={`pb-2 font-medium ${h === 'Platform' || h === 'Account' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {all.slice(0, 8).map(v => (
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="py-2.5 capitalize">{v.platform}</td>
                      <td className="py-2.5">
                        <a href={v.video_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          @{v.account_name}
                        </a>
                      </td>
                      <td className="py-2.5 text-right font-medium">{fmt(Number(v.views) || 0)}</td>
                      <td className="py-2.5 text-right">{v.engagement_rate != null ? `${v.engagement_rate}%` : '—'}</td>
                      <td className="py-2.5 text-right">
                        {v.sentiment
                          ? <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SENTIMENT_BADGE[v.sentiment] ?? 'bg-muted text-muted-foreground'}`}>{v.sentiment}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2.5 text-right">
                        {v.classified_type
                          ? <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${categoryTint(v.classified_type)}`}>{v.classified_type}</span>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Right panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-sm">Sentiment Overview</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {sentimentGroups.length === 0
                ? <Empty>No analysed videos yet. Sentiment needs ≥5 comments per video — Pass A skips the rest.</Empty>
                : sentimentGroups.map(({ label, pos, count }) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{label} <span className="opacity-60">· {count}</span></span>
                      <span className="font-medium text-positive">{pos}% pos</span>
                    </div>
                    <div className="bg-muted rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${pos ?? 0}%`, backgroundColor: greenForPct(pos ?? 0) }} />
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Top Audience Questions</CardTitle></CardHeader>
            <CardContent>
              {questions.length > 0
                ? <ol className="space-y-2">
                    {questions.map((q) => (
                      <li key={q.id} className="text-xs text-muted-foreground">
                        <span className="text-foreground capitalize">{q.theme.replace(/_/g, ' ')}</span>
                        {q.description && <> — {q.description}</>}
                      </li>
                    ))}
                  </ol>
                : <Empty>No question-category insights in the latest run.</Empty>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Topics</CardTitle></CardHeader>
            <CardContent>
              {topTopics.length > 0
                ? <div className="flex flex-wrap gap-1.5">
                    {topTopics.map((t, i) => (
                      <span key={i} className={`px-2 py-0.5 rounded-full text-xs capitalize ${accentTint(i)}`}>{t}</span>
                    ))}
                  </div>
                : <Empty>No topics classified yet — videos.topics is empty until Pass A runs.</Empty>}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Content type performance */}
      <Card>
        <CardHeader><CardTitle>Content Type Performance</CardTitle></CardHeader>
        <CardContent>
          {contentTypes.length === 0 ? <Empty>No classified videos yet — content type is set by Pass A.</Empty> : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {contentTypes.map(({ type, count, avgEng }, i) => (
                <div key={type} className={`rounded-xl p-4 text-center ${accentTint(i)}`}>
                  <div className="text-2xl font-bold">{avgEng}%</div>
                  <div className="text-sm font-medium capitalize mt-1 text-foreground">{type}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">avg engagement · {count} videos</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
