'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getSessionContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { deleteAgentThread } from '@/lib/agent/delete-thread'

// "Delete this question" on an Ask thread's page, a platform operator's alone
// for now. Who may, and how the workspace is kept to its own, is
// lib/agent/delete-thread.ts: the session names the workspace, the reader and
// whether they are an operator; the form names only the thread.

export interface DeleteThreadState {
  ok: boolean
  message: string | null
}

export async function deleteThreadAction(_prev: DeleteThreadState, form: FormData): Promise<DeleteThreadState> {
  const { clientId, userId, operator } = await getSessionContext()
  const threadId = String(form.get('thread_id') ?? '')
  const result = await deleteAgentThread(createAdminClient(), { clientId, userId, operator }, threadId)
  if (!result.ok) return { ok: false, message: result.message }
  // The rail's history, the Ask page and the thread's own address.
  revalidatePath('/dashboard/agent', 'layout')
  // Outside any try: `redirect` throws to navigate (Next's server action rule).
  redirect('/dashboard/agent')
}
