import { inngest } from '@/inngest/client'
import { generateWeeklyReport } from '@/lib/report'

// Builds + sends + stores a client's periodic report. Decoupled from the pipeline
// via an event so a slow/failed report never blocks a run: runPipeline emits
// `report/send.requested` { clientId, runId } after a scheduled run completes
// (manual "Run now" runs don't, so they never email). Can also be fired directly
// for an ad-hoc/test send.

export const sendWeeklyReport = inngest.createFunction(
  {
    id: 'send-weekly-report',
    triggers: [{ event: 'report/send.requested' }],
    concurrency: { limit: 1, key: 'event.data.clientId' },
    retries: 2,
  },
  async ({ event, step }) => {
    const { clientId, runId } = event.data as { clientId?: string; runId?: string }
    if (!clientId) throw new Error('report/send.requested missing clientId')

    return await step.run('generate-and-send', () =>
      generateWeeklyReport({ clientId, runId }),
    )
  },
)
