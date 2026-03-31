import { createAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Get client_id for this user
  const { data: profile } = await admin
    .from('users')
    .select('client_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return (
      <div className="p-4 text-muted-foreground">
        No client profile found for your account. Please contact support.
      </div>
    )
  }

  const clientId = profile.client_id

  // Fetch all videos for this client
  const { data: videos } = await admin
    .from('videos')
    .select('*')
    .eq('client_id', clientId)
    .order('views', { ascending: false })

  const all = videos ?? []

  // Stats
  const tiktokCount = all.filter(v => v.platform === 'tiktok').length
  const youtubeCount = all.filter(v => v.platform === 'youtube').length

  const withSentiment = all.filter(v => v.positive_pct !== null)
  const avg = (field: string) =>
    withSentiment.length > 0
      ? Math.round(withSentiment.reduce((s, v) => s + Number(v[field]), 0) / withSentiment.length)
      : 0

  const avgPositive = avg('positive_pct')
  const avgNeutral = avg('neutral_pct')
  const avgNegative = avg('negative_pct')

  const topVideo = all[0]

  // Aggregate questions and topics
  const questionCounts: Record<string, number> = {}
  const topicCounts: Record<string, number> = {}

  for (const v of all) {
    for (const q of v.common_questions ?? []) questionCounts[q] = (questionCounts[q] ?? 0) + 1
    for (const t of v.common_topics ?? []) topicCounts[t] = (topicCounts[t] ?? 0) + 1
  }

  const topQuestions = Object.entries(questionCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([q]) => q)
  const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t)

  // Content type breakdown
  const contentTypes: Record<string, number> = {}
  for (const v of all) {
    if (v.classified_type) contentTypes[v.classified_type] = (contentTypes[v.classified_type] ?? 0) + 1
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Weekly social media intelligence overview</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Videos Analysed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{all.length}</div>
            <p className="text-xs text-muted-foreground mt-1">{tiktokCount} TikTok · {youtubeCount} YouTube</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Positive Sentiment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{avgPositive}%</div>
            <p className="text-xs text-muted-foreground mt-1">Across {withSentiment.length} videos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top Video Views</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{topVideo ? Number(topVideo.views).toLocaleString() : '—'}</div>
            <p className="text-xs text-muted-foreground mt-1 capitalize">{topVideo?.platform ?? ''}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Topics Identified</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{topTopics.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Unique topics this week</p>
          </CardContent>
        </Card>
      </div>

      {/* Sentiment breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Sentiment Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: 'Positive', value: avgPositive, color: 'bg-green-500' },
            { label: 'Neutral', value: avgNeutral, color: 'bg-yellow-400' },
            { label: 'Negative', value: avgNegative, color: 'bg-red-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-20 text-sm text-muted-foreground">{label}</span>
              <div className="flex-1 bg-muted rounded-full h-2.5">
                <div className={`${color} h-2.5 rounded-full`} style={{ width: `${value}%` }} />
              </div>
              <span className="w-10 text-sm font-medium text-right">{value}%</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Questions and Topics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Top Questions Being Asked</CardTitle>
          </CardHeader>
          <CardContent>
            {topQuestions.length > 0 ? (
              <ol className="space-y-2">
                {topQuestions.map((q, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground text-sm">No questions recorded this week.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trending Topics</CardTitle>
          </CardHeader>
          <CardContent>
            {topTopics.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {topTopics.map((topic, i) => (
                  <span key={i} className="px-2.5 py-1 bg-muted rounded-full text-sm capitalize">
                    {topic}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No topics recorded this week.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top video */}
      {topVideo && (
        <Card>
          <CardHeader>
            <CardTitle>Top Video This Week</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {[topVideo.platform, topVideo.classified_type, topVideo.hook_style].filter(Boolean).map((tag, i) => (
                <span key={i} className="px-2 py-0.5 bg-muted rounded text-xs font-medium capitalize">{tag}</span>
              ))}
            </div>
            <p className="font-medium">{topVideo.caption ?? topVideo.account_name}</p>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>{Number(topVideo.views).toLocaleString()} views</span>
              <span>{topVideo.likes} likes</span>
              <span>{topVideo.comments_count} comments</span>
              <span>{topVideo.engagement_rate}% engagement</span>
            </div>
            {topVideo.context_insights && (
              <p className="text-sm text-muted-foreground italic border-l-2 pl-3 mt-1">{topVideo.context_insights}</p>
            )}
            <a href={topVideo.video_url} target="_blank" rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline inline-block">
              View video →
            </a>
          </CardContent>
        </Card>
      )}

      {/* Content types */}
      <Card>
        <CardHeader>
          <CardTitle>Content Types</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(contentTypes).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2 bg-muted px-3 py-2 rounded-lg">
                <span className="text-sm font-medium capitalize">{type}</span>
                <span className="text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded-full">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}