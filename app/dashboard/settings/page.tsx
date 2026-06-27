import { createAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Settings — read-only view of the client's tracking_configs (what gather is
// told to scrape) + plan. Editing is out of scope for the inspection build;
// this surfaces the config so the data on the other pages can be traced back to
// what was actually tracked.

interface TrackingConfig {
  brand_keywords: string[] | null
  competitor_keywords: string[] | null
  competitor_names: string[] | null
  industry_keywords: string[] | null
  platforms: string[] | null
  report_emails: string[] | null
  report_period: string | null
  report_day: string | null
  max_videos: number | null
  max_comments: number | null
  comment_depth: number | null
}

function Chips({ items, empty }: { items: string[] | null; empty: string }) {
  if (!items || items.length === 0) return <p className="text-xs text-muted-foreground italic">{empty}</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => <span key={i} className="px-2 py-0.5 bg-muted rounded text-xs">{t}</span>)}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value ?? <span className="text-muted-foreground italic">not set</span>}</span>
    </div>
  )
}

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('client_id').eq('id', user.id).single()
  if (!profile) return <div className="p-4 text-muted-foreground">No client profile found.</div>
  const clientId = profile.client_id

  const [{ data: client }, { data: cfg }] = await Promise.all([
    admin.from('clients').select('company_name, plan').eq('id', clientId).maybeSingle(),
    admin.from('tracking_configs').select('*').eq('client_id', clientId).maybeSingle(),
  ])
  const c = cfg as TrackingConfig | null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          {client?.company_name ?? 'Client'}{client?.plan ? ` · ${client.plan} plan` : ''}
        </p>
      </div>

      {!c ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No tracking config for this client — gather has nothing to scrape until this is set.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Platforms</CardTitle></CardHeader>
              <CardContent><Chips items={c.platforms} empty="No platforms selected." /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Competitors</CardTitle></CardHeader>
              <CardContent><Chips items={c.competitor_names} empty="No competitors named." /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Brand Keywords</CardTitle></CardHeader>
              <CardContent><Chips items={c.brand_keywords} empty="No brand keywords." /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Competitor Keywords</CardTitle></CardHeader>
              <CardContent><Chips items={c.competitor_keywords} empty="No competitor keywords." /></CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-sm">Industry Keywords</CardTitle></CardHeader>
              <CardContent><Chips items={c.industry_keywords} empty="No industry keywords." /></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm">Scrape &amp; Report Config</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Field label="Max videos / run" value={c.max_videos} />
              <Field label="Max comments / video" value={c.max_comments} />
              <Field label="Comment depth" value={c.comment_depth} />
              <Field label="Report period" value={c.report_period} />
              <Field label="Report day" value={c.report_day} />
              <Field label="Report emails" value={c.report_emails?.length ? c.report_emails.join(', ') : null} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
