import { timingSafeEqual } from 'crypto'
import { adminKeyValid } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { sendAlertEmail } from '@/lib/email'
import { assessPipelineHealth, formatOpsEmail, LOOKBACK_MS, type HealthInputs } from '@/lib/ops/health'

// The dead-man's switch (WP2, 2026-09-11).
//
// Every alert this product has ever had runs inside an Inngest function, so the
// one failure it cannot report is Inngest not calling it — which is what
// happened on 2026-09-06: no pipeline_runs row for Össur at all, and silence.
// This route is a SECOND scheduler. Vercel Cron calls it, it reads Postgres
// directly and emails through Resend directly, and it depends on Inngest for
// nothing. If Inngest is dead, this is the thing that says so.
//
// Auth: the Authorization: Bearer CRON_SECRET header Vercel Cron sends, or the
// same X-Admin-Key the /api/admin routes take so Heinrich can run it by hand.
// With CRON_SECRET unset it refuses (503) rather than running open — the JSON
// it returns is an operator's map of what is broken.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function secretMatches(provided: string | null, expected: string): boolean {
  const a = Buffer.from(provided ?? '')
  const b = Buffer.from(`Bearer ${expected}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

interface ClientRow {
  id: string
  company_name: string | null
  is_active: boolean | null
  is_comped: boolean | null
  trial_ends_at: string | null
  subscription_status: string | null
  approved_at: string | null
}

async function loadInputs(now: Date): Promise<HealthInputs> {
  const admin = createAdminClient()
  const since = new Date(now.getTime() - LOOKBACK_MS).toISOString()

  // The heartbeat table may not exist yet (code deploys before the migration is
  // applied). A missing table must read as "no heartbeat", which the checker
  // reports as a finding — never as a crash.
  const heartbeatRes = await admin.from('ops_heartbeats').select('name, last_seen_at')
  if (heartbeatRes.error) {
    console.warn(`[ops-check] ops_heartbeats unreadable: ${heartbeatRes.error.message}`)
  }

  // All four reads are bounded: one row per tenant, and 14 days of runs/sends
  // across the whole install is tens of rows — nowhere near PostgREST's 1000 cap.
  const [clientsRes, configsRes, runsRes, sendsRes] = await Promise.all([
    admin.from('clients')
      .select('id, company_name, is_active, is_comped, trial_ends_at, subscription_status, approved_at')
      .eq('is_active', true),
    admin.from('tracking_configs').select('client_id, report_period, report_day'),
    // started_at, not completed_at: a run completes hours after it starts, so
    // this window holds both ends of every run inside it.
    admin.from('pipeline_runs')
      .select('id, client_id, status, options, started_at, completed_at')
      .gte('started_at', since),
    admin.from('report_sends').select('run_id, sent_at').eq('status', 'sent').gte('sent_at', since),
  ])
  for (const [what, res] of [['clients', clientsRes], ['tracking_configs', configsRes], ['pipeline_runs', runsRes], ['report_sends', sendsRes]] as const) {
    if (res.error) throw new Error(`reading ${what}: ${res.error.message}`)
  }

  const configs = (configsRes.data ?? []) as { client_id: string; report_period: string | null; report_day: string | null }[]
  const cfgByClient = new Map(configs.map((c) => [c.client_id, c]))

  return {
    now,
    heartbeats: ((heartbeatRes.data ?? []) as { name: string; last_seen_at: string }[])
      .map((h) => ({ name: h.name, lastSeenAt: h.last_seen_at })),
    clients: ((clientsRes.data ?? []) as ClientRow[]).map((c) => ({
      id: c.id,
      name: c.company_name ?? c.id,
      billing: c,
      config: cfgByClient.get(c.id) ?? {},
    })),
    runs: ((runsRes.data ?? []) as { id: string; client_id: string; status: string; options: { sendReport?: boolean } | null; started_at: string | null; completed_at: string | null }[])
      .map((r) => ({
        id: r.id, clientId: r.client_id, status: r.status, options: r.options,
        startedAt: r.started_at, completedAt: r.completed_at,
      })),
    reportSends: ((sendsRes.data ?? []) as { run_id: string | null; sent_at: string | null }[])
      .map((s) => ({ runId: s.run_id, sentAt: s.sent_at })),
  }
}

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Never run open: the response is a list of everything that is currently
    // broken, and the caller is meant to be Vercel Cron.
    console.error('[ops-check] CRON_SECRET is not set — refusing to run')
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  if (!secretMatches(req.headers.get('authorization'), secret) && !adminKeyValid(req.headers.get('x-admin-key'))) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()
  try {
    const findings = assessPipelineHealth(await loadInputs(now))
    if (findings.length === 0) {
      console.log(`[ops-check] ok — nothing wrong at ${now.toISOString()}`)
    } else {
      const { subject, text } = formatOpsEmail(findings, now)
      if (process.env.OPS_CHECK_DRY_RUN === '1') {
        console.log(`[ops-check:dry-run] would send "${subject}"\n${text}`)
      } else {
        await sendAlertEmail(subject, text)
      }
    }
    return Response.json({ ok: findings.length === 0, findings, checkedAt: now.toISOString() })
  } catch (e) {
    // The watchman falling over is itself an outage. Say so by email, then let
    // it through so Vercel's cron log records a failed invocation too.
    const message = e instanceof Error ? e.message : String(e)
    if (process.env.OPS_CHECK_DRY_RUN === '1') {
      console.error(`[ops-check:dry-run] would send "Verbatim ops — ops check FAILED: ${message}"`)
    } else {
      await sendAlertEmail(
        `Verbatim ops — ops check FAILED: ${message}`,
        `The pipeline health check itself failed at ${now.toISOString()}, so nothing is watching the pipeline right now.\n\n` +
        `Error: ${message}\n\nVercel logs: the /api/cron/ops-check function. Inngest dashboard: https://app.inngest.com`,
      )
    }
    throw e
  }
}
