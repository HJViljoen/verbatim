import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk } from '../chunk'
import { splitTerms } from '../provenance/reconstruct'
import { selectAll } from '../supabase-admin'

// What a gather's searches surfaced, recorded at gather time (market-first
// plan WP3.4, deploy 4). Two append-only records, both written by gatePlatform
// right after its videos upsert:
//
//   video_provenance (MF1): how each FRESH kept video was first found, exact:
//     the terms and communities that surfaced it in the run that first stored
//     it. `videos.source_keywords` is overwritten by every run that resurfaces
//     a video (GC F26), which is why this was reconstructed until now
//     (lib/provenance/reconstruct.ts). Insert-if-absent: a held row is never
//     rewritten (the table refuses UPDATE).
//   video_surfacings (MF3): every stored video this run surfaced, fresh or
//     resurfaced, with the terms and communities that surfaced it this run.
//     "Outside" a month pair is then exact: not surfaced in the month by any
//     unchanged search.
//
// Both are records kept beside the gather: a failure is reported on the
// gather's errors channel and never loses the gather, and a table not there yet
// (MF1 or MF3 not applied) is a quiet no-op, not an error.

export interface SurfacedVideo {
  /** The platform's own id (videos.video_id). */
  video_id: string
  /** Every term this run surfaced it under (gatePlatform's merge). */
  source_keywords?: string[] | null
}

export interface ProvenanceInsert {
  client_id: string
  video_id: string
  first_run_id: string | null
  first_stored_at: string
  first_terms: string[]
  first_subreddits: string[]
  method: 'exact'
  evidence: 'gather'
}

export interface SurfacingInsert {
  client_id: string
  video_id: string
  run_id: string
  terms: string[]
  subreddits: string[]
}

/** The `exact` provenance rows of a run's fresh kept videos. `idOf` maps the
 *  platform id to videos.id; a video with no stored id gets no row. PURE. */
export function provenanceRows(args: {
  clientId: string
  runId: string | null
  storedAt: string
  fresh: readonly SurfacedVideo[]
  idOf: ReadonlyMap<string, string>
}): ProvenanceInsert[] {
  const out: ProvenanceInsert[] = []
  for (const v of args.fresh) {
    const id = args.idOf.get(v.video_id)
    if (!id) continue
    const split = splitTerms(v.source_keywords ?? [])
    out.push({
      client_id: args.clientId, video_id: id, first_run_id: args.runId, first_stored_at: args.storedAt,
      first_terms: split.terms, first_subreddits: split.subreddits, method: 'exact', evidence: 'gather',
    })
  }
  return out
}

/** One surfacing row per stored video this run surfaced. PURE. */
export function surfacingRows(args: {
  clientId: string
  runId: string
  surfaced: readonly SurfacedVideo[]
  idOf: ReadonlyMap<string, string>
}): SurfacingInsert[] {
  const seen = new Set<string>()
  const out: SurfacingInsert[] = []
  for (const v of args.surfaced) {
    const id = args.idOf.get(v.video_id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const split = splitTerms(v.source_keywords ?? [])
    out.push({ client_id: args.clientId, video_id: id, run_id: args.runId, terms: split.terms, subreddits: split.subreddits })
  }
  return out
}

const isMissing = (error: { code?: string; message?: string } | null | undefined, table: string): boolean =>
  !!error && (error.message ?? '').includes(table) && /schema cache|does not exist|Could not find/i.test(error.message ?? '')

export interface GatherRecordResult {
  provenance: number | 'not_applied'
  surfacings: number | 'not_applied'
  errors: string[]
}

/**
 * Write both records for one platform's gather. `fresh` are the kept fresh
 * videos, `surfaced` every video upserted this run (fresh and resurfaced).
 * The ids are read back by platform id (the upsert returns none), 100 at a
 * time, as gatePlatform's own known-video read is.
 */
export async function recordGatherSurfacings(admin: SupabaseClient, args: {
  clientId: string
  runId: string | null
  platform: string
  storedAt: string
  fresh: readonly SurfacedVideo[]
  surfaced: readonly SurfacedVideo[]
}): Promise<GatherRecordResult> {
  const result: GatherRecordResult = { provenance: 0, surfacings: 0, errors: [] }
  const ids = [...new Set(args.surfaced.map((v) => v.video_id))]
  if (ids.length === 0) return result
  const idOf = new Map<string, string>()
  for (const part of chunk(ids, 100)) {
    const rows = await selectAll<{ id: string; video_id: string }>(() =>
      admin.from('videos').select('id, video_id').eq('client_id', args.clientId).eq('platform', args.platform).in('video_id', part).order('id'))
    for (const r of rows) idOf.set(r.video_id, r.id)
  }

  const prov = provenanceRows({ clientId: args.clientId, runId: args.runId, storedAt: args.storedAt, fresh: args.fresh, idOf })
  for (const part of chunk(prov, 500)) {
    const { error } = await admin.from('video_provenance').upsert(part, { onConflict: 'client_id,video_id', ignoreDuplicates: true })
    if (isMissing(error, 'video_provenance')) { result.provenance = 'not_applied'; break }
    if (error) { result.errors.push(`video_provenance not recorded: ${error.message}`); break }
    result.provenance = (result.provenance as number) + part.length
  }

  if (!args.runId) return result
  const surf = surfacingRows({ clientId: args.clientId, runId: args.runId, surfaced: args.surfaced, idOf })
  for (const part of chunk(surf, 500)) {
    const { error } = await admin.from('video_surfacings').upsert(part, { onConflict: 'client_id,video_id,run_id', ignoreDuplicates: true })
    if (isMissing(error, 'video_surfacings')) { result.surfacings = 'not_applied'; break }
    if (error) { result.errors.push(`video_surfacings not recorded: ${error.message}`); break }
    result.surfacings = (result.surfacings as number) + part.length
  }
  return result
}
