// Keyword candidate discovery (2026-09-13). The inverse of keyword ROI:
// keyword_performance answers "is this configured term earning its spend",
// this answers "what does the corpus keep handing us that nobody configured".
//
// Source of terms: the classifier's per-video `topics` (Pass A / classify-meta,
// 1-4 lowercase topics a video) and hashtags — `videos.hashtags` where the
// platform gives us one (Instagram + owned), and `#tag` out of the caption
// everywhere else (TikTok and YouTube carry their tags inside the caption).
//
// Every video read here is already gate-kept: a dropped video never reaches
// `videos`, it exists only in `gate_verdicts` (verified against the 2026-09-10
// Sealand run — zero rows in `videos` with a kept=false verdict). So a
// candidate's counts are counts of RELEVANT videos, which is the whole point.
//
// Pure aggregation — no model call, no money. The compute half is a pure
// function (tested in keyword-discovery.test.ts); the pipeline step and the
// backfill script supply the rows and write the results.

import { DISCOVERY_MAX_TERM_CHARS, DISCOVERY_MAX_TERMS, DISCOVERY_MIN_VIDEOS, DISCOVERY_STOP_TERMS } from '../config'
import { dbSafeJson, dbSafeText } from '../db-text'
import { fold } from '../gather/util'
import { selectAll } from '../supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'

/** The videos slice discovery needs (id = uuid PK). */
export interface DiscoveryVideo {
  id: string
  platform: string
  caption: string | null
  hashtags: string[] | null
  topics: string[] | null
  source_keywords: string[] | null
  comments_count: number | null
  is_client: boolean | null
  is_competitor: boolean | null
  source: string | null
}

/** The tracking_configs slice discovery needs. `own_handles` is the jsonb
 *  platform -> handle map, as everywhere else in the repo. */
export interface DiscoveryConfig {
  brand_keywords?: string[] | null
  competitor_names?: string[] | null
  competitor_keywords?: string[] | null
  industry_keywords?: string[] | null
  exclude_terms?: string[] | null
  own_handles?: Record<string, string> | null
}

/** One keyword_candidates row, minus the ids the writer adds. */
export interface KeywordCandidate {
  term: string
  kind: 'topic' | 'hashtag'
  videos: number
  comments: number
  insights: number
  platforms: string[]
  found_by: Record<string, number>
  owned_videos: number
  client_videos: number
  competitor_videos: number
}

/** Shortest term allowed to exclude by SUBSTRING rather than by equality —
 *  applied to whichever side is the NEEDLE, in either direction.
 *
 *  Without a floor, one short exclude_term silently deletes every candidate
 *  containing it, and three characters is not a floor: "ai" would take
 *  "sustainability" and "art" takes "smartphone", "heartfelt" and "cartoon"
 *  just as blindly. Five is the length at which a fragment stops being a
 *  coincidence in ordinary words. Equality still applies at any length, so a
 *  short configured term still covers itself exactly. */
const SUBSTRING_MIN = 5

const STOP = new Set(DISCOVERY_STOP_TERMS.map(fold))

/** Hashtags out of free text. Unicode-aware (`\p{L}\p{N}_`) rather than `\w`,
 *  because the corpus is multi-language — a `#vélo` or `#バッグ` is a real tag
 *  and `\w` would clip it to nothing useful. */
const HASHTAG_IN_TEXT = /#([\p{L}\p{N}_]+)/gu

/** A term and its compacted forms: spaces stripped, then everything that is not
 *  a letter or a digit stripped.
 *
 *  A hashtag can hold neither a space nor punctuation (see HASHTAG_IN_TEXT), so
 *  the configured "upcycled bag" reaches the corpus as #upcycledbag and a
 *  configured "sea-land gear" as #sealandgear. Without these forms the tenant's
 *  own keyword reads as a discovery, every run, at the top of the table.
 *
 *  Empty forms are dropped: "___" compacts to nothing, and an empty needle is
 *  contained in every string. */
function variants(folded: string): string[] {
  const forms = new Set([folded, folded.replace(/\s+/g, ''), folded.replace(/[^\p{L}\p{N}]+/gu, '')])
  forms.delete('')
  return [...forms]
}

/** Every configured term, folded and despaced, split BY SHAPE — which decides
 *  how far a substring match may reach.
 *
 *  `tagged` is the whitespace-free ones, a handle or a hashtag, where matching
 *  runs both ways: "sealandgear" is covered by the configured "#sealandgear"
 *  (the candidate is contained in it) and "cotopaxiofficial" is covered by the
 *  configured "cotopaxi" (the candidate contains it).
 *
 *  `phrases` is the multi-word ones, where only the forward direction is safe.
 *  A candidate containing "upcycledbag" IS that keyword, but the single word
 *  "bag" is a broader term of its own — the discovery this whole step exists to
 *  surface — and running the other direction would delete it for no better
 *  reason than that the configured "upcycled bag" happens to contain it. */
