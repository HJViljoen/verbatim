'use server'

import { revalidatePath } from 'next/cache'

import { getSessionContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { databaseToday, declareMove } from '@/lib/subjects/moves'
import { moveDay } from '@/lib/subjects/move-day'
import { dateMoveSaid, parseMoveTarget } from '@/lib/pages/date-move'
import type { SubjectFormState } from '@/lib/actions/subjects'

// "Date a move" on Your moves (the approved preview, WP3.6 wave 2): what you
// changed, what it is about and the day you changed it, declared as a move.
//
// THE SAME WRITE EVERY MOVE TAKES. `declareMove` writes on the SESSION client
// (RLS pins the tenant and `declared_by`), checks the target is this tenant's,
// and logs an actor through the admin client; the day is MF5's
// `moves.dated_on`, checked against the window its CHECK holds. Like "Track
// this", it is open to anyone who can see the page: a move is the workspace
// saying what it did, and it changes nothing that is measured.
//
// A separate file from lib/actions/subjects.ts and accept-advice.ts, so the
// packages writing those do not share a file with this one.

export async function dateMoveAction(_prev: SubjectFormState, form: FormData): Promise<SubjectFormState> {
  const target = parseMoveTarget(String(form.get('target') ?? ''))
  if (typeof target === 'string') return { ok: false, message: target }
  const datedOn = String(form.get('dated_on') ?? '').trim() || null
  const { supabase, clientId, userId, email, operator } = await getSessionContext()
  // THE ADVICE MUST BE THIS TENANT'S, read the way "Accept this advice" reads
  // it (coalesce(lineage_id, id) on the session client): declareMove checks a
  // subject or a theme, and has nothing to check a lineage against. The id is
  // a validated uuid, so it carries no PostgREST syntax.
  if (target.kind === 'advice') {
    const { data, error } = await supabase
      .from('recommendations')
      .select('id')
      .eq('client_id', clientId)
      .or(`lineage_id.eq.${target.lineageId},and(lineage_id.is.null,id.eq.${target.lineageId})`)
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error(`[date-move] lineage read failed: ${error.message}`)
      return { ok: false, message: 'Could not save. Try again, and tell us if it keeps happening.' }
    }
    if (!data) return { ok: false, message: 'That piece of advice is no longer here.' }
  }
  const result = await declareMove(
    { supabase, clientId, userId, email, operator },
    createAdminClient(),
    { ...target, title: String(form.get('title') ?? ''), datedOn },
  )
  if (!result.ok) return { ok: false, message: result.message }
  // Where the move is read: Your moves (Y4 and the hero), and the front
  // page's moves line.
  revalidatePath('/dashboard/market')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/overview')
  const day = moveDay(datedOn, databaseToday())
  return { ok: true, message: dateMoveSaid(typeof day === 'string' ? null : day.day), ...(result.value?.id ? { id: result.value.id } : {}) }
}
