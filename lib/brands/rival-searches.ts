import type { SupabaseClient } from '@supabase/supabase-js'

import { selectAll } from '../supabase-admin'

// Which of the market's videos our rival searches found (market-first
// decision E; the research's F37; the lead's ruling of 27 Sep on deploy 3's
// brands column).
//
// ONE BASE FOR EVERY BRAND. A brand's headline count leaves out EVERY video
// ANY of our rival searches found, not only the videos its own searches found:
// "Patagonia black hole" finds videos that name The North Face too, and a
// brand counted without its own searches but with a rival's would still be
// counted partly on our own searching. So every brand's headline count sits
// over one denominator, the market's videos that no rival search of ours
// found, and the table's column head can carry that one base.
//
// A RIVAL SEARCH is every term we have searched in the rival bucket, current
// and retired: `keyword_performance.bucket = 'competitor'`, which holds each
// gather's terms with the bucket they ran in (the bare "cotopaxi",
// "patagonia", "freitag", "poler" and "topo designs" until 9 Sep; "cotopaxi
// backpack" and the rest after), plus the tenant's `competitor_keywords` now,
// so a term configured and not yet run is one too. The research's F37 read
// only the terms configured on 24 Sep; with them alone August's rival finds
// (made by the bare names) would count as the market's own.
//
// FOUND means any evidence we hold that a rival search surfaced the video: its
// first-found terms (MF1 `video_provenance`, where it is applied) or its
// source_keywords now. A gate verdict's keyword is not read here: on staging it
// adds no video to these two (138 of September's 654 market videos either
// way, 27 Sep).
//
// The page (lib/pages/overview-brands.ts) and scripts/brand-mentions.ts read
// the same set through `readRivalFound`, so the two print one figure.

/** Terms are compared trimmed and lowercased. */
export const normTerm = (t: string): string => t.trim().toLowerCase()

/** The rival searches: every term a gather ran in the rival bucket, and every
 *  term configured as one now. */
export function rivalSearchTerms(
  runTerms: readonly { keyword: string | null; bucket?: string | null }[],
  configured: readonly string[] | null | undefined,
): Set<string> {
  const out = new Set<string>()
  for (const r of runTerms) {
    if (r.keyword && (r.bucket == null || r.bucket === 'competitor')) out.add(normTerm(r.keyword))
  }
  for (const t of configured ?? []) if (t.trim()) out.add(normTerm(t))
  out.delete('')
  return out
}

/** The spellings to ask PostgREST's array overlap for: each term as run or
 *  configured, and its trimmed lowercase form (the stored arrays hold the
 *  configured spelling; `&&` is exact). */
export function overlapSpellings(
  runTerms: readonly { keyword: string | null }[],
  configured: readonly string[] | null | undefined,
): string[] {
  const raw = [...runTerms.map((r) => r.keyword ?? ''), ...(configured ?? [])].filter((t) => t.trim())
  return [...new Set([...raw, ...raw.map(normTerm)])].sort()
}

/** A Postgres array literal of `terms`, each element quoted, for PostgREST's
 *  `ov.` (supabase-js joins an array unquoted, which a term holding a comma,
 *  a quote or a brace would break). */
export function pgTextArray(terms: readonly string[]): string {
  return `{${terms.map((t) => `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`
}

/** The videos whose evidence names a rival search. */
export function rivalFoundOf(
  evidence: readonly { id: string; terms: readonly string[] | null }[],
  rival: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>()
  for (const e of evidence) if ((e.terms ?? []).some((t) => rival.has(normTerm(t)))) out.add(e.id)
  return out
}

/** The one base: the market's videos no rival search of ours found. */
export function withoutRivalSearches(market: readonly string[], rivalFound: ReadonlySet<string>): string[] {
  return market.filter((id) => !rivalFound.has(id))
}

const missing = (error: unknown, name: string): boolean => {
  const text = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? error)
  return text.includes(name) && /schema cache|does not exist|Could not find/i.test(text)
}

export interface RivalFound {
  /** The rival searches, trimmed and lowercased. */
  terms: ReadonlySet<string>
  /** The full-lane videos (the market's lane) any of them found, by uuid. */
  videos: ReadonlySet<string>
  /** Pages read: one per request, each page of a paged read its own. */
  pages: number
}

/** A read allowance a script keeps (`--max-reads`): charged BEFORE each
 *  request, so it stops before the read that would overshoot it. */
export interface ReadCharge {
  spend(k: number, what: string): void
}

/**
 * The rival searches and the videos they found, in three paged reads: the
 * rival bucket's terms (`keyword_performance`), the full-lane videos whose
 * source_keywords overlap them, and the videos whose first-found terms do
 * (`video_provenance`; none where MF1 is not applied). Each read asks only
 * for the matching rows, never for every market video. A read that fails
 * throws: the caller keeps what it printed before, never a count over a base
 * it could not read.
 *
 * ONE QUERY IN FLIGHT (plan §7.6; the deploy-3 fresh review): the reads go in
 * turn, never side by side, and where a script passes its allowance
 * (`charge`) each page is charged before it is asked for.
 */
export async function readRivalFound(
  client: SupabaseClient,
  clientId: string,
  configured: readonly string[] | null | undefined,
  charge?: ReadCharge,
): Promise<RivalFound> {
  let pages = 0
  // selectAll calls the builder once per page: the charge goes first.
  const page = <B>(what: string, build: () => B): (() => B) => () => {
    charge?.spend(1, what)
    pages += 1
    return build()
  }
  const runTerms = await selectAll<{ id: string; keyword: string | null; bucket: string | null }>(page('the rival searches', () =>
    client.from('keyword_performance').select('id, keyword, bucket').eq('client_id', clientId).eq('bucket', 'competitor').order('id')))
  const terms = rivalSearchTerms(runTerms, configured)
  const spellings = overlapSpellings(runTerms, configured)
  if (terms.size === 0 || spellings.length === 0) return { terms, videos: new Set(), pages }
  const literal = pgTextArray(spellings)
  const now = await selectAll<{ id: string; source_keywords: string[] | null }>(page('the videos our rival searches found', () =>
    client.from('videos').select('id, source_keywords').eq('client_id', clientId).eq('analyzed_lane', 'full')
      .overlaps('source_keywords', literal).order('id')))
  const first = await selectAll<{ video_id: string; first_terms: string[] | null }>(page('the videos our rival searches found first', () =>
    client.from('video_provenance').select('video_id, first_terms').eq('client_id', clientId)
      .overlaps('first_terms', literal).order('video_id'))).catch((error: unknown) => {
    if (missing(error, 'video_provenance')) return []
    throw error
  })
  const videos = rivalFoundOf([
    ...now.map((r) => ({ id: String(r.id), terms: r.source_keywords })),
    ...first.map((r) => ({ id: String(r.video_id), terms: r.first_terms })),
  ], terms)
  return { terms, videos, pages }
}
