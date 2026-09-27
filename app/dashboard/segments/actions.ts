'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { canManageTenant, getSessionContext } from '@/lib/auth'
import { actorStamp } from '@/lib/config-log'
import { NOT_MY_MARKET_COPY, OVERRIDE_SOURCES, writeNotMyMarket } from '@/lib/segments/override'
import { createAdminClient } from '@/lib/supabase-admin'

// "This is not my market" (plan §2.10 D5, WP3.2; lib/segments/override.ts).
// The entry points on videos and quotes are wave 2's; this is the action they
// post to.
//
// OWNERS AND ADMINS, as for the appeal it is the inverse of
// (app/dashboard/settings/record/actions.ts): it changes how the tenant's
// market is marked, and it is logged as a change.
//
// ON THE ADMIN CLIENT, SCOPED BY THE SESSION. `authenticated` holds no INSERT
// on video_segments (MF1), so the write goes through the service role; the
// tenant is the session's, never the form's, and the video is resolved against
// that tenant before anything is written, so a video id from another workspace
// is refused. The actor is the person (actorStamp), carried onto the row and
// the change log.
//
// NOT THE TENANT LOCK. Decision I holds the searches, rivals and communities
// still; a mark changes none of them, so it is not refused under the lock.

export interface NotMyMarketState {
  ok: boolean
  message: string
}

const schema = z.object({
  videoId: z.string().uuid(),
  from: z.enum(OVERRIDE_SOURCES),
})

export async function markNotMyMarket(_prev: NotMyMarketState, formData: FormData): Promise<NotMyMarketState> {
  const session = await getSessionContext()
  if (!canManageTenant(session.role)) return { ok: false, message: NOT_MY_MARKET_COPY.role }

  const parsed = schema.safeParse({ videoId: formData.get('videoId'), from: formData.get('from') ?? 'video' })
  if (!parsed.success) return { ok: false, message: NOT_MY_MARKET_COPY.unread }

  const result = await writeNotMyMarket(createAdminClient(), {
    clientId: session.clientId,
    videoId: parsed.data.videoId,
    from: parsed.data.from,
    actor: actorStamp(session, 'this is not my market'),
  })
  switch (result.outcome) {
    case 'unknown_video':
      return { ok: false, message: NOT_MY_MARKET_COPY.unknown }
    case 'not_ready':
      return { ok: false, message: NOT_MY_MARKET_COPY.notReady }
    case 'failed':
      console.error(`[segments] not-my-market not written for ${session.clientId}: ${result.error ?? 'unknown error'}`)
      return { ok: false, message: NOT_MY_MARKET_COPY.failed }
    case 'already':
      return { ok: true, message: NOT_MY_MARKET_COPY.already }
    case 'written':
      // A mark moves the maker and off-topic shares every market page reads.
      revalidatePath('/dashboard', 'layout')
      return { ok: true, message: NOT_MY_MARKET_COPY.done }
  }
}
