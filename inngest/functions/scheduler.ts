import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase-admin'
import { billingAccess, type BillingClient } from '@/lib/billing'
import { localDate, isWeeklyDue, isMonthlyDue, lastExpectedSlot, DISPATCH_WAIT_CAP_MS } from '@/lib/pipeline/schedule-due'
import { runIdForEvent } from '@/lib/pipeline/run-guard'
import {
  DISPATCH_POLL_MS, dispatchOrder, normaliseDue, waitVerdict,
  type DueClient, type MemoisedDueClient, type RunCheck, type WaitVerdict,
} from '@/lib/pipeline/sequential-dispatch'
import { touchHeartbeat } from '@/lib/ops/heartbeat'
import { sendAlertEmail } from '@/lib/email'

// Daily cron that decides which clients are due a run today and dispatches one
// `pipeline/run.requested` event each (runPipeline handles a single client).
//
// Schedule is read per client from tracking_configs: weekly runs fire on
// report_day; monthly runs fire on the 1st. Evaluated in Africa/Johannesburg so
// report_day matches the user's local week. Runs 06:00 SAST.
//
// ONE CLIENT AT A TIME (12 Oct 2026). This used to send every due client's
// event in one batch. On Sunday 11 Oct Össur and Sealand were dispatched at the
// same moment, their steps ran side by side on shared Vercel Fluid instances,
// eleven instances ran out of memory between 05:44 and 05:53 UTC, and Össur's
// synthesize died with an HTTP 500; the same step on the same data succeeded
// when it ran alone the next day. The pipeline's `concurrency` key is the
// client, so nothing in Inngest stopped two clients' runs overlapping.
//
// Now the due clients are dispatched oldest first (`dispatchOrder`,
// lib/pipeline/sequential-dispatch.ts), and after each one except the last the
// function waits for that run to settle: it sleeps ten minutes, reads that one
// pipeline_runs row, and repeats until the run has closed, has no row (open-run
// skipped it or it never opened), or DISPATCH_WAIT_CAP_MS (5 h) has passed; on
// the cap it alerts and dispatches the next client anyway. A sleeping function
// holds no concurrency slot. So on a Sunday with two clients this function
// lives for hours, not seconds, and the second client's run opens within ten
// minutes of the first one closing (Össur's takes two to three hours), or five
// hours after 06:00 if the first is stuck. That is why the ops check runs at
// 12:00 SAST (vercel.json; app/api/cron/ops-check/route.ts).
//
// Step ids, in order: `heartbeat`, `find-due-clients`, then per client
// `dispatch:<clientId>` and, for every client but the last,
// `wait:<clientId>:<k>` / `check:<clientId>:<k>` for k = 0, 1, … Everything in
// them comes from find-due-clients' memoised output, so a replay walks the same
// ids. A deploy that changes them must not land while a dispatcher is in
// flight, which on a Sunday is now from 06:00 to as late as about 11:00 SAST.

