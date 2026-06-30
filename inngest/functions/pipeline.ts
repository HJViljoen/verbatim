import { randomUUID } from 'crypto'
import { inngest } from '@/inngest/client'
import { createAdminClient, selectAll } from '@/lib/supabase-admin'
import { runGather } from '@/lib/gather/gather'
import { runPassA } from '@/lib/pipeline/pass-a'
import { runStepA2 } from '@/lib/pipeline/step-a2'
import { runPassC } from '@/lib/pipeline/pass-c'
import { runPassD } from '@/lib/pipeline/pass-d'
import { computeMetrics } from '@/lib/pipeline/metrics'
import { CLUSTER_SIMILARITY_THRESHOLD, EVIDENCE_FLOOR } from '@/lib/config'
import type { Platform } from '@/lib/gather/types'
import type { VideoRow, CommentRow } from '@/lib/pipeline/types'

// The full Verbatim pipeline as one durable Inngest function — the port of the
// scripts/run-*.ts CLI sequence the orchestrator was always meant to own
// (see the notes in run-gather.ts / run-cd.ts). One run_id flows through every
// stage; each stage is a retryable step decoupled via the DB, so a failure
// resumes from the last completed step rather than re-scraping.
//
// Trigger: `pipeline/run.requested` { clientId, options? }. The cron dispatcher
// (scheduler.ts) and the "Run now" button both emit this event.
//
// Timeout note: gather is split per-platform so no single step scrapes all three
// at once. Pass A is one step; on a very large corpus it could approach the
// function time limit — if that happens, fan it out per-video batch (runPassA
// accepts videoIds). Ossur-sized runs (with the configured caps) fit comfortably.

export interface PipelineRunOptions {
  platforms?: Platform[]
  maxVideos?: number
  videoLimit?: number
  period?: string
  // When set, emit a `report/send.requested` after the run completes so the
  // periodic report goes out. The scheduler sets this; manual "Run now" doesn't.
  sendReport?: boolean
}

export const runPipeline = inngest.createFunction(
  {
    id: 'run-pipeline',
    triggers: [{ event: 'pipeline/run.requested' }],
    // One run at a time per client — a new request waits rather than racing an
    // in-flight run on the same corpus.
    concurrency: { limit: 1, key: 'event.data.clientId' },
    retries: 2,
  },
  async ({ event, step }) => {
    const clientId = (event.data as { clientId?: string }).clientId
    if (!clientId) throw new Error('pipeline/run.requested missing clientId')
    const options = ((event.data as { options?: PipelineRunOptions }).options) ?? {}

    // 1. Open the run row (the orchestrator owns the lifecycle the CLI used to).
    const runId = await step.run('open-run', async () => {
      const admin = createAdminClient()
      const id = randomUUID()
      const { error } = await admin
        .from('pipeline_runs')
        .insert({ id, client_id: clientId, status: 'running' })
      if (error) throw new Error(`open run: ${error.message}`)
      return id
    })

    // 2. Resolve the platforms to gather (event override or the client config).
    const platforms = await step.run('plan-platforms', async () => {
      if (options.platforms?.length) return options.platforms
      const admin = createAdminClient()
      const { data } = await admin
        .from('tracking_configs').select('platforms').eq('client_id', clientId).maybeSingle()
      return (data?.platforms?.length ? data.platforms : ['tiktok', 'youtube', 'instagram']) as Platform[]
    })

    // 3. Gather — one step per platform so a single step never scrapes all three.
    let totalVideos = 0
    let totalErrors = 0
    for (const platform of platforms) {
      const r = await step.run(`gather:${platform}`, async () => {
        const [res] = await runGather({
          clientId, runId, platforms: [platform],
          maxVideos: options.maxVideos, videoLimit: options.videoLimit, period: options.period,
        })
        return res ?? { platform, videos: 0, comments: 0, errors: [] as string[] }
      })
      totalVideos += r.videos
      totalErrors += r.errors.length
    }

    // No corpus → close as failed, stop (nothing for the analysis passes to chew on).
    if (totalVideos === 0) {
      await step.run('mark-failed', async () => {
        const admin = createAdminClient()
        await admin.from('pipeline_runs').update({
          status: 'failed', videos_scraped: 0,
          error_message: 'gather produced no videos', completed_at: new Date().toISOString(),
        }).eq('id', runId)
      })
      return { runId, status: 'failed', totalVideos: 0 }
    }

    // 4. Pass A — per-video GPT analysis (sentiment/topics + audience_insights + evidence).
    const passA = await step.run('pass-a', async () => {
      const s = await runPassA({ clientId, runId, persist: true })
      return { analyzed: s.videosAnalyzed, skipped: s.videosSkipped, insights: s.insightsKept, cost: s.costUsd }
    })

    // 5. Back half — Step A2 → Pass C → Pass D (market + competitive synthesis).
    const synth = await step.run('analyze-cd', () => runBackHalf(clientId, runId))

    // 6. Close the run.
    await step.run('close-run', async () => {
      const admin = createAdminClient()
      await admin.from('pipeline_runs').update({
        status: totalErrors > 0 ? 'partial' : 'completed',
        videos_scraped: totalVideos,
        completed_at: new Date().toISOString(),
      }).eq('id', runId)
    })

    // 7. Periodic report — only when requested (the scheduler sets this), so a
    //    manual "Run now" refreshes data without emailing the client.
    if (options.sendReport) {
      await step.sendEvent('request-report', {
        name: 'report/send.requested',
        data: { clientId, runId },
      })
    }

    return { runId, status: totalErrors > 0 ? 'partial' : 'completed', totalVideos, ...passA, ...synth }
  },
)

// Step A2 → Pass C → Pass D over an existing Pass A run, market-wide (all
// platforms). Mirrors scripts/run-cd.ts with persist on.
async function runBackHalf(clientId: string, runId: string) {
  const admin = createAdminClient()

  const videos = await selectAll<VideoRow>(() =>
    admin.from('videos').select('*').eq('client_id', clientId).order('id', { ascending: true }),
  )
  const comments = await selectAll<CommentRow>(() =>
    admin.from('comments')
      .select('id, client_id, run_id, platform, video_id, comment_id, author, text, likes')
      .eq('client_id', clientId)
      .in('video_id', videos.map((v) => v.video_id))
      .order('id', { ascending: true }),
  )
  const metrics = computeMetrics(videos, comments)

  const { data: tc } = await admin.from('tracking_configs')
    .select('brand_keywords, competitor_names, industry_keywords')
    .eq('client_id', clientId).maybeSingle()

  const a2 = await runStepA2({
    clientId, runId, method: 'embedding',
    threshold: CLUSTER_SIMILARITY_THRESHOLD, evidenceFloor: EVIDENCE_FLOOR,
  })
  const c = await runPassC({
    clientId, runId, themes: a2.themes,
    trackingConfig: tc ?? undefined, sov: metrics.share_of_voice, persist: true,
  })
  const d = await runPassD({
    clientId, runId, themes: a2.themes,
    competitiveInsights: c.competitiveInsights, sov: metrics.share_of_voice, persist: true,
  })

  return {
    themes: a2.themes.length,
    competitiveInsights: c.inserted,
    marketInsights: d.marketInsights.length,
    recommendations: d.recommendations.length,
    synthesisCost: c.costUsd + d.costUsd,
  }
}
