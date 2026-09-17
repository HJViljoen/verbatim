/**
 * What a report purge would delete, decided as one pure function.
 *
 * The owner's ask, 2026-09-17: "delete all the previous reports made on
 * Sealand and Össur" — old, unpolished reports a client could still open. The
 * script that carries it out is scripts/purge-reports.ts; everything that
 * DECIDES lives here so it can be tested without a database, per AGENTS.md.
 *
 * Two rules matter more than the rest.
 *
 * 1. A `reports` row is NEVER deleted while a `report_schedules` row points at
 *    it. `report_schedules.report_id` is ON DELETE CASCADE, so deleting the
 *    definition takes the schedule with it — and Sealand's default "Weekly
 *    digest" schedule was deliberately paused on 2026-09-17. If it vanished,
 *    `ensureDefaultSchedule` would mint a fresh default on the next accepted
 *    invite, very possibly ACTIVE, and Sealand's team would start receiving
 *    digests the owner asked not to send. Nothing here ever writes
 *    report_schedules either; the table is read to protect its parents.
 *
 * 2. "Delivered" is the line `drafts` will not cross. A snapshot was delivered
 *    if a `report_sends` row in status 'sent' points at it, or if a share link
 *    on it has ever been viewed. Either way a person outside this app has seen
 *    that report, and the `drafts` scope leaves it alone.
 */

export type PurgeScope = 'drafts' | 'all'

// ── the rows this decision reads ──────────────────────────────────────────
// Field for field what scripts/purge-reports.ts selects. Deliberately loose
// about columns nothing here uses.

export interface SnapshotRow {
  id: string
  kind: string
  title: string | null
  report_id: string | null
  created_at: string
}
export interface SendRow {
  id: string
  snapshot_id: string | null
  share_link_id: string | null
  subject: string | null
  recipients: string[] | null
  status: string
  claimed_at: string
  sent_at: string | null
}
export interface BuildRow {
  id: string
  report_id: string | null
  snapshot_id: string | null
  status: string
  started_at: string
  error: string | null
}
export interface ArtifactRow {
  id: string
  snapshot_id: string | null
  format: string
  bytes: number | null
  storage_path: string
  rendered_at: string | null
}
export interface ShareLinkRow {
  id: string
  snapshot_id: string | null
  title: string | null
  view_count: number
  last_viewed_at: string | null
  created_at: string
}
export interface ExportEventRow {
  id: number
  snapshot_id: string | null
  action: string | null
  kind: string | null
  format: string | null
  created_at: string
}
export interface EditRow { id: string; snapshot_id: string | null; block_id: string | null }
export interface ReportRow {
  id: string
  title: string | null
  kind: string | null
  template_key: string | null
  created_at: string
}
export interface ScheduleRow { id: string; report_id: string | null; name: string; active: boolean; is_default: boolean }
export interface WeeklyRow {
  id: string
  subject: string | null
  week_start: string | null
  week_end: string | null
  sent_at: string | null
  sent_to: string[] | null
}

export interface PurgeTables {
  snapshots: SnapshotRow[]
  sends: SendRow[]
  builds: BuildRow[]
  artifacts: ArtifactRow[]
  links: ShareLinkRow[]
  exportEvents: ExportEventRow[]
  edits: EditRow[]
  reports: ReportRow[]
  schedules: ScheduleRow[]
  weekly: WeeklyRow[]
}

export interface PurgeOptions {
  scope: PurgeScope
  /** Wall clock, for the 48-hour send warning. */
  now?: number
}

/** One row that stays, and the reason it stays. */
export interface KeptRow { table: string; id: string; label: string; why: string }

export interface PurgePlan {
  scope: PurgeScope
  /** Deleted in this order: children before parents. */
  edits: EditRow[]
  exportEvents: ExportEventRow[]
  artifacts: ArtifactRow[]
  links: ShareLinkRow[]
  builds: BuildRow[]
  sends: SendRow[]
  snapshots: SnapshotRow[]
  weekly: WeeklyRow[]
  reports: ReportRow[]
  /** Storage objects the deleted artifacts own. */
  storagePaths: string[]
  /** share_views that go with the deleted links, by link id. */
  viewsByLink: Record<string, number>
  kept: KeptRow[]
  /** Refusals. A non-empty list means --apply must not run. */
  blockers: string[]
  /** Said out loud, but not a refusal. */
  warnings: string[]
}

/** A `report_sends` row nothing will move again. */
const TERMINAL_SEND = new Set(['sent', 'failed', 'skipped'])
/** A `report_builds` row nothing will move again. */
const TERMINAL_BUILD = new Set(['done', 'failed'])

const HOUR = 60 * 60 * 1000
export const RECENT_SEND_MS = 48 * HOUR

const short = (id: string) => id.slice(0, 8)
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : 'never')

