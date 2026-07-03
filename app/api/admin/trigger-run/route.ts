import { timingSafeEqual } from 'crypto'
import { inngest } from '@/inngest/client'

// Superadmin ops hook: trigger a pipeline run for a client without waiting for
// the schedule (the dashboard "Run now" button was removed 2026-07-01 — this is
// the operator-side replacement, needed because the Inngest keys are sensitive
// Vercel env vars and can't be used from outside the deployment). Auth = the
// Supabase service-role key in an X-Admin-Key header: anyone holding that
// secret already has full DB access, so it gates strictly more privilege than
// it grants. Sends the same pipeline/run.requested event the scheduler emits,
// minus sendReport — manual runs never email the client.

function keysMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY
  const provided = req.headers.get('x-admin-key') ?? ''
  if (!expected || !keysMatch(provided, expected)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as { clientId?: unknown; options?: unknown } | null
  const clientId = body?.clientId
  if (typeof clientId !== 'string' || !clientId) {
    return Response.json({ error: 'clientId required' }, { status: 400 })
  }
  // PipelineRunOptions passthrough (e.g. { skipGather, runId } for an
  // analysis-only resume). The caller holds the service-role key, so no
  // per-field validation beyond shape.
  const options = body?.options && typeof body.options === 'object' ? body.options : undefined

  const res = await inngest.send({ name: 'pipeline/run.requested', data: { clientId, options } })
  return Response.json({ ok: true, ids: res.ids })
}
