'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { canManageTenant, getSessionContext } from '@/lib/auth'
import { GATE_APPEALS_TABLE, isMissingGateAppeals } from '@/lib/settings/record-load'
import { createAdminClient } from '@/lib/supabase-admin'

// "This should have been kept" (design ST5, decision V).
//
// IT FILES A COMPLAINT; IT DOES NOT RE-GATHER. A re-gather is Apify money
// spent from a button, and the useful answer to "why was this dropped" is a
// person reading the verdict beside the caption — not the same gate running
// again on the same caption and reaching the same conclusion.
//
// ON THE ADMIN CLIENT, STAMPED WITH THE CALLER'S OWN ID. `authenticated` holds
// no INSERT on gate_appeals (M8), which is what stops a crafted POST filing
// under somebody else's name: the id comes from the session and is never taken
// from the form.
//
// NOT recordConfigChange. An appeal is not a configuration change — nothing
// about the workspace moved — and putting it in the change log would make the
// log read as if a setting had been altered every time a client disagreed with
// the gate. What we then DO about an appeal is a configuration change, and
// that is logged where every other one is.

export interface AppealState {
  ok: boolean
  message: string
}

const schema = z.object({
  runId: z.string().uuid().nullable(),
  platform: z.string().min(1).max(32),
  videoId: z.string().min(1).max(256),
  note: z.string().max(500),
})

export async function fileGateAppeal(_prev: AppealState, formData: FormData): Promise<AppealState> {
  const session = await getSessionContext()
  const { clientId, role, userId } = session
  // The excerpt is only ever served to an owner or an admin, so only an owner
  // or an admin has seen the thing they would be appealing.
  if (!canManageTenant(role)) {
    return { ok: false, message: 'Only an owner or an admin can do this.' }
  }

  const runId = String(formData.get('runId') ?? '')
  const parsed = schema.safeParse({
    runId: runId === '' ? null : runId,
    platform: formData.get('platform'),
    videoId: formData.get('videoId'),
    note: String(formData.get('note') ?? '').trim(),
  })
  if (!parsed.success) {
    return { ok: false, message: 'We could not read which post that was. Refresh the page and try again.' }
  }

  const admin = createAdminClient()

  // RESOLVED AGAINST A VERDICT THAT EXISTS, AND ONE OF THIS TENANT'S. The
  // migration deliberately declares no foreign key, so nothing else checks
  // this: an owner- or admin-shaped POST could seed the operator queue with any
  // platform/video pair, one per key. Role-gated, append-only and confined to
  // the caller's own tenant, so it was queue noise rather than exposure — but
  // it was the one place in Block B where a client-supplied identifier reached
  // a write without being resolved against anything.
  const verdict = await admin
    .from('gate_verdicts')
    .select('id')
    .eq('client_id', clientId)
    .eq('platform', parsed.data.platform)
    .eq('video_id', parsed.data.videoId)
    .limit(1)
  if (verdict.error && !isMissingGateAppeals(verdict.error)) {
    console.error(`[record] appeal lookup failed for ${clientId}: ${verdict.error.code ?? '?'} ${verdict.error.message}`)
    return { ok: false, message: 'We could not take that just now. Try again, and tell us if it keeps happening.' }
  }
  if ((verdict.data ?? []).length === 0) {
    return { ok: false, message: 'We have no record of looking at that post for this workspace, so there is nothing to appeal.' }
  }

  const { error } = await admin.from(GATE_APPEALS_TABLE).insert({
    client_id: clientId,
    run_id: parsed.data.runId,
    platform: parsed.data.platform,
    video_id: parsed.data.videoId,
    filed_by: userId,
    note: parsed.data.note || null,
  })

  if (error) {
    if (isMissingGateAppeals(error)) {
      return { ok: false, message: 'We cannot take this yet — the part of the product that records it has not shipped. Tell us and we will look at the post ourselves.' }
    }
    // One appeal per verdict: a second click is the same statement, not a
    // second one, and saying "already filed" is the truth.
    if (error.code === '23505') {
      return { ok: true, message: 'Already filed — we have this one.' }
    }
    console.error(`[settings] gate appeal not filed for ${clientId}: ${error.code ?? '?'} ${error.message}`)
    return { ok: false, message: 'We could not file that just now. Try again, and tell us if it keeps happening.' }
  }

  revalidatePath('/dashboard/settings/record')
  return { ok: true, message: 'Filed. We will look at this one by hand.' }
}
