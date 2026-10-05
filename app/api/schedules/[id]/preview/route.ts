import { getRouteSession } from '@/lib/auth'
import { mayBuildReports } from '@/lib/studio-visibility'
import { createAdminClient } from '@/lib/supabase-admin'
import { appBaseUrl } from '@/lib/site'
import { hydrateSnapshot, loadSnapshot } from '@/lib/snapshots'
import { renderDigestEmail } from '@/lib/email/digest'
import { renderDocumentEmail } from '@/lib/email/document-brief'
import { loadEdits } from '@/lib/reports/documents/edits'
import { isDocumentData } from '@/lib/reports/documents/types'
import { isWeeklyData } from '@/lib/reports/weekly-build'
import { isMonthlyData } from '@/lib/reports/monthly-build'
import { renderWeeklyEmail } from '@/lib/email/weekly'
import { renderMonthlyEmail } from '@/lib/email/monthly'
import { isQuarterlyData } from '@/lib/reports/quarterly-build'
import { renderQuarterlyEmail } from '@/lib/email/quarterly'
import { isWeeklyReadData } from '@/lib/reports/weekly-read-build'
import { renderWeeklyReadEmail } from '@/lib/email/weekly-read'
import { runSchedule } from '@/lib/schedules/run'
import { mayReadHeld } from '@/lib/reports/held'
import { isMissingPublishColumns, onPlatform, type PlatformSendState } from '@/lib/schedules/platform-state'
import type { ScheduleRow } from '@/lib/schedules/types'
import type { ReportSnapshotData } from '@/lib/reports/types'

// GET /api/schedules/[id]/preview[?send=<report_sends.id>] — the email as HTML,
// for a sandboxed iframe in the app (Stage 3).
//
//   with ?send   → "the email as sent": re-rendered from that send's snapshot
//                  (quotes resolve live, so an erased voice is gone; the
//                  inline sparkline images are not re-attached here)
//   without      → a dry preview at the workspace's current data: loaders +
//                  cover, no PDF, no link, no send, no rows left behind
//
// A client reads an issue once it is ON THE PLATFORM (`?send=` of a send that
// is sent, or that the operator published without its email: `onPlatform`,
// the rule the Studio's past issues, `heldOf` and the snapshots' RLS read);
// the dry preview at today's data is the operator's (integration, 1 Oct;
// lead's ruling 6: `mayBuildReports`), as building and sending are.

export const runtime = 'nodejs'
export const maxDuration = 300

