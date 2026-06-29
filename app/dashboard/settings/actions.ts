'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { getSessionContext, canManageTenant } from '@/lib/auth'
import { PLATFORMS, PERIODS, DAYS, LIMITS } from './constants'

export interface SettingsFormState {
  ok: boolean
  message: string
}

// Comma-separated text field -> trimmed, de-blanked string[].
const csv = (v: FormDataEntryValue | null) =>
  String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean)

const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? '').trim())
  return Number.isFinite(n) ? n : NaN
}

const schema = z.object({
  brand_keywords: z.array(z.string()),
  competitor_keywords: z.array(z.string()),
  competitor_names: z.array(z.string()),
  industry_keywords: z.array(z.string()),
  platforms: z.array(z.enum(PLATFORMS)).min(1, 'select at least one platform'),
  report_emails: z.array(z.email()),
  report_period: z.enum(PERIODS),
  report_day: z.enum(DAYS),
  max_videos: z.number().int().min(LIMITS.max_videos.min).max(LIMITS.max_videos.max),
  max_comments: z.number().int().min(LIMITS.max_comments.min).max(LIMITS.max_comments.max),
  comment_depth: z.number().int().min(LIMITS.comment_depth.min).max(LIMITS.comment_depth.max),
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
    brand_keywords: csv(formData.get('brand_keywords')),
    competitor_keywords: csv(formData.get('competitor_keywords')),
    competitor_names: csv(formData.get('competitor_names')),
    industry_keywords: csv(formData.get('industry_keywords')),
    platforms: formData.getAll('platforms').map(String),
    report_emails: csv(formData.get('report_emails')),
    report_period: formData.get('report_period'),
    report_day: formData.get('report_day'),
    max_videos: num(formData.get('max_videos')),
    max_comments: num(formData.get('max_comments')),
    comment_depth: num(formData.get('comment_depth')),
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
