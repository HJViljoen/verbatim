'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { canManageTenant, getSessionContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  activateSubject,
  declareMove,
  nameSubject,
  retireSubject,
  setMoveStatus,
  type WriteContext,
} from '@/lib/subjects/moves'
import { MOVE_STATUSES, SUBJECT_ORIGINS, SUBJECT_WRITE_REFUSED } from '@/lib/subjects/types'

// The subject and move write path (Phase 1 WP12, design §3 SU1 and SU2).
//
// LIVES IN lib/actions/ BECAUSE THREE SURFACES CALL IT. The editor is shared —
// SU1 on the Subjects page and Settings › Subjects (WP16) are the same
// component — and "Track this" is on SU2 and on VO3 (WP13). An action imported
// by module path from `app/dashboard/<page>/actions` moves house every time its
// page does, which is exactly what happened to the rec-status action in WP9.
//
// THE THREE SUBJECT WRITES CARRY A ROLE CHECK; THE TWO MOVE WRITES DO NOT, and
// the line between them is what the write CHANGES. Naming, confirming and
// stopping a subject change the measurement itself — every frozen month is
// about the set that was current when it froze, and decision E says the set is
// confirmed in Settings by the person who owns the workspace. RLS and the
// column grants are not that gate: `grant insert (…)` and `grant update
// (status, superseded_by, updated_at) on public.subjects to authenticated`
// admit every member of the tenant, so without `canManageTenant` a viewer
// could rename the thing the product measures. WP12 shipped these ungated and
// WP16 gated the same three behind its own copy of the actions; the merge
// keeps the gate and keeps one copy of the write path, so the Subjects page
// and Settings › Subjects refuse in the same words.
//
// A move is the other kind of act: it is the client SAYING they did something,
// scored later against readings nobody here can touch, and `moves` grants a
// member `status` and nothing that says what was measured. That stays open to
// anyone who can see the page.
//
// Every one of these writes carries an actor into `config_changes`
// (lib/subjects/moves.ts), written with the service-role client because a log a
// tenant can append to is not a log.
//
// NOTHING HERE DELETES. A subject that is stopped is `status='retired'` and its
// months keep their line; a move that is finished is `status='done'` and keeps
// its line too. The database agrees: there is no delete grant on either table.

export interface SubjectFormState {
  ok: boolean
  message: string
  /** The id written, so a form can confirm without re-reading. */
  id?: string
}

export const EMPTY_STATE: SubjectFormState = { ok: false, message: '' }

const uuid = z.string().uuid()

const nameSchema = z.object({
  name: z.string().trim().min(1, 'give it a name').max(60, 'keep the name under 60 characters'),
  description: z.string().trim().max(400, 'keep the description under 400 characters').optional(),
  origin: z.enum(SUBJECT_ORIGINS),
  supersedes: uuid.optional(),
})

const moveSchema = z.object({
  subject_id: uuid,
  title: z.string().trim().min(1, 'give it a name').max(120, 'keep the name under 120 characters'),
  note: z.string().trim().max(400, 'keep the note under 400 characters').optional(),
  direction: z.enum(['up', 'down']),
})

const blankToUndefined = (v: FormDataEntryValue | null): string | undefined => {
  const s = String(v ?? '').trim()
  return s === '' ? undefined : s
}

const firstIssue = (e: z.ZodError): string => {
  const i = e.issues[0]
  return `${i?.path.join('.') || 'form'}: ${i?.message ?? 'check your input.'}`
}

/**
 * Everywhere a subject or a move is read.
 *
 * Four addresses and each of them is real: the page that declared it, the
 * Overview hero and the OV5 moves list, Settings › Subjects (WP16), and Market,
 * which is where a move is scored (WP14). A router cache of 60 seconds
 * (next.config.ts staleTimes.dynamic) is long enough for a client to name a
 * subject and then not see it on the next page they open.
 */
function revalidateSubjects(): void {
  revalidatePath('/dashboard/subjects')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/market')
}

async function context(): Promise<WriteContext> {
  const { supabase, clientId, userId, email, operator } = await getSessionContext()
  return { supabase, clientId, userId, email, operator }
}

