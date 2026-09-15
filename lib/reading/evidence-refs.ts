import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAll } from '../supabase-admin'
import { chunk } from '../chunk'
import { chunkByAudienceMonth, mergeMonthRows, monthStartOf, windowOf, type MergeResult } from './monthly'
import type {
  Audience, FreezeColumns, MonthOrigin, MonthStatus, PlatformMix, StoredFreeze,
} from './types'

// The evidence-id freeze — design item 31a, decision H (Phase 1 WP6,
// 2026-09-18).
//
// WHAT IT IS FOR. A frozen month says "objections were 28 of 205 videos in
// August". The question a reader asks next is "which ones", and today nothing
// can answer it: the citations that produced the number are re-derived on every
// Pass A re-read and hard-deleted by the weekly prune. Measured on production
// 2026-09-15, 20.2–44.4% of an older run's member references no longer resolve,
// and 32 of 1,217 comment refs in shipped snapshots are already dead. So the
// ids are written down beside the count, at the same moment, by the same step.
//
// WHAT IT PROMISES, AND WHAT IT DOES NOT.
//
//   video ids   — durable. A video the platform stopped serving is TOMBSTONED,
//                 never deleted, because videos(id) cascades into the whole
//                 analysis. 50 tombstoned on production, 0 deleted. A point
//                 opens to its videos years later. The one thing that empties
//                 this is scripts/regate-corpus.ts --apply, which deletes video
//                 rows outright; its own header calls it "the most destructive
//                 operation an operator can run", and it is the single
//                 documented way a frozen point becomes unopenable.
//   comment ids — perishable, and a reader is told so. Retention deletes a
//                 comment; the prune deletes the evidence row that made it
//                 quotable. `resolveRefs` counts what is left ON READ and says
//                 "N of M still quotable". A stored resolvability flag would be
//                 wrong within a week, which is why there is not one.
//   the link    — not frozen, because it cannot be. `comments` carries no URL,
//                 and a link assembled from the platform's own comment id
//                 points at the post whose disappearance is WHY retention
//                 deleted our row. The video url survives a tombstone and is
//                 where "open this point" goes.
//
// WHY THE FREEZE IS LATE, AND WHY THE ROW SAYS SO. A filling month's row is
// replaced wholesale on every run and only the last write — taken 30 days after
// the month ends — is frozen. August 2026 freezes on about 4 October, by which
// time the nightly YouTube sweep (a 25-day cycle) has been over every one of
// its 864 cited YouTube comments at least once. So the ids that survive are
// "what was still citable 34 days later", not "the evidence the reading rested
// on". The count frozen beside them is computed in the same pass, so the row is
// internally consistent — and `read_at` and `frozen_at` are on the row, which
// is how a reader recovers the gap rather than being told a single reading
// date. Nothing here pretends otherwise.
//
// ONLY OPEN MONTHS GET IDS FROM THE PIPELINE, WHICH IS ALMOST NONE OF THEM.
// `monthsToRefresh` returns the stored FILLING months plus the walk-back of
// still-open ones and never a closed one, so the freeze-months step will only
// ever call this for the current month and the one before it. Measured on
// production 2026-09-15: 201 of 214 audience-months are already frozen
// (2020-10 → 2026-07); 13 are filling. So 94% of the series — the whole
// historical part, which is exactly the part a frozen-month reader most wants
// to open — gets no ids at all from a pipeline run, for ever.
//
// The one thing that fills them is the operator script, per tenant:
//
//     node --env-file=.env.local --import tsx scripts/monthly-reading.ts \
//       --client <uuid> --run <uuid> --write
//
// which reaches a closed month through the INSERT guard's decision-K arm: a
// brand-new row for a closed audience-month is accepted while the target table
// holds no earlier-transaction row for it, because that is the first back-read
// of a table that did not exist when the month closed. It is accepted ONCE.
// Run it before the WP11/WP12 tile ships, or "which videos was this read on"
// is empty for every month before 2026-08 and cannot be corrected afterwards.
//
// AND WHY IT IS A SEPARATE TABLE. 20260915092000 refused ids on the month
// reading in writing: "a frozen id list would decay into a record of what we
// can no longer show". That is right, and it is an argument about the MONTH
// READING, which must not rot. This table is allowed to rot and says which half
// rots; keeping them apart is how both stay true.

/** The objects a frozen point can be about. `theme` is all WP6 writes; the rest
 *  are the shapes M4 and M5 fill (a subject, a kind, a mood, the audience
 *  itself), and they share this table because "which videos was this read on"
 *  is one question however the rows were grouped. */
