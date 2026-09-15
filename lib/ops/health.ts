// The dead-man's switch (WP2, 2026-09-11).
//
// Every alert the product had ran INSIDE an Inngest function, so when Inngest
// never called us on 2026-09-06 — no pipeline_runs row for Össur at all, just
// silence — nothing fired. This module is the pure half of a check that runs
// from a second scheduler (Vercel Cron -> /api/cron/ops-check): given a
// snapshot of heartbeats, clients, runs and sends, it says what is wrong.
//
// Pure on purpose: the whole point is that it is testable without the systems
// it is watching, which are exactly the systems that cannot be trusted to be up.

import { billingAccess, type BillingClient } from '../billing'
import { cadenceReliability } from '../pipeline/cadence'
import { lastDailySlot, lastExpectedSlot, type ScheduleConfig } from '../pipeline/schedule-due'

/** keepWarm runs every 5 min; 30 min means six consecutive misses. */
export const INNGEST_SILENT_MS = 30 * 60_000
/** How far before its 06:00 SAST slot the dispatcher's beat may sit and still
 *  count as this morning's. The dispatcher is not measured by age: a plain
 *  26-h threshold is EXACTLY the slot-to-check gap, so a beat landing five
 *  seconds after 06:00:00 reads as 25h59m59s on a 06:00 check and the missed
 *  morning goes unreported. Compare against the slot instead. */
export const DISPATCHER_BEAT_SLACK_MS = 15 * 60_000
/** How long after the slot the dispatcher's beat is expected to have landed. */
export const DISPATCHER_GRACE_MS = 90 * 60_000
/** How long after its slot a run gets before "it never started". */
export const RUN_START_GRACE_MS = 2 * 3600_000
/** A run that opened slightly early still counts as that slot's run. */
export const RUN_START_LEAD_MS = 3600_000
/** A run still in progress this long after it opened is not coming back. */
export const RUN_STUCK_MS = 6 * 3600_000
/** Statuses that mean "still going". Both occur at rest in production: the
 *  orchestrator opens a run as 'running', and the standalone Pass A script
 *  (lib/pipeline/pass-a.ts) parks it at 'analyzing' — which is what the row
 *  stranded since 2026-06-13 actually is. A rule that only knew 'running' would
 *  have missed the one stuck run this install has ever had. */
export const IN_PROGRESS_STATUSES = new Set(['running', 'analyzing'])
/** An owed report this long after the run completed should have gone out. */
export const REPORT_GRACE_MS = 3 * 3600_000
/** How far back an undelivered update is still worth naming. This check used to
 *  run twice — once inside the dispatcher over 36 h, once here over 14 days —
 *  so one genuine miss produced one Inngest email plus a fortnight of daily ops
 *  emails. The dispatcher's copy is gone and this window is short, because
 *  alert fatigue is how 6 September stayed invisible for five days. */
export const REPORT_MISSED_WINDOW_MS = 48 * 3600_000
/** How far back a run that closed clean is still checked for what it left
 *  behind. Same 48 h as the missed report, and for the same reason: an update
 *  that lost its record is worth one morning's email, not a fortnight of them.
 *
 *  No grace before it. The three writes it asks about all land at or within
 *  seconds of the close, and the check runs once a day at 09:00 SAST against a
 *  06:00 SAST slot — a grace wide enough to cover a retrying cost write would
 *  push Sunday's finding to Monday, which is a day of not knowing in exchange
 *  for a race nobody has observed. */
export const RUN_INCOMPLETE_WINDOW_MS = 48 * 3600_000
/** How far back the caller reads runs and sends. Nothing older is evidence:
 *  a run stranded at 'analyzing' since 2026-06-13 would otherwise alert every
 *  morning forever, and a missed slot we cannot see rows for proves nothing. */
export const LOOKBACK_MS = 14 * 24 * 3600_000

export interface HealthHeartbeat {
  name: string
  lastSeenAt: string
}

export interface HealthClient {
  id: string
  name: string
  /** The columns billingAccess() reads — a suspended or unapproved tenant is
   *  owed no run, so its absence is not a finding. */
  billing: BillingClient
  config: ScheduleConfig
}

