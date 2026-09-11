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
import { lastExpectedSlot, type ScheduleConfig } from '../pipeline/schedule-due'

/** keepWarm runs every 5 min; 30 min means six consecutive misses. */
export const INNGEST_SILENT_MS = 30 * 60_000
/** The dispatcher is daily, so 26 h is one missed morning plus slack. */
export const DISPATCHER_SILENT_MS = 26 * 3600_000
/** How long after its slot a run gets before "it never started". */
export const RUN_START_GRACE_MS = 2 * 3600_000
/** A run that opened slightly early still counts as that slot's run. */
export const RUN_START_LEAD_MS = 3600_000
/** A run still 'running' this long after it opened is not coming back. */
export const RUN_STUCK_MS = 6 * 3600_000
/** An owed report this long after the run completed should have gone out. */
export const REPORT_GRACE_MS = 3 * 3600_000
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

export interface HealthRun {
  id: string
  clientId: string
  status: string
  options: { sendReport?: boolean } | null
  startedAt: string | null
  completedAt: string | null
}

export interface HealthReportSend {
  runId: string | null
  sentAt: string | null
}

export interface HealthInputs {
  now: Date
  heartbeats: HealthHeartbeat[]
  clients: HealthClient[]
  /** pipeline_runs from the last LOOKBACK_MS. */
  runs: HealthRun[]
  /** report_sends with status 'sent' from the last LOOKBACK_MS. */
  reportSends: HealthReportSend[]
}

export type FindingKind =
  | 'inngest_silent'
  | 'dispatcher_silent'
  | 'run_not_started'
  | 'run_stuck'
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

function heartbeatFinding(
  beats: Map<string, number>, name: string, kind: FindingKind, limitMs: number, now: number, label: string,
): Finding | null {
  const seen = beats.get(name)
  // Absent is the loudest case, not an error: either nothing has ever written
  // the row (table just shipped) or the writer has been dead since the table
  // was created. Both mean "we cannot show that Inngest is alive".
  if (seen === undefined) return { kind, detail: NO_HEARTBEAT }
  const age = now - seen
  if (age <= limitMs) return null
  return { kind, detail: `${label} last checked in ${ago(age)} (${new Date(seen).toISOString()}); limit is ${ago(limitMs)}` }
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
  const inngest = heartbeatFinding(beats, 'inngest', 'inngest_silent', INNGEST_SILENT_MS, now, 'keep-warm (every 5 min)')
  if (inngest) findings.push(inngest)
  const dispatcher = heartbeatFinding(beats, 'dispatcher', 'dispatcher_silent', DISPATCHER_SILENT_MS, now, 'the 06:00 SAST dispatcher')
  if (dispatcher) findings.push(dispatcher)

  // 2. Did every run that was due actually start? Absence of a pipeline_runs
  //    row is the only signal there is — nothing records "expected but never
  //    dispatched" — so the expectation has to be recomputed here.
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
    if (r.status !== 'running') continue
    const t = r.startedAt ? Date.parse(r.startedAt) : NaN
    if (Number.isNaN(t)) continue
    const age = now - t
    if (age <= RUN_STUCK_MS || age > LOOKBACK_MS) continue
    findings.push({
      kind: 'run_stuck',
      clientId: r.clientId,
      clientName: nameById.get(r.clientId),
      detail: `run ${r.id} has been 'running' since ${new Date(t).toISOString()} (${ago(age)})`,
    })
  }

  // 4. A run that finished owing a report, and the report never went out.
  //    cadenceReliability already knows what "owed" means (options.sendReport,
  //    completed or partial, a report_sends row with sent_at) — do not restate it.
  const settled = inputs.runs.filter((r) => {
    const t = r.completedAt ? Date.parse(r.completedAt) : NaN
    return !Number.isNaN(t) && now - t > REPORT_GRACE_MS && now - t <= LOOKBACK_MS
  })
  const cadence = cadenceReliability(
    settled.map((r) => ({ id: r.id, status: r.status, options: r.options, completedAt: r.completedAt })),
    inputs.reportSends.map((s) => ({ runId: s.runId, sentAt: s.sentAt })),
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
