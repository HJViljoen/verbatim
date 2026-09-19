import { Suspense } from 'react'
import Link from 'next/link'
import { getSessionContext } from '@/lib/auth'
import { PageFrame, PageBar, PageGrid, BarPill } from '@/components/shell/page-grid'
import { Tile } from '@/components/shell/tile'
import { PaneEmpty, DetailHeader, DetailSection } from '@/components/shell/master-list'
import { HowToRead } from '@/components/how-to-read'
import { ShareLinks, type ShareLinkView } from '@/components/reports/share-links'
import { ReportViewer } from '@/components/reports/report-viewer'
import { loadViewerSnapshot, viewerHref, type ViewerSnapshot } from '@/lib/reports/viewer'
import { createAdminClient } from '@/lib/supabase-admin'
import { getBaseUrl } from '@/lib/site'
import { coverPlainText } from '@/lib/reports/cover'
import type { CoverText } from '@/lib/reports/types'
import { sendDidNotFinish, sendFailureSentence } from '@/lib/schedules/copy'
import { exportedRows, exportedLine, type ExportSnapshot } from '@/lib/exports/rows'
import { rows as readRows } from '@/lib/pages/read'
import { BriefCards } from '@/components/reports/brief-cards'
import { ArchiveTile, type ArchiveColumn, type ArchiveItem } from '@/components/reports/archive-lists'
import { StudioCard } from '@/components/reports/studio-card'
import { QuarterlyAbsentTile, QuarterlyCardTile } from '@/components/blocks/reports-card/card'
import { ArchiveDateFilter } from '@/components/reports/date-filter'
import { loadQuarterlyCard } from '@/lib/pages/reports-card'
import { readingHandle } from '@/lib/reading/read'
import { catalogueChips } from '@/lib/reports/catalogue'
import { UPDATES_UNREAD_LINE, activePreset, loadReportsPageContext, presetLine } from '@/lib/reports/page-context'
import { fmtBytes } from '@/lib/reports/files'
import { shortDate } from '@/lib/format'
import { surface } from '@/lib/nav'
import { PAUSED_SEND_LINE, SENT_FIGURES_NOTE, dateFilterLine, emptyGroupLine, hasDateFilter, listCap, parseDateFilter, printedFigures, readingLine, readingStampOf, sentFigures, withinDates, type ListReach, type StoredFigures } from '@/lib/reports/archive'
import { BRIEFS_META, BRIEF_CARDS, cadenceWord, cardSending, briefLabel, briefMonthChip, briefReader, briefStamp, briefWhat, type BriefCard } from '@/lib/reports/briefs'
import { loadReportsPage } from '@/lib/settings/reports-load'
import { isArtefact } from '@/lib/settings/artefacts'
import { canSeeStudio, STUDIO_HREF } from '@/lib/studio-visibility'

// Reports — the three briefs, and the archive of what went out (Phase 1 WP19,
// design RP1 and RP4; decision R).
//
// THE PAGE GAINED A TOP HALF. RP1's three cards — Sales, Marketing, Content —
// sit above the archive, each with the cadence and the recipients its schedule
// carries and the day the last one read. The Leadership brief is deliberately
// not one of them (decision R) and the page says where it is.
//
// Below them, the archive as it was, with RP4's three corrections: the rail
// counts are the real totals rather than the length of a capped query, a date
// filter narrows every group, and a sent report prints the figures it went out
// with beside the day it read.
//
// The archive of what went out and what was built (Stage 3):
//   Sent  — every scheduled send (subject, who, when, the PDF, the share link,
//           the email as sent — re-rendered from its snapshot, never stored),
//           with the updates emailed before schedules existed beneath them.
//   Built — PDFs built by hand in the Studio, with their share links.
//   Exported — the pages and tiles a reader took from the export control on
//           the page itself; the only place those files can be found again.
// Making things happens in the Studio; this page is what left the building.
//
// Every door into the Studio on this page is gated on canSeeStudio
// (lib/studio-visibility.ts, owner's call 2026-09-17): a client reads the
// archive and downloads from it, and is never pointed at a page they cannot
// find. Reading, downloading and sharing are untouched.

interface SendRow {
  id: string
  schedule_id: string | null
  schedule_name: string | null
  run_id: string | null
  snapshot_id: string | null
  artifact_id: string | null
  share_link_id: string | null
  subject: string | null
  recipients: string[]
  status: string
  error: string | null
  claimed_at: string
  sent_at: string | null
  report_schedules: { name: string; attach_pdf: boolean } | null
}
interface LegacyReport { id: string; subject: string | null; week_start: string | null; week_end: string | null; sent_to: string[] | null; sent_at: string | null }
interface BuildRow {
  id: string
  title: string
  created_at: string
  report_id: string | null
  cover: CoverText | null
  /** EITHER SHAPE. A brief and a legacy arranged report freeze the PRINTED
   *  table; WP17's weekly, WP18's monthly and WP20's quarterly freeze the
   *  MEASURED one. `sentFigures` and `printedFigures` read both. */
  figures: StoredFigures | null
  /** `data.reading` — the month a brief read (WP19); absent on everything
   *  built before item 43 and on every arranged report. */
  reading?: unknown
  /** `data.month` / `data.monthStatus` — WP17's weekly and WP18's monthly put
   *  the month TOP-LEVEL, not under `reading`. Aliased under their own names
   *  because `month` and `month_status` are M9's columns and naming those
   *  fails the whole select until the migration lands. */
  dataMonth?: string | null
  monthStatus?: string | null
  /** `data.template` — which document this is, where it is one. */
  template?: string | null
  artifacts: { id: string; format: string; bytes: number; stale: boolean; rendered_at: string; version: number }[]
}

