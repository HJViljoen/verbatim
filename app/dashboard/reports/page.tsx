import Link from 'next/link'
import { getSessionContext } from '@/lib/auth'
import { Card, CardContent } from '@/components/ui/card'

// Reports — "what changed, week by week" (Redesign Spec §7). The archive of
// every periodic report, viewable in-browser: the email is the delta surface,
// this page is its permanent record. List here, full report at reports/[id].

interface WeeklyReport {
  id: string
  subject: string | null
  week_start: string | null
  week_end: string | null
  sent_to: string[] | null
  sent_at: string | null
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null

export default async function ReportsPage() {
  // Auth + tenant via the RLS-enforced session client. See lib/auth.ts.
  const { supabase, clientId } = await getSessionContext()

  const { data } = await supabase.from('weekly_reports')
    .select('id, subject, week_start, week_end, sent_to, sent_at')
    .eq('client_id', clientId).order('week_end', { ascending: false })

  const reports = (data ?? []) as WeeklyReport[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground italic">&ldquo;What changed, week by week?&rdquo;</p>
      </div>

      {reports.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Your reports will appear here after each update — the first lands with your next one.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Link key={r.id} href={`/dashboard/reports/${r.id}`} className="block group">
              <Card className="transition-colors group-hover:border-primary/40">
                <CardContent className="py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm font-semibold group-hover:text-primary">
                      {r.subject ?? 'Report'}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtDate(r.week_end) ?? '—'}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>{fmtDate(r.week_start)} – {fmtDate(r.week_end)}</span>
                    <span>{r.sent_at ? `emailed ${fmtDate(r.sent_at)}` : 'viewable here'}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
