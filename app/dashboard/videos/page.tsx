import { selectAll } from '@/lib/supabase-admin'
import { getSessionContext } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SENTIMENT_BADGE } from '@/lib/ui-colors'

// Content Analysis — the full video catalog with Pass A classification
// (classified_type, hook_style, sentiment, topics) plus hook-style and
// content-type performance aggregated from the catalog. Read-only server
// component. Competitor content-gap / recommended-hook analysis is not produced
// by the pipeline yet — flagged inline rather than faked.

interface VideoRow {
  id: string
  platform: string
  account_name: string
  video_url: string
  views: number | null
  engagement_rate: number | null
  is_client: boolean
  is_competitor: boolean
  competitor_name: string | null
  sentiment: string | null
  classified_type: string | null
  hook_style: string | null
  content_format: string | null
  topics: string[] | null
}

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(0)}K`
  : String(n)


// Aggregate avg engagement + count by a classification field.
function perfBy(videos: VideoRow[], key: 'hook_style' | 'classified_type') {
  const map: Record<string, { count: number; eng: number; engN: number }> = {}
  for (const v of videos) {
    const k = v[key]
    if (!k) continue
    map[k] ??= { count: 0, eng: 0, engN: 0 }
    map[k].count++
    if (Number(v.engagement_rate) > 0) { map[k].eng += Number(v.engagement_rate); map[k].engN++ }
  }
  return Object.entries(map)
    .map(([k, { count, eng, engN }]) => ({ k, count, avgEng: engN > 0 ? (eng / engN).toFixed(1) : null }))
    .sort((a, b) => Number(b.avgEng ?? -1) - Number(a.avgEng ?? -1))
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground italic">{children}</p>
}

export default async function ContentAnalysisPage() {
  // Auth + tenant via the RLS-enforced session client. See lib/auth.ts.
  const { supabase, clientId } = await getSessionContext()

  const all = await selectAll<VideoRow>(() => supabase.from('videos')
    .select('id, platform, account_name, video_url, views, engagement_rate, is_client, is_competitor, competitor_name, sentiment, classified_type, hook_style, content_format, topics')
    .eq('client_id', clientId).order('views', { ascending: false }).order('id', { ascending: true }))
  const analysed = all.filter(v => v.classified_type != null)
  const hookPerf = perfBy(analysed, 'hook_style')
  const typePerf = perfBy(analysed, 'classified_type')

  const roleOf = (v: VideoRow) =>
    v.is_client ? 'brand' : v.is_competitor ? (v.competitor_name ?? 'competitor') : 'industry'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Content Analysis</h1>
        <p className="text-sm text-muted-foreground">{all.length} videos · {analysed.length} classified by Pass A</p>
      </div>

      {/* Hook + type performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Hook Style Performance</CardTitle>
            <p className="text-[11px] text-muted-foreground italic mt-1">
              Inferred from caption &amp; comments only — the model never sees the video, so hook style is a weak signal. Reliable hook detection needs transcription/vision (v5).
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {hookPerf.length === 0 ? <Empty>No classified videos — hook_style is set by Pass A.</Empty>
              : hookPerf.map(({ k, count, avgEng }) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="capitalize">{k.replace(/-/g, ' ')} <span className="text-muted-foreground">· {count}</span></span>
                  <span className="font-medium">{avgEng != null ? `${avgEng}%` : '—'}</span>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Content Type Performance</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {typePerf.length === 0 ? <Empty>No classified videos — classified_type is set by Pass A.</Empty>
              : typePerf.map(({ k, count, avgEng }) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="capitalize">{k.replace(/-/g, ' ')} <span className="text-muted-foreground">· {count}</span></span>
                  <span className="font-medium">{avgEng != null ? `${avgEng}%` : '—'}</span>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="py-3">
          <Empty>Competitor content-gap analysis &amp; recommended hooks are not produced by the pipeline yet (no dedicated pass) — they fill once gather scrapes brand/competitor accounts.</Empty>
        </CardContent>
      </Card>

      {/* Video catalog */}
      <Card>
        <CardHeader><CardTitle>Video Catalog</CardTitle></CardHeader>
        <CardContent>
          {all.length === 0 ? <Empty>No videos scraped for this client yet.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs uppercase border-b">
                    {['Platform','Account','Role','Views','Eng.','Sentiment','Type','Hook','Topics'].map(h => (
                      <th key={h} className={`pb-2 font-medium ${['Views','Eng.'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {all.map(v => (
                    <tr key={v.id} className="border-b last:border-0 align-top">
                      <td className="py-2 capitalize">{v.platform}</td>
                      <td className="py-2">
                        <a href={v.video_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">@{v.account_name}</a>
                      </td>
                      <td className="py-2 capitalize text-xs text-muted-foreground">{roleOf(v)}</td>
                      <td className="py-2 text-right">{v.views != null ? fmt(Number(v.views)) : '—'}</td>
                      <td className="py-2 text-right">{v.engagement_rate != null ? `${v.engagement_rate}%` : '—'}</td>
                      <td className="py-2">{v.sentiment ? <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SENTIMENT_BADGE[v.sentiment] ?? 'bg-muted text-muted-foreground'}`}>{v.sentiment}</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2 capitalize text-xs">{v.classified_type ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2 capitalize text-xs">{v.hook_style?.replace(/-/g, ' ') ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2 text-xs text-muted-foreground">{(v.topics ?? []).slice(0, 3).join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