/**
 * The whole decision. Give it every row of a workspace and it returns what
 * would be deleted, what would be kept and why, and anything that should stop
 * or slow an apply.
 */
export function planPurge(t: PurgeTables, opts: PurgeOptions): PurgePlan {
  const now = opts.now ?? Date.now()
  const scope = opts.scope
  const kept: KeptRow[] = []
  const blockers: string[] = []
  const warnings: string[] = []

  const snapshotIds = new Set(t.snapshots.map((s) => s.id))

  // ── which snapshots were delivered to somebody ──────────────────────────
  const sentSnapshotIds = new Set(
    t.sends.filter((s) => s.status === 'sent' && s.snapshot_id).map((s) => s.snapshot_id as string),
  )
  const viewedSnapshotIds = new Set(
    t.links.filter((l) => l.view_count > 0 && l.snapshot_id).map((l) => l.snapshot_id as string),
  )
  const deliveredReason = (id: string): string | null => {
    const sent = sentSnapshotIds.has(id)
    const viewed = viewedSnapshotIds.has(id)
    if (sent && viewed) return 'emailed, and its share link has been opened'
    if (sent) return 'emailed to a recipient list'
    if (viewed) return 'its share link has been opened'
    return null
  }

  // ── snapshots ───────────────────────────────────────────────────────────
  const delSnapshots: SnapshotRow[] = []
  for (const s of t.snapshots) {
    const why = deliveredReason(s.id)
    if (scope === 'drafts' && why) {
      kept.push({ table: 'report_snapshots', id: s.id, label: `${s.title ?? 'untitled'} · ${s.kind} · ${day(s.created_at)}`, why: `delivered: ${why}` })
    } else {
      delSnapshots.push(s)
    }
  }
  const delSnapshotIds = new Set(delSnapshots.map((s) => s.id))

  // ── sends ───────────────────────────────────────────────────────────────
  // `drafts` touches no send row at all: a send row IS the delivery record.
  const delSends: SendRow[] = scope === 'all' ? [...t.sends] : []
  for (const s of t.sends) {
    if (scope === 'drafts') {
      kept.push({ table: 'report_sends', id: s.id, label: `${s.subject ?? 'no subject'} · ${s.status} · ${day(s.sent_at ?? s.claimed_at)}`, why: 'a delivery record, out of scope for drafts' })
      continue
    }
    if (!TERMINAL_SEND.has(s.status)) {
      blockers.push(
        `report_sends ${short(s.id)} is in status '${s.status}', which is not terminal: a runner may still be working on it. ` +
        `Let it settle (or close it) before deleting its history.`,
      )
    }
    const when = new Date(s.sent_at ?? s.claimed_at).getTime()
    if (Number.isFinite(when) && now - when < RECENT_SEND_MS) {
      warnings.push(
        `report_sends ${short(s.id)} (${day(s.sent_at ?? s.claimed_at)}) is younger than 48 hours. ` +
        `Deleting it makes this update read as owed-and-unsettled, so the ops health check will raise ` +
        `one \`report_missed\` alert to ALERT_EMAIL. One-off, and the operator's, never the tenant's.`,
      )
    }
  }

  // ── builds ──────────────────────────────────────────────────────────────
  // report_builds never cascades from a snapshot (the FK is SET NULL), so
  // every one that belongs to a deleted snapshot has to be named. Failed and
  // orphan builds go too: a build with no snapshot produced nothing, and one
  // pointing at a snapshot this workspace no longer has is already wreckage.
  const delBuilds: BuildRow[] = []
  for (const b of t.builds) {
    const orphan = b.snapshot_id !== null && !snapshotIds.has(b.snapshot_id)
    const doomed = b.snapshot_id !== null && delSnapshotIds.has(b.snapshot_id)
    const empty = b.snapshot_id === null
    if (!doomed && !empty && !orphan) {
      kept.push({ table: 'report_builds', id: b.id, label: `${b.status} · ${day(b.started_at)}`, why: 'its snapshot is kept' })
      continue
    }
    if (!TERMINAL_BUILD.has(b.status)) {
      blockers.push(
        `report_builds ${short(b.id)} is in status '${b.status}', which is not terminal: the build-document ` +
        `function may still be writing to it. Let it finish or fail before deleting it.`,
      )
    }
    delBuilds.push(b)
  }

  // ── share links, and the views under them ───────────────────────────────
  // A link on a deleted snapshot cascades; it is listed anyway so the audit
  // trail says which URLs stopped working. `drafts` also takes a link nothing
  // has ever opened, unless a surviving send row minted it — that URL is
  // sitting in an email somebody received.
  const delSendIds = new Set(delSends.map((s) => s.id))
  const survivingSendLinkIds = new Set(
    t.sends.filter((s) => !delSendIds.has(s.id)).map((s) => s.share_link_id).filter(Boolean) as string[],
  )
  const delLinks: ShareLinkRow[] = []
  for (const l of t.links) {
    const doomedSnapshot = l.snapshot_id !== null && delSnapshotIds.has(l.snapshot_id)
    const unviewed = l.view_count === 0 && !survivingSendLinkIds.has(l.id)
    const label = `${l.title ?? 'untitled'} · ${l.view_count} view${l.view_count === 1 ? '' : 's'} · last ${day(l.last_viewed_at)}`
    if (doomedSnapshot || unviewed) delLinks.push(l)
    else kept.push({ table: 'share_links', id: l.id, label, why: l.view_count > 0 ? 'it has been opened, and its snapshot is kept' : 'a surviving send row minted it, so the URL is in an email' })
  }
  const viewsByLink: Record<string, number> = {}
  for (const l of delLinks) viewsByLink[l.id] = l.view_count

  // ── artifacts, edits, export events ─────────────────────────────────────
  const delArtifacts = t.artifacts.filter((a) => a.snapshot_id !== null && delSnapshotIds.has(a.snapshot_id))
  const delEdits = t.edits.filter((e) => e.snapshot_id !== null && delSnapshotIds.has(e.snapshot_id))
  const delExportEvents = t.exportEvents.filter((e) => e.snapshot_id !== null && delSnapshotIds.has(e.snapshot_id))
  for (const e of t.exportEvents) {
    if (e.snapshot_id === null) {
      kept.push({ table: 'export_events', id: String(e.id), label: `${e.action ?? '?'} ${e.kind ?? ''} · ${day(e.created_at)}`, why: 'its snapshot_id is already null, so it names nothing that is going' })
    }
  }

  // ── weekly_reports (legacy, stored HTML) ────────────────────────────────
  const delWeekly: WeeklyRow[] = []
  for (const w of t.weekly) {
    const label = `${w.subject ?? 'no subject'} · ${day(w.week_start)} to ${day(w.week_end)} · ${w.sent_at ? `emailed ${day(w.sent_at)}` : 'never emailed'}`
    if (scope === 'all' || w.sent_at === null) delWeekly.push(w)
    else kept.push({ table: 'weekly_reports', id: w.id, label, why: 'it was emailed, and drafts keeps delivered history' })
  }

  // ── reports (the definitions) ───────────────────────────────────────────
  // A definition goes only when it owns no schedule and nothing of it is left.
  const scheduleByReport = new Map<string, ScheduleRow>()
  for (const s of t.schedules) if (s.report_id) scheduleByReport.set(s.report_id, s)
  const remainingByReport = new Map<string, number>()
  for (const s of t.snapshots) {
    if (!s.report_id || delSnapshotIds.has(s.id)) continue
    remainingByReport.set(s.report_id, (remainingByReport.get(s.report_id) ?? 0) + 1)
  }
  const delReports: ReportRow[] = []
  for (const r of t.reports) {
    const label = `${r.title ?? 'untitled'} · ${r.kind ?? '?'} · ${r.template_key ?? '?'} · ${day(r.created_at)}`
    const schedule = scheduleByReport.get(r.id)
    if (schedule) {
      kept.push({
        table: 'reports',
        id: r.id,
        label,
        why: `it owns the ${schedule.is_default ? 'DEFAULT ' : ''}"${schedule.name}" schedule (${short(schedule.id)}, active=${schedule.active}). ` +
          `report_schedules.report_id cascades, so deleting this row would delete that schedule and let a fresh default be minted on the next accepted invite.`,
      })
      continue
    }
    const remaining = remainingByReport.get(r.id) ?? 0
    if (remaining > 0) {
      kept.push({ table: 'reports', id: r.id, label, why: `${remaining} of its snapshot${remaining === 1 ? ' is' : 's are'} kept` })
      continue
    }
    delReports.push(r)
  }

  // Nothing here may write report_schedules, and this says so in the output.
  for (const s of t.schedules) {
    kept.push({
      table: 'report_schedules',
      id: s.id,
      label: `${s.name} · active=${s.active}${s.is_default ? ' · default' : ''}`,
      why: 'configuration, not a report. This script never writes this table.',
    })
  }

  return {
    scope,
    edits: delEdits,
    exportEvents: delExportEvents,
    artifacts: delArtifacts,
    links: delLinks,
    builds: delBuilds,
    sends: delSends,
    snapshots: delSnapshots,
    weekly: delWeekly,
    reports: delReports,
    storagePaths: delArtifacts.map((a) => a.storage_path).filter(Boolean),
    viewsByLink,
    kept,
    blockers,
    warnings,
  }
}

/** Rows the plan would delete, all told. Zero means there is nothing to do. */
export function planTotal(p: PurgePlan): number {
  return p.edits.length + p.exportEvents.length + p.artifacts.length + p.links.length
    + p.builds.length + p.sends.length + p.snapshots.length + p.weekly.length + p.reports.length
}
