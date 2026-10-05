import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getRouteSession } from '@/lib/auth'
import { actorStamp } from '@/lib/config-log'
import { BUILDS_ARE_OURS, mayBuildReports } from '@/lib/studio-visibility'
import { createAdminClient } from '@/lib/supabase-admin'
import { publishSend } from '@/lib/schedules/publish'

// POST /api/schedules/[id]/publish  { sendId }
//
// "Publish to the platform (not emailed)": a held weekly build goes onto the
// client's platform as an issue (the Studio's past issues, its viewer, PDF and
// share link) WITHOUT emailing anyone (the backfill, 1 Oct evening; lead's
// ruling 3; lib/schedules/publish.ts). The status stays `ready`, so Send still
// emails it. Its reads are on the client's pages already: the pages print the
// newest ready read whatever its send (lib/written/published.ts, 5 Oct).
//
// THE OPERATOR'S ALONE. What goes on the platform is Heinrich's decision, so
// a client's session, owner or admin included, is refused here before
// anything is read (`mayBuildReports`, as Send's route does). Tenant from the
// session, never the body; the send must be this schedule's and the tenant's.

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getRouteSession()
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!mayBuildReports(session)) return NextResponse.json({ error: BUILDS_ARE_OURS }, { status: 403 })
  const { id } = await params
  const body = (await request.json().catch(() => null)) as { sendId?: unknown } | null
  const scheduleId = z.uuid().safeParse(id).data
  const sendId = z.uuid().safeParse(body?.sendId).data
  if (!scheduleId || !sendId) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })

  const r = await publishSend(createAdminClient(), {
    clientId: session.clientId,
    sendId,
    scheduleId,
    by: session.userId,
    actor: actorStamp(session, 'published to the platform, not emailed'),
  })
  if (r.status === 'refused') return NextResponse.json({ status: r.status, error: r.error }, { status: 409 })
  return NextResponse.json(r)
}