export type EvidenceObjectKind = 'theme' | 'subject' | 'kind' | 'mood' | 'audience'

/** One row of `monthly_evidence_refs(p_client, p_run, p_from, p_to)`: the ids
 *  behind one theme's month, in one audience. */
export interface EvidenceRefReading {
  month: string
  audience: Audience
  theme_id: string
  video_ids: string[]
  comment_ids: string[]
  platform_mix: PlatformMix
}

/** The shape the merge and the table work in — object_kind/object_id rather
 *  than theme_id, so one table holds every kind of point. */
export interface EvidenceRefFacts {
  month: string
  audience: Audience
  object_kind: EvidenceObjectKind
  object_id: string
  video_ids: string[]
  comment_ids: string[]
  platform_mix: PlatformMix
}

export type EvidenceRefRow = EvidenceRefFacts & FreezeColumns & { client_id: string }

export const TABLE_EVIDENCE_REFS = 'month_evidence_refs'
export const RPC_EVIDENCE_REFS = 'monthly_evidence_refs'

/** A refs row's identity: the table's primary key, minus the tenant. */
export const evidenceRefKey = (r: { month: string; audience: string; object_kind: string; object_id: string }): string =>
  `${monthStartOf(r.month)}|${r.audience}|${r.object_kind}|${r.object_id}`

/** A theme's reading, as a point about an object. Pure. */
export function themeRefsToFacts(rows: readonly EvidenceRefReading[]): EvidenceRefFacts[] {
  return rows.map((r) => ({
    month: monthStartOf(r.month),
    audience: r.audience,
    object_kind: 'theme' as const,
    object_id: r.theme_id,
    video_ids: [...new Set(r.video_ids ?? [])].sort(),
    comment_ids: [...new Set(r.comment_ids ?? [])].sort(),
    platform_mix: r.platform_mix ?? {},
  }))
}

// ---- What is still there --------------------------------------------------

export interface RefResolution {
  /** Ids frozen. */
  total: number
  /** Ids that still resolve to something a reader can open or read. */
  resolvable: number
}

export interface PointResolution {
  videos: RefResolution
  /** Videos that resolve but whose platform no longer serves them — the row is
   *  there and says which video it was; the post is not. */
  unavailableVideos: number
  comments: RefResolution
}

/**
 * How much of a frozen point is still openable.
 *
 * A COMMENT resolves through `insight_evidence` and not through `comments`,
 * which is the rule the whole read path keeps (lib/quotes.ts
 * fetchQuoteTextsByCommentId says why): insight_evidence is where
 * `redacted = false` lives and it is what an erasure deletes, so reading the
 * words back through it means an erased comment stops resolving everywhere at
 * once. A comment row that survives with no evidence row behind it is counted
 * NOT quotable, which is the honest answer — 32 of the 33 dead refs in shipped
 * snapshots are exactly that case.
 *
 * A VIDEO resolves to its row. A tombstoned video still resolves: the row says
 * which video it was, and that is what "openable to which videos" promised. It
 * is reported separately so a surface can say the post itself is gone.
 */
export async function resolveRefs(
  admin: SupabaseClient,
  ids: { videoIds: readonly string[]; commentIds: readonly string[] },
): Promise<PointResolution> {
  const videoIds = [...new Set(ids.videoIds)]
  const commentIds = [...new Set(ids.commentIds)]
  const videos: { id: string; unavailable_at: string | null }[] = []
  for (const part of chunk(videoIds, 120)) {
    videos.push(...await selectAll<{ id: string; unavailable_at: string | null }>(() =>
      admin.from('videos').select('id, unavailable_at').in('id', part).order('id', { ascending: true }),
    ))
  }
  const quotable = new Set<string>()
  for (const part of chunk(commentIds, 120)) {
    const rows = await selectAll<{ comment_id: string | null; quote: string | null }>(() =>
      admin.from('insight_evidence')
        .select('comment_id, quote')
        .in('comment_id', part)
        .eq('redacted', false)
        .order('id', { ascending: true }),
    )
    for (const r of rows) if (r.comment_id && r.quote) quotable.add(r.comment_id)
  }
  return {
    videos: { total: videoIds.length, resolvable: videos.length },
    unavailableVideos: videos.filter((v) => v.unavailable_at !== null).length,
    comments: { total: commentIds.length, resolvable: quotable.size },
  }
}

