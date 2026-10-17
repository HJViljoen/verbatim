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
import { MOVES_WRITE_REFUSED, mayDecideMoves } from '@/lib/moves-access'
import { assertTenantMay, SUBJECTS_HELD } from '@/lib/tenant-locks'

// The subject and move write path (Phase 1 WP12, design §3 SU1 and SU2).
//
// LIVES IN lib/actions/ BECAUSE THREE SURFACES CALL IT. The editor is shared —
// SU1 on the Subjects page and Settings › Subjects (WP16) are the same
// component, and since Design v2 it lives in Settings › Your subjects alone —
// and "Track this" is on SU2 and on VO3 (WP13). An action imported
// by module path from `app/dashboard/<page>/actions` moves house every time its
// page does, which is exactly what happened to the rec-status action in WP9.
//
// THE THREE SUBJECT WRITES CARRY A ROLE CHECK; THE TWO MOVE WRITES DO NOT, and
// the line between them is what the write CHANGES. Naming, confirming and
// stopping a subject change the measurement itself — every frozen month is
// about the set that was current when it froze, and decision E says the set is
// confirmed in Settings by the person who owns the workspace. WP12 shipped
// these ungated and WP16 gated the same three behind its own copy of the
// actions; the merge keeps the gate and keeps one copy of the write path, so
// the Subjects page and Settings › Subjects refuse in the same words.
//
// THE DATABASE IS THE BOUNDARY; THIS IS THE SENTENCE. M4's two write policies
// on `subjects` named `client_id` and never a role, so a member's own JWT could
// PATCH /rest/v1/subjects?id=eq.… with {"status":"retired"} — confirmed on a
// throwaway cluster — and fire the irreversible freeze. The Block B fix pass
// put `get_my_role() = any (array['owner','admin'])` into both policies, the
// shape `tracking_configs` has used since the baseline. The column grants still
// say WHAT may be written; the policies now say WHO. `canManageTenant` here
// gives the refusal a sentence a person can read, one turn earlier.
//
// A move is the other kind of act: it is the client SAYING they did something,
// scored later against readings nobody here can touch, and `moves` grants a
// member `status` and nothing that says what was measured. A move's STATUS is
// an owner's or an admin's since depth v2 (T7, lib/moves-access.ts), with
// accepting advice and "Date a move", because Your moves offers the three side
// by side and one page cannot answer two readers two ways; and "Track this"
// joined them on 13 Oct (decision 6b), because it declares a move exactly as
// "Date a move" does. Both refuse before anything is read.
//
// AND THE SUBJECT WRITES TAKE THE TENANT LOCK (decision 7, 13 Oct). Naming,
// confirming and stopping a subject change what is measured, so a locked
// tenant's own owner or admin (Sealand during its trial) is refused with
// `SUBJECTS_HELD`, after the role check and before any write, exactly as the
// catalogue's writes are (lib/actions/products.ts); the platform operator is
// let through to make the change on the tenant's behalf (`assertTenantMay`,
// lib/tenant-locks.ts). The lock queues nothing here: the queue holds
// tracking columns only.
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
 * Five addresses and each of them is real: Market, which holds the subject
 * board and Your market's subjects since Design v2 (the Subjects page and
 * /dashboard/overview redirect there), the Dashboard, Settings, Settings ›
 * Your subjects, where the editor lives since Design v2 (T10c; a literal path
 * revalidates that page alone, so Settings' own does not cover it), and Your
 * moves, which is where a move is scored (WP14; /dashboard/moves since Design
 * v2). A router cache of 60 seconds (next.config.ts staleTimes.dynamic) is
 * long enough for a client to name a subject and then not see it on the next
 * page they open.
 */
function revalidateSubjects(): void {
  revalidatePath('/dashboard/market')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/settings/subjects')
  // Every page under Your moves (its levels are pages since 17 Oct).
  revalidatePath('/dashboard/moves', 'layout')
}

/** The refusal a reader who may not change the set gets, in the same words the
 *  editor prints where its controls would have been. */
const REFUSED: SubjectFormState = { ok: false, message: SUBJECT_WRITE_REFUSED }

/** The refusal a locked tenant's owner or admin gets (decision 7). */
const HELD: SubjectFormState = { ok: false, message: SUBJECTS_HELD }

/** The session, plus whether this reader may change the measurement: the
 *  role first, then the tenant lock (`assertTenantMay`, `tracking`). The
 *  refusal is the sentence for whichever said no. */
async function manageContext(): Promise<{ ctx: WriteContext; refusal: SubjectFormState | null }> {
  const session = await getSessionContext()
  const { supabase, clientId, userId, email, operator, role } = session
  const ctx = { supabase, clientId, userId, email, operator }
  if (!canManageTenant(role)) return { ctx, refusal: REFUSED }
  if (!assertTenantMay(session, clientId, 'tracking').ok) return { ctx, refusal: HELD }
  return { ctx, refusal: null }
}

/** Name a subject — or rename one, which is an insert and a retirement, never
 *  an edit (SU1: "renaming or adding a subject starts a new line"). */
export async function nameSubjectAction(
  _prev: SubjectFormState,
  form: FormData,
): Promise<SubjectFormState> {
  // The role and the lock first (decision 7): a locked owner is told the
  // subjects are held, never a form error.
  const { ctx, refusal } = await manageContext()
  if (refusal) return refusal
  const parsed = nameSchema.safeParse({
    name: String(form.get('name') ?? ''),
    description: blankToUndefined(form.get('description')),
    origin: String(form.get('origin') ?? 'client'),
    supersedes: blankToUndefined(form.get('supersedes')),
  })
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) }
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
  const { ctx, refusal } = await manageContext()
  if (refusal) return refusal
  const result = await activateSubject(ctx, createAdminClient(), { id })
  if (result.ok) revalidateSubjects()
  return { ok: result.ok, message: result.message }
}

