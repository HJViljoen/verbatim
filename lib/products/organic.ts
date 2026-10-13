import type { SupabaseClient } from '@supabase/supabase-js'

import { normTerm, overlapSpellings, pgTextArray, type ReadCharge } from '../brands/rival-searches'
import { selectAll } from '../supabase-admin'

// The per-category organic base's reads (depth v2 T11; the fresh check of 13
// Oct): our search terms, current and retired, and which videos each found.
// The evidence is lib/brands/rival-searches.ts readRivalFound's (keyword_
// performance for the terms a gather ran, tracking_configs for the terms
// configured now, then source_keywords and video_provenance's first-found
// terms for the videos), over EVERY bucket rather than the rival one: a
// category's base leaves out what a search in its own words found
// (lib/products/readings.ts categorySearchTerms). One query in flight; a
// script passes its read allowance (`charge`).

const missing = (error: unknown, name: string): boolean => {
  const text = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? error)
  return text.includes(name) && /schema cache|does not exist|Could not find/i.test(text)
}

const pageOf = <B>(charge: ReadCharge | undefined, what: string, build: () => B): (() => B) => () => { charge?.spend(1, what); return build() }

/** Every term a gather ran (any bucket) and every term configured now. */
export async function readSearchTerms(client: SupabaseClient, clientId: string, charge?: ReadCharge): Promise<string[]> {
  const run = await selectAll<{ id: string; keyword: string | null }>(pageOf(charge, 'our search terms', () =>
    client.from('keyword_performance').select('id, keyword').eq('client_id', clientId).order('id')))
  charge?.spend(1, 'the terms configured now')
  const { data, error } = await client.from('tracking_configs').select('brand_keywords, industry_keywords, competitor_keywords').eq('client_id', clientId).maybeSingle()
  if (error) throw new Error(`tracking_configs: ${error.message}`)
  const cfg = (data ?? {}) as { brand_keywords?: string[] | null; industry_keywords?: string[] | null; competitor_keywords?: string[] | null }
  const terms = [...run.map((r) => r.keyword ?? ''), ...(cfg.brand_keywords ?? []), ...(cfg.industry_keywords ?? []), ...(cfg.competitor_keywords ?? [])]
  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))].sort()
}

/** Of these terms, which found each full-lane video: its source_keywords now,
 *  or its first-found terms (video_provenance; none where MF1 is not there). */
export async function readSearchFound(client: SupabaseClient, clientId: string, terms: readonly string[], charge?: ReadCharge): Promise<Map<string, string[]>> {
  const want = new Set(terms.map(normTerm))
  const spellings = overlapSpellings(terms.map((keyword) => ({ keyword })), [])
  if (spellings.length === 0) return new Map()
  const literal = pgTextArray(spellings)
  const now = await selectAll<{ id: string; source_keywords: string[] | null }>(pageOf(charge, 'the videos our category searches found', () =>
    client.from('videos').select('id, source_keywords').eq('client_id', clientId).eq('analyzed_lane', 'full').overlaps('source_keywords', literal).order('id')))
  const first = await selectAll<{ video_id: string; first_terms: string[] | null }>(pageOf(charge, 'the videos they found first', () =>
    client.from('video_provenance').select('video_id, first_terms').eq('client_id', clientId).overlaps('first_terms', literal).order('video_id')))
    .catch((error: unknown) => { if (missing(error, 'video_provenance')) return []; throw error })
  const out = new Map<string, string[]>()
  const add = (id: string, ts: readonly string[] | null) => {
    const hit = (ts ?? []).filter((t) => want.has(normTerm(t)))
    if (hit.length) out.set(id, [...new Set([...(out.get(id) ?? []), ...hit])])
  }
  for (const r of now) add(String(r.id), r.source_keywords)
  for (const r of first) add(String(r.video_id), r.first_terms)
  return out
}