/** What a closed run left behind, counted by the caller. Three rows, each the
 *  end of a different part of the run: the trend series (`theme_observations`,
 *  written inside persist-themes), the recommendations Pass D produces, and the
 *  cost bookkeeping written after the run has already been stamped
 *  'completed'. */
export interface RunRowCounts {
  observations: number
  recommendations: number
  /** 0 or 1 — `run_costs` is one row per run. */
  costs: number
}

export interface HealthRun {
  id: string
  clientId: string
  status: string
  options: { sendReport?: boolean } | null
  startedAt: string | null
  completedAt: string | null
  /** The run's frozen flag snapshot. Only `themeRegistry` is read here: it
   *  decides whether theme observations were expected of this run at all.
   *  Absent on every run opened before 2026-08-18. */
  flags?: { themeRegistry?: boolean } | null
  /** What the run wrote, when the caller counted it — see `needsRowCounts`.
   *  Absent means "not counted", which is never a finding: a checker that read
   *  an uncounted run as an empty one would invent an outage out of a loader
   *  that skipped a row. */
  rows?: RunRowCounts | null
}

export interface HealthReportSend {
  runId: string | null
  sentAt: string | null
  /** report_sends.status — 'sent', 'ready' (held for review) and 'skipped' (no
   *  recipients) all mean the send path did as it was told. */
  status: string | null
}

export interface HealthInputs {
  now: Date
  heartbeats: HealthHeartbeat[]
  clients: HealthClient[]
  /** pipeline_runs from the last LOOKBACK_MS. */
  runs: HealthRun[]
  /** report_sends of EVERY status from the last LOOKBACK_MS. */
  reportSends: HealthReportSend[]
}

export type FindingKind =
  | 'inngest_silent'
  | 'dispatcher_silent'
  | 'run_not_started'
  | 'run_stuck'
  | 'run_incomplete'
  | 'report_missed'

export interface Finding {
  kind: FindingKind
  clientId?: string
  clientName?: string
  detail: string
}

const NO_HEARTBEAT = 'no heartbeat recorded yet'