interface Configured {
  tagged: string[]
  phrases: string[]
}

function configuredTerms(config: DiscoveryConfig): Configured {
  const raw = [
    ...(config.brand_keywords ?? []),
    ...(config.competitor_names ?? []),
    ...(config.competitor_keywords ?? []),
    ...(config.industry_keywords ?? []),
    ...(config.exclude_terms ?? []),
    ...Object.values(config.own_handles ?? {}),
  ]
  const tagged = new Set<string>()
  const phrases = new Set<string>()
  for (const term of raw) {
    const folded = fold(term)
    if (!folded) continue
    const into = /\s/.test(folded) ? phrases : tagged
    for (const form of variants(folded)) into.add(form)
  }
  return { tagged: [...tagged], phrases: [...phrases] }
}

/** Is this candidate already covered — by a configured term, a handle, or
 *  platform noise? */
function isCovered(folded: string, configured: Configured): boolean {
  if (!folded) return true
  if (STOP.has(folded)) return true
  // 1-2 character tokens, run-on pseudo-tags and anything with no letter in it
  // are never a search term worth having (and an over-long one cannot fit the
  // unique index at all). "No letter" covers the bare number and, because the
  // tag regex admits '_', the likes of "___" and "2026_".
  if (folded.length < 3) return true
  if (folded.length > DISCOVERY_MAX_TERM_CHARS) return true
  if (!/\p{L}/u.test(folded)) return true
  for (const cand of variants(folded)) {
    for (const term of configured.tagged) {
      if (term === cand) return true
      // The floor belongs to the needle, not the haystack: a configured
      // "#sealandgear" must not delete the candidate "gea" either.
      if (term.length >= SUBSTRING_MIN && cand.includes(term)) return true
      if (cand.length >= SUBSTRING_MIN && term.includes(cand)) return true
    }
    for (const term of configured.phrases) {
      if (term === cand) return true
      if (term.length < SUBSTRING_MIN) continue
      if (cand.includes(term)) return true
    }
  }
  return false
}

/** The (kind, term) pairs one video contributes, deduped. Hashtags come from
 *  the column and the caption both — a video that has them in both places
 *  contributes each tag once. */
