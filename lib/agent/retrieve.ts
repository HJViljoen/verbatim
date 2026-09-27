import { embedTexts } from '../pipeline/cluster'
import { isMissingColumnError, selectAll } from '../supabase-admin'
import {
  bucketByAudienceId,
  scopeToClientVoices,
  fetchInsightsByIds,
  fetchLiveBucketsByAudience,
  fetchQuoteCitationsByAudience,
  type QuoteCitation,
} from '../quotes'
import { AGENT_INSIGHTS_PER_QUERY, AGENT_INSIGHTS_TOTAL, CITATION_RELEVANCE_FLOOR } from '../config'
import { fuseHits, countConversations, type Hit, type FusedHit } from './rank'
import { audienceOf, isRivalAudience, rivalNameOf } from '../rivals'
import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../chunk'

// The retrieval half of the Verbatim Agent. Its whole job is to put real
// insights and real quotes in front of the answering model, entity-scoped and
// redaction-filtered, so that everything downstream is arguing about text that
// actually came from this tenant's corpus.
//
// It reaches INSIGHT level, not theme level. Answering a client's question off
// ~334 one-line theme headers is the "synthesis on headers" defect the August
// cold review found in Pass C/D, and it would sit here at the surface the
// client touches most.

/** The theme an insight was clustered into on the current run. `registryId` is
 *  the ONLY cross-run key (AGENTS.md — `themes.id` is a per-run row id and
 *  labels churn ~88% run to run), so it is what the trend layer joins on. */
export interface ThemeRef {
  themeId: string
  registryId: string | null
  label: string
  bucket: string
}

export interface RetrievedInsight {
  id: string
  theme: string
  description: string
  emotion: string | null
  journeyStage: string | null
  videoId: string | null
  bucket: string
  themeRef: ThemeRef | null
  similarity: number
  quotes: QuoteCitation[]
}

export interface RetrievedContext {
  insights: RetrievedInsight[]
  /** DISTINCT source videos behind the retrieved insights — "conversations" in
   *  the product's fixed vocabulary. Computed here, never by a model. */
  conversationCount: number
  /** Queries that returned nothing above the floor. Surfaced so the caller can
   *  tell "the corpus is silent on this" apart from "retrieval was never run",
   *  and so the operator lever can see WHICH angle found nothing. */
  emptyQueries: string[]
  runId: string
}

type Admin = ReturnType<typeof import('../supabase-admin').createAdminClient>

/** How many insights of this tenant are actually searchable.
 *
 *  Exists because an EMPTY INDEX and a SILENT CORPUS are indistinguishable at
 *  every other layer: match_insights filters `embedding is not null`, so a
 *  tenant nobody has embedded returns zero rows for every question ever asked,
 *  and the client is told "nothing relates to this" about their own customers.
 *  That is the exact failure this design calls the worst one. Counting is
 *  cheap; being confidently wrong is not. */
export async function embeddedInsightCount(admin: Admin, clientId: string): Promise<number> {
  const { count } = await admin
    .from('audience_insights')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .not('embedding', 'is', null)
  return count ?? 0
}

/** How much of this tenant's live corpus the agent can actually search, and
 *  when a vector was last written. The readiness page's Subjects · embeddings
 *  row; nothing in the answering path reads it.
 *
 *  It exists because the guard above only fires at zero. Measured 2026-09-15,
 *  before the pipeline started embedding its own insights: Össur 1,680 of
 *  3,129 and Sealand 785 of 2,872 — a tenant answered at 27% coverage and
 *  told "your customers do not mention this", with nothing anywhere saying
 *  that three quarters of the corpus was never searched. A count of zero is
 *  the only state today's product can see, and it is not the state either
 *  tenant was in.
 *
 *  Over `audience_insights_current`, not the base table, because that is the
 *  population match_insights searches and therefore the only denominator the
 *  percentage can honestly have. (embeddedInsightCount reads the base table; a
 *  superset makes no difference to an is-it-zero test, and does to a share.)
 *
 *  `lastEmbeddedAt` is null until 20260915094000_insight_embedding.sql is
 *  applied, and stays null for every vector written before it — the column is
 *  new and is never backfilled, because nothing knows when those rows were
 *  written. The page says "not recorded", not "never". */
export interface EmbeddingCoverage {
  embedded: number
  total: number
  /** ISO timestamp of the newest vector written, or null. */
  lastEmbeddedAt: string | null
}

