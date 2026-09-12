'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth'
import { INITIATIVE_DIRECTIONS, INITIATIVE_STATUSES, INITIATIVE_MAX_THEMES } from '@/lib/initiatives/types'

// The initiative write path (WP7c). Declaring one is not an operator lever and
// not a cost knob — it is the client saying what they are trying to move — so
// any member may do it, exactly as any member may move a recommendation
// through its lifecycle. RLS + the column grants (migration 20260911140000)
// are the gate; these actions re-assert the tenant on every write anyway.
//
// Nothing here deletes. A stopped initiative is `status = 'dropped'`, so a
// report that already measured it does not quietly lose its subject.

export interface InitiativeFormState {
  ok: boolean
  message: string
  /** The id created, so a client form can confirm without re-reading. */
  id?: string
}

const uuid = z.string().uuid()

const createSchema = z.object({
  title: z.string().trim().min(1, 'give it a name').max(120, 'keep the name under 120 characters'),
  goal: z.string().trim().max(400, 'keep the note under 400 characters').optional(),
  direction: z.enum(INITIATIVE_DIRECTIONS),
  registry_ids: z.array(uuid).min(1, 'pick at least one theme').max(INITIATIVE_MAX_THEMES, `track at most ${INITIATIVE_MAX_THEMES} themes`),
})

const csvIds = (v: FormDataEntryValue | null) =>
  String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean)

const blankToUndefined = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim()
  return s === '' ? undefined : s
}

const firstIssue = (e: z.ZodError) => {
  const i = e.issues[0]
  return `${i?.path.join('.') || 'form'}: ${i?.message ?? 'check your input.'}`
}

/** Revalidate everywhere an initiative is read. */
function revalidateInitiatives() {
  revalidatePath('/dashboard/settings/initiatives')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/voice')
}

export async function createInitiative(
  _prev: InitiativeFormState,
  formData: FormData,
): Promise<InitiativeFormState> {
  const { supabase, clientId, userId } = await getSessionContext()

  const parsed = createSchema.safeParse({
    title: formData.get('title'),
    goal: blankToUndefined(formData.get('goal')),
    direction: formData.get('direction'),
    registry_ids: csvIds(formData.get('registry_ids')),
  })
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) }

  // The themes must be this tenant's. The session client is RLS-scoped, so a
  // registry id belonging to someone else simply does not come back — and a
  // short count is the check. Without this, a crafted POST would store a
  // foreign theme id that the measurement would then read nothing for (RLS
  // again) and the row would read "too early" forever with no explanation.
  const { data: known, error: readError } = await supabase
    .from('theme_registry')
    .select('id')
    .eq('client_id', clientId)
    .in('id', parsed.data.registry_ids)
  if (readError) return { ok: false, message: `Could not save: ${readError.message}` }
  if ((known ?? []).length !== parsed.data.registry_ids.length) {
    return { ok: false, message: 'One of those themes is not yours to track.' }
  }

  const { data, error } = await supabase
    .from('initiatives')
    .insert({
      client_id: clientId,
      title: parsed.data.title,
      goal: parsed.data.goal ?? null,
      direction: parsed.data.direction,
      registry_ids: parsed.data.registry_ids,
      // started_at is the DB's current_date: the line is drawn where the
      // client actually declared it, never at a date a form could backdate.
      created_by: userId,
    })
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, message: `Could not save: ${error.message}` }

  revalidateInitiatives()
  return { ok: true, message: 'Tracking it from today.', id: (data as { id: string } | null)?.id }
}

const updateSchema = z.object({
  id: uuid,
  title: z.string().trim().min(1, 'give it a name').max(120, 'keep the name under 120 characters'),
  goal: z.string().trim().max(400, 'keep the note under 400 characters').optional(),
  direction: z.enum(INITIATIVE_DIRECTIONS),
})

export async function updateInitiative(
  _prev: InitiativeFormState,
  formData: FormData,
): Promise<InitiativeFormState> {
  const { supabase, clientId } = await getSessionContext()
  const parsed = updateSchema.safeParse({
    id: formData.get('id'),
    title: formData.get('title'),
    goal: blankToUndefined(formData.get('goal')),
    direction: formData.get('direction'),
  })
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) }

  // registry_ids and started_at are deliberately not editable: they are what
  // the measurement means. Change either and every point already reported
  // silently becomes a point about something else.
  const { data, error } = await supabase
    .from('initiatives')
    .update({
      title: parsed.data.title,
      goal: parsed.data.goal ?? null,
      direction: parsed.data.direction,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.id)
    .eq('client_id', clientId)
    .select('id')
  if (error) return { ok: false, message: `Could not save: ${error.message}` }
  // RLS filters, it does not error: a foreign or deleted id reaches here as a
  // success that changed nothing. Saying "Saved." to that is a lie the reader
  // has no way to catch.
  if ((data ?? []).length === 0) return { ok: false, message: 'That initiative is no longer here.' }

  revalidateInitiatives()
  return { ok: true, message: 'Saved.' }
}

export async function setInitiativeStatus(id: string, status: string): Promise<InitiativeFormState> {
  if (!uuid.safeParse(id).success) return { ok: false, message: 'Unknown initiative.' }
  if (!(INITIATIVE_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, message: 'Unknown status.' }
  }
  const { supabase, clientId } = await getSessionContext()
  const { data, error } = await supabase
    .from('initiatives')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('client_id', clientId)
    .select('id')
  if (error) return { ok: false, message: `Could not save: ${error.message}` }
  if ((data ?? []).length === 0) return { ok: false, message: 'That initiative is no longer here.' }

  revalidateInitiatives()
  return { ok: true, message: '' }
}
