import { canManageTenant, getSessionContext, type SessionContext } from '@/lib/auth'
import { isMissingPublishColumns, onPlatform } from '@/lib/schedules/platform-state'
import { PageTitle } from '@/components/pages/studio/ui'
import { YourReports } from '@/components/pages/studio/your-reports'
import { PastIssues } from '@/components/pages/studio/past-issues'
import { ReportViewer } from '@/components/reports/report-viewer'
import { loadViewerSnapshot, viewerHref, type ViewerSnapshot } from '@/lib/reports/viewer'
import { mayReadHeld, snapshotHeld } from '@/lib/reports/held'
import { PRIVACY_LINE } from '@/lib/reading/method'
import { pastIssues, shownStudioRows, studioRows, type StudioMember, type StudioSchedule, type StudioSend } from '@/lib/pages/studio'
import { rows as readRows } from '@/lib/pages/read'
import { createAdminClient } from '@/lib/supabase-admin'
import { OperatorWorkbench } from './workbench'
import type { Metadata } from 'next'
import { surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('studio').label }

// THE STUDIO, OPEN TO CLIENTS (pages build, 1 Oct; the Page-Studio artboard).
// Reports folds in here: "Your reports" (the weekly and the four monthly
// briefs, who gets each, the latest issue, Recipients for owners and admins)
// and, once anything has gone out, the past issues to open, download and
// share. The `studioRedirect` bounce to Reports is gone: Reports now redirects
// here (NAV), and the two together would loop.
//
// OPERATOR-ONLY BELOW. Build, templates, catalogue, custom reports, the review
// controls and Send are the operator's workbench (`./workbench.tsx`), drawn
// only where `session.operator` is set, and the routes behind it (`/new`,
// `/edit`) send anyone else back here.
//
// DEEP LINKS KEEP WORKING. `?view=<snapshot>` opens the viewer over the page;
// `?group=sent&item=<send>` (Reports' old address for an issue, and the
// workbench's history) opens that issue's snapshot; `?item=` selects a report
// in the workbench.
//
// A BUILD THAT HAS NOT GONE OUT IS NEVER A CLIENT'S (writing back, B1): the
// past issues are sends on the platform only (`sent`, or put on the platform
// without the email, which the row says: lib/schedules/platform-state.ts), and
// the viewer refuses a held snapshot to anyone who may not read held builds
// (`mayReadHeld`, the operator).

export const dynamic = 'force-dynamic'

const BASE = '/dashboard/studio'

interface SendRow extends StudioSend { status: string }

/** The workspace's issues on the platform: every SENT send, and every build
 *  the operator put on the platform without its email (`published_at`,
 *  lib/schedules/publish.ts). A database the publish migration has not
 *  reached is read the old way, sent only. */
async function loadIssueSends(supabase: SessionContext['supabase'], clientId: string) {
  const read = (published: boolean) => {
    const q = supabase.from('report_sends')
      .select(published ? 'id, schedule_id, schedule_name, snapshot_id, artifact_id, subject, sent_at, status, published_at' : 'id, schedule_id, schedule_name, snapshot_id, artifact_id, subject, sent_at, status')
      .eq('client_id', clientId)
    return (published ? q.or('status.eq.sent,published_at.not.is.null') : q.eq('status', 'sent').not('sent_at', 'is', null))
      .order('claimed_at', { ascending: false }).limit(100)
  }
  const res = await read(true)
  return res.error && isMissingPublishColumns(res.error) ? read(false) : res
}

export default async function StudioPage({ searchParams }: { searchParams?: Promise<{ item?: string; view?: string; group?: string }> }) {
  const sp = (await searchParams) ?? {}
  const session = await getSessionContext()
  const { supabase, clientId, role } = session
  const isOperator = session.operator != null

  const [clientRes, scheduleRes, sendRes, memberRes] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    // `*`, not a column list: `artefact` is M8's column, and a select naming
    // it fails outright on a database a migration behind.
    supabase.from('report_schedules').select('*').eq('client_id', clientId).order('created_at'),
    loadIssueSends(supabase, clientId),
    // Names for the recipients: the workspace's own people (Team reads the
    // same rows on the session client).
    supabase.from('users').select('email, full_name').eq('client_id', clientId),
  ])

  const tenant = ((clientRes.data as { company_name?: string | null } | null)?.company_name ?? '').trim() || 'you'
  const schedules = readRows<StudioSchedule & { recipients: string[] | null; artefact?: string | null; starter_key?: string | null }>(scheduleRes, 'studio.schedules')
    .map((s): StudioSchedule => ({
      id: s.id,
      name: s.name ?? '',
      artefact: s.artefact ?? null,
      starter_key: s.starter_key ?? null,
      recipients: s.recipients ?? [],
      active: Boolean(s.active),
    }))
  // Issues on the platform only (sent, or published without the email): a
  // held build stays its reviewer's.
  const sends = readRows<SendRow>(sendRes, 'studio.sends').filter((s) => onPlatform(s) && (s.sent_at || s.published_at))
  const members = readRows<StudioMember>(memberRes, 'studio.members').filter((m) => m.email)

  // The weekly alone until the briefs are built (Heinrich, 1 Oct).
  const rows = shownStudioRows(studioRows({ tenant, schedules, sends, members, now: new Date() }))
  const issues = pastIssues(sends, schedules)

  // The viewer over the page.
  const fromIssue = sp.group === 'sent' && sp.item ? issues.find((i) => i.id === sp.item)?.snapshotId ?? null : null
  const viewId = sp.view ?? fromIssue
  let viewer: ViewerSnapshot | null = null
  if (viewId && (mayReadHeld(session, clientId) || !(await snapshotHeld(createAdminClient(), clientId, viewId)))) {
    viewer = await loadViewerSnapshot(createAdminClient(), clientId, viewId)
  }
  const keep = { item: sp.group === 'sent' ? undefined : sp.item }
  const openHref = (snapshotId: string) => viewerHref(BASE, keep, snapshotId)
  const closeHref = viewerHref(BASE, keep, null)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[22px] text-[#26292C]">
      <PageTitle title={surface('studio').label} />
      <YourReports rows={rows} canEdit={canManageTenant(role)} privacy={PRIVACY_LINE} />
      <PastIssues issues={issues} openHref={openHref} />
      {isOperator ? <OperatorWorkbench session={session} sp={{ item: sp.group === 'sent' ? undefined : sp.item }} /> : null}
      {viewer && <ReportViewer snapshot={viewer} closeHref={closeHref} showStudio={isOperator} />}
    </div>
  )
}
