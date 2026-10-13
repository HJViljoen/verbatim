import { COMPETITIVE_MIN_VIDEOS } from '../config'
import { questionTouch, type QuestionPost, type QuestionTouch } from '../pages/own-post-touch'
import { ENGAGEMENT_EXCLUDED, formatReading, type FormatReading, type FormatRow, type FormatVideo } from '../reading/formats'
import { INDUSTRY_AUDIENCE } from '../rivals'
import { judge, type DatedEvidence } from '../written/evidence'
import { countsForTheWeek, lenientGateFor, POOL_MIN_VIDEOS, rankEligible, type PoolTheme, type ThemeJudgement } from '../written/pool'
import { POST_IDEA_RANKS, type PostIdeaLength } from './types'

// Which question conversations become post ideas, and what code decides about
// each before the writer sees it (depth v2, T13; plan decision 5). PURE: the
// reads are lib/post-ideas/step.ts's.
//
// THE CANDIDATES. The run's question conversations of its own window: themes
// of the run's clustering whose kind is `question` (`theme_observations.category`)
// or whose counted comments in the window are mostly questions
// (`isQuestionConversation`), and that the week pool would take (`rankEligible`, lib/written/pool.ts: at
// least three category videos on the read lane with a citation the lenient
// gate passes, one with a quote the strict gate passes, not maker-led), in the
// week pool's order, biggest first. A conversation the client's own posts
// already touch is left out, by the one rule every page uses for "your posts
// touched it" (`questionTouch`, lib/pages/own-post-touch.ts: two of the
// label's non-generic words in a post's topics), over the client's own posts
// (`ownedPosts`, `source = 'owned'`) of the reading month and the two before
// it. At most `POST_IDEA_CANDIDATES` go to the writer, one more than the three
// stored, so a conversation whose idea the scrub empties still leaves three.
//
// THE COMMENTS THE WRITER GROUPS. The conversation's citations in the window
// that count for the week (`countsForTheWeek`: category, read lane, no maker's
// video), pass the lenient gate (no brand insider) and ASK (`isQuestionShaped`:
// a question mark of any script anywhere, or an English question opener; an
// answer or a piece of advice is never a sub-question), of question-kind
// insights where those reach three videos: one per comment, at most
// `POST_IDEA_COMMENTS_MAX`, drawn round the videos so the sample reaches as
// many of them as it can. The writer reads each in English where the
// translation cache has it and the English still asks, else as written;
// NOTHING HERE IS STORED: a sub-question keeps comment and video ids, and its
// figure is counted from them.
//
// THE FORMAT, THE OPENING AND THE LENGTH ARE CODE'S (`choosePlay`). The
// playbook's own reading (`formatReading`, the engine of `buildPlaybook`:
// Reddit out, three rated videos a group, median over median) over the
// market's videos on the question, WHENEVER each was published
// (`published: 'any'`): a conversation's videos span many months, and the
// playbook's month slice would leave almost every format under the floor. The
// market is the playbook's category column (`INDUSTRY_AUDIENCE`: never the
// client's posts or a video naming the client, never a rival's), read off the
// conversation's member insights' own videos. The multiple is against the
// median video ON THE QUESTION. The best group by median that runs at least
// `POST_IDEA_MIN_MULTIPLE` above it, on at least `POST_IDEA_MIN_RATED` rated
// videos (the floor every surface rests a format's lead on), is chosen; none,
// and the slot is null rather than a pick off a handful of videos.

/** At most three ideas a run (the table's ranks). */
export const POST_IDEAS_MAX = POST_IDEA_RANKS.length
/** Conversations handed to the writer: one spare. */
export const POST_IDEA_CANDIDATES = POST_IDEAS_MAX + 1
/** Question comments a conversation shows the writer. */
export const POST_IDEA_COMMENTS_MAX = 40
/** A comment's words as the writer reads them, at most. */
export const POST_IDEA_COMMENT_CHARS = 280
/** THE EVIDENCE FLOOR (Heinrich, 11 Oct: a quiet period says so in one
 *  line and is never padded). An idea stands only on at least this many
 *  comments that ask, across at least this many videos: counted on what is
 *  SENT before the call (a conversation under it costs no call) and on what
 *  its sub-questions hold after compose's drops (an idea under it is held
 *  'thin'). One comment under one video is a remark, not a question the
 *  market keeps asking. */
export const POST_IDEA_MIN_COMMENTS = 3
export const POST_IDEA_MIN_VIDEOS = 2

/** Does this evidence clear the floor? Distinct comments that ask, and the
 *  distinct videos they sit under. Pure. */
export function clearsEvidenceFloor(n: { comments: number; videos: number }): boolean {
  return n.comments >= POST_IDEA_MIN_COMMENTS && n.videos >= POST_IDEA_MIN_VIDEOS
}

