import { questionTouch, type QuestionPost, type QuestionTouch } from '../pages/own-post-touch'
import { ENGAGEMENT_EXCLUDED, formatReading, type FormatReading, type FormatRow, type FormatVideo } from '../reading/formats'
import { INDUSTRY_AUDIENCE } from '../rivals'
import { judge, type DatedEvidence } from '../written/evidence'
import { countsForTheWeek, lenientGateFor, rankEligible, type PoolTheme, type ThemeJudgement } from '../written/pool'
import { POST_IDEA_RANKS, type PostIdeaLength } from './types'

// Which question conversations become post ideas, and what code decides about
// each before the writer sees it (depth v2, T13; plan decision 5). PURE: the
// reads are lib/post-ideas/step.ts's.
//
// THE CANDIDATES. The run's question conversations of its own window: themes
// of the run's clustering whose kind is `question` (`theme_observations.category`)
// and that the week pool would take (`rankEligible`, lib/written/pool.ts: at
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
// video) and pass the lenient gate (no brand insider), of question-kind
// insights where it has any: one per comment, at most
// `POST_IDEA_COMMENTS_MAX`, drawn round the videos so the sample reaches as
// many of them as it can. The writer reads them in English where the
// translation cache has it; NOTHING HERE IS STORED: a sub-question keeps
// comment and video ids, and its figure is counted from them.
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
// `POST_IDEA_MIN_MULTIPLE` above it is chosen; none, and the slot is null.

/** At most three ideas a run (the table's ranks). */
export const POST_IDEAS_MAX = POST_IDEA_RANKS.length
/** Conversations handed to the writer: one spare. */
export const POST_IDEA_CANDIDATES = POST_IDEAS_MAX + 1
/** Question comments a conversation shows the writer. */
export const POST_IDEA_COMMENTS_MAX = 40
/** A comment's words as the writer reads them, at most. */
export const POST_IDEA_COMMENT_CHARS = 280
/** The writer's sub-questions an idea keeps, biggest first. */
export const POST_IDEA_SUBQUESTIONS_MAX = 5
/** A format or opening is suggested only at this multiple or above. */
export const POST_IDEA_MIN_MULTIPLE = 1.1
/** Durations a length is read off, at least. */
export const LENGTH_MIN_VIDEOS = 3
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
  /** The English where the translation cache has it, else as written. */
  text: string
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
  /** What the comments sent cover (the cover's `asked`). */
  asked: { comments: number; videos: number }
  play: IdeaPlay
  /** `none`, or `unread` where the client's posts could not be read (the
   *  idea stands: nothing says a post answered it). */
  touch: QuestionTouch['state']
}

// ---- The conversations --------------------------------------------------------------

/** The question conversations the week pool would take, biggest first. */
export function rankQuestions(judged: readonly ThemeJudgement[]): ThemeJudgement[] {
  return rankEligible(judged.filter((j) => j.theme.kind === QUESTION_KIND))
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
  const counted = evidence.filter((e) => members.has(e.insightId) && countsForTheWeek(e) && judge(e, gate).ok && (e.english ?? e.text).trim() !== '')
  const asking = counted.filter((e) => e.kind === QUESTION_KIND)
  const pool = asking.length > 0 ? asking : counted
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
  return out.map((e) => ({ commentId: e.commentId, videoId: e.video.uuid, text: clip(e.english ?? e.text, POST_IDEA_COMMENT_CHARS) }))
}

// ---- The format, the opening, the length ----------------------------------------------

/** A video on the question, as the play reads it. */
export interface PlayVideo extends FormatVideo {
  duration_seconds: number | string | null
}

/** The best group of a reading at or above the floor multiple: the highest
 *  median, then the most rated videos, then the key. Null where none clears. */
export function bestRow(reading: Pick<FormatReading, 'rows'>, minMultiple = POST_IDEA_MIN_MULTIPLE): FormatRow | null {
  return [...reading.rows]
    .filter((r) => r.engagement.median !== null && r.multiple !== null && r.multiple >= minMultiple)
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
 * the durations of the videos on the question that drew at least the typical
 * response on it (`typical`, the question's median), in `format` where at
 * least `LENGTH_MIN_VIDEOS` of them carry a duration, else in any format.
 * Null where too few carry one, or there is no typical response to read
 * against. Pure.
 */
export function ideaLength(videos: readonly PlayVideo[], format: string | null, typical: number | null): PostIdeaLength | null {
  if (typical === null) return null
  const strong = videos.filter((v) => {
    const rate = rateOf(v)
    const d = Number(v.duration_seconds)
    return rate !== null && rate >= typical && Number.isFinite(d) && d > 0
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
