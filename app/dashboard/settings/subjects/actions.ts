'use server'

import { revalidatePath } from 'next/cache'

import { canManageTenant, getSessionContext } from '@/lib/auth'
import { activateSubject, nameSubject, retireSubject, type WriteContext } from '@/lib/subjects/moves'
import { createAdminClient } from '@/lib/supabase-admin'

// Settings › Subjects — the four writes SU1 needs (Phase 1 WP16, design items
// 4 and 22, decision E).
//
// EVERY ONE OF THEM ALREADY EXISTS in lib/subjects/moves.ts (WP4): naming,
// confirming, stopping and renaming are decided there, with the rules the
// database enforces restated as sentences and the change log written from the
// same place. These are the thin server actions that hand a browser's form to
// them — nothing here decides anything, which is why none of it is duplicated
// from that module.
//
// THE WRITES GO OUT ON THE SESSION CLIENT, not the admin one. `subjects` hands
// a member a column grant that covers `status` and `superseded_by` and nothing
// that says what the measurement is about, so RLS and the grants are the gate
// and the role check below is the first of three layers, not the only one. The
// admin client is passed alongside purely for the change log, which no tenant
// may write.

export interface SubjectState {
  ok: boolean
  message: string
}

async function context(): Promise<{ ctx: WriteContext; allowed: boolean }> {
  const session = await getSessionContext()
  return {
    allowed: canManageTenant(session.role),
    ctx: {
      supabase: session.supabase,
      clientId: session.clientId,
      userId: session.userId,
      email: session.email,
      operator: session.operator,
    },
  }
}

const refused: SubjectState = {
  ok: false,
  message: 'Only an owner or an admin can change what we read your market against.',
}

export async function addSubject(_prev: SubjectState, formData: FormData): Promise<SubjectState> {
  const { ctx, allowed } = await context()
  if (!allowed) return refused
  const supersedes = String(formData.get('supersedes') ?? '') || null
  const result = await nameSubject(ctx, createAdminClient(), {
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
    // A name typed on this page is the client's own words, whatever it was
    // suggested from. `origin` records where a name CAME from, and once a
    // person has typed it the honest answer is "they did".
    origin: 'client',
    supersedes,
  })
  revalidatePath('/dashboard/settings/subjects')
  return { ok: result.ok, message: result.message }
}

export async function confirmSubject(_prev: SubjectState, formData: FormData): Promise<SubjectState> {
  const { ctx, allowed } = await context()
  if (!allowed) return refused
  const result = await activateSubject(ctx, createAdminClient(), { id: String(formData.get('id') ?? '') })
  revalidatePath('/dashboard/settings/subjects')
  return { ok: result.ok, message: result.message }
}

export async function stopSubject(_prev: SubjectState, formData: FormData): Promise<SubjectState> {
  const { ctx, allowed } = await context()
  if (!allowed) return refused
  const result = await retireSubject(ctx, createAdminClient(), { id: String(formData.get('id') ?? '') })
  revalidatePath('/dashboard/settings/subjects')
  return { ok: result.ok, message: result.message }
}
