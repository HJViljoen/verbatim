'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getSessionContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { deleteAgentThread } from '@/lib/agent/delete-thread'

// "Delete this question" on an Ask thread's page. Who may, and how the
// workspace is kept to its own, is lib/agent/delete-thread.ts: the session
// names the workspace and the reader, the form names only the thread.

export interface DeleteThreadState {
  ok: boolean
  message: string | null
}

export async function deleteThreadAction(_prev: DeleteThreadState, form: FormData): Promise<DeleteThreadState> {
  const { clientId, userId, role } = await getSessionContext()
  const threadId = String(form.get('thread_id') ?? '')
  const result = await deleteAgentThread(createAdminClient(), { clientId, userId, role }, threadId)
  if (!result.ok) return { ok: false, message: result.message }
  // The rail's history, the Ask page and the thread's own address.
  revalidatePath('/dashboard/agent', 'layout')
  // Outside any try: `redirect` throws to navigate (Next's server action rule).
  redirect('/dashboard/agent')
}
