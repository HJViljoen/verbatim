import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSessionContext } from '@/lib/auth'

// A single stored report, rendered in-browser (Redesign Spec §7). The stored
// HTML is a self-contained email document, so it renders inside a sandboxed
// iframe rather than being injected into the page; a <base target="_blank">
// makes its deep links open in a full tab instead of navigating the frame.

export default async function ReportViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Auth + tenant via the RLS-enforced session client. See lib/auth.ts.
  const { supabase, clientId } = await getSessionContext()

  const { data } = await supabase.from('weekly_reports')
    .select('subject, html_content, week_start, week_end')
    .eq('client_id', clientId).eq('id', id).maybeSingle()

  if (!data?.html_content) notFound()

  const html = String(data.html_content).replace(/<head>/i, '<head><base target="_blank">')

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/reports" className="text-xs font-medium text-muted-foreground hover:text-primary">
          ← All reports
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{data.subject ?? 'Report'}</h1>
        <p className="text-sm text-muted-foreground">{data.week_start} – {data.week_end}</p>
      </div>

      <iframe
        srcDoc={html}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        title={data.subject ?? 'Report'}
        className="h-[80vh] w-full rounded-xl border bg-transparent"
      />
    </div>
  )
}
