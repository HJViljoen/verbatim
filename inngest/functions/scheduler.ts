import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase-admin'
import { billingAccess, type BillingClient } from '@/lib/billing'
import { localDate, isWeeklyDue, isMonthlyDue } from '@/lib/pipeline/schedule-due'
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

    const dueClientIds = await step.run('find-due-clients', async () => {
      const admin = createAdminClient()
      const today = localDate()

      const [{ data: clients }, { data: configs }] = await Promise.all([
        admin.from('clients')
          .select('id, is_active, is_comped, trial_ends_at, subscription_status, approved_at')
          .eq('is_active', true),
        admin.from('tracking_configs').select('client_id, report_period, report_day'),
      ])

      const cfgByClient = new Map((configs ?? []).map((c) => [c.client_id, c]))
      const due: string[] = []
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
        if (isWeeklyDue(cfg, today) || isMonthlyDue(cfg, today)) due.push(client.id)
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

    if (dueClientIds.length > 0) {
      await step.sendEvent(
        'dispatch-due-runs',
        dueClientIds.map((clientId) => ({
          name: 'pipeline/run.requested',
          // sendReport: emit the periodic report once this scheduled run completes.
          data: { clientId, options: { sendReport: true } },
        })),
      )
    }

    return { dispatched: dueClientIds.length, clientIds: dueClientIds }
  },
)
