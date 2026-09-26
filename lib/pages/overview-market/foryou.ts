import type { FigureTable } from '../../reading/verdicts'
import type { SubjectCalibrationWord } from './subjects'

// What it means for you, and what you published (market-first WP2.5; plan
// §2.2 blocks 7 and 8; §4.2 `ForYouBlock`).
//
// COUNTED LINE-UPS, NEVER ADVICE. Each line puts something the market said
// beside what Sealand has: its own posts, the talk under them. Advice stays in
// the ledger (real-volume graft 6); no market row gets a "you" column
// (heinrich-fidelity); and no line rests on a provisional subject's client
// level (decision C): the questions line is the MARKET's count beside your
// posts, and the followers line prints only for a ready subject.
//
// EVERY SENTENCE IS CODE'S (`FOR_YOU_SENTENCES`, `[[token]]` figures), and each
// line lists the posts it matched and on which words, so a "none" can be
// checked (DF risk 5). A post touches a question on two or more non-generic
// words (`postsSharing`, lib/pages/subjects.ts). No direction word anywhere.
//
// "The subjects picked for you", never "the subjects you follow" (G).
//
// PURE. The loader reads the posts, the questions and the census.

/** One line: its kind, its figures, the sentence it prints (by key), the posts
 *  that matched and on which words. §4.2's four fields, plus what the line is
 *  about (`label`, a subject's name or a theme's label, which is a model's
 *  words), the subject's calibration where it is one, and the words a post had
 *  to share (`checked`), so a line with no match still says what was checked.
 *  The last three are additive. */
export interface ForYouLine {
  kind: 'followers' | 'unanswered' | 'lead_touch'
  figures: FigureTable
  sentenceKey: string
  matchedPosts: { id: string; words: string[] }[]
  label?: string
  labelKind?: 'subject' | 'theme'
  calibration?: SubjectCalibrationWord
  checked?: string[]
}

export interface ForYouBlock {
  month: string
  lines: ForYouLine[]
}

/** The lines' sentences, by `sentenceKey`. Code's words; each figure a
 *  `[[token]]` its line's table holds. One base per sentence. */
export const FOR_YOU_SENTENCES: Readonly<Record<string, string>> = {
  'foryou.unanswered.none':
    'Your market asked about it on [[foryou_asked]] videos over the last 3 months. None of your [[foryou_posts]] posts in that time shared two or more of its words.',
  'foryou.unanswered.some':
    'Your market asked about it on [[foryou_asked]] videos over the last 3 months. [[foryou_touched]] of your [[foryou_posts]] posts in that time shared two or more of its words.',
  'foryou.lead_touch.none':
    'The market’s biggest conversation with few makers. None of your [[foryou_posts]] posts from the month shared two or more of its words.',
  'foryou.lead_touch.some':
    'The market’s biggest conversation with few makers. [[foryou_touched]] of your [[foryou_posts]] posts from the month shared two or more of its words.',
  // A tenant with no maker rule (Össur): the lead is the biggest conversation,
  // and nothing was measured about makers, so the line claims nothing about them.
  'foryou.lead_biggest.none':
    'The market’s biggest conversation. None of your [[foryou_posts]] posts from the month shared two or more of its words.',
  'foryou.lead_biggest.some':
    'The market’s biggest conversation. [[foryou_touched]] of your [[foryou_posts]] posts from the month shared two or more of its words.',
  'foryou.followers':
    'The subject picked for you that your followers talked about most: [[foryou_touched]] of your [[foryou_posts]] posts with a reading.',
}

/** How many of the checked words a line prints before "…". */
export const CHECKED_SHOWN = 4

/** A post, as the lines match it. */
export interface ForYouPost {
  id: string
  topics: readonly string[] | null
}

/** What a post had to share, and which did (`postsSharing`). */
export interface Sharing {
  checked: string[]
  matched: { id: string; words: string[] }[]
}

/**
 * The block's lines, in the preview's order: the subject the market asked
 * about most over three months, then the lead theme, then (a ready subject
 * only) the subject your followers talked about most.
 *
 *   questions  the subject with the most question videos over the last three
 *              months (not being re-described), its count, your posts over the
 *              same months and which of them shared two or more words with any
 *              of its question groups. Absent where no subject was asked about.
 *   lead       the front page's lead theme (a quarter makers or fewer) against
 *              your posts in the reading month. Absent with no lead, or no post.
 *   followers  the subject your own posts' comments matched most, printed only
 *              when that subject is ready (decision C): a provisional subject's
 *              followers stay in "What you published" as their themes.
 */
