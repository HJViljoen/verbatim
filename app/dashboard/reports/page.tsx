import { createAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Reports — past weekly reports from weekly_reports. The weekly-email generator
// isn't built yet (deferred post-v1), so this list is empty until reports are
// produced; the page surfaces them once they exist.

interface WeeklyReport {
  id: string
  subject: string | null
  week_start: string | null
  week_end: string | null
  sent_to: string[] | null
  sent_at: string | null
}

export default async function ReportsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('client_id').eq('id', user.id).single()
  if (!profile) return <div className="p-4 text-muted-foreground">No client profile found.</div>

  const { data } = await admin.from('weekly_reports')
    .select('id, subject, week_start, week_end, sent_to, sent_at')
    .eq('client_id', profile.client_id).order('sent_at', { ascending: false })

  const reports = (data ?? []) as WeeklyReport[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground">{reports.length} weekly reports</p>
      </div>

      {reports.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No weekly reports yet. The weekly email report generator is deferred (post-v1) — this list fills once reports are produced.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{r.subject ?? 'Weekly report'}</CardTitle></CardHeader>
              <CardContent>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{r.week_start} – {r.week_end}</span>
                  <span>{r.sent_at ? new Date(r.sent_at).toLocaleDateString() : 'not sent'}</span>
                </div>
                {r.sent_to?.length ? <p className="text-xs text-muted-foreground mt-1">to {r.sent_to.join(', ')}</p> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
