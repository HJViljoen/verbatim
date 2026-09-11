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
// Timing (vercel.json, which cannot carry a comment): 07:00 UTC = 09:00 SAST,
// THREE hours after the 06:00 SAST dispatcher slot. The run-not-started grace is
// two hours, so a run that starts late — queued behind the account's hard 5-slot
// Inngest concurrency, or a slow cold start — has an hour of margin before it is
// called missing. Hobby allows one daily cron per job, so this is a once-a-day
// check: an Inngest outage that starts and clears between two mornings is not
// seen. Sub-day coverage is a Pro-plan decision, not a threshold tweak.
//
// Auth: the Authorization: Bearer CRON_SECRET header Vercel Cron sends, or the
// same X-Admin-Key the /api/admin routes take so Heinrich can run it by hand.
// With CRON_SECRET unset it refuses (503) rather than running open — the JSON
// it returns is an operator's map of what is broken.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Five Supabase round-trips plus a Resend call, on a cold start. The Hobby
// default is 10 s, and a timeout here is exactly the silent failure this route
// exists to prevent.
export const maxDuration = 60

/** Can an alert actually leave the building? sendAlertEmail no-ops silently
 *  when any of these is unset, so the answer ships in the JSON — booleans only,
 *  never the values. */
function alertingConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.ALERT_EMAIL)
}

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
    // Every status, not just 'sent': a 'ready' row is a review hold waiting on
    // a human and 'skipped' means the schedule had no recipients — neither is a
    // missed update. Filtered on claimed_at because a held row has no sent_at.
    admin.from('report_sends').select('run_id, sent_at, status').gte('claimed_at', since),
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
    reportSends: ((sendsRes.data ?? []) as { run_id: string | null; sent_at: string | null; status: string | null }[])
      .map((s) => ({ runId: s.run_id, sentAt: s.sent_at, status: s.status })),
  }
}

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Never run open: the response is a list of everything that is currently
    // broken, and the caller is meant to be Vercel Cron. Said loudly because
    // the failure is otherwise invisible — the daily cron would get a 503 every
    // morning forever and the only trace would be this line.
    console.error('[ops-check] CRON_SECRET is NOT configured — refusing every call, including the daily cron. Nothing is watching the pipeline.')
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  if (!secretMatches(req.headers.get('authorization'), secret) && !adminKeyValid(req.headers.get('x-admin-key'))) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const alerting = { configured: alertingConfigured() }
  try {
    const findings = assessPipelineHealth(await loadInputs(now))
    if (findings.length === 0) {
      console.log(`[ops-check] ok — nothing wrong at ${now.toISOString()}`)
    } else {
      if (!alerting.configured) {
        console.error('[ops-check] findings but alert email is NOT configured — RESEND_API_KEY, EMAIL_FROM and ALERT_EMAIL must all be set or these findings reach nobody')
      }
      const { subject, text } = formatOpsEmail(findings, now)
      if (process.env.OPS_CHECK_DRY_RUN === '1') {
        console.log(`[ops-check:dry-run] would send "${subject}"\n${text}`)
      } else {
        await sendAlertEmail(subject, text)
      }
    }
    return Response.json({ ok: findings.length === 0, findings, alerting, checkedAt: now.toISOString() })
  } catch (e) {
    // The watchman falling over is itself an outage. Say so by email, then let
    // it through so Vercel's cron log records a failed invocation too.
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[ops-check] the check itself FAILED: ${message}`)
    if (process.env.OPS_CHECK_DRY_RUN === '1') {
      console.error(`[ops-check:dry-run] would send "Verbatim ops — ops check FAILED: ${message}"`)
    } else {
      // Never let the alert's own failure replace the failure it reports: an
      // unguarded await here would swallow the rethrow below and Vercel's log
      // would record Resend's error instead of the real one.
      try {
        await sendAlertEmail(
          `Verbatim ops — ops check FAILED: ${message}`,
          `The pipeline health check itself failed at ${now.toISOString()}, so nothing is watching the pipeline right now.\n\n` +
          `Error: ${message}\n\nVercel logs: the /api/cron/ops-check function. Inngest dashboard: https://app.inngest.com`,
        )
      } catch (sendErr) {
        console.error(`[ops-check] alert about that failure could not be sent: ${sendErr instanceof Error ? sendErr.message : String(sendErr)}`)
      }
    }
    throw e
  }
}
