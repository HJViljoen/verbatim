import Link from 'next/link'
import { canManageTenant, type SessionContext } from '@/lib/auth'
import { isMissingPublishColumns, onPlatform, publishedNotEmailed, PUBLISHED_NOT_EMAILED } from '@/lib/schedules/platform-state'
import type { ReactNode } from 'react'
import { Card } from '@/components/pages/studio/ui'
import { GO, ROW, STACK, STACK_CELL, STACK_HEAD, STACK_ROW, TBL, TD, TH } from '@/components/v2/look'
import { EmptyBox, GoLink, StatStrip, type StatItem } from '@/components/v2/ui'
import { BuildButton } from '@/components/reports/build-button'
import { DocumentBuildControl } from '@/components/documents/build-control'
import { BUILD_ACTIVE, type ReportBuildRow, type ReportKind } from '@/lib/reports/types'
import { BUILD_COLS, BUILD_PHASE_WORDS } from '@/lib/reports/documents/builds'
import { documentTemplate } from '@/lib/reports/documents/templates'
import { DeleteReport } from '@/components/reports/delete-report'
import { ShareLinks, type ShareLinkView } from '@/components/reports/share-links'
import { viewerHref } from '@/lib/reports/viewer'
import { ScheduleForm } from '@/components/schedules/schedule-form'
import { createAdminClient } from '@/lib/supabase-admin'
import { getBaseUrl } from '@/lib/site'
import { coverPlainText } from '@/lib/reports/cover'
import { catalogueTitle } from '@/lib/reports/catalogue'
import { AUDIENCES, type CoverSpec, type CoverText, type FigureTable, type ReportSection } from '@/lib/reports/types'
import { CADENCES, type ScheduleRow } from '@/lib/schedules/types'
import { artefactTitle, scheduleArtefact, sendsArtefact } from '@/lib/schedules/artefact'
import { reviewAudience } from '@/lib/schedules/members'
import { sendFailureSentence } from '@/lib/schedules/copy'
import { claimDecision } from '@/lib/schedules/claim'
import { cn } from '@/lib/utils'

// THE OPERATOR'S WORKBENCH (pages build, 1 Oct). The Studio opened to clients
// with "Your reports" and the past issues on top; everything below is the
// operator's and is drawn for nobody else (the page asks `session.operator`):
// build, templates, catalogue, custom reports, the review controls and Send.
// It is the Studio as it was before the split, minus its own page bar and
// viewer, which the page now owns.
//
// The Studio (Heinrich, 2026-08-30): your reports down the left, the one you
// picked on the right. A report is a template of your own (pages, tiles,
// who it is written for) plus its sending (who gets it after which updates,
// PDF attached, share link inside). New report = pick a template or go
// custom. Reports (the other page) is the archive of what went out.
//
// SINCE THE AUDIT DESIGN (7 Nov, Studio.dc.html, its lower half): one tile
// that flows with the page, no panes that scroll on their own: "Build and
// send" with "New report" a link, the reports a table (Report, Written,
// Sends to; the open one lit, `aria-current`), then the open report under
// it: its title and actions, a figures row (Written for, Sections, Built or
// draft with the last edit, Sends), Sending in an inner box (the form),
// Sends a table (Issue, Outcome, When), Builds with their links, Share. No
// mono, no capitals, no " · ". The one yellow is the form's Save (or Send it
// while a build waits). What each control does is unchanged.

