'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { ensureDefaultSchedule } from '@/lib/schedules/default'
import { SELECTABLE_PLATFORMS } from '@/app/dashboard/settings/constants'
import { deriveCompetitorKeywords, cleanTerms, ONBOARDING_MAX_VIDEOS } from '@/lib/onboarding-config'
import { suggestSearchTerms, flattenCompetitorTerms } from '@/lib/keywords/suggest'
import { takeSuggestionSlot } from '@/lib/keywords/suggest-guard'

// State shape (a type) — idle value lives in the client form; a 'use server'
// module may only export async functions.
export interface OnboardingState {
  ok: boolean
  message: string
}

export interface SuggestTermsState {
  ok: boolean
  message: string
  /** Candidates for the chips. Nothing is stored until the workspace is created. */
  suggestions: { brand: string[]; competitors: string[]; category: string[] } | null
}

const csv = (v: FormDataEntryValue | null) =>
  String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean)

// Competitors are required and category words are not (T0-7): the marketing
// site promises "Your brand. Your competitors. That's everything. No keyword
// tuning", and the form asked for the exact opposite. Competitors are also the
// half the product cannot work without, since half the corpus is found through
// them and every competitive surface reads them.
const schema = z.object({
  company_name: z.string().trim().min(1, 'enter your company name'),
  industry_keywords: z.array(z.string()),
  competitor_names: z.array(z.string()).min(1, 'add at least one competitor'),
  platforms: z.array(z.enum(SELECTABLE_PLATFORMS)).min(1, 'pick at least one platform'),
})

const TRIAL_DAYS = 14

/**
 * Propose search terms from what the form already holds (WP5, 2026-09-11).
 *
 * The vault has asked for this since the first strategy note — "if a Head of
 * Marketing has to figure out what industry_keywords means, they'll bounce".
 * Until now onboarding could only DERIVE (copy the competitor names into the
 * search list); it never proposed the words buyers actually type, which is the
 * half of the corpus a name alone cannot find.
 *
 * One gpt-4.1-mini call, ~$0.001, and nothing it returns is stored: the form
 * shows the terms as chips and only the kept ones reach tracking_configs.
 */
export async function suggestTerms(_prev: SuggestTermsState, formData: FormData): Promise<SuggestTermsState> {
  const { user } = await requireUser()
  const admin = createAdminClient()

  // This is the onboarding session or nothing. A user who already has a
  // workspace has no business here — createWorkspace redirects them, and
  // without the same guard this action was the one signed-in, model-spending
  // endpoint any account could call for a tenant it does not belong to.
  const { data: existing } = await admin.from('users').select('id').eq('id', user.id).maybeSingle()
  if (existing) return { ok: false, message: 'Your workspace is already set up — change search terms in Settings.', suggestions: null }

  const companyName = String(formData.get('company_name') ?? '').trim()
  if (!companyName) return { ok: false, message: 'Enter your company name first.', suggestions: null }

  // Metered per user, and the inputs are bounded inside suggestSearchTerms
  // (boundSuggestInput) because everything here comes straight off a form POST.
  const slot = await takeSuggestionSlot(user.id, null)
  if (!slot.ok) return { ok: false, message: slot.message, suggestions: null }

  try {
    const s = await suggestSearchTerms({
      company_name: companyName,
      competitor_names: csv(formData.get('competitor_names')),
      industry_keywords: csv(formData.get('industry_keywords')),
    })
    console.log(`[onboarding] search-term suggestions for "${companyName}": $${s.costUsd.toFixed(4)}`)
    const suggestions = { brand: s.brand, competitors: flattenCompetitorTerms(s), category: s.category }
    const total = suggestions.brand.length + suggestions.competitors.length + suggestions.category.length
    if (total === 0) return { ok: false, message: 'Nothing to suggest from that yet — name a competitor and try again.', suggestions: null }
    return { ok: true, message: 'Keep the ones that sound like your buyers.', suggestions }
  } catch (e) {
    return { ok: false, message: `Could not suggest terms right now: ${e instanceof Error ? e.message : String(e)}`, suggestions: null }
  }
}