/**
 * What a surface says about a frozen point's evidence. Pure, and calibrated:
 * no run, no pass, no score — a count of videos and a count of voices, and the
 * plain word for the case where the words are gone.
 *
 * "Counted, not quotable" is the design's own phrase for the end state, and it
 * is said only when it is true of EVERY comment. A point that has lost some of
 * its voices says how many are left, because "8 of 31" is a fact a reader can
 * weigh and "some" is not.
 */
export function quotableLine(r: PointResolution): string {
  // CONVERSATIONS, not videos. lib/calibration.ts's GLOSSARY pins the word —
  // "one video and the comments it sparked — the unit behind every 'heard in…'
  // and share figure" — and this sentence sits beside exactly those figures.
  // The plan pins only the "8 of 31 voices still quotable" half, so the other
  // half was a free choice, and "videos" is the pipeline's word for it, not
  // the product's.
  const videos = r.videos.resolvable === 1 ? '1 conversation' : `${r.videos.resolvable} conversations`
  const gone = r.unavailableVideos > 0
    ? `${r.unavailableVideos === r.videos.resolvable ? 'no longer' : `${r.unavailableVideos} no longer`} on the platform`
    : null
  const head = gone ? `${videos} (${gone})` : videos
  if (r.comments.total === 0) return head
  if (r.comments.resolvable === 0) return `${head} · counted, not quotable`
  if (r.comments.resolvable === r.comments.total) {
    return `${head} · ${r.comments.total === 1 ? '1 voice' : `${r.comments.total} voices`}`
  }
  return `${head} · ${r.comments.resolvable} of ${r.comments.total} voices still quotable`
}

// ---- Reading and writing ----------------------------------------------------

