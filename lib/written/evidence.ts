import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../chunk'
import { readQuoteContext } from '../quote-context'
import type { QuoteVideo } from '../quote-gate'
import { readTranslations, readingOf } from '../quotes'
import { quoteRef } from '../renderables/quotes-freeze'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, rivalKey } from '../rivals'
import type { QuoteRef } from './types'

// The comment evidence behind a set of insights, dated in one period, with
// what the quote gate reads about each (lib/quote-gate.ts). Shared by the week
// pool (T1, the run's window) and the standing facts (T2, the reading month).
//
// ONE READ SHAPE, THE PRODUCT'S. `audience_insights` embedding its comment
// evidence and each comment, with every date filter on the embedded rows, so
// an insight with nothing dated in the period does not come back at all
// (lib/pages/voice-surface-words.ts `loadWordsCandidates`, the same shape).
// `redacted = false` and `source = 'comment'` are every quote read's rule:
// demographic evidence cites but never quotes, and only a comment carries a
// date. One request per UUID_IN_CHUNK insights.
//
// THE VIDEO IS THE INSIGHT'S (`source_video_id`): insights belong to videos
// (AGENTS.md), so a comment an insight cites sits under that video, and the
// embed carries its lane and filing without a second read. A row whose comment
// names another video is dropped rather than guessed at. The gate's own view
// of the video (caption, hashtags, topics, account, segment) comes from
// `readQuoteContext`, the one read path every surface uses, with the
// segments read on the service role.
//
// THE WORDS STAY IN HERE. `text` is read so the gate can judge it; nothing
// built from these rows (`WeekPool`, `StandingFact`) carries it: a quote
// leaves as a `QuoteRef` with `text: ''` (`refOf`).

/** One comment citation, dated in the period asked for. */
export interface DatedEvidence {
  insightId: string
  /** `audience_insights.category`: the insight's kind. */
  kind: string | null
  /** `audience_insights.description`: Pass A's paraphrase, never the comment. */
  description: string
  evidenceId: string
  /** `insight_evidence.relevance_rank`, 99 where absent (lib/quotes.ts). */
  rank: number
  commentId: string
  /** The comment's date as stored (an instant, UTC). */
  commentDate: string
  author: string | null
  /** The excerpt as written. READ FOR THE GATE ONLY. */
  text: string
  lang?: string | null
  english?: string | null
  video: {
    /** `videos.id`. */
    uuid: string
    platform: string
    /** The platform's own id. */
    videoId: string
    /** client · competitor:<name> · industry-other (the reading functions' CASE). */
    audience: string
    /** `videos.analyzed_lane`: 'full' is the read lane (M13). */
    lane: string | null
    accountName: string | null
  }
  /** What the gate reads about the video, or null where it was not found
   *  (the gate then refuses the quote: `no_video`). */
  context: QuoteVideo | null
}

type EmbeddedVideo = {
  id: string
  platform: string | null
  video_id: string | null
  analyzed_lane: string | null
  is_client: boolean | null
  is_competitor: boolean | null
  competitor_name: string | null
  account_name: string | null
}

type EmbeddedInsight = {
  id: string
  category: string | null
  description: string | null
  videos: EmbeddedVideo | EmbeddedVideo[] | null
  insight_evidence: {
    id: string
    quote: string | null
    relevance_rank: number | null
    comment_id: string | null
    comments: {
      id: string
      comment_date: string | null
      platform: string | null
      video_id: string | null
      author: string | null
    } | { id: string; comment_date: string | null; platform: string | null; video_id: string | null; author: string | null }[] | null
  }[] | null
}

const EVIDENCE_SELECT = [
  'id, category, description,',
  'videos(id, platform, video_id, analyzed_lane, is_client, is_competitor, competitor_name, account_name),',
  'insight_evidence!inner(id, quote, relevance_rank, comment_id,',
  'comments!inner(id, comment_date, platform, video_id, author))',
].join(' ')

/** A to-one embed can come back as an object or a one-row list. */
const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

/** The audience a video is filed under: the reading functions' CASE
 *  (client first, then a tracked rival, else the category). */
