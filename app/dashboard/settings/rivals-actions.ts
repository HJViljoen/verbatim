'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { canManageTenant, getSessionContext } from '@/lib/auth'
import { affectsMonths } from '@/lib/config-affects'
import { actorStamp } from '@/lib/config-log'
import { isMissingCompetitors, renameRival } from '@/lib/rivals'
import { createAdminClient } from '@/lib/supabase-admin'

// Renaming a rival, from Settings › Tracking (Phase 1 WP16, design ST4, WP1's
// affordance).
//
// WP1 BUILT THE WRITE; THIS IS THE BUTTON. `renameRival` is one transaction
// over five tables — the identity, the tracked list, the census handles, the
// stored corpus, the theme registry and this run's theme buckets — plus the
// log row, because five writes that half-land leave a corpus stamped with two
// names and nothing saying so.
//
// A RENAME IS A BREAK, AND THE FORM SAYS SO BEFORE IT IS PRESSED. The frozen
// months cannot be re-keyed: `audience` is part of their primary key and the
// freeze guard refuses the UPDATE. So the old months stay under the old name,
// the new ones start under the new one, and the log row names both so the
// reader can draw one line with the break marked (lib/rivals.ts stitchRenames).
//
// The months the change touches are computed BEFORE the write and handed to the
// transaction, because afterwards the corpus carries the new name and the query
// that finds them would find nothing.

export interface RenameState {
  ok: boolean
  message: string
}

const schema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, 'give the rival a name').max(80, 'keep the name under 80 characters'),
})

export async function renameTrackedRival(_prev: RenameState, formData: FormData): Promise<RenameState> {
  const session = await getSessionContext()
  const { clientId, role } = session
  if (!canManageTenant(role)) {
    return { ok: false, message: 'Only an owner or an admin can rename a rival.' }
  }

  const parsed = schema.safeParse({ id: formData.get('id'), name: formData.get('name') })
  if (!parsed.success) {
    return { ok: false, message: `Could not rename: ${parsed.error.issues[0]?.message ?? 'check the name.'}` }
  }

  const admin = createAdminClient()
  const { data: current, error: readError } = await admin
    .from('competitors').select('name').eq('client_id', clientId).eq('id', parsed.data.id).maybeSingle()
  if (readError || !current) {
    return { ok: false, message: 'We could not find that rival. Refresh the page and try again.' }
  }
  const oldName = current.name as string

  const months = await affectsMonths(admin, clientId, {
    surface: 'rival_rename',
    field: 'competitor_names',
    before: [oldName],
    after: [parsed.data.name],
  })

  try {
    const result = await renameRival(
      { client: admin, clientId, actor: actorStamp(session, 'renamed a rival'), affectsMonths: months },
      parsed.data.id,
      parsed.data.name,
    )
    revalidatePath('/dashboard/settings')
    if (!result.renamed) return { ok: true, message: 'That is already its name.' }
    return {
      ok: true,
      message: `Renamed. ${result.videos} stored post${result.videos === 1 ? '' : 's'} now read as ${result.new_name}; the months already counted stay under ${result.old_name}, with the change marked on the line.`,
    }
  } catch (error) {
    if (isMissingCompetitors(error)) {
      return { ok: false, message: 'We cannot rename a rival yet — the part of the product that keeps their identity has not shipped.' }
    }
    console.error(`[settings] rival not renamed for ${clientId}: ${error instanceof Error ? error.message : String(error)}`)
    return { ok: false, message: 'Could not rename just now. Try again, and tell us if it keeps happening.' }
  }
}
