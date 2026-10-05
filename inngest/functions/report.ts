import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase-admin'
import { appBaseUrl } from '@/lib/site'
import { isTestRun, reportTargets } from '@/lib/schedules/due'
import type { ScheduleRow } from '@/lib/schedules/types'

// After a scheduled update: every schedule of the workspace that is due
// builds its report and emails its list (Stage 3). Decoupled from the
// pipeline by an event so a slow report never blocks a run: runPipeline emits
// `report/send.requested` { clientId, runId } after every run that finishes.
//
// A MANUAL RUN EMAILS NOBODY, AND ITS WEEKLY READ STILL REACHES THE PLATFORM
// (5 Oct; Heinrich: "a finished run reaches the platform by itself; review
// holds ONLY the email"). Until 5 Oct a manual run emitted nothing, so Össur's
// 4 Oct read never became an issue. Now a manual run's event carries
// `manual: true`, and `reportTargets` (lib/schedules/due.ts) fires its active
// weekly-read schedules alone, each with `noEmail`: built, held and put in the
// client's past issues, no list and no reviewer emailed, no other schedule
// started; unless the run is a test (`isTestRun`: a rehearsal that gathered
// nothing, a capped run, `options.publish: false`), which fires nothing. A
// scheduled run fires every due schedule as before, plus any active
// weekly-read schedule that is not due, with `noEmail`. An event without
// `manual` (every one emitted before 5 Oct) is a scheduled run's.
//
// This function only ORCHESTRATES. The work — loaders, cover, Chromium,
// Storage, share link, Resend — happens in POST /api/admin/schedules/run, one
// call per schedule, because a Chromium render inside an Inngest step would
// sit in the account's 5-slot concurrency budget next to the pipeline itself.
// A step throws when the runner reports a failure, so Inngest retries it —
// safe, because the runner claims (schedule, run) before it renders and a
// failed row may be taken over. A step out of retries is caught here so the
// workspace's other schedules still go out.
//
// Steps (ids are a stability contract — see AGENTS.md): 'find-due-schedules',
// then one `send:<scheduleId>` per schedule (stable per schedule). Unchanged
// on 5 Oct: what `find-due-schedules` returns gained an optional `noEmail`
// per schedule, which a run memoised before then simply does not carry.

export const sendWeeklyReport = inngest.createFunction(
  {
    id: 'send-weekly-report',
    triggers: [{ event: 'report/send.requested' }],
    concurrency: { limit: 1, key: 'event.data.clientId' },
    retries: 2,
  },
  async ({ event, step }) => {
    const { clientId, runId, manual } = event.data as { clientId?: string; runId?: string; manual?: boolean }
    if (!clientId) throw new Error('report/send.requested missing clientId')
    if (!runId) throw new Error('report/send.requested missing runId')

    const due = await step.run('find-due-schedules', async () => {
      const admin = createAdminClient()
      const [{ data: schedules, error }, { data: run, error: runError }] = await Promise.all([
        // `*`, not a column list: `artefact` is M8's column, and a select
        // naming it fails outright on a database a migration behind.
        admin.from('report_schedules').select('*').eq('client_id', clientId).order('created_at'),
        admin.from('pipeline_runs').select('id, completed_at, started_at, options').eq('id', runId).maybeSingle(),
      ])
      // A failed read throws, so the step retries: an empty answer would
      // leave the run's issue off the platform with nothing said, and a run
      // unread could not be told from a test.
      if (error) throw new Error(`report_schedules: ${error.message}`)
      if (runError) throw new Error(`pipeline_runs: ${runError.message}`)
      const r = run as { id: string; completed_at: string | null; started_at: string | null; options: unknown } | null
      const runDate = r?.completed_at ?? r?.started_at ?? new Date().toISOString()
      return reportTargets((schedules ?? []) as ScheduleRow[], runDate, { manual: manual === true, testRun: isTestRun(r) })
    })

    const results: { id: string; name: string; status: string; ms?: number; error?: string }[] = []
    for (const s of due) {
      try {
        const res = await step.run(`send:${s.id}`, async () => {
          const r = await fetch(`${appBaseUrl()}/api/admin/schedules/run`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-admin-key': process.env.ADMIN_API_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '' },
            body: JSON.stringify({ scheduleId: s.id, runId, ...(s.noEmail ? { noEmail: true } : {}) }),
          })
          const j = (await r.json().catch(() => ({}))) as { status?: string; ms?: number; error?: string }
          if (!r.ok) throw new Error(`schedules/run ${r.status}: ${j.error ?? j.status ?? 'no body'}`)
          return { status: j.status ?? 'ok', ms: j.ms, error: j.error }
        })
        results.push({ id: s.id, name: s.name, ...res })
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        console.error(`[send-weekly-report] ${s.name} (${s.id}) out of retries: ${error}`)
        results.push({ id: s.id, name: s.name, status: 'failed', error })
      }
    }
    return { clientId, runId, due: due.length, results }
  },
)