type Group = 'sent' | 'built' | 'exported'
const BASE = '/dashboard/reports'
/** What each list asks for, in one place: the `.limit()` the query carries and
 *  the number `listCap` weighs the table's head count against. Two copies of a
 *  cap is how a list and its caveat come to disagree. */
const LIST_CAP = { sent: 200, legacy: 1000, built: 100, exported: 50 } as const
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null)
const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
/** Every link on this page carries the reader's filter — a rail link that
 *  dropped the date filter would silently widen the archive under them. */
const hrefWith = (extra: Record<string, string | undefined>) => (group: Group, item?: string | null) => {
  const q = new URLSearchParams()
  if (group !== 'sent') q.set('group', group)
  if (item) q.set('item', item)
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v)
  const qs = q.toString()
  return qs ? `${BASE}?${qs}` : BASE
}
const scheduleName = (s: SendRow) => s.report_schedules?.name ?? s.schedule_name ?? 'a schedule since deleted'
const sendLine = (s: SendRow) =>
  s.status === 'sent' && s.sent_at ? `sent ${fmtWhen(s.sent_at)} to ${s.recipients.length} ${s.recipients.length === 1 ? 'person' : 'people'}`
  : s.status === 'failed' ? `did not send · ${fmtWhen(s.claimed_at)}`
  : sendDidNotFinish(s.status, s.claimed_at) ? `did not finish · ${fmtWhen(s.claimed_at)}`
  : `sending · ${fmtWhen(s.claimed_at)}`