/** Is this the error the freeze gets before 20260918095000 is applied? */
export function isMissingEvidenceRefs(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!text.includes(TABLE_EVIDENCE_REFS) && !text.includes(RPC_EVIDENCE_REFS)) return false
  if (code && ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

async function storedEvidenceRefs(
  admin: SupabaseClient, clientId: string, months: readonly string[],
): Promise<StoredFreeze[]> {
  if (months.length === 0) return []
  const rows = await selectAll<{
    month: string; audience: string; object_kind: string; object_id: string
    status: MonthStatus; origin: MonthOrigin; frozen_at: string | null
  }>(() =>
    admin
      .from(TABLE_EVIDENCE_REFS)
      .select('month, audience, object_kind, object_id, status, origin, frozen_at')
      .eq('client_id', clientId)
      .in('month', [...months])
      .order('month', { ascending: true })
      .order('audience', { ascending: true })
      .order('object_kind', { ascending: true })
      .order('object_id', { ascending: true }),
  )
  // `objectId` on StoredFreeze is "what the row is ABOUT" — a registry id, a
  // subject id, a kind, whichever column its table keeps it in. This table's
  // key has FOUR columns, which no MonthTable descriptor can spell, so the
  // composite travels in `key` and `objectId` carries `kind|id` for the delete
  // to aim at. It is the only table here that is not a descriptor.
  return rows.map((r) => ({
    key: evidenceRefKey(r),
    month: monthStartOf(r.month),
    audience: r.audience,
    objectId: `${r.object_kind}|${r.object_id}`,
    status: r.status,
    origin: r.origin,
    frozen_at: r.frozen_at ?? null,
  }))
}

/** One run's ids, month by month. Paged past the 1000-row PostgREST cap on a
 *  unique order, exactly as the count read is. */
export async function readEvidenceRefs(
  admin: SupabaseClient,
  clientId: string,
  runId: string,
  window: { from: string; to: string },
): Promise<EvidenceRefReading[]> {
  return selectAll<EvidenceRefReading>(() =>
    admin.rpc(RPC_EVIDENCE_REFS, { p_client: clientId, p_run: runId, p_from: window.from, p_to: window.to })
      .order('month', { ascending: true })
      .order('audience', { ascending: true })
      .order('theme_id', { ascending: true }),
  )
}

export interface EvidenceRefSummary {
  written: number
  frozen: number
  keptFrozen: number
  deleted: number
  refusedLate: number
  /** Distinct ids written down this visit — what the record actually gained. */
  videoIds: number
  commentIds: number
  /** The table or function is not there yet. Nothing was read or written. */
  missing: boolean
  /**
   * The freeze THREW and its caller swallowed it — the one shot at this
   * visit's ids is spent and the months froze without them.
   *
   * It is a field rather than an absent summary because the two read the same
   * to an operator and mean opposite things: the caller's catch used to return
   * undefined, and the script prints "not read — no clustering to attribute
   * them to (--denominators-only, or no run)" for a falsy summary, so the one
   * run that will ever fill 201 frozen audience-months could fail hard and
   * report itself as a run with no clustering, immediately below a line that
   * had already named the run. Exit code 0.
   */
  failed: string | null
}

export const emptyEvidenceRefSummary = (): EvidenceRefSummary =>
  ({ written: 0, frozen: 0, keptFrozen: 0, deleted: 0, refusedLate: 0, videoIds: 0, commentIds: 0, missing: false, failed: null })

/**
 * Write down which videos and which comments this visit's theme numbers rested
 * on, under the same freeze rules as the numbers themselves.
 *
 * Called from `freezeMonths` between the theme rows and the denominators, and
 * the position is deliberate: the denominator is the commit marker (the INSERT
 * guard reads it), so a refs row for an audience-month has to land BEFORE that
 * month's denominator freezes or the database will refuse it — for ever, since
 * no later visit returns to a closed month.
 *
 * Non-fatal to its caller by design. A record kept alongside the report must
 * not make a clean run read `partial` (the keyword-discovery precedent), and a
 * missing migration is a logged no-op that has read nothing.
 */
export async function freezeEvidenceRefs(
  admin: SupabaseClient,
  opts: {
    clientId: string
    runId: string
    months: readonly string[]
    now: string
    dryRun?: boolean
    clusteringKey?: string | null
    /** `denominatorKey` over the stored frozen denominators — the same list the
     *  theme merge is given, and for the same reason. */
    closedAudienceMonths?: readonly string[]
  },
): Promise<EvidenceRefSummary> {
  const out = emptyEvidenceRefSummary()
  const months = [...new Set(opts.months.map(monthStartOf))].sort()
  const window = windowOf(months)
  if (!window) return out

  let fresh: EvidenceRefFacts[]
  let stored: StoredFreeze[]
  try {
    fresh = themeRefsToFacts(await readEvidenceRefs(admin, opts.clientId, opts.runId, window))
    stored = await storedEvidenceRefs(admin, opts.clientId, months)
  } catch (e) {
    if (isMissingEvidenceRefs(e)) {
      console.log(`[evidence-refs] ${TABLE_EVIDENCE_REFS}/${RPC_EVIDENCE_REFS} do not exist yet — apply supabase/migrations/20260918095000_quote_translations.sql. The months are frozen without their ids; nothing else is affected.`)
      out.missing = true
      return out
    }
    throw e
  }

  const merge: MergeResult<EvidenceRefFacts> = mergeMonthRows({
    months, fresh, stored, keyOf: evidenceRefKey, now: opts.now, runId: opts.runId,
    clusteringKey: opts.clusteringKey,
    closedAudienceMonths: opts.closedAudienceMonths,
  })
  const rows: EvidenceRefRow[] = merge.writes.map((r) => ({ ...r, client_id: opts.clientId }))
  out.written = rows.length
  out.frozen = rows.filter((r) => r.status === 'frozen').length
  out.keptFrozen = merge.keptFrozen
  out.deleted = merge.stale.length
  out.refusedLate = merge.refusedLate.length
  out.videoIds = new Set(rows.flatMap((r) => r.video_ids)).size
  out.commentIds = new Set(rows.flatMap((r) => r.comment_ids)).size
  if (opts.dryRun) return out

  // Batched on audience-month boundaries, never a flat `chunk`: decision K's
  // back-read arm admits a first row into a closed audience-month only while
  // no EARLIER transaction has written one, and every chunk is its own
  // transaction — see `chunkByAudienceMonth`.
  for (const part of chunkByAudienceMonth(rows, 200)) {
    const { error } = await admin.from(TABLE_EVIDENCE_REFS)
      .upsert(part, { onConflict: 'client_id,month,audience,object_kind,object_id' })
    if (error) throw new Error(`${TABLE_EVIDENCE_REFS} upsert: ${(error as { message?: string }).message ?? String(error)}`)
  }
  // Stale FILLING rows only, one key at a time with `status = 'filling'`
  // restated — the month tables' rule, for the month tables' reason: a row that
  // froze between the read and this write survives the race.
  for (const s of merge.stale) {
    const [kind, ...rest] = (s.objectId ?? '').split('|')
    const { error } = await admin.from(TABLE_EVIDENCE_REFS).delete()
      .eq('client_id', opts.clientId)
      .eq('month', s.month)
      .eq('audience', s.audience)
      .eq('object_kind', kind)
      .eq('object_id', rest.join('|'))
      .eq('status', 'filling')
    if (error) throw new Error(`${TABLE_EVIDENCE_REFS} delete: ${(error as { message?: string }).message ?? String(error)}`)
  }
  return out
}
