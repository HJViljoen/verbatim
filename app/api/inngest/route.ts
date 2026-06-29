import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { runPipeline } from '@/inngest/functions/pipeline'
import { scheduledPipelineDispatcher } from '@/inngest/functions/scheduler'

// Inngest endpoint. Inngest Cloud calls this route (GET to sync, PUT to
// register, POST to invoke) using its own signing-key auth — it carries no
// Supabase session, so `proxy.ts` excludes this path from the auth redirect.

// The pipeline runs gather + several GPT passes; give a single function
// invocation room to finish a stage. (Vercel caps this per plan; Fluid Compute
// allows the longer end.)
export const maxDuration = 800

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runPipeline, scheduledPipelineDispatcher],
})