/** Stop tracking a subject. The months it already carries keep their line —
 *  the database freezes them at retirement rather than letting them decay. */
export async function retireSubjectAction(id: string): Promise<SubjectFormState> {
  if (!uuid.safeParse(id).success) return { ok: false, message: 'Unknown subject.' }
  const { ctx, refusal } = await manageContext()
  if (refusal) return refusal
  const result = await retireSubject(ctx, createAdminClient(), { id })
  if (result.ok) revalidateSubjects()
  return { ok: result.ok, message: result.message }
}

/** "Track this" on a subject (SU2) — the move OV5 lists and Market scores. */
export async function trackSubjectAction(
  _prev: SubjectFormState,
  form: FormData,
): Promise<SubjectFormState> {
  // An owner's or an admin's, like Date a move (decision 6b): refused on the
  // session's role before the form is read or anything is.
  const { supabase, clientId, userId, email, operator, role } = await getSessionContext()
  if (!mayDecideMoves(role)) return { ok: false, message: MOVES_WRITE_REFUSED }
  const parsed = moveSchema.safeParse({
    subject_id: String(form.get('subject_id') ?? ''),
    title: String(form.get('title') ?? ''),
    note: blankToUndefined(form.get('note')),
    direction: String(form.get('direction') ?? 'up'),
  })
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) }

  const ctx: WriteContext = { supabase, clientId, userId, email, operator }
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
  const { supabase, clientId, userId, email, operator, role } = await getSessionContext()
  if (!mayDecideMoves(role)) return { ok: false, message: MOVES_WRITE_REFUSED }
  const ctx: WriteContext = { supabase, clientId, userId, email, operator }
  const result = await setMoveStatus(ctx, createAdminClient(), {
    id,
    status: status as (typeof MOVE_STATUSES)[number],
  })
  if (result.ok) revalidateSubjects()
  return { ok: result.ok, message: result.message }
}
