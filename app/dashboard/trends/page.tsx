import { createAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Trends — longitudinal view across runs. Real trend lines need persistent theme
// IDs carried across runs (theme genealogy), which is a v5 feature; until then
// there's nothing to trend. This page shows the runs on record and is explicit
// about why the trend view is empty rather than faking a chart.

interface RunRow {
  id: string
  status: string | null
  started_at: string | null
  completed_at: string | null
  videos_scraped: number | null
}

export default async function TrendsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('client_id').eq('id', user.id).single()
  if (!profile) return <div className="p-4 text-muted-foreground">No client profile found.</div>

  const { data } = await admin.from('pipeline_runs')
    .select('id, status, started_at, completed_at, videos_scraped')
    .eq('client_id', profile.client_id).order('started_at', { ascending: false })

  const runs = (data ?? []) as RunRow[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Trends</h1>
        <p className="text-sm text-muted-foreground">{runs.length} runs on record</p>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground italic">
            Trend lines need persistent theme IDs carried across runs (theme genealogy) — a v5 feature.
            Until then themes are clustered per-run and can&apos;t be tracked over time, so there&apos;s nothing to trend.
            The runs below are what longitudinal analysis will eventually draw from.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Pipeline Runs</CardTitle></CardHeader>
        <CardContent>
          {runs.length === 0 ? <p className="text-xs text-muted-foreground italic">No runs yet.</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs uppercase border-b">
                  {['Run','Status','Started','Videos'].map(h => (
                    <th key={h} className={`pb-2 font-medium ${h === 'Videos' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{r.id.slice(0, 8)}</td>
                    <td className="py-2 text-xs capitalize">{r.status ?? '—'}</td>
                    <td className="py-2 text-xs text-muted-foreground">{r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td>
                    <td className="py-2 text-right text-xs">{r.videos_scraped ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
