import type { SupabaseClient } from '@supabase/supabase-js'

import { selectAll } from '../supabase-admin'

// The client's own posts: ONE read, keyed on `videos.source = 'owned'`
// (depth v2, T14). The playbook's own side, the unanswered questions' "your
// posts", the reply list's "under your post" and the Content page's "your
// posts this month" all ask this one question, and they ask it here.
//
// WHY `is_client` IS NOT "YOUR POSTS". `videos.is_client` is set at gather by a
// brand-keyword match on the account, the caption or the hashtags
// (`tagVideo`, lib/gather/tagging.ts). It is true of every creator's video
// that NAMES the brand: a review, a fitting vlog, a "my new Össur knee" post.
// That is the right key for "talk about you" (the `client` audience, decision
// E), and the wrong one for "what you published". Measured read-only on
// production, 13 Oct 2026: Össur's September holds 25 videos off its own
// accounts and 136 more creator videos tagged `is_client` (95 of them on
// YouTube, where Össur published none); October so far, 7 and 22. Every surface
// that read `is_client` as "your posts" was counting those creators as Össur.
// Sealand has no such gap today (27 and 13 owned, 0 about), which is why the
// mislabel was never seen there.
//
// WHY `source = 'owned'` IS. Only the owned profile read (lib/gather/owned.ts,
// `ingestOwnedPosts`) stamps it, from the account the post came off, together
// with `is_client = true` (`entityIdentity`). Since 2026-09-11 that read
// corrects a row the keyword gather found first, and
// scripts/reconcile-video-source.ts corrected the history; on 13 Oct, 6 of
// Össur's rows (Instagram 1, TikTok 3, YouTube 2, all published before
// September) still sat on 'discovered' under an account name its owned read
// stored, none of Sealand's, and none of either tenant's since 1 September.
// The census (`ownedPostsIn`) also bridges by account name for those; this read
// does not, on purpose: it is the one column every reader can filter on in SQL
// and in memory alike, and a page that filters one way while its loader
// filters another is how three answers to "is this ours" reached one screen.
//
// DATED BY THE POST. Like `lib/reading/formats.ts`, this is the published clock
// (`videos.upload_date`), not the comment's: a post is something the brand
// published on a day. The window is half-open, `[from, to)`, and an undated
// row is never counted into it (a census is a count, `ownPostsInWindow`).
//
// NOT A MARKET READ. AGENTS.md forbids re-deriving a period figure about the
// CONVERSATION by counting `videos` over a date span; this counts what the
// client published, which no month table holds, the same way the owned census
// (`run_summary.owned_census`) has since 2026-09-09.

/** The one source value that means "posted from the client's own account". */
export const OWNED_SOURCE = 'owned' as const

/** Is this row a post off the client's own account? The in-memory twin of the
 *  read's `.eq('source', 'owned')`. `is_client` is deliberately not read: a
 *  creator's video naming the brand carries it too (see the header). */
export function isOwnedPost(v: { source?: string | null }): boolean {
  return v.source === OWNED_SOURCE
}

/** One of the client's own posts, as the Content page and the playbook read it.
 *  Structurally a `PlaybookVideo` (lib/pages/playbook.ts), so a post can be
 *  handed to `buildPlaybook` as it stands. */
export interface OwnedPost {
  id: string
  /** The platform's own id (`videos.video_id`), the key comments join on. */
  video_id: string
  platform: string
  video_url: string | null
  account_name: string | null
  /** `YYYY-MM-DD`. Never null here: an undated post is not in any window. */
  upload_date: string
  /** The caption; on YouTube the title and description, joined (there is no
   *  title column). */
  caption: string | null
  /** One of the 12 `classified_type` values, or null where nothing classified it. */
  classified_type: string | null
  /** One of the 10 `hook_style` values, or null. */
  hook_style: string | null
  /** The opening, verbatim, where a classifier found one. */
  hook_text: string | null
  /** (likes + shares + comments) / views × 100, as the column stores it (3.8 =
   *  3.8%). Null where the platform gave no views (an Instagram photo). */
  engagement_rate: number | null
  views: number
  likes: number
  comments_count: number
  /** What the post is about (`videos.topics`): the haystack the unanswered
   *  questions' word check reads. */
  topics: string[] | null
  is_client: boolean | null
  is_competitor: boolean | null
  competitor_name: string | null
  source: string | null
  sentiment: string | null
  sentiment_source: string | null
  analyzed_lane: string | null
  /** The run whose analysis is the post's current one (`videos.analyzed_run_id`);
   *  null where nothing has analysed it. Optional so a row built before it
   *  (a fixture, a playbook video) still fits. Your market's card counts the
   *  posts "with a reading" off it (depth v2, T7). */
  analyzed_run_id?: string | null
}

