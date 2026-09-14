import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase-admin'
import { billingAccess, type BillingClient } from '@/lib/billing'
import { localDate, isWeeklyDue, isMonthlyDue, lastExpectedSlot } from '@/lib/pipeline/schedule-due'
import { touchHeartbeat } from '@/lib/ops/heartbeat'
import { sendAlertEmail } from '@/lib/email'

// Daily cron that decides which clients are due a run today and dispatches one
// `pipeline/run.requested` event each (runPipeline handles a single client).
//
// Schedule is read per client from tracking_configs: weekly runs fire on
// report_day; monthly runs fire on the 1st. Evaluated in Africa/Johannesburg so
// report_day matches the user's local week. Runs 06:00 SAST.

export const scheduledPipelineDispatcher = inngest.createFunction(
  {
    id: 'scheduled-pipeline-dispatcher',
    triggers: [{ cron: 'TZ=Africa/Johannesburg 0 6 * * *' }],
    // This function had no failure handler: if find-due-clients threw its way
    // out of retries, the morning's dispatch simply did not happen and the only
    // trace was a red row in Inngest's dashboard that nobody watches (WP2).
    onFailure: async ({ event }) => {
      const message = (event.data as { error?: { message?: string } }).error?.message ?? 'dispatcher failed'
      await sendAlertEmail(
        'Verbatim ops — dispatcher FAILED',
        `The 06:00 SAST scheduled-pipeline-dispatcher failed after retries, so no client was dispatched today.\n\n` +
        `Error: ${message}\n\n` +
        `Run a client by hand: POST /api/admin/trigger-run {"clientId":"…","options":{"sendReport":true}}\n` +
        `Inngest dashboard: https://app.inngest.com`,
      )
    },
  },
  async ({ step }) => {
    // Liveness beacon FIRST, before anything that can fail: the ops check
    // outside Inngest reads this row to tell "the dispatcher ran and something
    // went wrong" from "the dispatcher was never called" — the 2026-09-06
    // failure mode. Its own failure is swallowed (touchHeartbeat never throws).
    await step.run('heartbeat', async () => {
      const { weekday, dayOfMonth } = localDate()
      return touchHeartbeat(createAdminClient, 'dispatcher', { weekday, dayOfMonth })
    })

    const dueClients = await step.run('find-due-clients', async () => {
      const admin = createAdminClient()
      const now = new Date()
      const today = localDate(now)

      const [{ data: clients }, { data: configs }] = await Promise.all([
        admin.from('clients')
          .select('id, is_active, is_comped, trial_ends_at, subscription_status, approved_at')
          .eq('is_active', true),
        admin.from('tracking_configs').select('client_id, report_period, report_day'),
      ])

      const cfgByClient = new Map((configs ?? []).map((c) => [c.client_id, c]))
      const due: { clientId: string; scheduledFor: string | null }[] = []
      for (const client of (clients ?? []) as (BillingClient & { id: string })[]) {
        const cfg = cfgByClient.get(client.id)
        if (!cfg) continue
        // Billing gate (T0-2): is_active alone let an expired trial or a
        // cancelled subscription keep drawing paid runs every week. Comped
        // tenants (all four live ones today) pass unchanged.
        const access = billingAccess(client)
        if (!access.hasAccess) {
          console.log(`[scheduler] skipping ${client.id}: no access (${access.reason})`)
          continue
        }
        if (isWeeklyDue(cfg, today) || isMonthlyDue(cfg, today)) {
          // The slot this dispatch is serving — today's 06:00 SAST, computed by
          // the same rule the ops check uses to ask "was it started?". The run
          // row carries it (pipeline_runs.scheduled_for), so that question stops
          // being a recomputation from config and becomes a column. Null would
          // mean a manual run, so a due client with no resolvable slot (it has
          // one by construction here) simply carries none.
          const slot = lastExpectedSlot(cfg, now)
          due.push({ clientId: client.id, scheduledFor: slot ? slot.toISOString() : null })
        }
      }
      return due
    })

    // The cadence check that used to live here as a `check-cadence` step moved
    // OUT of this function (WP2). It ran inside the very cron it was meant to
    // vouch for, so it could not report the one failure that matters — Inngest
    // never calling us — and it duplicated the ops check's report_missed
    // finding, turning one genuine miss into an email from here plus a daily
    // email from there. /api/cron/ops-check owns delivery reliability now, over
    // a 48-hour window, and it runs on Vercel Cron where Inngest cannot silence it.

    // Tolerate the pre-2026-09-15 memoised shape (a bare client id), so a
    // dispatcher suspended across the deploy replays cleanly.
    const due = (dueClients as (string | { clientId: string; scheduledFor: string | null })[]).map((d) =>
      typeof d === 'string' ? { clientId: d, scheduledFor: null } : d,
    )

    if (due.length > 0) {
      await step.sendEvent(
        'dispatch-due-runs',
        due.map(({ clientId, scheduledFor }) => ({
          name: 'pipeline/run.requested',
          // sendReport: emit the periodic report once this scheduled run completes.
          // scheduledFor: the slot this run serves, recorded on the run row.
          data: { clientId, options: { sendReport: true, scheduledFor } },
        })),
      )
    }

    return { dispatched: due.length, clientIds: due.map((d) => d.clientId) }
  },
)