// Provision a brand-new workspace for the signed-in, membership-less user:
// creates the client, an initial tracking_config, and the user's owner
// membership — then drops them into the dashboard. Uses the service role
// because the user has no tenant context yet, so RLS can't authorize these
// writes (this is the "provisioning" use of the service role, by design).
export async function createWorkspace(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const { user } = await requireUser()
  const admin = createAdminClient()

  // Guard: if they already have a workspace, don't create a second one.
  const { data: existing } = await admin
    .from('users').select('id').eq('id', user.id).maybeSingle()
  if (existing) redirect('/dashboard')

  // Terms the user kept from the suggestion step, on their own field names so
  // they can never be confused with the comma-separated category box.
  const kept = (name: string) => formData.getAll(name).map(String)

  const parsed = schema.safeParse({
    company_name: formData.get('company_name'),
    industry_keywords: cleanTerms([...csv(formData.get('industry_keywords')), ...kept('suggested_category')]),
    competitor_names: csv(formData.get('competitor_names')),
    platforms: formData.getAll('platforms').map(String),
  })
  if (!parsed.success) {
    return { ok: false, message: `Please ${parsed.error.issues[0]?.message ?? 'check your input'}.` }
  }
  const { company_name, industry_keywords, competitor_names, platforms } = parsed.data

  // 1) Client (tenant). Created INACTIVE and unapproved (T0-2): a signup used
  //    to become a live tenant that the next Monday's scheduler picked up and
  //    started spending Apify and OpenAI money on, unattended and unbilled. An
  //    operator sets is_active + approved_at once the workspace is real.
  const { data: client, error: clientErr } = await admin
    .from('clients')
    .insert({
      company_name,
      plan: 'trial',
      is_active: false,
      approved_at: null,
      trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString(),
    })
    .select('id')
    .single()
  if (clientErr || !client) {
    return { ok: false, message: `Could not create workspace: ${clientErr?.message ?? 'unknown error'}` }
  }
  const clientId = client.id as string

  // 2) Initial tracking config. competitor_keywords is DERIVED (T0-7): gather
  //    searches from it while tagging matches on competitor_names, and nothing
  //    ever wrote it, so a self-serve tenant gathered nothing about the
  //    competitors it just named. max_videos overrides the column default of
  //    10, which is too thin for the analysis floors to leave anything.
  //    Kept suggestions ADD to the derivation, never replace it: the derived
  //    competitor list is the floor that makes the product work at all, and a
  //    model's extra spellings are a bonus on top of it. The company name is
  //    the same floor for brand_keywords.
  const { error: cfgErr } = await admin.from('tracking_configs').insert({
    client_id: clientId,
    //    The company name itself bypasses the 4-character floor: a short name
    //    ("Gap") is still the one term this tenant cannot be tracked without.
    brand_keywords: [company_name, ...cleanTerms(kept('suggested_brand')).filter((t) => t.toLowerCase() !== company_name.toLowerCase())].slice(0, 15),
    competitor_names,
    competitor_keywords: cleanTerms([...deriveCompetitorKeywords(competitor_names), ...kept('suggested_competitor')]),
    industry_keywords,
    platforms,
    max_videos: ONBOARDING_MAX_VIDEOS,
    report_emails: user.email ? [user.email] : [],
  })
  if (cfgErr) return { ok: false, message: `Could not save tracking settings: ${cfgErr.message}` }

  // 2b) Default schedule ("Weekly digest"), seeded with the creator's address
  // — mirrors the tracking_configs.report_emails seed above, now the source
  // recipients actually send from. Non-fatal: a bookkeeping failure must
  // never block workspace creation.
  try {
    await ensureDefaultSchedule(admin, clientId, user.email ? [user.email] : [], user.id)
  } catch (e) {
    console.error(`[onboarding] default schedule not created for ${clientId}: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 3) Owner membership for the creator.
  const fullName = (user.user_metadata?.full_name as string | undefined) || user.email?.split('@')[0] || 'Owner'
  const { error: memberErr } = await admin.from('users').insert({
    id: user.id, client_id: clientId, email: user.email, full_name: fullName, role: 'owner',
  })
  if (memberErr) return { ok: false, message: `Could not finish setup: ${memberErr.message}` }

  redirect('/dashboard')
}