/** The writer's sub-questions an idea keeps, biggest first. */
export const POST_IDEA_SUBQUESTIONS_MAX = 5
/** A format or opening is suggested only at this multiple or above. */
export const POST_IDEA_MIN_MULTIPLE = 1.1
/** …and only off this many rated videos in its group: the product's floor for
 *  resting a finding on a bucket, the one `LEAD_MIN_RATED`
 *  (lib/pages/content-brief.ts) names for the playbook's one takeaway. Read
 *  from where it lives so the pipeline does not import a page. */
export const POST_IDEA_MIN_RATED = COMPETITIVE_MIN_VIDEOS
/** Durations a length is read off, at least: under five, the middle half is
 *  the whole range (three testimonials ran 30 s and 3:15 on Össur's week). */
export const LENGTH_MIN_VIDEOS = 5
/** The longest video a length is read off: the short form the board's length
 *  is ("30 to 45 seconds"), up to YouTube's Shorts ceiling. A long-form video
 *  on the same question is another post (Sealand's airline question mixed
 *  thirty-second reels with seventeen-minute reviews: a range of nothing). */
export const LENGTH_MAX_SECONDS = 180
/** Months of the client's own posts the "already touched" test reads: the
 *  reading month and the two before it. */
export const POST_IDEA_OWNED_MONTHS = 3
/** The theme kind a post idea answers. */
export const QUESTION_KIND = 'question'

/** One question comment, as the writer reads it. `text` is NEVER stored. */
export interface IdeaComment {
  /** The writer's handle: c1, c2 and so on, unique across the set. */
  handle: string
  commentId: string
  /** `videos.id` of the video the comment sits under. */
  videoId: string
  /** The English where the translation cache has it and it still asks, else
   *  as written. Always question-shaped (`isQuestionShaped`). */
  text: string
}

/** A question mark of any script: Latin, full-width (Chinese, Japanese) and
 *  Arabic. Most comments are not in English, so this is the main signal. */
const QUESTION_MARK = /[?？؟]/
/** An English question's opener: a question word (never "what a…", which
 *  exclaims), or an auxiliary before its subject ("do you", "is it", "can
 *  anyone"); "Do it!" and "Do this" are not questions. */
const QUESTION_OPENER = new RegExp(
  String.raw`^[^\p{L}\p{N}]*(?:(?:what(?!\s+an?\b)|why|how|when|where|which|who|whom|whose)\b|(?!do\s+(?:it|that|this)\b)(?:is|are|am|was|were|do|does|did|can|could|will|would|should|shall|may|might|has|have|had|isn'?t|aren'?t|doesn'?t|don'?t|didn'?t|can'?t|won'?t|wouldn'?t|couldn'?t|shouldn'?t)\s+(?:i|you|he|she|it|we|they|this|that|these|those|there|anyone|anybody|someone|somebody|the|a|an|my|your|his|her|their|our|u)\b|any\s*(?:one|body)\s+(?:know|have|tried|else|use))`,
  'iu',
)

/** Does this comment ASK? A question mark of any script anywhere in it, or an
 *  English question opener. An answer, a piece of advice or a compliment is
 *  never a sub-question. Pure. */
export function isQuestionShaped(text: string | null | undefined): boolean {
  const t = (text ?? '').trim()
  return t !== '' && (QUESTION_MARK.test(t) || QUESTION_OPENER.test(t))
}

/** What code chose for the post. */
export interface IdeaPlay {
  format: string | null
  formatMultiple: number | null
  opening: string | null
  openingMultiple: number | null
  length: PostIdeaLength | null
  /** The market's videos on the question it was read over, and how many
   *  carry a comparable response rate. */
  videos: number
  rated: number
}

/** A question conversation handed to the writer. */
export interface IdeaCandidate {
  /** The writer's handle: Q1, Q2 and so on, in rank order. */
  handle: string
  /** `theme_registry.id`. */
  themeId: string
  label: string
  description: string | null
  /** The category's videos on it in the window (`window_theme_readings`). */
  weekVideos: number
  /** …with a citation the lenient gate passes: the rank key. */
  lenientVideos: number
  comments: IdeaComment[]
  /** The comments sent to the writer, and the DISTINCT videos they sit
   *  under: the cover's `asked`, the "of N" a sub-question's videos print
   *  against (a sub-question can only be found among the comments sent). */
  asked: { comments: number; videos: number }
  play: IdeaPlay
  /** `none`, or `unread` where the client's posts could not be read (the
   *  idea stands: nothing says a post answered it). */
  touch: QuestionTouch['state']
}

// ---- The conversations --------------------------------------------------------------

