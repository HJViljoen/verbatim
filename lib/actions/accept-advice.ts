'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'

import { getSessionContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { declareMove } from '@/lib/subjects/moves'
import { setRecommendationStatus } from '@/lib/actions/rec-status'
import { planAfterMove } from '@/lib/actions/accept-plan'

// "Accept this advice" — MK5's second live way of making a move (Phase 1 WP14,
// design §3 MK5).
//
// IN lib/actions/ AND NOT BESIDE THE PAGE, for the reason rec-status.ts gives
// at length: an action imported by module path from app/dashboard/<page>/
// actions moves house every time its page does, and these pages have just
// moved house once.
//
// A MOVE IS DECLARED AGAINST A LINEAGE, NEVER AGAINST A RECOMMENDATION ROW.
// Pass D-b deletes and reinserts every recommendation each update
// (lib/pipeline/pass-d.ts), so a move holding a row id would be pointing at a
// row that no longer exists by Sunday. `moves.lineage_id` is the advice's
// identity and is what `moveTarget` takes for an advice-kinded move.
//
// TWO WRITES, AND THE ORDER IS THE SAME ARGUMENT rec-status.ts makes. The move
// is the record of what the client decided to do; the status is the copy the
// ledger prints. The move goes first, because a move that landed with no status
// beside it reads as "accepted, not yet marked", while a status that landed
// with no move behind it is a tick on a page with nothing tracking it.
//
// A SEPARATE FILE FROM lib/actions/moves.ts, which WP12 owns for Track this.
// Two packages writing one file from two worktrees is a merge conflict for no
// gain, and "accept this advice" is Market's own button.

export interface AcceptAdviceState {
  ok: boolean
  message: string
}

const input = z.object({
  lineageId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
})

export async function acceptAdvice(lineageId: string, title: string): Promise<AcceptAdviceState> {
  const parsed = input.safeParse({ lineageId, title })
  if (!parsed.success) return { ok: false, message: 'That piece of advice is no longer here.' }

  const { supabase, clientId, userId, email, operator } = await getSessionContext()

  // The lineage must be this tenant's, read through the session client so a
  // foreign id resolves to nothing here rather than reaching the write. Any
  // copy of the lineage will do — the identity is what is being accepted.
  //
  // MATCHED THE WAY THE LEDGER KEYS IT: `coalesce(lineage_id, id)`. A bare
  // `.eq('lineage_id', …)` misses a row written between a deploy and the
  // backfill, which is the exact case `lineageKey`'s `?? r.id` exists for — the
  // ledger would draw the row, the button would name its id, and the client
  // would be told "That piece of advice is no longer here." Zero such rows in
  // production today, and none of that is a reason to key one read two ways.
  // The id is a validated uuid, so it cannot carry PostgREST syntax.
  const lineage = parsed.data.lineageId
  const { data: rec, error } = await supabase
    .from('recommendations')
    .select('id')
    .eq('client_id', clientId)
    .or(`lineage_id.eq.${lineage},and(lineage_id.is.null,id.eq.${lineage})`)
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error(`[accept-advice] lineage read failed: ${error.message}`)
    return { ok: false, message: 'Could not save. Try again, and tell us if it keeps happening.' }
  }
  if (!rec) return { ok: false, message: 'That piece of advice is no longer here.' }

  const declared = await declareMove(
    { supabase, clientId, userId, email, operator },
    createAdminClient(),
    { kind: 'advice', lineageId: parsed.data.lineageId, title: parsed.data.title },
  )
  const plan = planAfterMove(declared)
  if (plan.do === 'refuse') return { ok: false, message: plan.message }

  const status = await setRecommendationStatus(rec.id as string, 'acted_on')
  revalidatePath('/dashboard/market')
  revalidatePath('/dashboard')
  if (!status.ok) return { ok: false, message: `${plan.message} ${status.message}`.trim() }
  return { ok: true, message: plan.message }
}