/** The refusal a reader who may not change the set gets, in the same words the
 *  editor prints where its controls would have been. */
const REFUSED: SubjectFormState = { ok: false, message: SUBJECT_WRITE_REFUSED }

/** The session, plus whether this reader may change the measurement. */
async function manageContext(): Promise<{ ctx: WriteContext; allowed: boolean }> {
  const { supabase, clientId, userId, email, operator, role } = await getSessionContext()
  return { ctx: { supabase, clientId, userId, email, operator }, allowed: canManageTenant(role) }
}

/** Name a subject — or rename one, which is an insert and a retirement, never
 *  an edit (SU1: "renaming or adding a subject starts a new line"). */
export async function nameSubjectAction(
  _prev: SubjectFormState,
  form: FormData,
): Promise<SubjectFormState> {
  const parsed = nameSchema.safeParse({
    name: String(form.get('name') ?? ''),
    description: blankToUndefined(form.get('description')),
    origin: String(form.get('origin') ?? 'client'),
    supersedes: blankToUndefined(form.get('supersedes')),
  })
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) }

  const { ctx, allowed } = await manageContext()
  if (!allowed) return REFUSED
  const result = await nameSubject(ctx, createAdminClient(), {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    origin: parsed.data.origin,
    supersedes: parsed.data.supersedes ?? null,
  })
  if (result.ok) revalidateSubjects()
  return { ok: result.ok, message: result.message, ...(result.value?.id ? { id: result.value.id } : {}) }
}

/** Confirm a subject: the write that starts the counting (decision E). */
export async function confirmSubjectAction(id: string): Promise<SubjectFormState> {
  if (!uuid.safeParse(id).success) return { ok: false, message: 'Unknown subject.' }
  const { ctx, allowed } = await manageContext()
  if (!allowed) return REFUSED
  const result = await activateSubject(ctx, createAdminClient(), { id })
  if (result.ok) revalidateSubjects()
  return { ok: result.ok, message: result.message }
}

/** Stop tracking a subject. The months it already carries keep their line —
 *  the database freezes them at retirement rather than letting them decay. */
export async function retireSubjectAction(id: string): Promise<SubjectFormState> {
  if (!uuid.safeParse(id).success) return { ok: false, message: 'Unknown subject.' }
  const { ctx, allowed } = await manageContext()
  if (!allowed) return REFUSED
  const result = await retireSubject(ctx, createAdminClient(), { id })
  if (result.ok) revalidateSubjects()
  return { ok: result.ok, message: result.message }
}

/** "Track this" on a subject (SU2) — the move OV5 lists and Market scores. */
export async function trackSubjectAction(
  _prev: SubjectFormState,
  form: FormData,
): Promise<SubjectFormState> {
  const parsed = moveSchema.safeParse({
    subject_id: String(form.get('subject_id') ?? ''),
    title: String(form.get('title') ?? ''),
    note: blankToUndefined(form.get('note')),
    direction: String(form.get('direction') ?? 'up'),
  })
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) }

  const ctx = await context()
  const result = await declareMove(ctx, createAdminClient(), {
    kind: 'subject',
    subjectId: parsed.data.subject_id,
    title: parsed.data.title,
    note: parsed.data.note ?? null,
    direction: parsed.data.direction,
  })
  if (result.ok) revalidateSubjects()
  return { ok: result.ok, message: result.message, ...(result.value?.id ? { id: result.value.id } : {}) }
}

/** Mark a move done, dropped, or running again. */
export async function setMoveStatusAction(id: string, status: string): Promise<SubjectFormState> {
  if (!uuid.safeParse(id).success) return { ok: false, message: 'Unknown move.' }
  if (!(MOVE_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, message: 'Say whether it is done, dropped, or still running.' }
  }
  const ctx = await context()
  const result = await setMoveStatus(ctx, createAdminClient(), {
    id,
    status: status as (typeof MOVE_STATUSES)[number],
  })
  if (result.ok) revalidateSubjects()
  return { ok: result.ok, message: result.message }
}
