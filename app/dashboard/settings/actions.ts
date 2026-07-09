'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { getSessionContext, canManageTenant } from '@/lib/auth'
import { PERIODS, DAYS } from './constants'

export interface SettingsFormState {
  ok: boolean
  message: string
}

// Comma-separated text field -> trimmed, de-blanked string[].
const csv = (v: FormDataEntryValue | null) =>
  String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean)

// Facts vs knobs (Redesign Spec §9): this action accepts ONLY the client-
// editable facts. Keywords, platforms, and scrape depth are operator levers —
// deliberately absent here so a crafted POST can't move cost/quality knobs
// even though the row-level UPDATE policy would allow the write.
const schema = z.object({
  competitor_names: z.array(z.string()),
  report_emails: z.array(z.email()),
  report_period: z.enum(PERIODS),
  report_day: z.enum(DAYS),
})

export async function updateTrackingConfig(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  // Server actions are directly POST-reachable, so authz is re-checked here —
  // never trusting the UI's disabled state. RLS is the third layer (the
  // tracking_configs UPDATE policy also requires owner/admin).
  const { supabase, clientId, role } = await getSessionContext()
  if (!canManageTenant(role)) {
    return { ok: false, message: 'You don’t have permission to change settings.' }
  }

  const parsed = schema.safeParse({
    competitor_names: csv(formData.get('competitor_names')),
    report_emails: csv(formData.get('report_emails')),
    report_period: formData.get('report_period'),
    report_day: formData.get('report_day'),
  })

  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const field = first?.path.join('.') || 'form'
    return { ok: false, message: `Invalid ${field}: ${first?.message ?? 'check your input.'}` }
  }

  const { error } = await supabase
    .from('tracking_configs')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('client_id', clientId)

  if (error) {
    return { ok: false, message: `Could not save: ${error.message}` }
  }

  revalidatePath('/dashboard/settings')
  return { ok: true, message: 'Settings saved.' }
}
