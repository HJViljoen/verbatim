import { inngest } from '@/inngest/client'
import { sendAlertEmail } from '@/lib/email'
import { attentionLines, holdNotices, nudgeNotices, planSends, runDay } from '@/lib/finance/daily'
import {
  allProfiles, callAdmin, issueAll, ledgerRows, refreshFx, syncApify, tellOperator, unfinishedInvoices,
} from '@/lib/finance/daily-io'
import { applyPayments } from '@/lib/finance/ledger'
import { createAdminClient } from '@/lib/supabase-admin'

// finance-daily (Finance, 2026-11-17): the month's invoice makes and sends
// itself, billed in advance, and the operator hears about money owed.
// 07:00 SAST every day; or on `finance/daily.run` with an optional
// `{ today: 'YYYY-MM-DD' }` for a rehearsal (ignored in production, so a stray
// event never bills a month early: lib/finance/daily.ts runDay).
//
// Steps (ids are a stability contract, see AGENTS.md):
//   'day'               the day the run acts for
//   'issue'             each active profile's next month, if today is its day
//                       (lib/finance/issue.ts; once per month whatever runs)
//   'plan-print'        the drafts still to print
//   'print:<number>'    one per draft: fetches the render route (Chromium runs
//                       there, never in a step)
//   'plan-send'         which ready invoices send themselves and which wait;
//                       one that may have gone, is in flight or whose last send
//                       failed is never sent by the job, only listed in 'alert'
//   'send:<number>'     one per auto invoice: fetches the send route (claim,
//                       email with the PDF, record)
//   'tell-held'         one email to the operator for invoices waiting for a
//                       tap (D1), each said once (fin_notices)
//   'nudge'             one email to the operator for invoices past due or past
//                       their promised day, each said once
//   'fx'                the dollar's rate on the cost side, while fx_auto is on
//                       (lib/finance/vendors/fx.ts; invoices keep their fixed rate)
//   'apify-usage'       Apify's own figure for this billing cycle
//                       (lib/finance/vendors/apify.ts). Neither alerts: the page
//                       shows the day each was last read.
// Anything that failed is in one alert at the end ('alert'). Nothing here ever
// emails a client but the send route, and only for an auto profile not held.

export const financeDaily = inngest.createFunction(
  {
    id: 'finance-daily',
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ cron: 'TZ=Africa/Johannesburg 0 7 * * *' }, { event: 'finance/daily.run' }],
  },
  async ({ event, step }) => {
    const day = await step.run('day', () => runDay(new Date(), (event?.data as { today?: unknown } | undefined)?.today, process.env.VERCEL_ENV))
    const { today } = day
    const problems: string[] = []

    const issued = await step.run('issue', () => issueAll(createAdminClient(), today))
    for (const f of issued.failed) problems.push(`Issuing for profile ${f.profileId} failed: ${f.error}`)

    const drafts = await step.run('plan-print', async () =>
      (await unfinishedInvoices(createAdminClient())).filter((i) => i.status === 'draft').map((i) => ({ id: i.id, number: i.number })))
    for (const d of drafts) {
      const r = await step.run(`print:${d.number}`, () => callAdmin<{ error?: string }>(`/api/admin/finance/invoices/${d.id}/render`))
      if (!r.ok) problems.push(`Invoice ${d.number} did not print (${r.status}): ${r.json.error ?? 'no answer'}`)
    }

    const plan = await step.run('plan-send', async () => {
      const admin = createAdminClient()
      const p = planSends(await unfinishedInvoices(admin), await allProfiles(admin), today)
      return { send: p.send.map((i) => ({ id: i.id, number: i.number })), held: holdNotices(p.hold), attention: attentionLines(p.attention) }
    })
    // What the job will not send (it may have gone, or its last send failed):
    // the operator's, every run until they act.
    problems.push(...plan.attention)
    for (const s of plan.send) {
      const r = await step.run(`send:${s.number}`, () => callAdmin<{ ok?: boolean; message?: string }>(`/api/admin/finance/invoices/${s.id}/send`))
      if (!r.ok || !r.json.ok) problems.push(`Invoice ${s.number} did not send: ${r.json.message ?? r.status}`)
    }

    const held = await step.run('tell-held', () => tellOperator(createAdminClient(), 'hold', plan.held))

    const nudged = await step.run('nudge', async () => {
      const admin = createAdminClient()
      const { invoices, payments } = await ledgerRows(admin)
      return tellOperator(admin, 'nudge', nudgeNotices(invoices, applyPayments(invoices, payments, today), today))
    })

    const fx = await step.run('fx', () => refreshFx(createAdminClient()))
    const apify = await step.run('apify-usage', () => syncApify(createAdminClient()))

    if (problems.length) {
      await step.run('alert', () => sendAlertEmail(
        `Verbatim finance: ${problems.length === 1 ? 'a problem' : `${problems.length} problems`} on ${today}`,
        [...problems, '', 'Ops → Costs shows each invoice\'s state; Send and Print there retry by hand.'].join('\n'),
      ))
    }

    return {
      today,
      injected: day.injected,
      issued: issued.issued,
      printed: drafts.length,
      sent: plan.send.map((s) => s.number),
      held: held.told,
      nudged: nudged.told,
      fx,
      apify,
      problems,
    }
  },
)