export default async function ReportsPage({ searchParams }: { searchParams?: Promise<{ group?: string; item?: string; view?: string; from?: string; to?: string }> }) {
  const sp = (await searchParams) ?? {}
  const session = await getSessionContext()
  const { supabase, clientId } = session
  const studio = canSeeStudio(session)
  const group: Group = sp.group === 'built' ? 'built' : sp.group === 'exported' ? 'exported' : 'sent'
  const dates = parseDateFilter(sp.from, sp.to)

  const [sendRes, legacyRes, buildRes, exportRes, sendTotal, legacyTotal, builtTotal, exportTotal, reportRows, schedules] = await Promise.all([
    supabase.from('report_sends').select('id, schedule_id, schedule_name, run_id, snapshot_id, artifact_id, share_link_id, subject, recipients, status, error, claimed_at, sent_at, report_schedules(name, attach_pdf)')
      .eq('client_id', clientId).in('status', ['sent', 'failed', 'claimed']).order('claimed_at', { ascending: false }).limit(LIST_CAP.sent),
    // `.limit()` EXPLICITLY, BECAUSE A BARE SELECT IS NOT UNCAPPED. PostgREST
    // stops at 1,000 rows and says nothing (AGENTS.md), so this read was capped
    // all along while the caveat's arithmetic treated it as complete — the same
    // two-pools defect one table over. `selectAll` is the other answer and is
    // the wrong one here: nobody reads a list of ten thousand legacy updates,
    // and the cap is now a number the caveat can name.
    supabase.from('weekly_reports').select('id, subject, week_start, week_end, sent_to, sent_at')
      .eq('client_id', clientId).order('week_end', { ascending: false }).limit(LIST_CAP.legacy),
    supabase.from('report_snapshots')
      // `readingAt:data->>readingAt` IS THE WEEKLY'S AND THE MONTHLY'S CARRIER.
      // A brief puts its reading instant in `data.reading.readingAt`; WP17's
      // weekly report and WP18's monthly reading both put it TOP-LEVEL, in
      // `data.readingAt`. Without the alias every one of those rows fell to
      // `created_at` and the Built group printed "built … · no reading date
      // recorded" beside a snapshot that carries the date. The sent-snapshot
      // read below already aliased it; this list did not, and the monthly
      // report merged in beside it (WP18) is the artefact that made it visible.
      .select('id, title, created_at, report_id, cover:data->cover, figures:data->figures, reading:data->reading, readingAt:data->>readingAt, dataMonth:data->>month, monthStatus:data->>monthStatus, template:data->>template, artifacts(id, format, bytes, stale, rendered_at, version)')
      .eq('client_id', clientId).eq('kind', 'report').order('created_at', { ascending: false }).limit(LIST_CAP.built),
    supabase.from('report_snapshots')
      .select('id, title, kind, created_at, artifacts(id, format, bytes, stale)')
      .eq('client_id', clientId).in('kind', ['page', 'tile', 'agent_thread']).order('created_at', { ascending: false }).limit(LIST_CAP.exported),
    // THE COUNTS ARE THE REAL TOTALS (RP4, cut #106). They were `.length` of
    // queries capped at 200 / 100 / 50, so a busy workspace's rail read "200"
    // for ever and a reader could not tell a cap from a count. A head count is
    // one cheap round trip and answers the question the number is asked.
    supabase.from('report_sends').select('id', { count: 'exact', head: true }).eq('client_id', clientId).in('status', ['sent', 'failed', 'claimed']),
    supabase.from('weekly_reports').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('report_snapshots').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('kind', 'report'),
    supabase.from('report_snapshots').select('id', { count: 'exact', head: true }).eq('client_id', clientId).in('kind', ['page', 'tile', 'agent_thread']),
    // `latest_snapshot_id` IS THE UNCAPPED ANSWER to "has this workspace ever
    // built this brief?". The cards' own pool is the newest 100 kind='report'
    // snapshots, and a claim about the WORKSPACE may not be drawn from a capped
    // query (`latestBriefLine`, and the archive's own listCap precedent).
    supabase.from('reports').select('id, template_key, kind, latest_snapshot_id').eq('client_id', clientId).eq('kind', 'document'),
    loadReportsPage(supabase, clientId).catch(() => null),
  ])

  // THE PAGE'S ONE READING HANDLE (Block D wave 2). The bar's context line, the
  // archive's delivery meta, the preset chips and the method footnote all come
  // from `loadReportsPageContext`; the quarterly card reads its own two windows
  // and answers null on a workspace with no confirmed subject, which is every
  // workspace until M4 is applied. Both degrade in words and neither can take
  // the archive down with it.
  const [ctx, quarterly] = await Promise.all([
    loadReportsPageContext(supabase, clientId),
    loadQuarterlyCard({ supabase, clientId, reading: readingHandle(clientId), params: sp }).catch((e: unknown) => {
      console.error(`[reports] quarterly card: ${(e as { message?: string })?.message ?? String(e)}`)
      return null
    }),
  ])
  // readRows, not `data ?? []`: a failed read and an empty archive render the
  // same page, so a broken query would show a client an empty Sent or Exported
  // tab with nothing anywhere saying the read failed.
  // A READ THAT FAILED IS NOT AN EMPTY GROUP. `readRows` keeps the page
  // rendering and logs, which is right — but the head counts beside these
  // lists answer even when the lists do not, so an unread group would print
  // "0 of 340 items" with nothing on the page saying the read failed. The
  // filter line and the empty state both take this instead of asserting.
  const unread = {
    sent: sendRes.error != null || legacyRes.error != null,
    built: buildRes.error != null,
    exported: exportRes.error != null,
  }
  const allSends = readRows<SendRow>(sendRes, 'reports.sends')
  const allLegacy = readRows<LegacyReport>(legacyRes, 'reports.legacy')
  const sentSnapshotIds = new Set(allSends.map((s) => s.snapshot_id).filter(Boolean))
  // EVERY build, before the Sent group takes its own back. The Built LIST
  // subtracts what was sent (an artefact belongs in one group), but a card's
  // "last one built" must not: once a brief is emailed once, subtracting it
  // would make the card name an older build, or say the brief has never been
  // built at all.
  const everyBuild = readRows<BuildRow>(buildRes, 'reports.builds')
  const allBuilds = everyBuild.filter((b) => !sentSnapshotIds.has(b.id))
  const exportSnapshots = readRows<ExportSnapshot>(exportRes, 'reports.exports')
  const allExports = exportedRows(exportSnapshots)

  // The date filter narrows every group, on the day each row is dated BY:
  // a send by when it was claimed, a build by when it read (falling back to
  // when it was built), an export by when it was taken.
  const sends = allSends.filter((x) => withinDates(x.sent_at ?? x.claimed_at, dates))
  const legacy = allLegacy.filter((x) => withinDates(x.sent_at ?? x.week_end, dates))
  const builds = allBuilds.filter((b) => withinDates(readingStampOf(b).at, dates))
  const exports = allExports.filter((e) => withinDates(e.createdAt, dates))

  const totals = {
    sent: (sendTotal.count ?? allSends.length) + (legacyTotal.count ?? allLegacy.length),
    built: Math.max((builtTotal.count ?? allBuilds.length) - sentSnapshotIds.size, allBuilds.length),
    exported: exportTotal.count ?? allExports.length,
  }

  // THE RAIL COUNTS ARE EXACT; THE LISTS ARE NOT. Each list above is the newest
  // LIST_CAP rows, and the date filter narrows what was loaded — so a filter
  // reaching back past a cap would otherwise report "0 of 340" about an archive
  // that holds some. `cappedAt` is the cap a group's list is sitting on where
  // the TABLE holds more than it.
  //
  // THE TEST IS THE HEAD COUNT OF THE POOL THE LIST WAS DRAWN FROM, NOT THE
  // NUMBER ON THE RAIL. The Built list loads every `kind='report'` row and the
  // rail then subtracts the ones a send has taken, so the two are different
  // pools: 130 built, 40 of them sent, and a rail reading 90 against a cap of
  // 100 said "nothing is hidden" while 30 rows were never loaded — the exact
  // claim about the workspace this caveat exists to prevent.
  // The Sent group is read from TWO tables and its caveat has to count both.
  // `totals.sent` adds the legacy updates to the sends, so weighing it against
  // the sends' cap alone told a workspace with exactly 200 sends and 47 legacy
  // rows — a complete list, searched end to end — that "only the 200 most
  // recent are searched". `listCap` takes both pools and answers about the
  // group. All of that is `reachOf` below, which answers per group now that
  // the three lists are drawn at once rather than one at a time.

  // ── RP1: the three cards ───────────────────────────────────────────────
  // readRows, for the reason stated above: a failed read must not read as a
  // workspace that has never set a brief up.
  const documentReports = readRows<{ id: string; template_key: string | null; latest_snapshot_id: string | null }>(reportRows, 'reports.documents')
  const scheduleRows = schedules?.schedules ?? []
  // The pool the cards' `latest` is drawn from — the same 100 rows the Built
  // list loads, weighed against the head count. Null means it searched
  // everything, which is the only state in which "Never built" is a fact.
  const briefPoolCappedAt = listCap([{ total: builtTotal.count, cap: LIST_CAP.built }])
  // Read once and used twice: the cards' `sending` gate and the Sent list's
  // empty line are the same fact about this workspace.
  const paused = (schedules?.period ?? null) === 'paused'
  const cards: BriefCard[] = BRIEF_CARDS.map(({ role, artefact }) => {
    const latest = everyBuild.find((b) => b.template === role) ?? null
    const reportRow = documentReports.find((r) => r.template_key === role) ?? null
    const schedule = scheduleRows.find((x) => isArtefact(x.artefact) && x.artefact === artefact) ?? null
    const recipients = schedule?.recipients ?? []
    // The last build's own stamp, read ONCE: the month chip, the footer stamp
    // and the reading line are three renderings of it and must not be three
    // reads of it.
    const stamp = latest ? readingStampOf(latest) : null
    // THE PDF, NOT ANY FILE. A build can carry a PNG of one tile; the card's
    // action says PDF and must hand back one.
    const pdf = latest?.artifacts.find((a) => a.format.toLowerCase() === 'pdf') ?? null
    return {
      role,
      artefact,
      label: briefLabel(artefact),
      what: briefWhat(artefact),
      reportId: reportRow?.id ?? null,
      everBuilt: reportRow ? reportRow.latest_snapshot_id != null : null,
      poolCappedAt: briefPoolCappedAt,
      latest: latest && stamp ? { snapshotId: latest.id, title: latest.title, readingLine: readingLine(stamp) } : null,
      reader: briefReader(artefact),
      monthChip: briefMonthChip(stamp),
      stamp: briefStamp(stamp),
      figures: sentFigures(latest?.figures ?? null, 4),
      pdf: pdf ? { id: pdf.id, bytes: pdf.bytes, stale: pdf.stale } : null,
      cadence: cadenceWord(schedule?.cadence ?? null),
      recipients,
      sending: cardSending({ artefact, active: Boolean(schedule?.active), recipients, period: schedules?.period ?? 'weekly' }),
      scheduleKnown: schedules != null,
    }
  })

  // ── selection ─────────────────────────────────────────────────────────
  // AN ID THAT NAMES NOTHING IS NOT AN INVITATION TO OPEN SOMETHING ELSE. A
  // link into the archive carries `?item=`, and where that row is gone — a
  // purged snapshot, a share link sent weeks ago, or dates that now exclude it
  // — falling through to the newest row opened a different document under the
  // reader's own link, silently. The fallback is for a group opened WITHOUT an
  // item; a named one either resolves or is said to be missing below.
  const pick = <T,>(rows: readonly T[], id: (r: T) => string, on: boolean): string | null => {
    if (!on) return null
    if (sp.item) return rows.some((r) => id(r) === sp.item) ? sp.item : null
    return rows[0] ? id(rows[0]) : null
  }
  const sentRows = [...sends.map((s) => ({ id: s.id })), ...legacy.map((l) => ({ id: l.id }))]
  const sentId = pick(sentRows, (r) => r.id, group === 'sent')
  const selectedSend = sentId ? sends.find((s) => s.id === sentId) ?? null : null
  const selectedLegacy = sentId && !selectedSend ? legacy.find((l) => l.id === sentId) ?? null : null
  const buildId = pick(builds, (b) => b.id, group === 'built')
  const selectedBuild = buildId ? builds.find((b) => b.id === buildId) ?? null : null
  const exportId = pick(exports, (e) => e.id, group === 'exported')
  const selectedExport = exportId ? exports.find((e) => e.id === exportId) ?? null : null

  // Share links for the selected item — read server-side (the token is
  // withheld from the workspace's RLS reads), scoped to the tenant.
  let shareLinks: ShareLinkView[] = []
  const linkSnapshot = selectedSend?.snapshot_id ?? selectedBuild?.id ?? null
  if (linkSnapshot) {
    const admin = createAdminClient()
    const base = await getBaseUrl()
    const { data: l } = await admin.from('share_links')
      .select('id, snapshot_id, token, title, expires_at, password_hash, revoked_at, view_count, last_viewed_at, created_at')
      .eq('client_id', clientId).eq('snapshot_id', linkSnapshot).order('created_at', { ascending: false })
    shareLinks = ((l ?? []) as { id: string; snapshot_id: string; token: string; title: string; expires_at: string | null; password_hash: string | null; revoked_at: string | null; view_count: number; last_viewed_at: string | null; created_at: string }[])
      .map((x) => ({ id: x.id, url: `${base}/r/${x.token}`, title: x.title, createdAt: x.created_at, expiresAt: x.expires_at, revokedAt: x.revoked_at, protected: Boolean(x.password_hash), views: x.view_count, lastViewedAt: x.last_viewed_at, buildAt: x.created_at }))
  }
  // The snapshot a send went out with. It is deliberately NOT in `builds` —
  // the Built group subtracts everything that was sent — so it is read here,
  // by id, for the figures RP4 asks the archive to print beside the date.
  // The row is passed to readingStampOf exactly as PostgREST returns it —
  // `reading` and `readingAt` flat, under their aliases. Re-nesting it here
  // was what hid the bug: this one call site read correctly and the three on
  // the Built group and the cards did not.
  interface SentSnapshot { id: string; created_at: string; figures: StoredFigures | null; reading: unknown; readingAt: string | null; dataMonth: string | null; monthStatus: string | null }
  let sentSnapshot: SentSnapshot | null = null
  if (selectedSend?.snapshot_id) {
    const { data: snap } = await supabase.from('report_snapshots')
      .select('id, created_at, figures:data->figures, reading:data->reading, readingAt:data->>readingAt, dataMonth:data->>month, monthStatus:data->>monthStatus')
      .eq('client_id', clientId).eq('id', selectedSend.snapshot_id).maybeSingle()
    sentSnapshot = (snap as SentSnapshot | null) ?? null
  }

  type ArtifactLite = { id: string; format: string; bytes: number; stale: boolean }
  let artifact: ArtifactLite | null = null
  if (selectedSend?.artifact_id) {
    const { data: a } = await supabase.from('artifacts').select('id, format, bytes, stale').eq('id', selectedSend.artifact_id).maybeSingle()
    artifact = (a as ArtifactLite | null) ?? null
  }
  let legacyHtml: string | null = null
  if (selectedLegacy) {
    const { data: row } = await supabase.from('weekly_reports').select('html_content').eq('client_id', clientId).eq('id', selectedLegacy.id).maybeSingle()
    legacyHtml = row?.html_content ? String(row.html_content).replace(/<head>/i, '<head><base target="_blank">') : null
  }

  // The viewer over the page (?view=): the build's frozen pages, read here
  // instead of downloaded. Scoped to this workspace by the loader; an id that
  // names nothing simply does not open.
  let viewer: ViewerSnapshot | null = null
  if (sp.view) viewer = await loadViewerSnapshot(createAdminClient(), clientId, sp.view)
  const closeViewer = viewerHref(BASE, { group: sp.group, item: buildId ?? sentId ?? undefined }, null)

  const carry: Record<string, string | undefined> = {
    ...(dates.from ? { from: dates.from } : {}),
    ...(dates.to ? { to: dates.to } : {}),
  }
  const href = hrefWith(carry)

  // ── The archive, as three lists at once (Block D wave 2) ───────────────
  // The rail and the one-group-at-a-time list are gone; `?group=` survives as
  // the selector for the DETAIL pane, so every link already in circulation
  // still opens the same item.
  const reachOf = (g: Group): ListReach => ({
    cappedAt: g === 'sent'
      ? listCap([{ total: sendTotal.count, cap: LIST_CAP.sent }, { total: legacyTotal.count, cap: LIST_CAP.legacy }])
      : g === 'built'
        ? listCap([{ total: builtTotal.count, cap: LIST_CAP.built }])
        : listCap([{ total: exportTotal.count, cap: LIST_CAP.exported }]),
    ...(g === 'built' ? { clock: 'built' } : {}),
    unread: unread[g],
  })
  const emptyFor = (g: Group, verb: string, invite: string) =>
    emptyGroupLine({ verb, invite, filtered: hasDateFilter(dates), reach: reachOf(g) })

  // ONE FILTER LINE OVER THREE LISTS, so it weighs every pool the three were
  // drawn from. `listCap` takes them all and answers about the archive rather
  // than about whichever tab happened to be open.
  const shownAll = sends.length + legacy.length + builds.length + exports.length
  const totalAll = totals.sent + totals.built + totals.exported
  const allReach: ListReach = {
    cappedAt: listCap([
      { total: sendTotal.count, cap: LIST_CAP.sent },
      { total: legacyTotal.count, cap: LIST_CAP.legacy },
      { total: builtTotal.count, cap: LIST_CAP.built },
      { total: exportTotal.count, cap: LIST_CAP.exported },
    ]),
    unread: unread.sent || unread.built || unread.exported,
  }
  const filter = (
    <ArchiveDateFilter
      filter={dates}
      hidden={{ ...(sp.group ? { group: sp.group } : {}), ...(sp.item ? { item: sp.item } : {}) }}
      line={dateFilterLine(dates, shownAll, totalAll, allReach)}
    />
  )

  const sentItems: ArchiveItem[] = [
    ...sends.map((s): ArchiveItem => ({
      id: s.id,
      title: s.subject ?? 'Update',
      meta: `${scheduleName(s)} · ${sendLine(s)}`,
      stamp: shortDate(s.sent_at ?? s.claimed_at),
      href: href('sent', s.id),
      active: s.id === sentId,
      failed: s.status === 'failed' || sendDidNotFinish(s.status, s.claimed_at),
      icon: 'mail',
      search: `${s.subject ?? ''} ${scheduleName(s)}`,
    })),
    ...legacy.map((l): ArchiveItem => ({
      id: l.id,
      title: l.subject ?? 'Update',
      meta: `earlier update · ${fmtDate(l.week_start)} – ${fmtDate(l.week_end)}${l.sent_at ? '' : ' · viewable here'}`,
      stamp: l.sent_at ? shortDate(l.sent_at) : null,
      href: href('sent', l.id),
      active: l.id === sentId,
      icon: 'mail',
      search: `${l.subject ?? ''} ${fmtDate(l.week_end) ?? ''}`,
    })),
  ]

  const columns: ArchiveColumn[] = [
    {
      key: 'sent',
      label: 'Sent',
      meta: 'to your inbox',
      items: sentItems,
      // WHAT THIS COLUMN HOLDS UNDER THE FILTER, and what its list was drawn
      // from — two different facts, and the all-time head count is neither.
      held: sentItems.length,
      cappedAt: reachOf('sent').cappedAt,
      // A PAUSED WORKSPACE IS PROMISED NOTHING. Both invitations below name a
      // next update, and `report_period = 'paused'` means there is none —
      // `schedule-due.ts` matches nothing against it. The fact is already in
      // this render (`schedules?.period`, read for `cardSending` above), so
      // the page said one thing about delivery and Settings two clicks away
      // said the opposite.
      empty: emptyFor('sent', 'was sent', paused
        ? PAUSED_SEND_LINE
        : studio
          ? 'Nothing sent yet. Each report in the Studio sends after the next update; the first lands then.'
          : 'Nothing sent yet. Your updates are set up by Verbatim and send after the next update; the first lands then.'),
    },
    {
      key: 'built',
      label: 'Built',
      meta: 'documents',
      items: builds.map((b): ArchiveItem => ({
        id: b.id,
        title: b.title,
        meta: `${readingLine(readingStampOf(b))} · ${b.artifacts.length ? b.artifacts.map((a) => a.format.toUpperCase()).join(', ') : 'no file'}`,
        stamp: shortDate(readingStampOf(b).at),
        href: viewerHref(BASE, { group: 'built', item: b.id }, b.id),
        active: b.id === buildId,
        icon: 'file',
        search: b.title,
      })),
      held: builds.length,
      cappedAt: reachOf('built').cappedAt,
      empty: emptyFor('built', 'was built', studio
        ? 'Nothing built by hand yet. Build any template in the Studio and its PDF lands here.'
        : 'Nothing built by hand yet. Ask your Verbatim contact for a report built to order and its PDF lands here.'),
    },
    {
      key: 'exported',
      label: 'Exported',
      // "CARD", NOT "TILE". A tile is what the code calls the thing; a reader
      // calls it a card, and "tile" is on the jargon list
      // (lib/calibration.ts). `components/export-menu.tsx` still ships
      // `aria-label="Export this tile"` — shell's to change.
      meta: 'pages and cards',
      items: exports.map((e): ArchiveItem => ({
        id: e.id,
        title: e.title,
        meta: exportedLine(e, fmtWhen(e.createdAt)),
        stamp: shortDate(e.createdAt),
        href: href('exported', e.id),
        active: e.id === exportId,
        icon: 'image',
        search: `${e.title} ${e.what}`,
      })),
      held: exports.length,
      cappedAt: reachOf('exported').cappedAt,
      empty: emptyFor('exported', 'was exported', 'Nothing exported yet. Export any page or card from its menu; the files collect here.'),
    },
  ]

  const detail = group === 'sent' ? (
    selectedSend ? (
      <>
        <DetailHeader eyebrow={scheduleName(selectedSend)} title={selectedSend.subject ?? 'Update'} meta={sendLine(selectedSend)} />
        {(selectedSend.status === 'failed' || sendDidNotFinish(selectedSend.status, selectedSend.claimed_at)) && (
          <DetailSection><p className="text-[12.5px] text-negative">This update did not reach anyone. {selectedSend.status === 'failed' ? sendFailureSentence(selectedSend.error) : 'The send started and never finished.'} {studio ? 'An owner or admin can send it again from the Studio.' : 'Ask your Verbatim contact to send it again.'}</p></DetailSection>
        )}
        <DetailSection label="To">
          <p className="text-[12.5px] text-secondary-foreground">{selectedSend.recipients.join(' · ') || 'nobody'}</p>
        </DetailSection>
        {sentSnapshot && (
          <DetailSection label="What it read, and the figures it went out with">
            <p className="font-mono text-[11px] text-secondary-foreground">{readingLine(readingStampOf(sentSnapshot))}</p>
            {sentFigures(sentSnapshot.figures).length > 0 ? (
              <>
                <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                  {sentFigures(sentSnapshot.figures).map((f) => (
                    <div key={f.key} className="flex items-baseline justify-between gap-3 border-b border-border/50 py-0.5">
                      <dt className="min-w-0 truncate text-[12px] text-muted-foreground">{f.label}</dt>
                      <dd className="shrink-0 font-mono text-[12px] tabular-nums text-foreground">{f.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-[11px] text-muted-foreground">{SENT_FIGURES_NOTE}</p>
              </>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">This report did not store its figures.</p>
            )}
          </DetailSection>
        )}
        <DetailSection label="Files and links">
          <div className="flex flex-wrap items-center gap-3">
            {artifact ? (
              <a href={`/api/artifacts/${artifact.id}`} className="text-[12px] font-medium underline underline-offset-2">Download the PDF · {fmtBytes(artifact.bytes)}{artifact.stale ? ' · rebuilt on download' : ''}{selectedSend.report_schedules?.attach_pdf ? ' · was attached' : ''}</a>
            ) : <span className="text-[12px] text-muted-foreground">No PDF stored.</span>}
          </div>
          <div className="mt-3"><ShareLinks snapshotId={selectedSend.snapshot_id} links={shareLinks} /></div>
        </DetailSection>
        {selectedSend.snapshot_id && selectedSend.schedule_id && (
          <DetailSection label="The email as sent">
            <iframe src={`/api/schedules/${selectedSend.schedule_id}/preview?send=${selectedSend.id}`} sandbox="allow-popups allow-popups-to-escape-sandbox" title={selectedSend.subject ?? 'Update'} className="h-[720px] w-full rounded-[4px] bg-tile ring-1 ring-border" />
            <p className="mt-1 text-[11px] text-muted-foreground">Re-rendered from the figures it was sent with; the quoted voices are read live, so a withdrawn comment never shows.</p>
          </DetailSection>
        )}
      </>
    ) : selectedLegacy ? (
      <>
        <DetailHeader eyebrow="Earlier update" title={selectedLegacy.subject ?? 'Update'}
          meta={`${fmtDate(selectedLegacy.week_start)} – ${fmtDate(selectedLegacy.week_end)}${selectedLegacy.sent_at ? ` · emailed ${fmtDate(selectedLegacy.sent_at)}${selectedLegacy.sent_to?.length ? ` to ${selectedLegacy.sent_to.length}` : ''}` : ' · stored, not emailed'}`} />
        {legacyHtml ? (
          <iframe srcDoc={legacyHtml} sandbox="allow-popups allow-popups-to-escape-sandbox" title={selectedLegacy.subject ?? 'Update'} className="min-h-0 w-full flex-1 bg-tile max-md:h-[70vh]" />
        ) : (
          <PaneEmpty>This update has no stored content.</PaneEmpty>
        )}
      </>
    ) : (
      <PaneEmpty>Select an update to read it here.</PaneEmpty>
    )
  ) : group === 'built' ? (
    selectedBuild ? (
    <>
      <DetailHeader eyebrow={studio ? 'Built in the Studio' : 'Built for you'} title={selectedBuild.title} meta={readingLine(readingStampOf(selectedBuild))} />
      <DetailSection>
        {selectedBuild.cover && selectedBuild.figures && <p className="text-[12.5px] leading-relaxed text-secondary-foreground">{coverPlainText(selectedBuild.cover.body, printedFigures(selectedBuild.figures) ?? {})}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link href={viewerHref(BASE, { group: 'built', item: selectedBuild.id }, selectedBuild.id)} scroll={false} className="text-[12px] font-medium underline underline-offset-2">Open the report</Link>
          {selectedBuild.artifacts.map((a) => (
            <a key={a.id} href={`/api/artifacts/${a.id}`} className="text-[12px] font-medium underline underline-offset-2">Download {a.format.toUpperCase()} · {fmtBytes(a.bytes)}{a.stale ? ' · rebuilt on download' : ''}</a>
          ))}
          {studio && selectedBuild.report_id && <Link href={`${STUDIO_HREF}?item=${selectedBuild.report_id}`} className="text-[12px] font-medium underline underline-offset-2">Open in the Studio</Link>}
        </div>
      </DetailSection>
      {sentFigures(selectedBuild.figures).length > 0 && (
        <DetailSection label="The figures it was built with">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {sentFigures(selectedBuild.figures).map((f) => (
              <div key={f.key} className="flex items-baseline justify-between gap-3 border-b border-border/50 py-0.5">
                <dt className="min-w-0 truncate text-[12px] text-muted-foreground">{f.label}</dt>
                <dd className="shrink-0 font-mono text-[12px] tabular-nums text-foreground">{f.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] text-muted-foreground">{SENT_FIGURES_NOTE}</p>
        </DetailSection>
      )}
      <DetailSection label="Share">
        <ShareLinks snapshotId={selectedBuild.id} links={shareLinks} />
      </DetailSection>
    </>
    ) : (
      <PaneEmpty>Select a build.</PaneEmpty>
    )
  ) : selectedExport ? (
    <>
      <DetailHeader eyebrow="Exported from the page" title={selectedExport.title} meta={exportedLine(selectedExport, fmtWhen(selectedExport.createdAt))} />
      <DetailSection label="Files">
        <div className="flex flex-wrap items-center gap-3">
          {selectedExport.files.map((f) => (
            <a key={f.id} href={`/api/artifacts/${f.id}`} className="text-[12px] font-medium underline underline-offset-2">Download the {f.format.toUpperCase()} · {fmtBytes(f.bytes)}</a>
          ))}
        </div>
        {selectedExport.stale && (
          <p className="mt-2 text-[11px] text-muted-foreground">This file was cleared from storage. Downloading it builds the same file again from the figures it was exported with; the quoted voices are read live, so a withdrawn comment never shows.</p>
        )}
      </DetailSection>
    </>
  ) : (
    <PaneEmpty>Select a file.</PaneEmpty>
  )

  const selected = selectedSend != null || selectedLegacy != null || selectedBuild != null || selectedExport != null
  // The reader named an item and it is not here. The master-detail printed
  // "Select a file." into its third pane; with the pane gone the page drew
  // nothing at all, so a share link to a deleted snapshot said nothing.
  const missing = Boolean(sp.item) && !selected
  const presetKey = activePreset(ctx.presets, dates)
  const chosen = ctx.presets.find((x) => x.key === presetKey) ?? null

  return (
    <PageFrame className="gap-4">
      {/* THE BAR IS THE ARTBOARD'S, COMPOSED HERE (`reports.shell`,
          `reports.bar.question`). `lib/nav.ts` still gives Reports
          `bar: 'title'` — the horizon control and the soundness band stay off,
          because this page still makes no reading of a period — so the page
          takes the primitive and passes the two things the artboard draws that
          the table would not: the month the archive is being read in, and the
          question the surface answers, which has been in `SURFACES` verbatim
          all along with nothing printing it. */}
      <PageBar title={surface('reports').label} context={ctx.context} subtitle={surface('reports').question ?? undefined}>
        <Suspense fallback={null}>
          <HowToRead items={['month', 'level', 'change', 'video']} basePath={BASE} />
        </Suspense>
        {/* NOT `primary`. The artboard puts EXPORT in this slot and Reports has
            no page module to export (deviation 1); what stood in its place was
            the page's loudest element pointing AWAY from every document on it,
            and since wave 2 the Studio is offered from its own card as well —
            "Start a report", "Open the catalogue" and one action per brief. A
            page that asks "Which document do I need?" answers with the
            documents. */}
        {studio && <Link href={STUDIO_HREF}><BarPill>Open the Studio</BarPill></Link>}
      </PageBar>

      <BriefCards cards={cards} meta={BRIEFS_META} studio={studio} basePath={BASE} />

      {/* THE ROWS GROW WITH THEIR CONTENT, as the artboard's do: its cards are
          `min-height:248px`, not a fixed grid track. `PageGrid`'s 116px row
          unit is right for a reading page whose tiles are sized by their
          layout; here the honest form of a figure is longer than the mock's
          and a fixed track would clip it under `overflow-hidden`.
          `row={2}` is the 248px floor the artboard states; at `row={3}` the
          stacked (sub-xl) minimum was 380px and `distribute="between"` spread
          two sentences over it.
          AND THE CARD IS NEVER SIMPLY ABSENT: `loadQuarterlyCard` answers null
          where no subject is confirmed — the state both live workspaces are in
          — and a page advertising documents may not go silent about the one it
          was built to advertise. */}
      <PageGrid className="xl:auto-rows-min">
        {quarterly
          ? <QuarterlyCardTile card={quarterly} col={studio ? 7 : 12} row={2} />
          : <QuarterlyAbsentTile col={studio ? 7 : 12} row={2} />}
        {studio && <StudioCard pages={catalogueChips()} col={5} row={2} />}
      </PageGrid>

      <PageGrid className="xl:auto-rows-min">
        <ArchiveTile
          col={12}
          row={4}
          columns={columns}
          meta={ctx.delivery?.line ?? null}
          presets={ctx.presets}
          activePresetKey={presetKey}
          presetHref={(x) => presetPath(BASE, x, sp.group)}
          // A FAILED RUN READ SAYS SO. `ctx.presets` is empty in exactly that
          // case (never four chips reading zero), and silence there would let
          // a reader take an unread record for an empty one.
          presetNote={chosen ? presetLine(chosen) : ctx.updatesUnread ? UPDATES_UNREAD_LINE : null}
          filter={filter}
          // PRINTED ONCE ON THE SCREEN. `PRIVACY_LINE` is the last line of
          // `methodLines`, which this page prints in full at the foot (the
          // method footnote below), so the archive's own footer said the same
          // sentence 60px above it. The footer copy predates that footnote.
          // It is also the copy that clips at 375, so dropping it closes both.
          footer={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[12px] text-muted-foreground">
                Share links are created on an item below.
              </span>
            </span>
          }
        />
      </PageGrid>

      {(selected || missing) && (
        <PageGrid className="xl:auto-rows-min">
          <Tile col={12} row={missing ? 1 : 3} className="p-0">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {missing
                ? <PaneEmpty>That item is not in the archive any more, or the dates you have set exclude it. Pick one from the lists above.</PaneEmpty>
                : detail}
            </div>
          </Tile>
        </PageGrid>
      )}

      {/* THE METHOD FOOTNOTE (`reports.method.footer`). The decision the brief
          asked for, made: the page was given one minimal reading handle
          (lib/reports/page-context.ts) and prints the REAL footnote —
          `methodLines`, the same five facts in the same words every other
          surface states them in. Nothing here is invented, and where the
          record could not be read the footnote is absent rather than thin. */}
      {ctx.method && (
        <p className="m-0 flex flex-col gap-0.5 font-mono text-[9.5px] leading-[1.35] text-muted-foreground">
          {ctx.method.lines.map((line, i) => (
            <span key={i} className={i === 0 ? 'text-secondary-foreground' : undefined}>{line}</span>
          ))}
        </p>
      )}

      {viewer && <ReportViewer snapshot={viewer} closeHref={closeViewer} showStudio={studio} />}
    </PageFrame>
  )
}

/** Where a preset chip points: the archive's own date filter, plus the group
 *  the reader is reading — a chip that kept `?item=` would open a send the new
 *  dates exclude, which is why `item` is dropped, but dropping `group` with it
 *  silently reset an open Built item to the Sent list. */
function presetPath(base: string, p: { from: string | null; to: string | null }, group?: string): string {
  const q = new URLSearchParams()
  if (group) q.set('group', group)
  if (p.from) q.set('from', p.from)
  if (p.to) q.set('to', p.to)
  const qs = q.toString()
  return qs ? `${base}?${qs}` : base
}