export function audienceOfVideo(v: { is_client: boolean | null; is_competitor: boolean | null; competitor_name: string | null }): string {
  if (v.is_client) return CLIENT_AUDIENCE
  if (v.is_competitor) return rivalKey(v.competitor_name)
  return INDUSTRY_AUDIENCE
}

/** The rows the embedded read returned, flattened to one row per citation.
 *  Pure, and exported for its test. */
export function flattenEvidence(rows: readonly EmbeddedInsight[]): Omit<DatedEvidence, 'context' | 'lang' | 'english'>[] {
  const out: Omit<DatedEvidence, 'context' | 'lang' | 'english'>[] = []
  for (const insight of rows) {
    const v = one(insight.videos)
    if (!v?.id || !v.video_id || !v.platform) continue
    for (const e of insight.insight_evidence ?? []) {
      const c = one(e.comments)
      if (!e.quote || !e.comment_id || !c?.comment_date) continue
      // The comment must sit under the insight's own video.
      if (c.video_id !== v.video_id || (c.platform ?? '').toLowerCase() !== v.platform.toLowerCase()) continue
      out.push({
        insightId: String(insight.id),
        kind: insight.category ?? null,
        description: (insight.description ?? '').trim(),
        evidenceId: String(e.id),
        rank: e.relevance_rank ?? 99,
        commentId: String(e.comment_id),
        commentDate: c.comment_date,
        author: c.author ?? null,
        text: e.quote,
        video: {
          uuid: String(v.id),
          platform: v.platform,
          videoId: v.video_id,
          audience: audienceOfVideo(v),
          lane: v.analyzed_lane ?? null,
          accountName: v.account_name ?? null,
        },
      })
    }
  }
  return out
}

/**
 * The comment evidence of these insights dated in `[from, to)`, with each
 * quote's English (the translation cache) and its video's gate context.
 * Throws on a read error: both callers are fail-soft one level up.
 */
export async function loadDatedEvidence(
  admin: SupabaseClient,
  clientId: string,
  insightIds: readonly string[],
  period: { from: string; to: string },
): Promise<DatedEvidence[]> {
  const ids = [...new Set(insightIds.filter(Boolean))]
  if (ids.length === 0) return []
  const pages = await mapWithLimit(chunk(ids, UUID_IN_CHUNK), READ_CONCURRENCY, async (part) => {
    const res = await admin
      .from('audience_insights')
      .select(EVIDENCE_SELECT)
      .eq('client_id', clientId)
      .in('id', part)
      .eq('insight_evidence.redacted', false)
      .eq('insight_evidence.source', 'comment')
      .gte('insight_evidence.comments.comment_date', period.from)
      .lt('insight_evidence.comments.comment_date', period.to)
      .order('id', { ascending: true })
    if (res.error) throw new Error(`written evidence: ${res.error.message}`)
    return (res.data ?? []) as unknown as EmbeddedInsight[]
  })
  const flat = flattenEvidence(pages.flat())
  if (flat.length === 0) return []
  const [translations, ctx] = await Promise.all([
    readTranslations(admin, flat.map((e) => e.text)),
    readQuoteContext(admin, clientId, { videoUuids: [...new Set(flat.map((e) => e.video.uuid))] }, admin),
  ])
  return flat.map((e) => ({ ...e, ...readingOf(translations, e.text), context: ctx.forVideoUuid(e.video.uuid) }))
}

/** A citation as a stored read keeps it: the ref, never the words. */
export function refOf(e: Pick<DatedEvidence, 'evidenceId' | 'commentDate' | 'video'>): QuoteRef {
  return {
    ref: quoteRef.evidence(e.evidenceId),
    text: '',
    date: e.commentDate ? e.commentDate.slice(0, 10) : null,
    platform: e.video.platform,
    thread: `${e.video.platform.toLowerCase()}::${e.video.videoId}`,
  }
}

/** The gate's view of one citation (`GateInput`). */
export const gateInputOf = (e: DatedEvidence) => ({
  text: e.text,
  lang: e.lang ?? null,
  english: e.english ?? null,
  video: e.context,
})