export async function embeddingCoverage(admin: Admin, clientId: string): Promise<EmbeddingCoverage> {
  const [all, embedded, last] = await Promise.all([
    admin.from('audience_insights_current').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    admin.from('audience_insights_current').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).not('embedding', 'is', null),
    admin.from('audience_insights_current').select('embedded_at')
      .eq('client_id', clientId).not('embedded_at', 'is', null)
      .order('embedded_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  // Throw rather than count a failed read as zero. PostgREST hands back
  // `count: null` on every failure, so `count ?? 0` here would reach the
  // readiness page as "0 of 0" — which compute.ts reads as status `missing`
  // and prints as "Nothing has been read for this workspace yet, so there is
  // nothing to search" for a tenant with thousands of live insights. That is
  // lib/readiness/load.ts's stated rule ("thirteen rows of confident falsehood
  // with nothing anywhere saying a read failed is worse than a page that does
  // not load"), and this reader lives one import outside that file.
  if (all.error) throw all.error
  if (embedded.error) throw embedded.error
  // The ONE deliberate swallow: a deploy can land before the migration (they
  // are applied by hand here), and the readiness page must render the two
  // counts it CAN read rather than 500 on a column that is not there yet.
  // Narrow: this column only — any other failure of this read throws too.
  const columnNotThere = isMissingColumnError(last.error, 'embedded_at')
  if (last.error && !columnNotThere) throw last.error
  return {
    embedded: embedded.count ?? 0,
    total: all.count ?? 0,
    lastEmbeddedAt: columnNotThere ? null : ((last.data?.embedded_at as string | undefined) ?? null),
  }
}

/** Newest run that actually produced analysis. Mirrors the dashboard pages: an
 *  in-flight run has no themes yet, so the agent keeps answering from the last
 *  closed corpus rather than going blank mid-run. */
export async function latestRunId(admin: Admin, clientId: string): Promise<string | null> {
  const { data } = await admin
    .from('pipeline_runs')
    .select('id, started_at')
    .eq('client_id', clientId)
    .in('status', ['completed', 'partial'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

interface ThemeBucketRow {
  id: string
  registry_id: string | null
  label: string | null
  bucket: string | null
  supporting_insight_ids: string[] | null
}

/**
 * Retrieve the corpus context for one question.
 *
 * `queries` is the question expanded into the vocabulary the corpus actually
 * uses (lib/agent/interpret.ts) — clients ask "should we run a Black Friday
 * promo", and no theme is labelled that.
 */
export async function retrieveForQueries(
  admin: Admin,
  args: {
    clientId: string
    runId: string
    queries: string[]
    perQuery?: number
    limit?: number
    floor?: number
    /** WP3.9 (market-first plan §2.8). OPT-IN: absent, retrieval keeps the
     *  rule it has always had (rivals dropped after the cap, all time). */
    scope?: RetrievalScope
  },
): Promise<RetrievedContext> {
  const { clientId, runId } = args
  const queries = args.queries.map((q) => q.trim()).filter(Boolean)
  const perQuery = args.perQuery ?? AGENT_INSIGHTS_PER_QUERY
  const limit = args.limit ?? AGENT_INSIGHTS_TOTAL
  const floor = args.floor ?? CITATION_RELEVANCE_FLOOR

  if (queries.length === 0) {
    return { insights: [], conversationCount: 0, emptyQueries: [], runId }
  }

  const vectors = await embedTexts(queries)
  const perQueryHits: Hit[][] = []
  const emptyQueries: string[] = []

  for (let i = 0; i < queries.length; i++) {
    const { data, error } = await admin.rpc('match_insights', {
      p_client_id: clientId,
      p_query: vectors[i] as unknown as string,
      p_limit: perQuery,
      p_floor: floor,
    })
    // A failed retrieval must NOT read as an empty corpus — that would tell a
    // client "we have nothing on this" when the truth is the search broke.
    if (error) throw new Error(`match_insights("${queries[i]}"): ${error.message}`)
    const hits = ((data ?? []) as { id: string; similarity: number }[]).map((r) => ({
      id: r.id,
      similarity: r.similarity,
    }))
    if (hits.length === 0) emptyQueries.push(queries[i])
    perQueryHits.push(hits)
  }

  // WP3.9: the market scope takes its own path and leaves this one as it was.
  if (args.scope) return retrieveScoped(admin, { clientId, runId, perQueryHits, emptyQueries, limit, scope: args.scope })

  const fused = fuseHits(perQueryHits, { limit })
  if (fused.length === 0) {
    return { insights: [], conversationCount: 0, emptyQueries, runId }
  }

  // Entity scoping. A client's own question must never be answered with a
  // competitor's customers — the rule lives in lib/quotes.ts and every other
  // evidence surface obeys it. Themes of the current run are the only place
  // the bucket of an insight is recorded.
  const themeRows = await selectAll<ThemeBucketRow>(() =>
    admin
      .from('themes')
      .select('id, registry_id, label, bucket, supporting_insight_ids')
      .eq('client_id', clientId)
      .eq('run_id', runId)
      .order('id', { ascending: true }),
  )
  const bucketById = bucketByAudienceId(
    themeRows.map((t) => ({ bucket: t.bucket ?? 'industry-other', supporting_insight_ids: t.supporting_insight_ids ?? [] })),
  )
  // An insight can sit in more than one theme; first wins, deterministically,
  // because themeRows is ordered by id.
  const themeByInsight = new Map<string, ThemeRef>()
  for (const t of themeRows) {
    const ref: ThemeRef = {
      themeId: t.id,
      registryId: t.registry_id,
      label: t.label ?? '',
      bucket: t.bucket ?? 'industry-other',
    }
    for (const id of t.supporting_insight_ids ?? []) if (!themeByInsight.has(id)) themeByInsight.set(id, ref)
  }
  // Base table, not the view: these are id-set lookups, and AGENTS.md keeps
  // those on the base table so a row an in-flight run has superseded but not
  // yet pruned still resolves.
  interface InsightRowLite {
    id: string
    theme: string | null
    description: string | null
    emotion: string | null
    journey_stage: string | null
    source_video_id: string | null
  }
  // Resolve BEFORE scoping: the authoritative entity of an insight is the
  // current tag on the video it came from, and that is only knowable once the
  // rows (and their source_video_id) are in hand. `fused` is already capped at
  // `limit`, so this fetch is bounded.
  const rows = await fetchInsightsByIds<InsightRowLite>(
    admin,
    fused.map((f) => f.id),
    'id, theme, description, emotion, journey_stage, source_video_id',
  )

  // The entity gate. A stored theme bucket is a snapshot frozen at the run that
  // wrote it, and `scopeToClientVoices` keeps ids it does not recognise — so on
  // 2026-09-10 the agent answered "what do people think of Sealand" with a
  // Patagonia comment under "What your customers said": that insight was either
  // absent from the current run's themes or still carried a pre-re-tag bucket.
  // Live tags win; the stored bucket is only the fallback for an insight with
  // no source video to ask about.
  const liveBucketById = await fetchLiveBucketsByAudience(admin, rows)
  const entityBucketById = new Map(bucketById)
  for (const [id, bucket] of liveBucketById) entityBucketById.set(id, bucket)

  const scoped = new Set(scopeToClientVoices(fused.map((f) => f.id), entityBucketById))
  const kept = fused.filter((f) => scoped.has(f.id))
  if (kept.length === 0) {
    return { insights: [], conversationCount: 0, emptyQueries, runId }
  }
  const rowById = new Map(rows.map((r) => [r.id, r]))
  const quotesById = await fetchQuoteCitationsByAudience(admin, kept.map((k) => k.id))

  const insights: RetrievedInsight[] = []
  for (const hit of kept) {
    const row = rowById.get(hit.id)
    // An id that no longer resolves was pruned between the search and the
    // fetch. Dropping it is right; counting it would inflate the answer.
    if (!row) continue
    insights.push({
      id: row.id,
      theme: row.theme ?? '',
      description: row.description ?? '',
      emotion: row.emotion,
      journeyStage: row.journey_stage,
      videoId: row.source_video_id,
      bucket: entityBucketById.get(row.id) ?? 'industry-other',
      themeRef: themeByInsight.get(row.id) ?? null,
      similarity: hit.bestSimilarity,
      quotes: (quotesById.get(row.id) ?? []).sort((a, b) => a.rank - b.rank),
    })
  }

  return {
    insights,
    conversationCount: countConversations(insights),
    emptyQueries,
    runId,
  }
}

// ── The market scope (market-first plan §2.8, WP3.9) ─────────────────────────
//
// OPT-IN, AND THE PATH ABOVE IS UNTOUCHED. `retrieveForQueries` without a
// `scope` keeps its rule word for word: fuse, cap, then drop every rival voice
// (`scopeToClientVoices`). Ask and the brief research ask for the market scope
// by passing one; nothing else calls this file's retrieval.
//
// WHAT THE SCOPE CHANGES, AND WHY EACH ONE.
//  · A QUESTION THAT NAMES A RIVAL READS THAT RIVAL'S FILED VIDEOS. Decision E
//    puts the videos filed under a tracked brand inside the market, and a
//    question about Cotopaxi answered from category voices only is answered
//    from the voices nearest to Cotopaxi rather than from Cotopaxi's own
//    (GA F9–F10). A rival the question does not name stays out, as before, so
//    a question about the client is never answered with another brand's
//    audience.
//  · THE SCOPE IS APPLIED BEFORE THE CAP, NOT AFTER IT. After the cap a
//    question about a rival lost the slots its own insights held (Sealand's
//    Patagonia questions carried 25 to 31 findings where market questions
//    carried 50 to 60, GA F9); before it, the cap counts only what the answer
//    may use.
//  · THE WINDOW IS DATED BY THE COMMENT. An insight is inside a window when a
//    comment it quotes was written inside it (its top three pieces of
//    evidence); one that quotes no comment is dated by its video's upload day.
//    `null` is all time. 12% of the category pool is from videos uploaded
//    before August 2026 (GA F11), so the default of 90 days is the reader's
//    choice to widen, never a silent inclusion.
//
// Reads, each bounded by the fused list (at most `perQuery` × the queries):
// the run's themes (as above), the insight rows, their videos, and with a
// window the top evidence and its comments' dates.

/** The scope an answer is read over. */
export interface RetrievalScope {
  /** Tracked rival names the question names. Insights filed under one of them
   *  are retrievable; every other rival's stay out. */
  rivals: readonly string[]
  /** Half-open `[from, to)` days, `YYYY-MM-DD`, dated by the comment. Null:
   *  all time. */
  window: { from: string; to: string } | null
}

/** How many pieces of an insight's evidence date it: its best three. */
export const SCOPE_EVIDENCE_PER_INSIGHT = 3

const foldName = (s: string): string => s.normalize('NFD').replace(/\p{M}+/gu, '').trim().toLowerCase()

/** May an insight filed under `bucket` be read under this scope? The client's
 *  own and the category's always; a rival's only where the question names it;
 *  an insight nobody could file passes, as it does under the default rule. */
export function scopeAdmits(bucket: string | null | undefined, scope: RetrievalScope): boolean {
  if (!bucket || !isRivalAudience(bucket)) return true
  const name = rivalNameOf(bucket)
  if (!name) return false
  const wanted = new Set(scope.rivals.map(foldName))
  return wanted.has(foldName(name))
}

/** Is an insight inside the window? Any evidence comment dated inside it, or,
 *  with none, the video's upload day inside it. Nothing dated at all is
 *  outside: an insight we cannot date is not evidence about a window. */
export function insideWindow(
  commentDates: readonly string[],
  uploadDate: string | null,
  window: RetrievalScope['window'],
): boolean {
  if (!window) return true
  const inside = (d: string): boolean => {
    const day = d.slice(0, 10)
    return day >= window.from && day < window.to
  }
  if (commentDates.length > 0) return commentDates.some(inside)
  return uploadDate ? inside(uploadDate) : false
}

interface ScopedVideoRow {
  id: string
  is_client: boolean | null
  is_competitor: boolean | null
  competitor_name: string | null
  upload_date: string | null
}

async function readChunked<R>(ids: readonly string[], read: (part: string[]) => PromiseLike<{ data: R[] | null; error: unknown }> & { range?: unknown }): Promise<R[]> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return []
  const pages = await mapWithLimit(chunk(unique, UUID_IN_CHUNK), READ_CONCURRENCY, (part) =>
    selectAll<R>(() => read(part) as unknown as { range: (from: number, to: number) => PromiseLike<{ data: R[] | null; error: unknown }> }),
  )
  return pages.flat()
}

async function retrieveScoped(
  admin: Admin,
  a: { clientId: string; runId: string; perQueryHits: Hit[][]; emptyQueries: string[]; limit: number; scope: RetrievalScope },
): Promise<RetrievedContext> {
  const { clientId, runId, emptyQueries, limit, scope } = a
  const empty: RetrievedContext = { insights: [], conversationCount: 0, emptyQueries, runId }
  // Every hit, ranked: the cap comes after the scope.
  const candidates: FusedHit[] = fuseHits(a.perQueryHits)
  if (candidates.length === 0) return empty

  const themeRows = await selectAll<ThemeBucketRow>(() =>
    admin
      .from('themes')
      .select('id, registry_id, label, bucket, supporting_insight_ids')
      .eq('client_id', clientId)
      .eq('run_id', runId)
      .order('id', { ascending: true }),
  )
  const storedBucket = bucketByAudienceId(
    themeRows.map((t) => ({ bucket: t.bucket ?? 'industry-other', supporting_insight_ids: t.supporting_insight_ids ?? [] })),
  )
  const themeByInsight = new Map<string, ThemeRef>()
  for (const t of themeRows) {
    const ref: ThemeRef = { themeId: t.id, registryId: t.registry_id, label: t.label ?? '', bucket: t.bucket ?? 'industry-other' }
    for (const id of t.supporting_insight_ids ?? []) if (!themeByInsight.has(id)) themeByInsight.set(id, ref)
  }

  const rows = await fetchInsightsByIds<{
    id: string
    theme: string | null
    description: string | null
    emotion: string | null
    journey_stage: string | null
    source_video_id: string | null
  }>(admin, candidates.map((c) => c.id), 'id, theme, description, emotion, journey_stage, source_video_id')
  const rowById = new Map(rows.map((r) => [r.id, r]))

  // THE LIVE TAG DECIDES, as on the default path (the 2026-09-10 lesson): the
  // stored theme bucket is the fallback for an insight with no video to ask.
  const videos = await readChunked<ScopedVideoRow>(
    rows.map((r) => r.source_video_id).filter((v): v is string => Boolean(v)),
    (part) => admin.from('videos').select('id, is_client, is_competitor, competitor_name, upload_date').in('id', part).order('id'),
  )
  const videoById = new Map(videos.map((v) => [v.id, v]))
  const bucketOf = (id: string): string => {
    const video = videoById.get(rowById.get(id)?.source_video_id ?? '')
    return video ? audienceOf(video) : storedBucket.get(id) ?? 'industry-other'
  }

  let admitted = candidates.filter((c) => rowById.has(c.id) && scopeAdmits(bucketOf(c.id), scope))

  if (scope.window && admitted.length > 0) {
    const evidence = await readChunked<{ audience_insight_id: string; comment_id: string | null; relevance_rank: number | null }>(
      admitted.map((c) => c.id),
      (part) => admin
        .from('insight_evidence')
        .select('audience_insight_id, comment_id, relevance_rank')
        .in('audience_insight_id', part)
        .eq('redacted', false)
        .not('comment_id', 'is', null)
        .order('id'),
    )
    const byInsight = new Map<string, { comment_id: string; rank: number }[]>()
    for (const e of evidence) {
      if (!e.comment_id) continue
      const list = byInsight.get(e.audience_insight_id) ?? []
      list.push({ comment_id: e.comment_id, rank: e.relevance_rank ?? 99 })
      byInsight.set(e.audience_insight_id, list)
    }
    const top = new Map<string, string[]>()
    for (const [id, list] of byInsight) {
      top.set(id, list.sort((x, y) => x.rank - y.rank || x.comment_id.localeCompare(y.comment_id)).slice(0, SCOPE_EVIDENCE_PER_INSIGHT).map((x) => x.comment_id))
    }
    const comments = await readChunked<{ id: string; comment_date: string | null }>(
      [...top.values()].flat(),
      (part) => admin.from('comments').select('id, comment_date').in('id', part).order('id'),
    )
    const dateOf = new Map(comments.map((c) => [c.id, c.comment_date]))
    admitted = admitted.filter((c) => {
      const dates = (top.get(c.id) ?? []).map((id) => dateOf.get(id)).filter((d): d is string => Boolean(d))
      const upload = videoById.get(rowById.get(c.id)?.source_video_id ?? '')?.upload_date ?? null
      return insideWindow(dates, upload, scope.window)
    })
  }

  const kept = limit > 0 ? admitted.slice(0, limit) : admitted
  if (kept.length === 0) return empty
  const quotesById = await fetchQuoteCitationsByAudience(admin, kept.map((k) => k.id))

  const insights: RetrievedInsight[] = []
  for (const hit of kept) {
    const row = rowById.get(hit.id)
    if (!row) continue
    insights.push({
      id: row.id,
      theme: row.theme ?? '',
      description: row.description ?? '',
      emotion: row.emotion,
      journeyStage: row.journey_stage,
      videoId: row.source_video_id,
      bucket: bucketOf(row.id),
      themeRef: themeByInsight.get(row.id) ?? null,
      similarity: hit.bestSimilarity,
      quotes: (quotesById.get(row.id) ?? []).sort((x, y) => x.rank - y.rank),
    })
  }
  return { insights, conversationCount: countConversations(insights), emptyQueries, runId }
}