export function buildForYou(input: {
  month: string
  questions: {
    subject: { id: string; name: string; calibration: SubjectCalibrationWord }
    asked: number
    posts: number
    sharing: Sharing
  } | null
  /** `fewMakers`: the lead was chosen on a measured maker share (a quarter
   *  or fewer); false for a tenant with no maker rule, whose lead is simply
   *  the biggest conversation. */
  lead: { label: string; posts: number; sharing: Sharing; fewMakers?: boolean } | null
  followers: { subject: { id: string; name: string; calibration: SubjectCalibrationWord }; k: number; n: number } | null
}): ForYouBlock {
  const lines: ForYouLine[] = []
  const q = input.questions
  if (q && q.asked > 0 && q.subject.calibration !== 'failed') {
    const touched = q.sharing.matched.length
    lines.push({
      kind: 'unanswered',
      sentenceKey: touched === 0 ? 'foryou.unanswered.none' : 'foryou.unanswered.some',
      figures: {
        foryou_asked: { value: q.asked, unit: 'videos', label: `videos your market asked about ${q.subject.name} on, over the last 3 months` },
        foryou_posts: { value: q.posts, unit: 'videos', label: 'your posts over the last 3 months' },
        foryou_touched: { value: touched, unit: 'videos', label: `your posts sharing two or more of its words` },
      },
      matchedPosts: q.sharing.matched,
      label: q.subject.name,
      labelKind: 'subject',
      calibration: q.subject.calibration,
      checked: q.sharing.checked,
    })
  }
  const l = input.lead
  if (l && l.posts > 0) {
    const touched = l.sharing.matched.length
    lines.push({
      kind: 'lead_touch',
      sentenceKey: `foryou.${l.fewMakers === false ? 'lead_biggest' : 'lead_touch'}.${touched === 0 ? 'none' : 'some'}`,
      figures: {
        foryou_posts: { value: l.posts, unit: 'videos', label: 'your posts in the month' },
        foryou_touched: { value: touched, unit: 'videos', label: 'your posts sharing two or more of its words' },
      },
      matchedPosts: l.sharing.matched,
      label: l.label,
      labelKind: 'theme',
      checked: l.sharing.checked,
    })
  }
  const f = input.followers
  if (f && f.subject.calibration === 'ready' && f.k > 0 && f.n > 0) {
    lines.push({
      kind: 'followers',
      sentenceKey: 'foryou.followers',
      figures: {
        foryou_posts: { value: f.n, unit: 'videos', label: 'your posts with a reading' },
        foryou_touched: { value: f.k, unit: 'videos', label: `your posts whose comments were about ${f.subject.name}` },
      },
      matchedPosts: [],
      label: f.subject.name,
      labelKind: 'subject',
      calibration: f.subject.calibration,
    })
  }
  return { month: input.month, lines }
}

/** The words a line prints under its sentence: the words each matching post
 *  shared, or, where none matched, the words that were checked ("checked:
 *  waterproof · rain · zip · …"). */
export function forYouWords(line: Pick<ForYouLine, 'matchedPosts' | 'checked'>): { matched: boolean; words: string[]; more: boolean } {
  const matched = [...new Set(line.matchedPosts.flatMap((p) => p.words))]
  if (matched.length > 0) return { matched: true, words: matched, more: false }
  const checked = line.checked ?? []
  return { matched: false, words: checked.slice(0, CHECKED_SHOWN), more: checked.length > CHECKED_SHOWN }
}

// ---- What you published (plan §2.2 block 8) --------------------------------

/**
 * The posts census (§2.2 row 8's print: "20 posts in September (30 in August)
 * · 10 drew 5 or more comments · 9 carry a reading, 234 comments · your
 * followers talked most about … · Moves: none dated yet"). The monthly's
 * `MonthlyPublished` is this shape.
 */
export interface PublishedCensus {
  month: string
  /** Your posts published in the month (by the day posted). */
  posts: number
  /** The same, the month before; null where it was not read. */
  prevPosts: number | null
  /** Of `posts`, those with `COMMENT_FLOOR` comments or more. */
  drewFive: number
  /** Your audience's videos read in the month (its denominator row): the
   *  posts that carry a reading, and their comments dated in the month. Null
   *  where the month holds no row for your audience: not read, never 0. */
  withReading: number | null
  readingComments: number | null
  /** What your followers talked about most: your audience's themes in the
   *  month, by videos, largest first (model labels). */
  followers: { label: string; k: number }[]
  /** Moves dated on this workspace. */
  movesDated: number
}

/** A post "drew" comments at this many (§2.2's "drew 5 or more"). */
export const COMMENT_FLOOR = 5
/** The followers' themes the census lists (§2.2 prints three). */
export const FOLLOWERS_SHOWN = 3
/** A theme heard on one video is kept for the record and never "talked
 *  about most" (How to read's rule for themes). */
export const FOLLOWERS_MIN_K = 2

export function buildPublished(input: {
  month: string
  posts: readonly { uploadDate: string | null; commentsCount: number | null }[]
  prevPosts: number | null
  audience: { videos: number; comments: number } | null
  themes: readonly { label: string; k: number }[]
  movesDated: number
}): PublishedCensus {
  return {
    month: input.month,
    posts: input.posts.length,
    prevPosts: input.prevPosts,
    drewFive: input.posts.filter((p) => (p.commentsCount ?? 0) >= COMMENT_FLOOR).length,
    withReading: input.audience?.videos ?? null,
    readingComments: input.audience?.comments ?? null,
    followers: [...input.themes]
      .filter((t) => t.k >= FOLLOWERS_MIN_K)
      .sort((a, b) => b.k - a.k || a.label.localeCompare(b.label))
      .slice(0, FOLLOWERS_SHOWN),
    movesDated: input.movesDated,
  }
}