const BASE = '/dashboard/studio'
const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const fmtBytes = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`)

interface Report { id: string; kind: ReportKind; template_key: string | null; title: string; audience: string; cover: CoverSpec; status: 'draft' | 'built'; sections: ReportSection[]; latest_snapshot_id: string | null; updated_at: string }
interface BuildRow { id: string; title: string; created_at: string; cover: CoverText | null; figures: FigureTable | null; artifacts: { id: string; format: string; bytes: number; stale: boolean; rendered_at: string; version: number }[] }
export interface SendRow { id: string; schedule_id: string | null; status: string; subject: string | null; recipients: string[]; sent_at: string | null; claimed_at: string; error: string | null; ready_at: string | null; approved_by: string | null; snapshot_id: string | null; published_at?: string | null }

const SEND_COLS = 'id, schedule_id, status, subject, recipients, sent_at, claimed_at, error, ready_at, approved_by, snapshot_id'

/** The schedule's sends, with when each was put on the platform without its
 *  email (`published_at`); a database the publish migration has not reached
 *  is read without it, and every row reads unpublished. */
async function loadSends(supabase: SessionContext['supabase'], clientId: string) {
  const read = (cols: string) => supabase.from('report_sends').select(cols).eq('client_id', clientId).order('claimed_at', { ascending: false }).limit(100)
  const res = await read(`${SEND_COLS}, published_at`)
  return res.error && isMissingPublishColumns(res.error) ? read(SEND_COLS) : res
}

/** A send's row in the schedule's history: what happened, and when. */
function sendRow(s: SendRow, nameOf: ReadonlyMap<string, string>): { outcome: string; when: string } {
  if (s.status === 'sent' && s.sent_at) return { outcome: `Sent to ${s.recipients.length}${s.approved_by ? `, by ${nameOf.get(s.approved_by) ?? 'a teammate'}` : ''}`, when: fmtWhen(s.sent_at) }
  if (publishedNotEmailed(s) && s.published_at) return { outcome: PUBLISHED_NOT_EMAILED.split(' \u00b7 ').join(', '), when: fmtWhen(s.published_at) }
  if (s.status === 'failed') return { outcome: `Did not send: ${sendFailureSentence(s.error)}`, when: fmtWhen(s.claimed_at) }
  if (s.status === 'ready') return { outcome: 'Ready for review', when: fmtWhen(s.ready_at ?? s.claimed_at) }
  return { outcome: s.status.charAt(0).toUpperCase() + s.status.slice(1), when: fmtWhen(s.claimed_at) }
}

/** The schedule's sends as the board's table: the issue (its page where it
 *  went out), what happened, when. */
export function SendsTable({ history, nameOf }: { history: SendRow[]; nameOf: ReadonlyMap<string, string> }) {
  return (
    <div>
      <h4 className="m-0 mb-1.5 text-[16px] font-semibold">Sends</h4>
      <table className={cn(TBL, STACK, 'text-[14.5px]')}>
        <thead className={STACK_HEAD}>
          <tr>
            <th scope="col" className={TH}>Issue</th>
            <th scope="col" className={cn(TH, 'w-[220px]')}>Outcome</th>
            <th scope="col" className={cn(TH, 'w-[150px] pr-0')}>When</th>
          </tr>
        </thead>
        <tbody className={STACK}>
          {history.map((s) => {
            const row = sendRow(s, nameOf)
            return (
              <tr key={s.id} className={STACK_ROW}>
                <td className={cn(TD, STACK_CELL)}>
                  {/* Only an issue on the platform (sent, or put there without
                      its email) opens at `?group=sent&item=`; a ready, skipped,
                      failed or claimed send has nothing there, so it is plain
                      text (the operator pass, 8 Nov: main linked them too, to
                      the same address, which opened nothing). */}
                  {onPlatform(s)
                    ? <Link href={`/dashboard/studio?group=sent&item=${s.id}`} className={ROW}>{s.subject ?? 'Update'}</Link>
                    : <span className="font-semibold">{s.subject ?? 'Update'}</span>}
                </td>
                <td className={cn(TD, STACK_CELL, s.status === 'sent' ? '' : 'text-muted-foreground')}>{row.outcome}</td>
                <td className={cn(TD, STACK_CELL, 'pr-0 tabular-nums')}>{row.when}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** A part of the open report under its heading. */
function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="m-0 mb-2.5 text-[16px] font-semibold">{title}</h4>
      {children}
    </div>
  )
}

const readerOf = (r: Pick<Report, 'audience' | 'cover'>) => r.cover?.reader?.trim() || AUDIENCES.find((a) => a.key === r.audience)?.label || 'General'
const pagesOf = (sections: { page: string }[]) => [...new Set(sections.map((s) => catalogueTitle(s.page)))]

export async function OperatorWorkbench({ session, sp }: { session: SessionContext; sp: { item?: string } }) {
  const { supabase, clientId, role, email } = session
  const canManage = canManageTenant(role)

  const [{ data: reportData }, { data: scheduleData }, { data: sendData }, { data: runData }] = await Promise.all([
    supabase.from('reports').select('id, kind, template_key, title, audience, cover, status, sections, latest_snapshot_id, updated_at').eq('client_id', clientId).order('created_at'),
    supabase.from('report_schedules').select('*').eq('client_id', clientId),
    loadSends(supabase, clientId),
    supabase.from('pipeline_runs').select('id').eq('client_id', clientId).in('status', ['completed', 'partial']).limit(1),
  ])
  const reports = (reportData ?? []) as Report[]
  const schedules = (scheduleData ?? []) as ScheduleRow[]
  const sends = (sendData ?? []) as unknown as SendRow[]
  const sendable = (runData ?? []).length > 0
  const scheduleOf = new Map(schedules.filter((s) => s.report_id).map((s) => [s.report_id as string, s]))
  // A SCHEDULE THAT SENDS AN ARTEFACT HAS NO `reports` ROW (Phase 1 WP17), and
  // the Studio is the only place any schedule can be read or edited. Listing
  // only `reports` meant that the moment `migrate-schedule-keys --apply` moved
  // a workspace onto the weekly report, its recipients field, Preview, Send now
  // and Active toggle all disappeared and SQL became the only door to the list
  // of people it emails. So an artefact schedule is listed in its own right,
  // under `?item=schedule:<id>`, until WP16's delivery screen takes it over.
  const artefacts = schedules.filter((s) => sendsArtefact(s))
  const artefactKey = (s: ScheduleRow) => `schedule:${s.id}`
  const pickedArtefact = sp.item?.startsWith('schedule:')
    ? artefacts.find((s) => artefactKey(s) === sp.item) ?? null
    : null

  const selectedId = pickedArtefact ? null : sp.item && reports.some((r) => r.id === sp.item) ? sp.item : reports[0]?.id ?? null
  const selected = selectedId ? reports.find((r) => r.id === selectedId) ?? null : null
  const schedule = pickedArtefact ?? (selected ? scheduleOf.get(selected.id) ?? null : null)
  const scheduleSends = schedule ? sends.filter((s) => s.schedule_id === schedule.id) : []
  const history = scheduleSends.slice(0, 6)
  // A build waiting for a person: the newest one, shown to every member.
  // A delivery that died between the claim and the email (a killed render, a
  // redeploy) leaves a `claimed` row with a snapshot behind it and no way in:
  // it is not `ready`, so the block below never appeared, and only the next
  // update would move it. Past the stale window that claim belongs to nobody,
  // and deliverSend already takes it over by its timestamp, so the Studio
  // offers it in the same place, saying plainly that it stopped partway.
  // (claimDecision reads the clock itself; this page is force-dynamic, so it
  // is a fresh read on every request.)
  // The stalled fallback is offered ONLY on the newest send: `claimDecision`
  // calls a cold claim stale forever, and sends are per (schedule, run), so an
  // August hand-send that timed out would still be offered in September, after
  // September's own update had already gone out. Pressing Send would mail last
  // month's brief to the whole list.
  const newest = scheduleSends[0] ?? null
  // A build put on the platform without its email stays `ready`, and Send
  // still emails it; it is offered for that only while it is the schedule's
  // newest build, so a later week's Send can never be followed by an older
  // published week's email to the whole list.
  const readySend =
    scheduleSends.find((s) => s.status === 'ready' && (!s.published_at || s === newest))
    ?? (newest && newest.status === 'claimed' && newest.snapshot_id != null && claimDecision(newest) === 'takeover' ? newest : null)
  const stalled = readySend?.status === 'claimed'
  // Who pressed Send, for the archive line.
  const approverIds = [...new Set(history.map((s) => s.approved_by).filter(Boolean) as string[])]
  let nameOf = new Map<string, string>()
  if (approverIds.length) {
    const { data: people } = await supabase.from('users').select('id, full_name, email').in('id', approverIds)
    nameOf = new Map(((people ?? []) as { id: string; full_name: string | null; email: string }[]).map((p) => [p.id, p.full_name || p.email]))
  }

  let builds: BuildRow[] = []
  let shareLinks: ShareLinkView[] = []
  // A written report's builds are its report_builds rows (phase, cost, the
  // PDF); an edit on a build's snapshot marks it. The share section takes
  // the latest finished build's snapshot.
  let docBuilds: ReportBuildRow[] = []
  let editedSnapshots = new Set<string>()
  const isDocument = selected?.kind === 'document'
  if (selected && isDocument) {
    const { data: db } = await supabase.from('report_builds').select(BUILD_COLS).eq('client_id', clientId).eq('report_id', selected.id).order('started_at', { ascending: false }).limit(12)
    docBuilds = (db ?? []) as ReportBuildRow[]
    const snapIds = docBuilds.map((b) => b.snapshot_id).filter((x): x is string => Boolean(x))
    if (snapIds.length) {
      const { data: ed } = await supabase.from('report_edits').select('snapshot_id').in('snapshot_id', snapIds)
      editedSnapshots = new Set(((ed ?? []) as { snapshot_id: string }[]).map((e) => e.snapshot_id))
    }
  }
  if (selected) {
    const { data: b } = await supabase.from('report_snapshots')
      .select('id, title, created_at, cover:data->cover, figures:data->figures, artifacts(id, format, bytes, stale, rendered_at, version)')
      .eq('client_id', clientId).eq('report_id', selected.id).order('created_at', { ascending: false }).limit(12)
    builds = (b ?? []) as unknown as BuildRow[]
    if (builds.length) {
      // The token is withheld from the workspace's own RLS reads; links are read server-side, scoped to the tenant.
      const admin = createAdminClient()
      const base = await getBaseUrl()
      const byBuild = new Map(builds.map((x) => [x.id, x.created_at]))
      const { data: l } = await admin.from('share_links')
        .select('id, snapshot_id, token, title, expires_at, password_hash, revoked_at, view_count, last_viewed_at, created_at')
        .eq('client_id', clientId).in('snapshot_id', builds.map((x) => x.id)).order('created_at', { ascending: false })
      shareLinks = ((l ?? []) as { id: string; snapshot_id: string; token: string; title: string; expires_at: string | null; password_hash: string | null; revoked_at: string | null; view_count: number; last_viewed_at: string | null; created_at: string }[])
        .map((x) => ({ id: x.id, url: `${base}/r/${x.token}`, title: x.title, createdAt: x.created_at, expiresAt: x.expires_at, revokedAt: x.revoked_at, protected: Boolean(x.password_hash), views: x.view_count, lastViewedAt: x.last_viewed_at, buildAt: byBuild.get(x.snapshot_id) ?? x.created_at }))
    }
  }

  const itemKey = pickedArtefact ? artefactKey(pickedArtefact) : selectedId ?? undefined
  const openViewer = (snapshotId: string) => viewerHref(BASE, { item: itemKey }, snapshotId)

  const sendingLine = (s: ScheduleRow | null) => {
    if (!s) return 'Not sent to anyone yet'
    const cadence = CADENCES.find((c) => c.key === s.cadence)?.label ?? s.cadence
    const people = `${s.recipients.length} ${s.recipients.length === 1 ? 'person' : 'people'}`
    return s.active ? `${cadence}, to ${people}` : `Sending off (${cadence.toLowerCase()}, ${people})`
  }
  const sendsTo = (s: ScheduleRow | undefined, otherwise: string) => (s?.active ? `${s.recipients.length} ${s.recipients.length === 1 ? 'person' : 'people'}` : s ? 'Sending off' : otherwise)
  const sendingBox = (form: ReactNode) => (
    <div className="flex flex-col gap-4 rounded-[10px] bg-inner p-[22px] max-sm:p-4">
      <h4 className="m-0 text-[16px] font-semibold">Sending</h4>
      {form}
    </div>
  )

  const readyProp = readySend ? { id: readySend.id, subject: readySend.subject, readyAt: readySend.ready_at, error: readySend.error ? sendFailureSentence(readySend.error) : null, stalled, publishedAt: readySend.published_at ?? null } : null
  const reportStats: StatItem[] = selected
    ? isDocument
      ? [
          { key: 'for', term: 'Written for', value: readerOf(selected) },
          { key: 'template', term: 'Written', value: `${documentTemplate(selected.template_key)?.name ?? 'Written report'}, by Verbatim from the update` },
          { key: 'built', term: selected.status === 'built' ? 'Built, last edited' : 'Not built yet, last edited', value: fmtWhen(selected.updated_at) },
          { key: 'sends', term: 'Sends', value: sendingLine(schedule) },
        ]
      : [
          { key: 'for', term: 'Written for', value: readerOf(selected) },
          { key: 'sections', term: 'Sections', value: selected.sections.length ? `${selected.sections.length}: ${pagesOf(selected.sections).join(', ')}` : 'None yet' },
          { key: 'built', term: selected.status === 'built' ? 'Built, last edited' : 'Draft, last edited', value: fmtWhen(selected.updated_at) },
          { key: 'sends', term: 'Sends', value: sendingLine(schedule) },
        ]
    : []

  return (
    <section aria-label="Build and send">
      <Card className="gap-3.5 p-[26px] max-sm:p-[18px]">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="m-0 text-[21px] font-semibold leading-[1.3]">Build and send</h2>
          <GoLink href={`${BASE}/new`}>New report</GoLink>
        </div>

        {reports.length || artefacts.length ? (
          <table className={cn(TBL, STACK)}>
            <thead className={STACK_HEAD}>
              <tr>
                <th scope="col" className={cn(TH, 'pl-3')}>Report</th>
                <th scope="col" className={cn(TH, 'w-[220px]')}>Written</th>
                <th scope="col" className={cn(TH, 'w-[130px] pr-3 text-right')}>Sends to</th>
              </tr>
            </thead>
            <tbody className={STACK}>
              {reports.map((r) => {
                const on = r.id === selectedId
                return (
                  <tr key={r.id} aria-current={on ? 'true' : undefined} className={cn(STACK_ROW, 'max-sm:px-3', on && 'bg-accent')}>
                    <td className={cn(TD, STACK_CELL, 'pl-3')}><Link href={`${BASE}?item=${r.id}`} className={cn(ROW, 'max-sm:inline-flex max-sm:min-h-11 max-sm:items-center')}>{r.title}</Link></td>
                    <td className={cn(TD, STACK_CELL)}>For {readerOf(r)}</td>
                    <td className={cn(TD, STACK_CELL, 'pr-3 text-right tabular-nums')}>{sendsTo(scheduleOf.get(r.id), r.status === 'built' ? 'Built' : 'Draft')}</td>
                  </tr>
                )
              })}
              {artefacts.map((s) => {
                const on = pickedArtefact?.id === s.id
                return (
                  <tr key={s.id} aria-current={on ? 'true' : undefined} className={cn(STACK_ROW, 'max-sm:px-3', on && 'bg-accent')}>
                    <td className={cn(TD, STACK_CELL, 'pl-3')}><Link href={`${BASE}?item=${artefactKey(s)}`} className={cn(ROW, 'max-sm:inline-flex max-sm:min-h-11 max-sm:items-center')}>{artefactTitle(scheduleArtefact(s))}</Link></td>
                    <td className={cn(TD, STACK_CELL)}>By Verbatim</td>
                    <td className={cn(TD, STACK_CELL, 'pr-3 text-right tabular-nums')}>{sendsTo(s, 'Sending off')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <EmptyBox>No reports yet. Start one from a template, or go custom.</EmptyBox>
        )}

        {pickedArtefact ? (
          <div className="mt-3.5 flex flex-col gap-[18px] border-t border-border pt-[22px]">
            <h3 className="m-0 text-[19px] font-semibold leading-[1.3]">{artefactTitle(scheduleArtefact(pickedArtefact))}</h3>
            <StatStrip items={[
              { key: 'by', term: 'Written', value: 'By Verbatim, nothing to arrange' },
              { key: 'sends', term: 'Sends', value: sendingLine(pickedArtefact) },
            ]} />
            <p className="m-0 max-w-[60ch] text-[15px] leading-[1.55] text-secondary-foreground">
              Verbatim writes this one from your update, so there is no outline to edit. What you choose here is who receives it, when, and what rides along.
            </p>
            {sendingBox(
              <ScheduleForm
                key={`${pickedArtefact.id}:${pickedArtefact.updated_at}:${readySend?.id ?? 'none'}`}
                reportId={null}
                starterKey={pickedArtefact.starter_key}
                reportTitle={pickedArtefact.name}
                schedule={pickedArtefact}
                canManage={canManage}
                userEmail={email ?? null}
                sendable={sendable}
                ready={readyProp}
                reviewer={reviewAudience(clientId)}
              />,
            )}
            {history.length > 0 && <SendsTable history={history} nameOf={nameOf} />}
          </div>
        ) : selected ? (
          <div className="mt-3.5 flex flex-col gap-[18px] border-t border-border pt-[22px]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h3 className="m-0 min-w-0 text-[19px] font-semibold leading-[1.3]">{selected.title}</h3>
              <div className="flex flex-wrap items-center gap-2.5">
                <Link href={`${BASE}/edit/${selected.id}`} className={cn(GO, 'mr-2 inline-flex min-h-9 items-center max-sm:min-h-11')}>Edit the report</Link>
                {isDocument
                  ? <DocumentBuildControl reportId={selected.id} inFlight={docBuilds[0] && BUILD_ACTIVE.includes(docBuilds[0].status) ? { id: docBuilds[0].id, status: docBuilds[0].status, startedAt: docBuilds[0].started_at } : null} />
                  : <BuildButton reportId={selected.id} />}
                <DeleteReport id={selected.id} />
              </div>
            </div>
            <StatStrip items={reportStats} />
            {sendingBox(
              <ScheduleForm
                key={`${selected.id}:${schedule?.updated_at ?? 'none'}:${readySend?.id ?? 'none'}`}
                reportId={selected.id}
                reportTitle={selected.title}
                schedule={schedule}
                canManage={canManage}
                userEmail={email ?? null}
                sendable={sendable}
                isDocument={isDocument}
                ready={readyProp}
                reviewer={reviewAudience(clientId)}
              />,
            )}
            {history.length > 0 && <SendsTable history={history} nameOf={nameOf} />}
            <Part title="Builds">
              {isDocument ? (
                docBuilds.length > 0 ? (
                  <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                    {docBuilds.map((b) => {
                      const art = builds.find((x) => x.id === b.snapshot_id)?.artifacts.find((a) => a.format === 'pdf') ?? null
                      return (
                        <li key={b.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 rounded-[10px] border border-track px-5 py-3.5 text-[15px]">
                          <span className="text-[13.5px] text-muted-foreground">{fmtWhen(b.started_at)}</span>
                          <span className={b.status === 'failed' ? 'text-caution' : b.status === 'done' ? '' : 'text-secondary-foreground'}>{b.status === 'done' ? 'Built' : BUILD_PHASE_WORDS[b.status]}{b.status === 'failed' && b.error ? `: ${b.error}` : ''}</span>
                          {b.needs_review && <span className="text-caution">A check flagged this one: read it before sending.</span>}
                          {b.snapshot_id && editedSnapshots.has(b.snapshot_id) && <span className="text-[13.5px] text-muted-foreground">Edited</span>}
                          {Number(b.cost_usd) > 0 && <span className="text-[13.5px] tabular-nums text-muted-foreground">${Number(b.cost_usd).toFixed(2)}</span>}
                          {b.snapshot_id && b.status === 'done' && <Link href={openViewer(b.snapshot_id)} className={GO}>Open the build</Link>}
                          {art && <a href={`/api/artifacts/${art.id}`} className={GO}>Download PDF, {fmtBytes(art.bytes)}{art.stale ? ', re-renders' : ''}</a>}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <EmptyBox>Not built yet. Building reads the update, asks the data, writes the brief for its reader and prints the PDF. Three to five minutes.</EmptyBox>
                )
              ) : builds.length > 0 ? (
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {builds.map((b) => (
                    <li key={b.id} className="flex flex-col gap-2.5 rounded-[10px] border border-track px-5 py-[18px]">
                      <span className="text-[13.5px] text-muted-foreground">Built {fmtWhen(b.created_at)}{b === builds[0] && selected.status === 'draft' ? ', edited since: build again for a current PDF' : ''}</span>
                      {b.cover && b.figures && <p className="m-0 text-[15px] leading-[1.65]">{coverPlainText(b.cover.body, b.figures)}</p>}
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        <Link href={openViewer(b.id)} className={GO}>Open the build</Link>
                        {b.artifacts.map((a) => (
                          <a key={a.id} href={`/api/artifacts/${a.id}`} className={GO}>Download {a.format.toUpperCase()}, {fmtBytes(a.bytes)}{a.stale ? ', re-renders' : ''}</a>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyBox>Not built yet. Building freezes the figures as they are now, writes the cover for its reader and prints the PDF.</EmptyBox>
              )}
            </Part>
            <Part title="Share">
              <ShareLinks snapshotId={builds[0]?.id ?? null} links={shareLinks} />
            </Part>
          </div>
        ) : (
          <div className="mt-3.5 flex flex-col items-start gap-3 border-t border-border pt-[22px]">
            <EmptyBox title="Nothing here yet.">A report arranges the pages you already have for a reader you name, and can go out to a list of people after each update.</EmptyBox>
            <GoLink href={`${BASE}/new`}>New report</GoLink>
          </div>
        )}
      </Card>
    </section>
  )
}