export const scheduledPipelineDispatcher = inngest.createFunction(
  {
    id: 'scheduled-pipeline-dispatcher',
    triggers: [{ cron: 'TZ=Africa/Johannesburg 0 6 * * *' }],
    // This function had no failure handler: if find-due-clients threw its way
    // out of retries, the morning's dispatch simply did not happen and the only
    // trace was a red row in Inngest's dashboard that nobody watches (WP2).
    // Since clients are dispatched one at a time, a failure can come after
    // some of them were already dispatched, so the alert cannot say "none".
    onFailure: async ({ event }) => {
      const message = (event.data as { error?: { message?: string } }).error?.message ?? 'dispatcher failed'
      await sendAlertEmail(
        'Verbatim ops — dispatcher FAILED',
        `The 06:00 SAST scheduled-pipeline-dispatcher failed after retries. It dispatches due clients one at a time, so some or all of today's clients may not have been dispatched.\n\n` +
        `Error: ${message}\n\n` +
        `Check today's pipeline_runs rows (client_id, status, started_at) before running anyone by hand: a client that already has a run today must not get a second.\n` +
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
      const due: DueClient[] = []
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
          // approvedAt: the dispatch order's key (dispatchOrder).
          due.push({ clientId: client.id, scheduledFor: slot ? slot.toISOString() : null, approvedAt: client.approved_at ?? null })
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

    // Every shape find-due-clients has memoised (a bare id before 2026-09-15,
    // no approvedAt before 2026-10-12) reads, so a dispatcher suspended across
    // a deploy replays cleanly; ordered here, from the memoised output, so the
    // order and every step id below are the same on every replay.
    const queue = dispatchOrder(normaliseDue(dueClients as MemoisedDueClient[]))

    // What became of each dispatched client, for the return value (Inngest's
    // run output, which outlives Vercel's hour of logs): how its wait ended,
    // or 'last' for the client nobody waits behind.
    const runs: ({ clientId: string; runId: string | null } & (WaitVerdict | { state: 'last' | 'no_event_id' }))[] = []
    for (const [i, { clientId, scheduledFor }] of queue.entries()) {
      const sent = await step.sendEvent(`dispatch:${clientId}`, {
        name: 'pipeline/run.requested',
        // sendReport: emit the periodic report once this scheduled run completes.
        // scheduledFor: the slot this run serves, recorded on the run row.
        data: { clientId, options: { sendReport: true, scheduledFor } },
      })
      // The id open-run gives this run: derived from the event id, exactly as
      // pipeline.ts derives newRunId, so the row can be read by primary key.
      const eventId = sent.ids[0]
      const runId = eventId ? runIdForEvent(eventId) : null

      // The last client has nobody waiting behind it.
      if (i === queue.length - 1) {
        runs.push({ clientId, runId, state: 'last' })
        break
      }
      if (!runId) {
        console.error(`[scheduler] dispatched client ${clientId} but got no event id back, so its run cannot be watched; dispatching the next client without waiting`)
        runs.push({ clientId, runId, state: 'no_event_id' })
        continue
      }

      let verdict: WaitVerdict = { state: 'waiting', status: null }
      // waitVerdict never answers 'waiting' at the last look, so this ends.
      for (let k = 0; verdict.state === 'waiting'; k++) {
        await step.sleep(`wait:${clientId}:${k}`, DISPATCH_POLL_MS)
        verdict = await step.run(`check:${clientId}:${k}`, () => checkRun(clientId, runId, k))
      }
      runs.push({ clientId, runId, ...verdict })
    }

    return { dispatched: queue.length, clientIds: queue.map((d) => d.clientId), runs }
  },
)

/**
 * One look at the run the dispatcher is waiting on: that ONE pipeline_runs row,
 * by primary key, `id, status` only. Runs inside the `check:` step, so its log
 * line and its alert happen once rather than on every replay. Never throws: a
 * read that fails is a look that saw nothing, and the next look ten minutes on
 * is its retry. A throw would retry the step and then fail the dispatcher, and
 * every client still queued would lose its week to one bad read.
 */
async function checkRun(clientId: string, runId: string, check: number): Promise<WaitVerdict> {
  let read: RunCheck
  try {
    const { data, error } = await createAdminClient()
      .from('pipeline_runs').select('id, status').eq('id', runId).maybeSingle()
    read = error ? { status: null, error: error.message } : { status: (data?.status as string | undefined) ?? null }
  } catch (e) {
    read = { status: null, error: e instanceof Error ? e.message : String(e) }
  }
  const verdict = waitVerdict(read, check)
  const after = `${((check + 1) * DISPATCH_POLL_MS) / 60_000} min after dispatch`
  if (verdict.state === 'absent') {
    console.warn(`[scheduler] no pipeline_runs row ${runId} for client ${clientId} ${after}: open-run skipped it (another run in flight) or it never opened; dispatching the next client`)
  } else if (verdict.state === 'settled') {
    console.log(`[scheduler] run ${runId} for client ${clientId} settled '${verdict.status}' ${after}; dispatching the next client`)
  } else if (verdict.state === 'waiting' && read.error !== undefined) {
    console.warn(`[scheduler] could not read run ${runId} for client ${clientId} ${after}: ${read.error}; looking again`)
  } else if (verdict.state === 'capped') {
    const why = verdict.error !== undefined ? `its row could not be read (${verdict.error})` : `it is still '${verdict.status}'`
    const hours = DISPATCH_WAIT_CAP_MS / 3600_000
    console.error(`[scheduler] GAVE UP waiting on run ${runId} for client ${clientId} after ${hours} h: ${why}; dispatching the next client anyway`)
    await sendAlertEmail(
      'Verbatim ops — dispatcher stopped waiting on a run',
      `The 06:00 SAST dispatcher runs due clients one at a time. Run ${runId} (client ${clientId}) was dispatched ${hours} h ago and ${why}, so the dispatcher has stopped waiting and is dispatching the next client now.\n\n` +
      `The two runs may now overlap, which is what ran Vercel out of memory on 11 Oct 2026. Check the run in the Inngest dashboard: https://app.inngest.com`,
    )
  }
  return verdict
}