/**
 * Is this a question conversation? Its kind is `question` (Pass B's category),
 * or most of its counted citations in the window are questions (the week
 * pool's `dominantKind`, in videos): a conversation filed under fit or price
 * whose comments this week mostly ASK is as much a question as one filed
 * under questions, and on Össur's corpus most questions are filed under a
 * topic (the 4 to 11 Oct window held two of the first kind and more of the
 * second).
 */
export const isQuestionConversation = (j: Pick<ThemeJudgement, 'theme' | 'dominantKind'>): boolean =>
  j.theme.kind === QUESTION_KIND || j.dominantKind === QUESTION_KIND

/** The question conversations the week pool would take, biggest first. */
export function rankQuestions(judged: readonly ThemeJudgement[]): ThemeJudgement[] {
  return rankEligible(judged.filter(isQuestionConversation))
}

/** One conversation the client's posts already touch, and the posts. */
export interface CoveredQuestion {
  themeId: string
  label: string
  posts: string[]
}

/**
 * The ranked conversations the client's own posts have not touched, at most
 * `cap`, and the ones left out because a post did. `posts` null is "your
 * posts could not be read": nothing is left out on a guess, and each kept
 * conversation says `unread`.
 */
export function untouchedQuestions(
  ranked: readonly ThemeJudgement[],
  posts: readonly QuestionPost[] | null,
  cap = POST_IDEA_CANDIDATES,
): { kept: { judgement: ThemeJudgement; touch: QuestionTouch['state'] }[]; covered: CoveredQuestion[] } {
  const kept: { judgement: ThemeJudgement; touch: QuestionTouch['state'] }[] = []
  const covered: CoveredQuestion[] = []
  for (const j of ranked) {
    const touch = questionTouch({ labels: [j.theme.label], posts })
    if (touch.state === 'touched') {
      covered.push({ themeId: j.theme.themeId, label: j.theme.label, posts: touch.matched.map((m) => m.id) })
      continue
    }
    if (kept.length < cap) kept.push({ judgement: j, touch: touch.state })
  }
  return { kept, covered }
}

// ---- The comments --------------------------------------------------------------------

const clip = (text: string, max: number): string => {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return `${cut.slice(0, sp > max * 0.6 ? sp : max)}…`
}

/**
 * The conversation's question comments in the period, as the writer reads
 * them, without handles. `evidence` may hold other themes' rows: only this
 * theme's member insights are read. Pure.
 */