/** The client's own posts over a window. */
export interface OwnedPosts {
  /** The clock every figure keeps: `videos.upload_date`. */
  basis: 'published'
  /** Half-open, `YYYY-MM-DD`. */
  window: { from: string; to: string }
  /** Newest first (then by id, so the order is stable). */
  posts: OwnedPost[]
  total: number
  /** Posts per platform, most first, then by name. Platforms with none are
   *  absent: this read knows what was published, not which accounts exist. */
  byPlatform: { platform: string; posts: number }[]
}

/** The columns `OwnedPost` carries, and no more. One literal, not a
 *  concatenation: the client's select parser types a literal and gives up on a
 *  `string`. */
export const OWNED_POST_COLUMNS = 'id, video_id, platform, video_url, account_name, upload_date, caption, classified_type, hook_style, hook_text, engagement_rate, views, likes, comments_count, topics, is_client, is_competitor, competitor_name, source, sentiment, sentiment_source, analyzed_lane, analyzed_run_id'

/** A window bound as a day: an instant (`2026-10-01T00:00:00Z`) or a day. */
const day = (x: string): string => x.slice(0, 10)

const toNumber = (x: unknown): number => {
  const n = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(n) ? n : 0
}

/** `numeric` arrives from PostgREST as a string; null stays null. */
const toRate = (x: unknown): number | null => {
  if (x == null || x === '') return null
  const n = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(n) ? n : null
}

type RawOwnedRow = Omit<OwnedPost, 'upload_date' | 'engagement_rate' | 'views' | 'likes' | 'comments_count'> & {
  upload_date: string | null
  engagement_rate: number | string | null
  views: number | string | null
  likes: number | string | null
  comments_count: number | string | null
}

/**
 * The pure half: rows in, the client's own posts in the window out.
 *
 * It filters again on `source` and on the window although the read already
 * did, so a caller handing it a mixed array (the month's whole corpus) gets the
 * same answer the read gives, and so a test can prove a creator's video naming
 * the brand is not counted.
 */
export function summariseOwnedPosts(
  rows: readonly RawOwnedRow[],
  window: { from: string; to: string },
): OwnedPosts {
  const from = day(window.from)
  const to = day(window.to)
  const posts: OwnedPost[] = rows
    .filter((r) => isOwnedPost(r))
    .filter((r): r is RawOwnedRow & { upload_date: string } => {
      const d = r.upload_date ? day(r.upload_date) : null
      return d != null && d >= from && d < to
    })
    .map((r) => ({
      ...r,
      upload_date: day(r.upload_date),
      engagement_rate: toRate(r.engagement_rate),
      views: toNumber(r.views),
      likes: toNumber(r.likes),
      comments_count: toNumber(r.comments_count),
    }))
    .sort((a, b) => b.upload_date.localeCompare(a.upload_date) || a.id.localeCompare(b.id))

  const counts = new Map<string, number>()
  for (const p of posts) counts.set(p.platform, (counts.get(p.platform) ?? 0) + 1)
  const byPlatform = [...counts.entries()]
    .map(([platform, n]) => ({ platform, posts: n }))
    .sort((a, b) => b.posts - a.posts || a.platform.localeCompare(b.platform))

  return { basis: 'published', window: { from, to }, posts, total: posts.length, byPlatform }
}

/**
 * The client's own posts published in `[from, to)`.
 *
 * `scope` is any loader's scope (`lib/renderables/types.ts` `Scope` fits): the
 * session client on the app path, the admin client on the export path. Tens of
 * rows a month on every tenant we have; `selectAll` all the same, because a
 * bare `.select()` caps at 1000 and the window is the caller's.
 */
export async function ownedPosts(
  scope: { supabase: unknown; clientId: string },
  window: { from: string; to: string },
): Promise<OwnedPosts> {
  const supabase = scope.supabase as SupabaseClient
  const rows = await selectAll<RawOwnedRow>(() =>
    supabase
      .from('videos')
      .select(OWNED_POST_COLUMNS)
      .eq('client_id', scope.clientId)
      .eq('source', OWNED_SOURCE)
      .gte('upload_date', day(window.from))
      .lt('upload_date', day(window.to))
      .order('upload_date', { ascending: false })
      .order('id', { ascending: true }),
  )
  return summariseOwnedPosts(rows, window)
}
