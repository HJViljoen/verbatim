import { createAdminClient, selectAll, isMissingColumnError } from '../supabase-admin'
import { chunk, UUID_IN_CHUNK } from '../chunk'
import { THEME_MATCH_THRESHOLD, REGISTRY_DORMANT_RUNS, themeRegistryEnabled, transcriptsEnabled } from '../config'
import { audienceFold } from '../rivals'
import { embedTexts, cosine } from './cluster'
import { passAPromptVersion } from './pass-a'
import { matchThemes, dormantIds, matchTally, themedRunWindow, type MatchArm, type MatchKind, type RegistryEntry } from './theme-registry'
import type { AggregatedTheme } from './types'

// Theme persistence + mini theme-matching (Redesign Spec 2026-07-03 §8).
// Persists Step A2's clustered themes — with Pass B labels, the single-source
// tier, and a first_seen flag — to the `themes` table, replaced per (client,
// run). first_seen comes from embedding-matching this run's label+description
// against the PREVIOUS run's stored theme embeddings: unmatched = a new theme
// ("New" badges + the weekly-email delta). Deliberately NOT full genealogy —
// one boolean, computed once, no persistent theme identity across runs.

export interface PersistThemesResult {
  inserted: number
  firstSeen: number
  /** Registry match tally when THEME_REGISTRY is on — the run log's read on how
   *  stable identity actually was this week. Absent when the flag is off. */
  registry?: Record<MatchKind, number> & { entries: number; dormant: number }
  /** The registry block's failure message, when it failed. Absent when the
   *  registry is off or it did its work.
   *
   *  The block still degrades rather than failing the run (see the catch
   *  below), but it no longer degrades in silence: the whole
   *  `theme_observations` write lives inside that catch, so a run could close
   *  'completed' having written zero observations — a lost week of the trend
   *  series that reads to a client as "nothing changed". The caller turns this
   *  into a counted run error, which is what makes the run 'partial' and puts
   *  the reason in the partial-run alert. */
  registryFailed?: string
  /** False on the client's first themed run — every theme is trivially "new",
   *  so pages should suppress the badge (detectable: no earlier themed run). */
  hadPreviousRun: boolean
}

/** Read a run's persisted themes back into the in-memory shape Pass C/D
 *  consume. Lets the synthesis half run in its own Inngest step, decoupled
 *  from Step A2/Pass B via the DB. sampleDescriptions aren't persisted (they
 *  only feed Pass B, which has already run by the time rows exist).
 *
 *  `video_evidence_count` in this select list — and in the Voice page's
 *  (lib/pages/voice.ts) — is a HARD PRECONDITION, not a seatbelted one: a
 *  select that names a missing column raises 42703 and there is nothing
 *  sensible to retry without breaking the caller's row shape. The write below
 *  survives a deploy that lands before 20260912090000_theme_video_evidence.sql;
 *  the reads do not. Apply that migration before deploying. */
export async function loadThemes(clientId: string, runId: string): Promise<AggregatedTheme[]> {
  const admin = createAdminClient()
  const rows = await selectAll<{
    label: string; description: string | null; bucket: string; category: string
    member_themes: string[]; supporting_insight_ids: string[]; supporting_video_ids: string[]
    evidence_count: number; video_evidence_count: number | null; strength_score: number | null
    rank_score: number | null; mean_strength: number | null
    dominant_emotion: string | null; dominant_sentiment_impact: string | null; single_source: boolean
  }>(() =>
    admin
      .from('themes')
      .select('label, description, bucket, category, member_themes, supporting_insight_ids, supporting_video_ids, evidence_count, video_evidence_count, strength_score, rank_score, mean_strength, dominant_emotion, dominant_sentiment_impact, single_source')
      .eq('client_id', clientId).eq('run_id', runId)
      // Most salient first: this order IS Pass C/D's only cue to what matters.
      // nullsFirst false keeps pre-2026-08-18 rows (no rank) at the back rather
      // than at the front.
      .order('rank_score', { ascending: false, nullsFirst: false })
      .order('strength_score', { ascending: false })
      .order('id', { ascending: true }),
  )
  return rows.map((r) => ({
    bucket: r.bucket,
    category: r.category,
    theme: r.member_themes[0] ?? r.label,
    memberThemes: r.member_themes,
    supportingVideoIds: r.supporting_video_ids,
    supportingInsightIds: r.supporting_insight_ids,
    evidenceCount: r.evidence_count,
    // Null on a run aggregated before WP7a — read as "nothing on camera"
    // rather than as unknown, which is what every consumer of this shape
    // already assumed and what the pre-WP7a rank_score was computed from.
    videoEvidenceCount: r.video_evidence_count ?? 0,
    strengthScore: r.strength_score ?? 0,
    meanStrength: r.mean_strength ?? r.strength_score ?? 0,
    rankScore: r.rank_score ?? 0,
    dominantEmotion: r.dominant_emotion ?? 'neutral',
    dominantSentimentImpact: r.dominant_sentiment_impact ?? 'neutral',
    singleSource: r.single_source,
    sampleDescriptions: [],
    label: r.label,
    description: r.description ?? undefined,
  }))
}

