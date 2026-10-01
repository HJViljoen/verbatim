/**
 * Settings › What you track (pages build, 1 Oct; the Page-Settings artboard):
 * the search terms in their four groups, your accounts, the brands you track
 * with their accounts, the communities, and the videos you marked as not your
 * market. Settings, not readings: no yield, no capacity, no makers rules, no
 * market card, no term performance (the review's cuts).
 *
 * The pure half shapes the stored config for the page; `loadWhatYouTrack` is
 * the one wave of reads behind it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { findRival, loadCompetitors, type Competitor } from '@/lib/rivals'
import type { TermLists } from './settings-words'
import type { SubredditEntry } from '@/lib/gather/types'

export interface AccountLine {
  platform: string
  /** "@handle", or null where the account is a channel with no handle. */
  handle: string | null
}

export interface BrandRow {
  name: string
  /** The `competitors` identity, which a rename needs; null before M1. */
  id: string | null
  accounts: AccountLine[]
}

export interface OwnAccountRow {
  platform: string
  value: string
  mono: boolean
}

export interface WhatYouTrack {
  tenant: string
  terms: TermLists
  /** The tracked list as stored, for the editors (order kept). */
  names: string[]
  brands: BrandRow[]
  communities: string[]
  ownAccounts: OwnAccountRow[]
  ownHandles: Record<string, string>
  /** Videos marked "not my market"; null where it could not be read. */
  notMine: number | null
}

/** The order the artboard lists a brand's or your accounts in. */
const PLATFORM_ORDER = ['instagram', 'tiktok', 'youtube'] as const
const PLATFORM_NAME: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' }

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(clean).filter(Boolean) : [])

/** A handle as printed: "@name". A YouTube channel id is a channel, not a
 *  handle, and prints none. */
export function handleOf(platform: string, raw: string): string | null {
  const h = raw.trim()
  if (!h) return null
  if (platform === 'youtube') return h.startsWith('@') ? h : null
  return `@${h.replace(/^@+/, '')}`
}

/** A brand's accounts in the artboard's order: Instagram, TikTok, YouTube. */
export function brandAccounts(handles: Record<string, string> | null | undefined): AccountLine[] {
  const h = handles ?? {}
  return PLATFORM_ORDER.filter((p) => clean(h[p])).map((p) => ({ platform: PLATFORM_NAME[p], handle: handleOf(p, clean(h[p])) }))
}

/** Your own accounts: "@handle", or "{Tenant}’s channel" for a YouTube
 *  channel id. */
export function ownAccountRows(handles: Record<string, string> | null | undefined, tenant: string): OwnAccountRow[] {
  const h = handles ?? {}
  return PLATFORM_ORDER.filter((p) => clean(h[p])).map((p) => {
    const handle = handleOf(p, clean(h[p]))
    return handle
      ? { platform: PLATFORM_NAME[p], value: handle, mono: true }
      : { platform: PLATFORM_NAME[p], value: tenant ? `${tenant}’s channel` : 'Your channel', mono: false }
  })
}

const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' })

/** The page's model, from the stored config and the rival identities. */
export function whatYouTrack(input: {
  tenant: string
  config: Record<string, unknown> | null
  rivals: readonly Competitor[]
  notMine: number | null
}): WhatYouTrack {
  const c = input.config ?? {}
  const names = list(c.competitor_names)
  const handles = (c.competitor_handles ?? {}) as Record<string, Record<string, string>>
  const handlesOf = (name: string) =>
    handles[name] ?? Object.entries(handles).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? null
  const entries = (Array.isArray(c.subreddits) ? c.subreddits : []) as SubredditEntry[]
  const ownHandles = (c.own_handles ?? {}) as Record<string, string>
  return {
    tenant: input.tenant,
    terms: {
      brand_keywords: list(c.brand_keywords),
      industry_keywords: list(c.industry_keywords),
      competitor_keywords: list(c.competitor_keywords),
      exclude_terms: list(c.exclude_terms),
    },
    names,
    brands: [...names].sort(byName).map((name) => {
      const identity = findRival(input.rivals.filter((r) => !r.retired_at), name)
      return { name, id: identity?.id ?? null, accounts: brandAccounts(handlesOf(name)) }
    }),
    communities: entries
      .filter((e) => e && e.status === 'active' && clean(e.name))
      .map((e) => clean(e.name).replace(/^\/?r\//i, ''))
      .sort(byName),
    ownAccounts: ownAccountRows(ownHandles, input.tenant),
    ownHandles,
    notMine: input.notMine,
  }
}

/** The one wave of reads behind the page, on the session client. */
export async function loadWhatYouTrack(
  supabase: SupabaseClient,
  clientId: string,
  notMine: (supabase: SupabaseClient, clientId: string) => Promise<number | null>,
): Promise<{ model: WhatYouTrack | null; failed: boolean }> {
  const [clientRead, configRead, rivals, marked] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    supabase.from('tracking_configs').select('*').eq('client_id', clientId).maybeSingle(),
    loadCompetitors(supabase, clientId).catch((e: unknown) => {
      console.error(`[settings] rivals not read for ${clientId}: ${(e as { message?: string }).message ?? String(e)}`)
      return [] as Competitor[]
    }),
    notMine(supabase, clientId).catch(() => null),
  ])
  if (configRead.error) {
    console.error(`[settings] tracking config not read for ${clientId}: ${configRead.error.message}`)
    return { model: null, failed: true }
  }
  if (!configRead.data) return { model: null, failed: false }
  const tenant = clean((clientRead.data as { company_name?: string } | null)?.company_name)
  return {
    model: whatYouTrack({ tenant, config: configRead.data as Record<string, unknown>, rivals, notMine: marked }),
    failed: false,
  }
}
