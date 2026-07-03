import { timingSafeEqual } from 'crypto'
import { generateWeeklyReport, previewWeeklyReport } from '@/lib/report'

// Superadmin ops hook: build/send a client's report outside the schedule —
// ad-hoc re-sends and testing the email path (Resend creds live only in this
// deployment, so a local script can't exercise real delivery). Same auth as
// trigger-run: the Supabase service-role key in X-Admin-Key gates strictly
// more privilege than it grants.
//
// Body: { clientId, runId?, mode? }
//   mode 'preview' → build only, returns subject/recipients/html (no DB write, no email)
//   mode 'store'   → persist to weekly_reports without sending
//   default        → persist + send to tracking_configs.report_emails

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

  const body = (await req.json().catch(() => null)) as
    { clientId?: unknown; runId?: unknown; mode?: unknown } | null
  const clientId = body?.clientId
  if (typeof clientId !== 'string' || !clientId) {
    return Response.json({ error: 'clientId required' }, { status: 400 })
  }
  const runId = typeof body?.runId === 'string' ? body.runId : undefined
  const mode = body?.mode

  if (mode === 'preview') {
    const preview = await previewWeeklyReport({ clientId, runId })
    if (!preview) return Response.json({ error: 'no completed run to report on' }, { status: 404 })
    return Response.json(preview)
  }

  const result = await generateWeeklyReport({ clientId, runId, send: mode !== 'store' })
  return Response.json(result)
}