/** Text embedded for cross-run matching — the client-facing identity of the theme. */
function matchText(t: AggregatedTheme): string {
  return `${t.label ?? t.theme}. ${t.description ?? ''}`.trim()
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** A registry entry as persistThemes reads it: the matcher's shape plus the
 *  bookkeeping only the writer needs. */
type RegistryRow = RegistryEntry & {
  last_seen_run_id: string | null
  last_seen_at: string | null
  first_seen_run_id: string | null
  observation_count: number | null
}

/** Theme rows per INSERT statement. See insertThemesChunked: an embedding makes
 *  each row ~14KB, so the body — not the row count — is what times out. */
export const THEMES_INSERT_CHUNK = 100

/**
 * Insert theme rows THEMES_INSERT_CHUNK at a time, stopping at the first error.
 *
 * One statement carrying every theme scaled with the run and eventually stopped
 * fitting: 757 themes on run d346b0f7 (2026-09-13) made a ~10MB request body
 * that Postgres spent 13.4s on before killing it — 57014 `canceling statement
 * due to statement timeout`. The Inngest retry happened to land it (all 757 rows
 * share one created_at), so a run that should have been 'partial' closed
 * 'completed' on a coin flip, and the next client with more themes loses them.
 *
 * 100 is the repo's chunk size (chunkedIn, Step A2). Stopping at the first error
 * rather than pressing on is safe: persistThemes deletes the run's themes before
 * inserting, so a step retry starts from empty and no chunk is written twice.
 * Takes the insert as a callback so the chunking is testable without a database.
 */
export async function insertThemesChunked<E>(
  // PromiseLike, not Promise: a PostgREST builder is thenable but not a Promise.
  insert: (part: Record<string, unknown>[]) => PromiseLike<{ error: E | null }>,
  rows: Record<string, unknown>[],
): Promise<E | null> {
  for (const part of chunk(rows, THEMES_INSERT_CHUNK)) {
    const { error } = await insert(part)
    if (error) return error
  }
  return null
}

/**
 * Mark registry entries dormant UUID_IN_CHUNK ids at a time, stopping at the
 * first error.
 *
 * One `.in('id', stale)` carrying every stale id put the whole list in the
 * query string. Run e80e9347 (Sealand, 2026-09-24) had 2,204 active entries,
 * 825 of them unseen that run, and PostgREST's URL cap is measured between 500
 * and 700 uuids (lib/chunk.ts) — so the update came back a bare "Bad Request",
 * the registry step degraded and the run closed 'partial'. Setting a constant
 * status is idempotent, so a retry that re-marks an earlier chunk is harmless.
 * Takes the update as a callback so the chunking is testable without a database.
 */
export async function markDormantChunked<E>(
  update: (part: string[]) => PromiseLike<{ error: E | null }>,
  ids: readonly string[],
): Promise<E | null> {
  for (const part of chunk(ids, UUID_IN_CHUNK)) {
    const { error } = await update(part)
    if (error) return error
  }
  return null
}

/**
 * The share of a theme's members this run re-analysed.
 *
 * Videos, not insight rows: `videos.analyzed_run_id` is the pointer the plan
 * step sets, the theme's own `supportingVideoIds` is the distinct set behind
 * it, and no extra read is needed to weight by insight. Null for a theme with
 * no videos at all — no denominator, so no share, and a 0 there would read as
 * "nothing was re-analysed", which is a different claim.
 *
 * It has to be computed at persist time: `prune-stale-analysis` runs after
 * close-run and the NEXT run's pointer overwrites this one, so neither half of
 * the fraction survives to be derived later.
 */
export function rereadShare(videoIds: readonly string[], reRead: ReadonlySet<string>): number | null {
  const unique = [...new Set(videoIds)]
  if (unique.length === 0) return null
  return unique.filter((id) => reRead.has(id)).length / unique.length
}

/**
 * The match a theme's observation records for this run: the one the FIRST
 * attempt made, where there is one.
 *
 * A retried persist-themes replays the whole registry block, and by then the
 * entries the first attempt created hold this run's membership — so they score
 * 1.0, and `upsert(onConflict: 'theme_id,run_id')` overwrites `new` with
 * `exact`. It has already happened twice in production: Össur's d346b0f7 stores
 * 757 `exact` observations while 303 of its registry entries were first seen in
 * that very run, and Sealand's cb0d97b2 stores 914 `exact` against 644.
 * `themes.first_seen` was right both times, because it is derived from the
 * entry's own `first_seen_run_id`; only the observation lied.
 */
export function firstMatch(
  prior: { match_kind: MatchKind; match_score: number | null; match_arm?: MatchArm | null } | undefined,
  fresh: { kind: MatchKind; score: number; arm?: MatchArm },
): { match_kind: MatchKind; match_score: number | null; match_arm: MatchArm | null } {
  // The arm travels with the kind, not beside it: they are one answer, and a
  // row carrying the first attempt's kind with the replay's arm would be worse
  // than either alone.
  return prior
    ? { match_kind: prior.match_kind, match_score: prior.match_score, match_arm: prior.match_arm ?? null }
    : { match_kind: fresh.kind, match_score: fresh.score, match_arm: fresh.arm ?? null }
}

export async function persistThemes(
  clientId: string,
  runId: string,
  themes: AggregatedTheme[],
  opts?: { themeRegistry?: boolean; promptVersion?: string },
): Promise<PersistThemesResult> {
  const admin = createAdminClient()

  // Previous themed run = the most recent themes rows for another run.
  const { data: prevRun } = await admin
    .from('themes')
    .select('run_id, created_at')
    .eq('client_id', clientId)
    .neq('run_id', runId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let prevEmbeddings: number[][] = []
  if (prevRun) {
    const prevRows = await selectAll<{ embedding: number[] | null }>(() =>
      admin
        .from('themes')
        .select('embedding')
        .eq('client_id', clientId)
        .eq('run_id', prevRun.run_id)
        .order('id', { ascending: true }),
    )
    prevEmbeddings = prevRows.map((r) => r.embedding).filter((e): e is number[] => Array.isArray(e) && e.length > 0)
  }

  const embeddings = await embedTexts(themes.map(matchText))
  const firstSeenFlags = embeddings.map((vec) => {
    if (prevEmbeddings.length === 0) return true
    return !prevEmbeddings.some((prev) => cosine(vec, prev) >= THEME_MATCH_THRESHOLD)
  })

  // ---- theme identity (shape B-lite) --------------------------------------
  // Match this run's themes to the client's persistent registry on MEMBERSHIP,
  // not on the label: with Pass A incremental, an unchanged theme carries an
  // identical supporting_insight_ids set, while its label churns ~88% of the
  // time. Off → registryIds stays empty and first_seen keeps the old
  // label-embedding meaning, byte for byte.
  // The run's frozen snapshot when the pipeline supplies one. persist-themes is
  // a DIFFERENT step from open-run, so reading the env here is exactly the split
  // the snapshot exists to prevent, and it would make pipeline_runs.flags a
  // false record of what the run actually did. Scripts pass nothing and keep
  // the live read.
  const registryOn = opts?.themeRegistry ?? themeRegistryEnabled()
  const registryIds: (string | null)[] = themes.map(() => null)
  const registryKinds: MatchKind[] = themes.map(() => 'new')
  const registryScores: number[] = themes.map(() => 0)
  const registryArms: (MatchArm | undefined)[] = themes.map(() => undefined)
  const registryFirstSeen: boolean[] = themes.map(() => false)
  let registrySummary: PersistThemesResult['registry']
  // Seeding = the client has no registry yet. Every theme is trivially "new",
  // which is TRUE of the data and useless to a reader — so on the seed run the
  // displayed/emailed "new" keeps its old meaning and the registry just fills
  // up quietly. Without this, the first flag-on run would badge all ~537 Voice
  // cards and email "122 new themes" on a week where nothing actually changed.
  let seeding = false
  // The failure MESSAGE, not a boolean: the caller reports it, and "the
  // registry was skipped" with no reason is the console line this replaces.
  let registryFailed: string | null = null

  if (registryOn) try {
    // Is the video key in this database yet? M2 is applied by hand, so a deploy
    // can land before it — and without this probe every run would close
    // 'partial' until someone applied it, because the registry block's catch
    // would swallow a 42703 on member_video_ids as a registry failure. One
    // cheap query governs the three writes below; the columns move together
    // (one migration) so one answer covers them all.
    const probe = await admin.from('theme_registry')
      .select('member_video_ids').eq('client_id', clientId).limit(1)
    const videoKey = !(probe.error && isMissingColumnError(probe.error, 'member_video_ids'))
    if (!videoKey) {
      console.warn('[theme-registry] theme_registry.member_video_ids does not exist — apply supabase/migrations/20260918091000_theme_key.sql. Matching on insight row ids alone until it lands, which is what every run did before 2026-09-18.')
    } else if (probe.error) {
      throw new Error(`probe theme_registry: ${probe.error.message}`)
    }

    // Two spelled-out selects rather than one built string: the client types
    // the select list, and a column list it cannot read as a literal comes back
    // as an error type. Named columns either way (never select('*')).
    const entries = videoKey
      ? await selectAll<RegistryRow>(() =>
        admin.from('theme_registry')
          .select('id, bucket, member_insight_ids, member_video_ids, embedding, status, canonical_label, last_seen_run_id, last_seen_at, first_seen_run_id, observation_count')
          .eq('client_id', clientId).order('id', { ascending: true }),
      )
      : await selectAll<RegistryRow>(() =>
        admin.from('theme_registry')
          .select('id, bucket, member_insight_ids, embedding, status, canonical_label, last_seen_run_id, last_seen_at, first_seen_run_id, observation_count')
          .eq('client_id', clientId).order('id', { ascending: true }),
      )
    seeding = entries.length === 0
    // A retried step replays this whole block. Anything already written for THIS
    // run must not be counted twice or re-interpreted: entries created by the
    // first attempt now hold this run's membership, so they would match `exact`
    // and silently turn "new" into "unchanged".
    // `match_arm` is one of M2's columns, so the select is spelled out twice for
    // the same reason the registry's is — naming it before the migration lands
    // raises 42703 and the catch below would read that as a registry failure.
    type PriorObs = { theme_id: string; match_kind: MatchKind; match_score: number | null; match_arm?: MatchArm | null }
    const priorObs = videoKey
      ? await selectAll<PriorObs>(() =>
        admin.from('theme_observations').select('theme_id, match_kind, match_score, match_arm')
          .eq('client_id', clientId).eq('run_id', runId).order('theme_id', { ascending: true }),
      )
      : await selectAll<PriorObs>(() =>
        admin.from('theme_observations').select('theme_id, match_kind, match_score')
          .eq('client_id', clientId).eq('run_id', runId).order('theme_id', { ascending: true }),
      )
    const alreadyObserved = new Map(priorObs.map((o) => [o.theme_id, o]))

    // What this run re-analysed, which is the numerator of every observation's
    // reread_share. Read here rather than derived later: prune-stale-analysis
    // runs after close-run and moves the denominator, and videos.analyzed_run_id
    // is overwritten by the next run that re-reads the video. One narrow query —
    // the ids this run's own Pass A pointed at, 508 rows on the largest run in
    // production — not the whole videos table.
    const reRead = new Set((await selectAll<{ id: string }>(() =>
      admin.from('videos').select('id').eq('client_id', clientId).eq('analyzed_run_id', runId)
        .order('id', { ascending: true }),
    )).map((v) => v.id))
    const promptVersion = opts?.promptVersion ?? passAPromptVersion(transcriptsEnabled())

    const results = matchThemes(
      themes.map((t, i) => ({
        key: String(i),
        bucket: t.bucket,
        memberInsightIds: t.supportingInsightIds,
        memberVideoIds: t.supportingVideoIds,
        label: t.label ?? t.theme,
        embedding: embeddings[i],
      })),
      entries,
      // The fold is injected rather than imported by the matcher, which stays
      // pure. It lets an exact title carry an identity across two spellings of
      // one rival — and nothing else cross a bucket.
      { cosine, bucketKey: audienceFold },
    )
    const nowIso = new Date().toISOString()
    const updates: Record<string, unknown>[] = []
    for (const r of results) {
      const i = Number(r.key)
      const t = themes[i]
      const label = t.label ?? t.theme
      if (r.themeId) {
        // Refresh the entry to this observation: the label is deliberately the
        // LATEST one (display stays fresh, the id carries continuity).
        //
        // `bucket` is written unconditionally, which since 2026-09-18 can MOVE
        // an entry: when the title arm carries an identity across two spellings
        // of one rival, the entry lands under the new spelling with nothing
        // recording that it moved. Decision I reserves the theme_registry.bucket
        // re-stamp to the Settings rename, which writes the competitors row and
        // logs the break. Inert today — verified read-only that Össur has 3
        // distinct buckets and Sealand 6, no two of which fold together under
        // audienceFold — and harmless for the month series either way, because
        // month_theme_readings derives `audience` from videos.is_client /
        // competitor_name rather than from this column. It becomes live the
        // moment WP16's rename path exists, and belongs on that checklist.
        const prior = entries.find((e) => e.id === r.themeId)
        updates.push({
          id: r.themeId,
          client_id: clientId,
          bucket: t.bucket,
          // observation_count only advances when this run has not already been
          // counted for that entry — a replayed step is a no-op, not a +1.
          observation_count: (prior?.observation_count ?? 0) + (alreadyObserved.has(r.themeId) ? 0 : 1),
          canonical_label: label,
          description: t.description ?? null,
          member_insight_ids: t.supportingInsightIds,
          ...(videoKey ? { member_video_ids: t.supportingVideoIds } : {}),
          member_slugs: t.memberThemes,
          embedding: embeddings[i].map(round6),
          status: 'active',
          last_seen_run_id: runId,
          last_seen_at: nowIso,
        })
        registryIds[i] = r.themeId
        // "New" is derived from the entry's own first_seen_run_id, so a retry
        // that re-matches an entry it created a moment ago still reads as new.
        registryFirstSeen[i] = prior?.first_seen_run_id === runId
      } else {
        const { data, error } = await admin.from('theme_registry').insert({
          client_id: clientId,
          bucket: t.bucket,
          canonical_label: label,
          description: t.description ?? null,
          member_insight_ids: t.supportingInsightIds,
          ...(videoKey ? { member_video_ids: t.supportingVideoIds } : {}),
          member_slugs: t.memberThemes,
          embedding: embeddings[i].map(round6),
          status: 'active',
          first_seen_run_id: runId,
          last_seen_run_id: runId,
          last_seen_at: nowIso,
          observation_count: 1,
          ...(r.splitFrom ? { parent_theme_id: r.splitFrom } : {}),
        }).select('id').single()
        if (error || !data) throw new Error(`insert theme_registry: ${error?.message ?? 'no row'}`)
        registryIds[i] = data.id as string
        registryFirstSeen[i] = true
      }
      registryKinds[i] = r.kind
      registryScores[i] = r.score
      registryArms[i] = r.arm
    }
    // One round trip per 200 matched entries instead of ~540 sequential updates.
    for (const part of chunk(updates, 200)) {
      const { error } = await admin.from('theme_registry').upsert(part, { onConflict: 'id' })
      if (error) throw new Error(`update theme_registry: ${error.message}`)
    }

    // One observation per (theme, run). Upsert so a step retry is idempotent.
    if (themes.length) {
      const obs = themes.map((t, i) => {
        // A replayed step may not rewrite how this theme was first matched —
        // see firstMatch, and the two production runs it names.
        const prior = registryIds[i] ? alreadyObserved.get(registryIds[i] as string) : undefined
        const match = firstMatch(prior, { kind: registryKinds[i], score: registryScores[i], arm: registryArms[i] })
        return {
          theme_id: registryIds[i],
          client_id: clientId,
          run_id: runId,
          evidence_count: t.evidenceCount,
          strength_score: t.strengthScore,
          rank_score: t.rankScore,
          mean_strength: t.meanStrength,
          dominant_emotion: t.dominantEmotion,
          dominant_sentiment_impact: t.dominantSentimentImpact,
          single_source: t.singleSource,
          category: t.category,
          label: t.label ?? t.theme,
          member_insight_ids: t.supportingInsightIds,
          ...(videoKey ? {
            member_video_ids: t.supportingVideoIds,
            prompt_version: promptVersion,
            reread_share: rereadShare(t.supportingVideoIds, reRead),
            // Which reading claimed the identity. Stored beside the kind
            // because after the cutover `exact` means either "the same insight
            // rows" or "the same videos, different insight rows", and the
            // re-read break marker reads match_kind.
            match_arm: match.match_arm,
          } : {}),
          match_kind: match.match_kind,
          match_score: match.match_score,
          merged_from: results.find((r) => Number(r.key) === i)?.mergedFrom ?? [],
          split_from: results.find((r) => Number(r.key) === i)?.splitFrom ?? null,
          run_date: nowIso.slice(0, 10),
        }
      })
      const { error } = await admin.from('theme_observations').upsert(obs, { onConflict: 'theme_id,run_id' })
      if (error) throw new Error(`insert theme_observations: ${error.message}`)
    }

    // Dormancy: unseen across the last REGISTRY_DORMANT_RUNS runs that THEMED.
    // The window used to come from pipeline_runs — the last three closed runs of
    // any kind — while both the migration comment and the JSDoc said "themed
    // runs". Össur's history holds five completed runs with zero themes, and a
    // gather-only "Run now" or a run that dies before persist-themes does the
    // same thing: it consumes a dormancy slot and retires live themes early.
    // The registry answers it off its own last_seen stamps, with no query.
    const ordered = themedRunWindow(entries, runId, REGISTRY_DORMANT_RUNS)
    const stale = dormantIds(
      entries.map((e) => ({ id: e.id, last_seen_run_id: registryIds.includes(e.id) ? runId : e.last_seen_run_id, status: e.status })),
      ordered,
      REGISTRY_DORMANT_RUNS,
    )
    if (stale.length) {
      // Chunked — see markDormantChunked for the "Bad Request" this fixes.
      const error = await markDormantChunked((part) => admin.from('theme_registry').update({ status: 'dormant' }).in('id', part), stale)
      if (error) throw new Error(`mark dormant: ${error.message}`)
    }
    registrySummary = { ...matchTally(results), entries: entries.length + results.filter((r) => !r.themeId).length, dormant: stale.length }
  } catch (e) {
    // The registry is a side layer: it makes "new" honest and gives Trends a
    // stable key, but a client's weekly report must never die because identity
    // bookkeeping failed. Degrade to the pre-registry behaviour — first_seen
    // falls back to the label-embedding rule, themes rows carry no registry_id,
    // and the next run picks the registry up again (matching is stateless, so
    // nothing half-written misleads it: entries keep their old membership until
    // a run completes the update).
    // Returned to the caller, not merely logged: the pipeline counts it as a
    // run error, so the run closes 'partial' and the alert names the step. A
    // console line was the whole record before, and it ages out of the host's
    // log retention within the hour.
    registryFailed = e instanceof Error ? e.message : String(e)
    console.error(`[theme-registry] skipped: ${registryFailed}`)
    for (let i = 0; i < registryIds.length; i++) registryIds[i] = null
    registrySummary = undefined
  }

  // Replace per (client, run) — invariant 6.
  const { error: delErr } = await admin.from('themes').delete().eq('client_id', clientId).eq('run_id', runId)
  if (delErr) throw new Error(`clear themes: ${delErr.message}`)

  if (themes.length) {
    const rows = themes.map((t, i) => ({
      client_id: clientId,
      run_id: runId,
      bucket: t.bucket,
      category: t.category,
      label: t.label ?? t.theme,
      description: t.description ?? null,
      member_themes: t.memberThemes,
      supporting_insight_ids: t.supportingInsightIds,
      supporting_video_ids: t.supportingVideoIds,
      evidence_count: t.evidenceCount,
      // `?? 0`, though the field is declared required: `themes:{bucket}` is a
      // MEMOISED Inngest step whose payload is AggregatedTheme[], so a run that
      // completed its bucket steps BEFORE this deploy and resumes after it
      // replays untyped JSON with no videoEvidenceCount. JSON.stringify drops
      // undefined, and PostgREST rejects a bulk insert whose objects have
      // differing keys (PGRST102) — the whole persist step would fail. 0 is
      // also the honest value: that theme's rank_score was computed unweighted.
      video_evidence_count: t.videoEvidenceCount ?? 0,
      strength_score: t.strengthScore,
      rank_score: t.rankScore,
      mean_strength: t.meanStrength,
      dominant_emotion: t.dominantEmotion,
      dominant_sentiment_impact: t.dominantSentimentImpact,
      single_source: t.singleSource,
      // With the registry on, "new" means a theme with no prior identity —
      // not "the labeller chose different words", which is what the
      // label-embedding rule actually measured (48 of 58 false positives).
      first_seen: registryOn && !seeding && !registryFailed ? registryFirstSeen[i] : firstSeenFlags[i],
      embedding: embeddings[i].map(round6),
      ...(registryOn && !registryFailed ? { registry_id: registryIds[i] } : {}),
    }))
    // Chunked, not one statement — see insertThemesChunked for the 57014 this
    // fixes. A theme row is dominated by its embedding (1536 floats at 6dp).
    const insertChunked = (toInsert: Record<string, unknown>[]) =>
      insertThemesChunked((part) => admin.from('themes').insert(part), toInsert)
    const error = await insertChunked(rows)
    // Same seatbelt Pass A's bookkeeping carries: a deploy can land before its
    // migration, and this step is NOT .catch()-isolated — it would take the run
    // down after Pass A, Pass B and clustering are already paid for, the most
    // expensive possible place to fail. Losing the column costs the on-camera
    // weighting for one run; losing the run costs the run. A missing column
    // fails the FIRST chunk, so nothing is in yet and the whole set re-inserts.
    if (error && isMissingColumnError(error, 'video_evidence_count')) {
      console.warn('[themes] themes.video_evidence_count does not exist — apply supabase/migrations/20260912090000_theme_video_evidence.sql. Persisting without it; on-camera counts read as none until it lands.')
      const retryErr = await insertChunked(rows.map(({ video_evidence_count: _dropped, ...rest }) => rest))
      if (retryErr) throw new Error(`persist themes: ${retryErr.message}`)
    } else if (error) throw new Error(`persist themes: ${error.message}`)
  }

  return {
    inserted: themes.length,
    firstSeen: registryOn && !seeding && !registryFailed ? registryFirstSeen.filter(Boolean).length : firstSeenFlags.filter(Boolean).length,
    hadPreviousRun: prevEmbeddings.length > 0,
    ...(registrySummary ? { registry: registrySummary } : {}),
    ...(registryFailed ? { registryFailed } : {}),
  }
}
