import type { SupabaseClient } from '@supabase/supabase-js'

import { WHAT_THEY_SELL } from '../pages/market-frame'
import { loadBrandClaims, type BrandClaims } from '../pipeline/claims'
import { inMonth, readingMonthOf } from './month'

// The company, as the writer needs it for "What it means for {company}"
// (writer v3, the lead's ruling of 30 Sep: "implications must be about
// Sealand, not the category"). The first dry v3 read's implications were true
// of every bag brand ("a premium bag earns its price when…"), because the
// writer knew nothing about the company but its name.
//
// THREE THINGS, EACH THROUGH THE PRODUCT'S OWN READER, AND NONE OF THEM THE
// MARKET:
//  · what it sells: the product's own noun (`WHAT_THEY_SELL`, the front
//    page's), the stored market description (`tracking_configs`, MF3, null for
//    Sealand today) and the industry keywords its market is followed by;
//  · what it says about itself: its OWN-VOICE claims in its own videos
//    (`loadBrandClaims`, the loader Pass C and the document engine use: the
//    newest run per video, deduped, the brand's voice split from creators
//    talking about it). Pass A's paraphrase of each (`claim`), NEVER the
//    transcript's words (`quote`);
//  · whether it posted: the own-post census (the front page's rule,
//    `videos.is_client`, DATED BY THE POST, `upload_date`) over the week's
//    dates and the month to date. The writer is told yes or none, never a
//    count: it has no numbers.
//
// The client's own posts are not the market (decision E), and neither are
// its claims: the prompt says so, and the writer may set a finding against a
// claim but never say how a claim was received unless a candidate says it.
//
// FAIL-SOFT. Each part that cannot be read is left out (logged), and the
// writer is told less; a context that cannot be read never stops a read.

/** Own claims the writer is shown, at most. */
export const COMPANY_CLAIMS_MAX = 10
/** Industry keywords the writer is shown, at most. */
export const COMPANY_KEYWORDS_MAX = 12

export interface CompanyContext {
  /** What the company sells, in the product's words. */
  sells: { noun: string | null; description: string | null; keywords: string[] }
  /** What the company says about itself in its own videos: paraphrases,
   *  newest first, deduped, capped. */
  claims: string[]
  /** Posts the company published (dated by the post): the week's dates and
   *  the month to date. Null where not read. */
  posts: { week: number | null; month: number | null }
}

/** The own-voice claims as the writer sees them: the paraphrase only, once
 *  per wording, newest first, capped. Pure. */
export function ownClaimsOf(claims: Pick<BrandClaims, 'client'>, max = COMPANY_CLAIMS_MAX): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of claims.client) {
    if (c.voice === 'about') continue
    const claim = (c.claim ?? '').replace(/\s+/g, ' ').trim()
    const key = claim.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    if (!claim || seen.has(key)) continue
    seen.add(key)
    out.push(claim)
    if (out.length >= max) break
  }
  return out
}

/** The census's two periods, as dates (`upload_date` is a date): the week's
 *  days `[from, to)` and its month, `[month start, to)` so far, or the month
 *  the week started in, in full, for a week that carried past its end (M2,
 *  lib/written/month.ts). Pure. */
export function postPeriods(window: { from: string; to: string }): { week: { from: string; to: string }; month: { from: string; to: string } } {
  const to = window.to.slice(0, 10)
  const reading = readingMonthOf(window)
  return { week: { from: window.from.slice(0, 10), to }, month: { from: reading.month, to: reading.complete ? reading.to.slice(0, 10) : to } }
}

/** The context as the writer reads it, in words and without a number. Pure. */
export function companyLines(company: string, ctx: CompanyContext | null | undefined, month: string, complete = false): string {
  if (!ctx) return ''
  const sells = [
    ctx.sells.noun ? `${company} sells ${ctx.sells.noun}.` : '',
    ctx.sells.description ? `In its own words, its market is: ${ctx.sells.description}` : '',
    ctx.sells.keywords.length ? `Its market is followed by these words: ${ctx.sells.keywords.join(', ')}.` : '',
  ].filter(Boolean)
  const posted = (n: number | null, when: string) => (n == null ? '' : n > 0 ? `${company} published posts of its own ${when}.` : `${company} published no post of its own ${when}.`)
  const posts = [posted(ctx.posts.week, 'this week'), posted(ctx.posts.month, inMonth(month, complete))].filter(Boolean)
  return [
    `About ${company} (context for "What it means for ${company}"; none of this is what the market said):`,
    sells.length ? `- What ${company} sells: ${sells.join(' ')}` : '',
    ctx.claims.length
      ? `- What ${company} says about itself in its own videos (its claims, in paraphrase):\n${ctx.claims.map((c) => `  - ${c}`).join('\n')}`
      : `- What ${company} says about itself: nothing recorded.`,
    posts.length ? `- ${posts.join(' ')}` : '',
  ].filter(Boolean).join('\n')
}

/** Read the context. READ-ONLY, one statement at a time, never throws. */
export async function loadCompanyContext(
  admin: SupabaseClient,
  opts: { clientId: string; window: { from: string; to: string } },
): Promise<CompanyContext> {
  const { clientId, window } = opts
  const ctx: CompanyContext = { sells: { noun: WHAT_THEY_SELL[clientId] ?? null, description: null, keywords: [] }, claims: [], posts: { week: null, month: null } }
  const warn = (what: string, e: unknown) => console.warn(`[written/company] ${what} not read; the writer is told less:`, e instanceof Error ? e.message : e)

  // `select('*')`: market_description arrived with MF3 and may not be here.
  let config: Record<string, unknown> = {}
  try {
    const res = await admin.from('tracking_configs').select('*').eq('client_id', clientId).maybeSingle()
    if (res.error) throw new Error(res.error.message)
    config = (res.data ?? {}) as Record<string, unknown>
    const description = typeof config.market_description === 'string' ? config.market_description.trim() : ''
    ctx.sells.description = description || null
    ctx.sells.keywords = [...new Set(((config.industry_keywords ?? []) as string[]).map((k) => String(k).trim()).filter(Boolean))].slice(0, COMPANY_KEYWORDS_MAX)
  } catch (e) {
    warn('tracking_configs', e)
  }

  try {
    const claims = await loadBrandClaims(
      admin as Parameters<typeof loadBrandClaims>[0],
      clientId,
      ((config.competitor_names ?? []) as string[]).filter(Boolean),
      ((config.brand_keywords ?? []) as string[]).filter(Boolean),
      (config.own_handles ?? {}) as Record<string, string>,
      (config.competitor_handles ?? {}) as Record<string, Record<string, string>>,
    )
    ctx.claims = ownClaimsOf(claims)
  } catch (e) {
    warn('own claims', e)
  }

  const periods = postPeriods(window)
  for (const key of ['week', 'month'] as const) {
    try {
      const res = await admin.from('videos').select('id', { count: 'exact', head: true })
        .eq('client_id', clientId).eq('is_client', true)
        .gte('upload_date', periods[key].from).lt('upload_date', periods[key].to)
      if (res.error) throw new Error(res.error.message)
      ctx.posts[key] = res.count ?? 0
    } catch (e) {
      warn(`own posts (${key})`, e)
    }
  }
  return ctx
}
