'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { getSessionContext, canManageTenant } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { mergeCompetitorKeywords, cleanTerms, MIN_KEYWORD_CHARS, MAX_TERMS_PER_BUCKET } from '@/lib/onboarding-config'
import { suggestSearchTerms, flattenCompetitorTerms } from '@/lib/keywords/suggest'
import { PERIODS, DAYS } from './constants'

export interface SettingsFormState {
  ok: boolean
  message: string
}

export interface SuggestState {
  ok: boolean
  message: string
  /** Candidates only — nothing is stored until the client keeps them and saves. */
  suggestions: { brand: string[]; competitors: string[]; category: string[] } | null
}

// Comma-separated text field -> trimmed, de-blanked string[].
const csv = (v: FormDataEntryValue | null) =>
  String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean)

// Facts vs knobs (Redesign Spec §9): this action accepts ONLY the client-
// editable facts. Keywords, platforms, and scrape depth are operator levers —
// deliberately absent here so a crafted POST can't move cost/quality knobs
// even though the row-level UPDATE policy would allow the write.
// Caps mirror the tracking_configs CHECK constraints (T0-2) so the limit
// arrives as a sentence rather than as a raw Postgres constraint name.
const schema = z.object({
  competitor_names: z.array(z.string()).min(1, 'add at least one competitor').max(15, 'track at most 15 competitors'),
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

  // Read the stored config BEFORE validating: a paused tenant's form has no
  // period control at all (the select cannot represent 'paused'), so the field
  // is absent from the POST and has to be filled in from what is stored.
  const { data: current } = await supabase
    .from('tracking_configs')
    .select('report_period, competitor_names, competitor_keywords')
    .eq('client_id', clientId)
    .maybeSingle()

  // Paused stays paused (T0-7). Before, the select rendered 'paused' as
  // 'weekly' and a save wrote that back, re-arming the scheduler on a tenant
  // meant to be quiet. Three live tenants sit at 'paused' today, Sealand
  // among them.
  const isPaused = current?.report_period === 'paused'

  const parsed = schema.safeParse({
    competitor_names: csv(formData.get('competitor_names')),
    report_period: isPaused ? 'weekly' : formData.get('report_period'),
    report_day: formData.get('report_day'),
  })

  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const field = first?.path.join('.') || 'form'
    return { ok: false, message: `Invalid ${field}: ${first?.message ?? 'check your input.'}` }
  }

  const { error } = await supabase
    .from('tracking_configs')
    .update({
      ...parsed.data,
      ...(isPaused ? { report_period: 'paused' } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('client_id', clientId)

  if (error) {
    return { ok: false, message: `Could not save: ${error.message}` }
  }

  // competitor_keywords follows competitor_names (T0-7): gather searches from
  // the keywords while tagging matches on the names, and no app surface ever
  // wrote the keywords, so a self-serve tenant gathered nothing about the
  // competitors it just named. Written with the admin client on purpose: T0-2
  // revoked the column from `authenticated`, so it stays unreachable from a
  // crafted POST and moves only through this derivation. Authorization already
  // passed (role check + the RLS update above). Non-fatal: the four facts are
  // saved either way.
  //
  // A UNION, not a replacement (2026-09-12). The old rule skipped the write
  // entirely whenever the stored list diverged from the derivation, on the
  // assumption that divergence meant an operator had hand-curated it. Now that
  // the client can edit the term list itself, the first edit made that true
  // forever: adding a competitor name would silently stop adding a search term
  // for it — the exact T0-7 bug, reachable by ordinary use. So the derived
  // terms are topped up onto whatever is stored, the way onboarding already
  // merges them. Curation is respected for what it can express — the union
  // never REMOVES a term anyone added.
  const storedKeywords = (current?.competitor_keywords ?? []) as string[]
  const sameSet = (a: string[], b: string[]) =>
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
  const next = mergeCompetitorKeywords(storedKeywords, parsed.data.competitor_names)
  if (!sameSet(storedKeywords, next)) {
    const { error: kwErr } = await createAdminClient()
      .from('tracking_configs')
      .update({ competitor_keywords: next })
      .eq('client_id', clientId)
    if (kwErr) console.error(`[settings] competitor_keywords not updated for ${clientId}: ${kwErr.message}`)
  }

  revalidatePath('/dashboard/settings')
  return { ok: true, message: 'Settings saved.' }
}

// ---- Search terms (WP5, 2026-09-11) ----------------------------------------
//
// The "facts vs knobs" line moved. Keywords are a fact the client owns — only
// they know that "Cotopaxi" is also a volcano, or which two words their buyers
// actually type. What made keywords an operator lever was cost and quality:
// cost is now bounded below the UI (the CHECK constraints cap each bucket at
// 15, GATHER_MAX_SEARCHES_PER_RUN caps a run at 120 searches), and quality is
// what the performance table beside the editor is for. max_videos,
// comment_depth and platforms stay operator knobs and are still absent here.
//
// Three of the four columns are REVOKEd from `authenticated` (T0-2), so they
// are written with the admin client — the same route competitor_keywords
// already takes above, after the same role check. exclude_terms is granted to
// the tenant role (20260911140000_exclude_terms.sql) and goes through the
// session client, so RLS is the last word on it.

const termList = (what: string) =>
  z.array(z.string())
    .max(MAX_TERMS_PER_BUCKET, `keep at most ${MAX_TERMS_PER_BUCKET} ${what}`)
    .refine((xs) => xs.every((x) => x.trim().length >= MIN_KEYWORD_CHARS), {
      message: `each term needs at least ${MIN_KEYWORD_CHARS} characters — shorter words find the whole internet`,
    })

const termsSchema = z.object({
  brand_keywords: termList('terms for your brand').min(1, 'keep at least one term for your brand'),
  competitor_keywords: termList('competitor terms'),
  industry_keywords: termList('category terms'),
  exclude_terms: termList('exclusions'),
})

export async function updateSearchTerms(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const { supabase, clientId, role } = await getSessionContext()
  if (!canManageTenant(role)) {
    return { ok: false, message: 'You don’t have permission to change search terms.' }
  }

  const list = (name: string) => formData.getAll(name).map(String)
  const parsed = termsSchema.safeParse({
    brand_keywords: list('brand_keywords'),
    competitor_keywords: list('competitor_keywords'),
    industry_keywords: list('industry_keywords'),
    exclude_terms: list('exclude_terms'),
  })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, message: `Could not save: ${first?.message ?? 'check your terms.'}` }
  }

  // Tidy once more on the server: the same trim/de-dupe/cap the form applies,
  // so a crafted POST cannot store a list the UI could never produce.
  const terms = {
    brand_keywords: cleanTerms(parsed.data.brand_keywords),
    competitor_keywords: cleanTerms(parsed.data.competitor_keywords),
    industry_keywords: cleanTerms(parsed.data.industry_keywords),
    updated_at: new Date().toISOString(),
  }
  if (terms.brand_keywords.length === 0) {
    return { ok: false, message: 'Could not save: keep at least one term for your brand.' }
  }

  // Terms FIRST, exclusions last. The exclusions column arrives with a
  // migration that may not have been applied yet, and when it hasn't, Postgres
  // rejects the whole statement — so writing them together would lose a brand
  // and category edit to a column the client never touched.
  const { error, count } = await createAdminClient()
    .from('tracking_configs')
    .update(terms, { count: 'exact' })
    .eq('client_id', clientId)
  if (error) {
    console.error(`[settings] search terms not saved for ${clientId}: ${error.message}`)
    return { ok: false, message: 'Could not save your search terms. Try again, and tell us if it keeps happening.' }
  }
  // An UPDATE that matched nothing is not an error — no config row, or RLS
  // declining silently. Reporting "Saved." on a write that did nothing is the
  // failure mode this catches.
  if (count === 0) {
    return { ok: false, message: 'Nothing was saved — this workspace has no tracking setup yet. Talk to us and we’ll set it up.' }
  }

  const { error: exclErr } = await supabase
    .from('tracking_configs')
    .update({ exclude_terms: cleanTerms(parsed.data.exclude_terms), updated_at: new Date().toISOString() })
    .eq('client_id', clientId)

  revalidatePath('/dashboard/settings')
  if (exclErr) {
    console.error(`[settings] exclude_terms not saved for ${clientId}: ${exclErr.code ?? '?'} ${exclErr.message}`)
    // The one failure the client is allowed to hear about in plain words: the
    // column does not exist yet. Everything else is ours to chase, not theirs.
    return isMissingColumn(exclErr, 'exclude_terms')
      ? { ok: true, message: 'Saved. Exclusions need a database update that hasn’t shipped yet.' }
      : { ok: true, message: 'Saved — except the “Not this” list, which we could not store. Try that part again.' }
  }
  return { ok: true, message: 'Saved. Your next update searches these terms.' }
}

/** PostgREST's two ways of saying "that column isn't there": Postgres 42703
 *  from a statement it forwarded, PGRST204 from its own schema cache. */
function isMissingColumn(err: { code?: string | null; message?: string | null }, column: string): boolean {
  const code = err.code ?? ''
  return (code === '42703' || code === 'PGRST204') && (err.message ?? '').includes(column)
}

/** Ask the model for more terms. Offers only — nothing is written here. */
export async function suggestMoreTerms(_prev: SuggestState, _formData: FormData): Promise<SuggestState> {
  const { supabase, clientId, role } = await getSessionContext()
  if (!canManageTenant(role)) {
    return { ok: false, message: 'You don’t have permission to change search terms.', suggestions: null }
  }

  const [{ data: client }, { data: cfg }] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    supabase.from('tracking_configs').select('competitor_names, industry_keywords').eq('client_id', clientId).maybeSingle(),
  ])
  const companyName = (client?.company_name as string | undefined) ?? ''
  if (!companyName) {
    return { ok: false, message: 'We need your company name first.', suggestions: null }
  }

  try {
    const s = await suggestSearchTerms({
      company_name: companyName,
      competitor_names: (cfg?.competitor_names ?? []) as string[],
      industry_keywords: (cfg?.industry_keywords ?? []) as string[],
    })
    console.log(`[settings] search-term suggestions for ${clientId}: $${s.costUsd.toFixed(4)}`)
    const suggestions = { brand: s.brand, competitors: flattenCompetitorTerms(s), category: s.category }
    const total = suggestions.brand.length + suggestions.competitors.length + suggestions.category.length
    if (total === 0) {
      return { ok: false, message: 'Nothing worth suggesting — add a competitor or a category word and try again.', suggestions: null }
    }
    return { ok: true, message: `${total} to consider. Keep the ones that sound like your buyers.`, suggestions }
  } catch (e) {
    return { ok: false, message: `Could not suggest terms right now: ${e instanceof Error ? e.message : String(e)}`, suggestions: null }
  }
}