function videoTerms(video: DiscoveryVideo): { kind: 'topic' | 'hashtag'; folded: string }[] {
  const out = new Map<string, { kind: 'topic' | 'hashtag'; folded: string }>()
  const add = (kind: 'topic' | 'hashtag', raw: string) => {
    const folded = fold(raw.replace(/^#+/, ''))
    if (folded) out.set(`${kind}::${folded}`, { kind, folded })
  }
  for (const topic of video.topics ?? []) add('topic', topic)
  for (const tag of video.hashtags ?? []) add('hashtag', tag)
  for (const m of (video.caption ?? '').matchAll(HASHTAG_IN_TEXT)) add('hashtag', m[1])
  return [...out.values()]
}

/**
 * Aggregate the run's gate-kept videos into keyword candidates.
 *
 * `insightsByVideo` maps videos.id -> how many of this run's audience_insights
 * cite that video (absent = 0). `videos`/`comments`/`insights` are counted over
 * DISTINCT videos, so a term tagged twice on one video counts once.
 *
 * Terms under DISCOVERY_MIN_VIDEOS are dropped; the rest come back sorted by
 * videos desc, comments desc, then term asc (the last only so the output is
 * deterministic) and capped at DISCOVERY_MAX_TERMS.
 */
export function computeKeywordCandidates(
  videos: DiscoveryVideo[],
  insightsByVideo: Map<string, number>,
  config: DiscoveryConfig,
): KeywordCandidate[] {
  const configured = configuredTerms(config)
  const agg = new Map<string, KeywordCandidate & { platformSet: Set<string> }>()

  for (const video of videos) {
    for (const { kind, folded } of videoTerms(video)) {
      if (isCovered(folded, configured)) continue
      const key = `${kind}::${folded}`
      let row = agg.get(key)
      if (!row) {
        row = {
          term: folded,
          kind,
          videos: 0,
          comments: 0,
          insights: 0,
          platforms: [],
          found_by: {},
          owned_videos: 0,
          client_videos: 0,
          competitor_videos: 0,
          platformSet: new Set<string>(),
        }
        agg.set(key, row)
      }
      row.videos++
      row.comments += video.comments_count ?? 0
      row.insights += insightsByVideo.get(video.id) ?? 0
      if (video.platform) row.platformSet.add(video.platform)
      if (video.source === 'owned') row.owned_videos++
      if (video.is_client) row.client_videos++
      if (video.is_competitor) row.competitor_videos++
      // Which configured search carried this video in. Deduped per video so a
      // keyword listed twice on one row credits once.
      for (const keyword of new Set(video.source_keywords ?? [])) {
        if (!keyword) continue
        row.found_by[keyword] = (row.found_by[keyword] ?? 0) + 1
      }
    }
  }

  return [...agg.values()]
    .filter((r) => r.videos >= DISCOVERY_MIN_VIDEOS)
    .map(({ platformSet, ...r }) => ({ ...r, platforms: [...platformSet].sort() }))
    .sort((a, b) => b.videos - a.videos || b.comments - a.comments || a.term.localeCompare(b.term))
    .slice(0, DISCOVERY_MAX_TERMS)
}

export interface DiscoveryResult {
  videos: number
  candidates: KeywordCandidate[]
  topics: number
  hashtags: number
}

/**
 * Compute and persist this run's keyword candidates. Idempotent: the run's
 * existing rows are deleted before the insert, so a retry (or a re-run of the
 * backfill) converges rather than conflicting.
 *
 * HONESTY CAVEAT, same as backfill-keyword-insights.ts: gather restamps
 * `videos.run_id` to the newest run on every upsert, so "the run's videos" is
 * exact for the newest run and a proxy for older ones (their rows have since
 * been restamped away, which is why an old run discovers little or nothing).
 */
export async function discoverRunKeywords(
  admin: SupabaseClient,
  clientId: string,
  runId: string,
  opts: { persist?: boolean } = {},
): Promise<DiscoveryResult> {
  const videos = await selectAll<DiscoveryVideo>(() =>
    admin
      .from('videos')
      .select('id, platform, caption, hashtags, topics, source_keywords, comments_count, is_client, is_competitor, source')
      .eq('client_id', clientId)
      .eq('run_id', runId)
      .order('id'),
  )

  // Insights this run produced, by video. Run-scoped (not the *_current views)
  // for the same reason keyword-attribution is: the question here is what THIS
  // run's analysis got out of a term, not what the corpus currently holds.
  const insights = await selectAll<{ source_video_id: string | null }>(() =>
    admin
      .from('audience_insights')
      .select('source_video_id')
      .eq('client_id', clientId)
      .eq('run_id', runId)
      .order('id'),
  )
  const insightsByVideo = new Map<string, number>()
  for (const i of insights) {
    if (!i.source_video_id) continue
    insightsByVideo.set(i.source_video_id, (insightsByVideo.get(i.source_video_id) ?? 0) + 1)
  }

  const { data: configRow, error: configError } = await admin
    .from('tracking_configs')
    .select('brand_keywords, competitor_names, competitor_keywords, industry_keywords, exclude_terms, own_handles')
    .eq('client_id', clientId)
    .maybeSingle()
  if (configError) throw new Error(`discovery config fetch: ${configError.message}`)

  const candidates = computeKeywordCandidates(videos, insightsByVideo, (configRow ?? {}) as DiscoveryConfig)
  const result: DiscoveryResult = {
    videos: videos.length,
    candidates,
    topics: candidates.filter((c) => c.kind === 'topic').length,
    hashtags: candidates.filter((c) => c.kind === 'hashtag').length,
  }
  if (opts.persist === false) return result

  const { error: deleteError } = await admin
    .from('keyword_candidates')
    .delete()
    .eq('client_id', clientId)
    .eq('run_id', runId)
  if (deleteError) throw new Error(`discovery delete: ${deleteError.message}`)

  // Terms come from captions and model output, so they go through dbSafeText on
  // the way to a text column (lib/db-text.ts — one U+0000 kills the whole body).
  const rows = candidates.map((c) => ({
    client_id: clientId,
    run_id: runId,
    term: dbSafeText(c.term),
    kind: c.kind,
    videos: c.videos,
    comments: c.comments,
    insights: c.insights,
    platforms: c.platforms,
    found_by: dbSafeJson(c.found_by),
    owned_videos: c.owned_videos,
    client_videos: c.client_videos,
    competitor_videos: c.competitor_videos,
  }))
  // ONE insert, not a chunked loop. `rows` is capped at DISCOVERY_MAX_TERMS, and
  // a single PostgREST insert is a single statement — so the delete/insert pair
  // either both land or neither does. A chunked insert whose second request went
  // out of retries (which this step swallows by design) would leave the run
  // holding a partial candidate set, and the reader would under-count that run
  // with nothing anywhere saying so.
  if (rows.length) {
    const { error } = await admin.from('keyword_candidates').insert(rows)
    if (error) throw new Error(`discovery insert: ${error.message}`)
  }

  return result
}