function ago(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 120) return `${min} min ago`
  const hours = Math.floor(min / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.floor(hours / 24)} days ago`
}

/** Absent is the loudest case, not an error: either nothing has ever written
 *  the row (table just shipped) or the writer has been dead since the table was
 *  created. Both mean "we cannot show that Inngest is alive". */
function missingBeat(beats: Map<string, number>, name: string, kind: FindingKind): Finding | null {
  return beats.has(name) ? null : { kind, detail: NO_HEARTBEAT }
}

/**
 * Which runs the caller has to count rows for: one that closed 'completed'
 * inside the last RUN_INCOMPLETE_WINDOW_MS.
 *
 * Exported so the loader and the rule cannot drift — a run the loader does not
 * count arrives here with `rows` absent and can never become a finding, and a
 * run the rule would judge is exactly the one the loader counts.
 *
 * 'completed' only, deliberately. A 'partial' run has already emailed through
 * the partial-run alert with its errors attached; this finding is for the runs
 * that look clean and are not.
 */
export function needsRowCounts(run: { status: string; completedAt: string | null }, now: Date): boolean {
  if (run.status !== 'completed') return false
  const t = run.completedAt ? Date.parse(run.completedAt) : NaN
  if (Number.isNaN(t)) return false
  const age = now.getTime() - t
  return age >= 0 && age <= RUN_INCOMPLETE_WINDOW_MS
}

export function assessPipelineHealth(inputs: HealthInputs): Finding[] {
  const now = inputs.now.getTime()
  const findings: Finding[] = []

  // 1. Is Inngest calling us at all? Everything below only makes sense if it is.
  const beats = new Map<string, number>()
  for (const b of inputs.heartbeats) {
    const t = Date.parse(b.lastSeenAt)
    if (!Number.isNaN(t)) beats.set(b.name, t)
  }
  // keep-warm runs every five minutes, so plain age is the right measure.
  const inngestBeat = beats.get('inngest')
  const missingInngest = missingBeat(beats, 'inngest', 'inngest_silent')
  if (missingInngest) findings.push(missingInngest)
  else if (inngestBeat !== undefined && now - inngestBeat > INNGEST_SILENT_MS) {
    findings.push({
      kind: 'inngest_silent',
      detail: `keep-warm (every 5 min) last checked in ${ago(now - inngestBeat)} (${new Date(inngestBeat).toISOString()}); limit is ${ago(INNGEST_SILENT_MS)}`,
    })
  }

  // The dispatcher runs once, at 06:00 SAST, so it is measured against that
  // slot rather than by age — see DISPATCHER_BEAT_SLACK_MS.
  const dispatcherBeat = beats.get('dispatcher')
  const missingDispatcher = missingBeat(beats, 'dispatcher', 'dispatcher_silent')
  if (missingDispatcher) findings.push(missingDispatcher)
  else if (dispatcherBeat !== undefined) {
    const slot = lastDailySlot(inputs.now).getTime()
    if (now >= slot + DISPATCHER_GRACE_MS && dispatcherBeat < slot - DISPATCHER_BEAT_SLACK_MS) {
      findings.push({
        kind: 'dispatcher_silent',
        detail: `the 06:00 SAST dispatcher did not check in for the ${new Date(slot).toISOString()} slot; its last beat is ${new Date(dispatcherBeat).toISOString()} (${ago(now - dispatcherBeat)})`,
      })
    }
  }

  // 2. Did every run that was due actually start? Absence of a pipeline_runs
  //    row is the only signal there is — nothing records "expected but never
  //    dispatched" — so the expectation has to be recomputed here.
  //    `pipeline_runs.scheduled_for` (2026-09-15) names the slot a run SERVED,
  //    which is the other half: it makes a started run's slot a fact instead of
  //    an inference, but a slot nobody ran still writes no row at all. Phase 1
  //    turns this into a join on that column and keeps this recomputation for
  //    the rows that predate it.
  const startsByClient = new Map<string, number[]>()
  for (const r of inputs.runs) {
    const t = r.startedAt ? Date.parse(r.startedAt) : NaN
    if (Number.isNaN(t)) continue
    const list = startsByClient.get(r.clientId)
    if (list) list.push(t)
    else startsByClient.set(r.clientId, [t])
  }
  for (const client of inputs.clients) {
    if (!billingAccess(client.billing).hasAccess) continue
    const slot = lastExpectedSlot(client.config, inputs.now)
    if (!slot) continue
    const slotMs = slot.getTime()
    if (now < slotMs + RUN_START_GRACE_MS) continue
    // Only claim a miss for a slot the run window can actually speak to.
    if (now - slotMs > LOOKBACK_MS) continue
    const started = (startsByClient.get(client.id) ?? []).some((t) => t >= slotMs - RUN_START_LEAD_MS)
    if (started) continue
    findings.push({
      kind: 'run_not_started',
      clientId: client.id,
      clientName: client.name,
      detail: `expected a run at ${slot.toISOString()} (${ago(now - slotMs)}); no pipeline_runs row exists`,
    })
  }

  // 3. A run that opened and never closed.
  const nameById = new Map(inputs.clients.map((c) => [c.id, c.name]))
  for (const r of inputs.runs) {
    if (!IN_PROGRESS_STATUSES.has(r.status)) continue
    const t = r.startedAt ? Date.parse(r.startedAt) : NaN
    if (Number.isNaN(t)) continue
    const age = now - t
    if (age <= RUN_STUCK_MS || age > LOOKBACK_MS) continue
    findings.push({
      kind: 'run_stuck',
      clientId: r.clientId,
      clientName: nameById.get(r.clientId),
      detail: `run ${r.id} has been '${r.status}' since ${new Date(t).toISOString()} (${ago(age)})`,
    })
  }

  // 4. A run that closed 'completed' and left nothing behind.
  //    Status is only as honest as the catch sites are: four of them log
  //    without counting, everything after close-run cannot change the status at
  //    all, and until this week the whole theme_observations write sat inside a
  //    swallowed try/catch. So the status is not evidence on its own — the rows
  //    are. Three, each the end of a different half of the run.
  for (const r of inputs.runs) {
    if (!needsRowCounts(r, inputs.now)) continue
    const counts = r.rows
    if (!counts) continue
    const missing: string[] = []
    // Only when the registry was on for THIS run: before the flag, observations
    // were not written at all, and a feature's age is not an incident.
    if (r.flags?.themeRegistry === true && counts.observations === 0) {
      missing.push('no theme observations — the trend series has no point for this update')
    }
    if (counts.recommendations === 0) missing.push('no recommendations')
    // Written after close-run and .catch()-ed, so its absence cannot show up in
    // the status: a run that cost money and recorded none looks free.
    if (counts.costs === 0) missing.push('no run_costs row — what this update spent is unrecorded')
    if (missing.length === 0) continue
    findings.push({
      kind: 'run_incomplete',
      clientId: r.clientId,
      clientName: nameById.get(r.clientId),
      detail: `run ${r.id} closed 'completed' at ${r.completedAt} with ${missing.join('; ')}`,
    })
  }

  // 5. A run that finished owing a report, and the report never went out.
  //    cadenceReliability owns both halves of that rule — what "owed" means
  //    (options.sendReport, completed or partial) and which report_sends states
  //    settle it — so neither is restated here.
  const ripe = inputs.runs.filter((r) => {
    const t = r.completedAt ? Date.parse(r.completedAt) : NaN
    return !Number.isNaN(t) && now - t > REPORT_GRACE_MS && now - t <= REPORT_MISSED_WINDOW_MS
  })
  const cadence = cadenceReliability(
    ripe.map((r) => ({ id: r.id, status: r.status, options: r.options, completedAt: r.completedAt })),
    inputs.reportSends.map((s) => ({ runId: s.runId, sentAt: s.sentAt, status: s.status })),
  )
  const runById = new Map(inputs.runs.map((r) => [r.id, r]))
  for (const id of cadence.missedRunIds) {
    const run = runById.get(id)
    findings.push({
      kind: 'report_missed',
      clientId: run?.clientId,
      clientName: run ? nameById.get(run.clientId) : undefined,
      detail: `run ${id} completed ${run?.completedAt ?? '?'} with sendReport, and no report_sends row is 'sent'`,
    })
  }

  return findings
}

const INNGEST_DASHBOARD = 'https://app.inngest.com'
const REREGISTER = 'curl -X PUT https://app.verbatimintel.com/api/inngest'

const HEADINGS: Record<FindingKind, string> = {
  inngest_silent: 'Inngest is not calling us',
  dispatcher_silent: 'The daily dispatcher has not run',
  run_not_started: 'A due run never started',
  run_stuck: 'A run is stuck',
  run_incomplete: 'An update finished without its record',
  report_missed: 'A finished update reached nobody',
}

/** The operator email for one check. Leads with the two things to do first,
 *  because the most likely cause is a registration gap after a deploy. */
export function formatOpsEmail(findings: Finding[], now: Date): { subject: string; text: string } {
  const n = findings.length
  const subject = `Verbatim ops — ${n} finding${n === 1 ? '' : 's'}`
  const lines = findings.map((f) => {
    const who = f.clientName ? ` [${f.clientName}]` : ''
    return `• ${HEADINGS[f.kind]}${who}: ${f.detail}`
  })
  const text = [
    `The pipeline health check found ${n} thing${n === 1 ? '' : 's'} wrong at ${now.toISOString()}.`,
    '',
    ...lines,
    '',
    'First two moves:',
    `  1. Inngest dashboard — is the app registered and are the crons firing? ${INNGEST_DASHBOARD}`,
    `  2. Re-register after a deploy: ${REREGISTER}`,
    '',
    'Then: POST /api/admin/trigger-run {"clientId":"…"} to run a client by hand,',
    'and POST /api/admin/send-report {"clientId":"…","runId":"…"} to re-send an update.',
  ].join('\n')
  return { subject, text }
}