const page = (html: string, status = 200) => new Response(html.replace(/<head>/i, '<head><base target="_blank">'), { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } })
const note = (text: string, status: number) => page(`<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#6E7378;font-size:13px;padding:24px">${text}</body></html>`, status)

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getRouteSession()
  if (!session) return note('Not signed in.', 401)
  const { id } = await params
  const admin = createAdminClient()
  const { data: schedule } = await admin.from('report_schedules').select('*').eq('id', id).eq('client_id', session.clientId).maybeSingle()
  if (!schedule) return note('No such schedule.', 404)
  const s = schedule as ScheduleRow
  const sendId = new URL(request.url).searchParams.get('send')
  // A BUILD THAT HAS NOT GONE OUT IS ITS REVIEWER'S (lib/reports/held.ts):
  // to anyone else, a send shows only once it is on the platform (sent, or
  // published without its email), and a schedule whose builds wait for review
  // has no preview at today's data (it would be the held build, rebuilt).
  const readsHeld = mayReadHeld(session, session.clientId)
  const HELD = 'This report shows here once it has been sent.'

  if (sendId) {
    // With `published_at`, or without it on a database the publish migration
    // has not reached (every row then reads unpublished, which each one is).
    const readSend = (cols: string) => admin.from('report_sends').select(cols).eq('id', sendId).eq('schedule_id', id).eq('client_id', session.clientId).maybeSingle()
    let sendRes = await readSend('snapshot_id, share_link_id, status, published_at')
    if (sendRes.error && isMissingPublishColumns(sendRes.error)) sendRes = await readSend('snapshot_id, share_link_id, status')
    const send = sendRes.data as unknown as (PlatformSendState & { snapshot_id: string | null; share_link_id: string | null }) | null
    if (!readsHeld && !(send && onPlatform(send))) return note(HELD, 404)
    const sid = send?.snapshot_id
    const row = sid ? await loadSnapshot(admin, sid) : null
    if (!row || row.kind !== 'report') return note('This send has no stored build to show.', 404)
    const data = await hydrateSnapshot<ReportSnapshotData>(admin, row)
    let shareUrl: string | null = null
    const linkId = send?.share_link_id
    if (linkId) {
      const { data: link } = await admin.from('share_links').select('token, revoked_at').eq('id', linkId).maybeSingle()
      const l = link as { token: string; revoked_at: string | null } | null
      if (l && !l.revoked_at) shareUrl = `${appBaseUrl()}/r/${l.token}`
    }
    // THE EMAIL AS SENT, for a weekly artefact: re-rendered from the stored
    // reading, with the quotes resolved live — so an erased voice is gone from
    // "what went out" at the next look, which is the whole reason no body is
    // ever stored.
    if (isWeeklyData(data)) {
      return page(renderWeeklyEmail({ data, shareUrl, appUrl: appBaseUrl(), attached: s.attach_pdf }).html)
    }
    // The weekly read: the email exactly as it goes (or went) out, which is
    // what the operator reads on a held send before pressing Send.
    if (isWeeklyReadData(data)) {
      return page(renderWeeklyReadEmail({ data, shareUrl, appUrl: appBaseUrl(), attached: s.attach_pdf }).html)
    }
    if (isMonthlyData(data)) {
      return page(renderMonthlyEmail({ data, shareUrl, appUrl: appBaseUrl(), attached: s.attach_pdf }).html)
    }
    if (isQuarterlyData(data)) {
      return page(renderQuarterlyEmail({ data, shareUrl, appUrl: appBaseUrl(), attached: s.attach_pdf }).html)
    }
    if (isDocumentData(data)) {
      // Edits are read fresh: an edit made a minute ago shows on the next open.
      const edits = await loadEdits(admin, row.id)
      return page(renderDocumentEmail({ data, edits, shareUrl, appUrl: appBaseUrl(), attached: s.attach_pdf }).html)
    }
    return page(renderDigestEmail({ data, shareUrl, appUrl: appBaseUrl(), attached: s.attach_pdf, cadenceWord: s.cadence === 'monthly' ? 'monthly' : 'weekly' }).html)
  }

  if (!readsHeld && s.review) return note(HELD, 403)
  // The dry preview builds today's issue: the operator's alone.
  if (!mayBuildReports(session)) return note(HELD, 403)

  // A written report is not built here: writing one costs money and minutes.
  // The dry preview shows the email over the last brief this report built.
  if (s.report_id) {
    const { data: report } = await admin.from('reports').select('kind, latest_snapshot_id').eq('id', s.report_id).eq('client_id', session.clientId).maybeSingle()
    const r = report as { kind: string | null; latest_snapshot_id: string | null } | null
    if (r?.kind === 'document') {
      const row = r.latest_snapshot_id ? await loadSnapshot(admin, r.latest_snapshot_id) : null
      if (!row) return note('Nothing to show yet. Build this report once, and the email shows what would go out.', 409)
      const data = await hydrateSnapshot<ReportSnapshotData>(admin, row)
      if (!isDocumentData(data)) return note('This send has no stored build to show.', 404)
      const edits = await loadEdits(admin, row.id)
      return page(renderDocumentEmail({ data, edits, shareUrl: null, appUrl: appBaseUrl(), attached: s.attach_pdf }).html)
    }
  }

  const { data: run } = await admin.from('pipeline_runs').select('id').eq('client_id', session.clientId).in('status', ['completed', 'partial']).order('completed_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
  const runId = (run as { id: string } | null)?.id
  if (!runId) return note('Nothing to show yet — your first update has not landed.', 409)
  // Already out for this update (sent, or published to the platform without
  // its email)? Show that — free, and exactly what the client has.
  const readLatest = (published: boolean) => {
    const q = admin.from('report_sends').select('id').eq('schedule_id', id).eq('run_id', runId).not('snapshot_id', 'is', null)
    return (published ? q.or('status.eq.sent,published_at.not.is.null') : q.eq('status', 'sent'))
      .order('claimed_at', { ascending: false }).limit(1).maybeSingle()
  }
  let latestRes = await readLatest(true)
  if (latestRes.error && isMissingPublishColumns(latestRes.error)) latestRes = await readLatest(false)
  const latest = latestRes.data
  const latestId = (latest as { id: string } | null)?.id
  if (latestId) return Response.redirect(new URL(`/api/schedules/${id}/preview?send=${latestId}`, request.url), 307)
  const r = await runSchedule({ admin, schedule: s, runId, baseUrl: appBaseUrl(), mode: 'preview' })
  if (r.status !== 'preview' || !r.html) return note(r.error ?? 'Could not build the preview.', 500)
  return page(r.html)
}
