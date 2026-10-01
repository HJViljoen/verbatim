'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getSessionContext } from '@/lib/auth'
import { canManageTenant } from '@/lib/roles'
import { createAdminClient } from '@/lib/supabase-admin'
import { measureStatements, measureSummary } from '@/lib/statements/measure'
import { maySeeStatements, STATEMENTS_HELD } from '@/lib/statements/visibility'
import {
  STATEMENTS_MAX,
  STATEMENT_MAX_CHARS,
  STATEMENT_MIN_CHARS,
  TABLE_STATEMENTS,
  isMissingStatements,
} from '@/lib/statements/types'

// Your statements: add, edit and remove (pages build, package MOVES).
//
// OWNERS AND ADMINS, IN TWO PLACES. `canManageTenant` here is the affordance;
// the RLS policies on `client_statements` (20261105090000) are the gate, so a
// crafted POST from a member reaches nothing. The writes go through the
// SESSION client so the policy sees the person.
//
// AN EDIT IS A RETIREMENT PLUS A NEW ROW. The reading is about the words; a
// statement edited in place would carry a reading about a sentence nobody can
// see any more.
//
// HELD FROM TENANTS (lead's ruling 5, 1 Oct evening; open ruling #7): while
// `STATEMENTS_TENANT_VISIBLE` is false (lib/statements/visibility.ts) every
// action refuses a session that is not the operator's, BEFORE anything is
// written, so nothing is measured on a tenant's behalf. The operator uses it
// as built.
//
// MEASURED ON ADD, AFTER THE RESPONSE. The new statement is measured with
// `after()` on the service role (embedding, band, judge, one stance call): the
// page shows the words at once and the reading on the next visit. Nothing says
// "measuring" in the meantime (the brief). A measurement that fails leaves the
// statement unmeasured until the weekly run reads it again.

export interface StatementActionState {
  ok: boolean
  message: string
}

const COULD_NOT_SAVE = 'Could not save. Try again, and tell us if it keeps happening.'

/** One line, its spaces collapsed. */
export async function cleanStatement(raw: unknown): Promise<string> {
  return String(raw ?? '').replace(/\s+/g, ' ').trim()
}

const textSchema = z.string().min(STATEMENT_MIN_CHARS).max(STATEMENT_MAX_CHARS)

async function writer() {
  const { supabase, clientId, userId, role, operator } = await getSessionContext()
  return { supabase, clientId, userId, allowed: canManageTenant(role), held: !maySeeStatements({ operator }) }
}

function measureLater(clientId: string, statementId: string) {
  after(async () => {
    try {
      const r = await measureStatements(createAdminClient(), { clientId, statementIds: [statementId], write: true })
      for (const x of r.results) console.log(`[statements] measured on add: ${measureSummary(x)}`)
      if (r.skipped) console.warn(`[statements] measure on add skipped: ${r.skipped}`)
    } catch (e) {
      console.error(`[statements] measure on add failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  })
}

async function insertStatement(
  ctx: Awaited<ReturnType<typeof writer>>,
  text: string,
): Promise<{ id: string } | StatementActionState> {
  const { count, error: countError } = await ctx.supabase.from(TABLE_STATEMENTS)
    .select('id', { count: 'exact', head: true })
    .eq('client_id', ctx.clientId).is('retired_at', null)
  if (countError) {
    console.error(`[statements] count: ${countError.message}`)
    return { ok: false, message: COULD_NOT_SAVE }
  }
  if ((count ?? 0) >= STATEMENTS_MAX) return { ok: false, message: `You can keep up to ${STATEMENTS_MAX} statements. Remove one to add another.` }
  const { data, error } = await ctx.supabase.from(TABLE_STATEMENTS)
    .insert({ client_id: ctx.clientId, text, created_by: ctx.userId })
    .select('id').single()
  if (error) {
    if ((error as { code?: string }).code === '23505') return { ok: false, message: 'You already have that statement.' }
    if (!isMissingStatements(error)) console.error(`[statements] insert: ${error.message}`)
    return { ok: false, message: COULD_NOT_SAVE }
  }
  return { id: (data as { id: string }).id }
}

/** The add form (`useActionState`). */
export async function addStatement(_prev: StatementActionState, form: FormData): Promise<StatementActionState> {
  const text = await cleanStatement(form.get('text'))
  if (!textSchema.safeParse(text).success) {
    return { ok: false, message: text.length < STATEMENT_MIN_CHARS ? 'Type the statement first.' : `Keep it under ${STATEMENT_MAX_CHARS} characters.` }
  }
  const ctx = await writer()
  if (ctx.held) return { ok: false, message: STATEMENTS_HELD }
  if (!ctx.allowed) return { ok: false, message: 'Only owners and admins can change statements.' }
  const added = await insertStatement(ctx, text)
  if (!('id' in added)) return added
  measureLater(ctx.clientId, added.id)
  revalidatePath('/dashboard/market')
  return { ok: true, message: '' }
}

async function retire(ctx: Awaited<ReturnType<typeof writer>>, id: string): Promise<StatementActionState | null> {
  const { data, error } = await ctx.supabase.from(TABLE_STATEMENTS)
    .update({ retired_at: new Date().toISOString() })
    .eq('id', id).eq('client_id', ctx.clientId).is('retired_at', null)
    .select('id')
  if (error) {
    if (!isMissingStatements(error)) console.error(`[statements] retire: ${error.message}`)
    return { ok: false, message: COULD_NOT_SAVE }
  }
  if ((data ?? []).length === 0) return { ok: false, message: 'That statement is no longer here.' }
  return null
}

export async function removeStatement(id: string): Promise<StatementActionState> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: 'That statement is no longer here.' }
  const ctx = await writer()
  if (ctx.held) return { ok: false, message: STATEMENTS_HELD }
  if (!ctx.allowed) return { ok: false, message: 'Only owners and admins can change statements.' }
  const failed = await retire(ctx, id)
  if (failed) return failed
  revalidatePath('/dashboard/market')
  return { ok: true, message: '' }
}

export async function editStatement(id: string, raw: string): Promise<StatementActionState> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: 'That statement is no longer here.' }
  const text = await cleanStatement(raw)
  if (!textSchema.safeParse(text).success) {
    return { ok: false, message: text.length < STATEMENT_MIN_CHARS ? 'Type the statement first.' : `Keep it under ${STATEMENT_MAX_CHARS} characters.` }
  }
  const ctx = await writer()
  if (ctx.held) return { ok: false, message: STATEMENTS_HELD }
  if (!ctx.allowed) return { ok: false, message: 'Only owners and admins can change statements.' }
  const { data: current } = await ctx.supabase.from(TABLE_STATEMENTS)
    .select('text').eq('id', id).eq('client_id', ctx.clientId).is('retired_at', null).maybeSingle()
  if (!current) return { ok: false, message: 'That statement is no longer here.' }
  if ((current as { text: string }).text === text) return { ok: true, message: '' }
  // Retire first, so the new words do not collide with the old on the
  // one-live-sentence index when only the case or spacing changed.
  const failed = await retire(ctx, id)
  if (failed) return failed
  const added = await insertStatement(ctx, text)
  if (!('id' in added)) {
    // The new words did not land: put the old ones back rather than leave the
    // client with neither. (Its readings stay with the retired row; the
    // restored one is measured again.)
    const restored = await insertStatement(ctx, (current as { text: string }).text)
    if ('id' in restored) measureLater(ctx.clientId, restored.id)
    revalidatePath('/dashboard/market')
    return added
  }
  measureLater(ctx.clientId, added.id)
  revalidatePath('/dashboard/market')
  return { ok: true, message: '' }
}