export function questionComments(
  clientId: string,
  theme: Pick<PoolTheme, 'label' | 'memberIds'>,
  evidence: readonly DatedEvidence[],
  cap = POST_IDEA_COMMENTS_MAX,
): Omit<IdeaComment, 'handle'>[] {
  const members = new Set(theme.memberIds)
  const gate = lenientGateFor(clientId, theme.label)
  // Only a comment that asks, in its own words or its English.
  const counted = evidence.filter((e) => members.has(e.insightId) && countsForTheWeek(e) && judge(e, gate).ok && (isQuestionShaped(e.english) || isQuestionShaped(e.text)))
  // The question-kind ones where they reach as many videos as a conversation
  // needs; otherwise every comment that asks (a price conversation's "how
  // much?" is often filed as buying intent).
  const asking = counted.filter((e) => e.kind === QUESTION_KIND)
  const pool = new Set(asking.map((e) => e.video.uuid)).size >= POOL_MIN_VIDEOS ? asking : counted
  // One row per comment: its best-ranked citation.
  const byComment = new Map<string, DatedEvidence>()
  for (const e of [...pool].sort((a, b) => a.rank - b.rank || a.evidenceId.localeCompare(b.evidenceId))) {
    if (!byComment.has(e.commentId)) byComment.set(e.commentId, e)
  }
  // Round the videos, the most-cited first, so a capped sample reaches as many
  // videos as it can (a sub-question's figure is its videos).
  const byVideo = new Map<string, DatedEvidence[]>()
  for (const e of byComment.values()) byVideo.set(e.video.uuid, [...(byVideo.get(e.video.uuid) ?? []), e])
  const videos = [...byVideo.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  const out: DatedEvidence[] = []
  for (let i = 0; out.length < cap; i++) {
    let more = false
    for (const [, list] of videos) {
      if (i >= list.length) continue
      more = true
      out.push(list[i])
      if (out.length >= cap) break
    }
    if (!more) break
  }
  // The English where it still asks (a translation that dropped the "？"),
  // else the words as written: the writer reads either, and compose checks
  // the very string it was sent.
  return out.map((e) => ({ commentId: e.commentId, videoId: e.video.uuid, text: clip(isQuestionShaped(e.english) ? e.english! : e.text, POST_IDEA_COMMENT_CHARS) }))
}

// ---- The format, the opening, the length ----------------------------------------------

/** A video on the question, as the play reads it. */
export interface PlayVideo extends FormatVideo {
  duration_seconds: number | string | null
}

/** The best group of a reading on at least the floor of rated videos and at
 *  or above the floor multiple: the highest median, then the most rated
 *  videos, then the key. Null where none clears both. */
export function bestRow(
  reading: Pick<FormatReading, 'rows'>,
  opts: { minMultiple?: number; minRated?: number } = {},
): FormatRow | null {
  const minMultiple = opts.minMultiple ?? POST_IDEA_MIN_MULTIPLE
  const minRated = opts.minRated ?? POST_IDEA_MIN_RATED
  return [...reading.rows]
    .filter((r) => r.engagement.median !== null && r.engagement.n >= minRated && r.multiple !== null && r.multiple >= minMultiple)
    .sort((a, b) => (b.engagement.median ?? 0) - (a.engagement.median ?? 0) || b.engagement.n - a.engagement.n || a.key.localeCompare(b.key))[0] ?? null
}

const rateOf = (v: FormatVideo): number | null => {
  if (ENGAGEMENT_EXCLUDED.includes(v.platform)) return null
  const e = Number(v.engagement_rate)
  return Number.isFinite(e) && e > 0 ? e : null
}

/** A length as a post plan states it: to five seconds under a minute, to
 *  fifteen above. */
export function roundSeconds(s: number): number {
  return s < 60 ? Math.max(5, Math.round(s / 5) * 5) : Math.round(s / 15) * 15
}

/**
 * How long the post should run: the middle half (nearest-rank quartiles) of
 * the durations of the short-form videos (`LENGTH_MAX_SECONDS`) on the
 * question that drew at least the typical response on it (`typical`, the
 * question's median), in `format` where at least `LENGTH_MIN_VIDEOS` of them
 * carry a duration, else in any format.
 * Null where too few carry one, or there is no typical response to read
 * against. Pure.
 */
export function ideaLength(videos: readonly PlayVideo[], format: string | null, typical: number | null): PostIdeaLength | null {
  if (typical === null) return null
  const strong = videos.filter((v) => {
    const rate = rateOf(v)
    const d = Number(v.duration_seconds)
    return rate !== null && rate >= typical && Number.isFinite(d) && d > 0 && d <= LENGTH_MAX_SECONDS
  })
  const inFormat = format ? strong.filter((v) => v.classified_type === format) : []
  const [set, basis]: [readonly PlayVideo[], PostIdeaLength['basis']] | [null, null] =
    inFormat.length >= LENGTH_MIN_VIDEOS ? [inFormat, 'format'] : strong.length >= LENGTH_MIN_VIDEOS ? [strong, 'question'] : [null, null]
  if (!set || !basis) return null
  const ds = set.map((v) => Number(v.duration_seconds)).sort((a, b) => a - b)
  const at = (p: number) => ds[Math.min(ds.length - 1, Math.max(0, Math.ceil(p * ds.length) - 1))]
  return { fromSeconds: roundSeconds(at(0.25)), toSeconds: roundSeconds(at(0.75)), videos: set.length, basis }
}

/**
 * The format, the opening and the length for one conversation, from the
 * market's videos on it (`videos`: the caller's set, already the category's).
 * `month` only names the reading; every video is read whenever published.
 * Pure.
 */
export function choosePlay(videos: readonly PlayVideo[], month: string): IdeaPlay {
  const read = (key: 'classified_type' | 'hook_style') =>
    formatReading({ month, audience: INDUSTRY_AUDIENCE, audienceLabel: 'The category', key, videos, published: 'any' })
  const formats = read('classified_type')
  const hooks = read('hook_style')
  const format = bestRow(formats)
  const opening = bestRow(hooks)
  return {
    format: format?.key ?? null,
    formatMultiple: format?.multiple ?? null,
    opening: opening?.key ?? null,
    openingMultiple: opening?.multiple ?? null,
    length: ideaLength(videos, format?.key ?? null, formats.median.value),
    videos: videos.length,
    rated: formats.median.n,
  }
}

// ---- The handles -----------------------------------------------------------------------

/** The candidates in rank order with the writer's handles: Q1… for the
 *  conversations, c1… for the comments, unique across the set. Pure. */
export function withHandles(
  candidates: readonly (Omit<IdeaCandidate, 'handle' | 'comments' | 'asked'> & { comments: Omit<IdeaComment, 'handle'>[] })[],
): IdeaCandidate[] {
  let n = 0
  return candidates.map((c, i) => {
    const comments = c.comments.map((x) => ({ ...x, handle: `c${++n}` }))
    return {
      ...c,
      handle: `Q${i + 1}`,
      comments,
      asked: { comments: comments.length, videos: new Set(comments.map((x) => x.videoId)).size },
    }
  })
}
