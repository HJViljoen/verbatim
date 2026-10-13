import { describe, expect, it } from 'vitest'
import { engageDeepLink, engageUnder, engageVocab, loadEngageCandidates, rankEngageCandidates, type EngageCandidate } from './engage'
import { fakeDb } from './test/fake-db'

const WINDOW = '2026-08-02T00:00:00Z'

let n = 0
function cand(over: {
  category?: string
  strength?: number | null
  likes?: number
  commentDate?: string | null
  videoUrl?: string | null
  commentId?: string
  text?: string
}): EngageCandidate {
  n++
  return {
    insightId: `i${n}`,
    evidenceId: `e${n}`,
    category: over.category ?? 'question',
    strength: over.strength === undefined ? 5 : over.strength,
    theme: 'theme',
    comment: {
      id: over.commentId ?? `c${n}`,
      author: 'a',
      text: over.text ?? 'where can i actually buy one of these',
      likes: over.likes ?? 0,
      commentDate: over.commentDate === undefined ? '2026-08-05T10:00:00Z' : over.commentDate,
      platform: 'tiktok',
      videoUrl: over.videoUrl === undefined ? `https://t.example/${n}` : over.videoUrl,
      account: null,
      platformCommentId: `p${n}`,
    },
  }
}

describe('rankEngageCandidates', () => {
  it('hard-drops comments outside the window and undated ones', () => {
    const out = rankEngageCandidates(
      [
        cand({ commentDate: '2026-07-20T00:00:00Z', likes: 500 }),
        cand({ commentDate: null, likes: 500 }),
        cand({ commentDate: '2026-08-05T00:00:00Z' }),
      ],
      { windowStart: WINDOW },
    )
    expect(out).toHaveLength(1)
    expect(out[0].comment.commentDate).toBe('2026-08-05T00:00:00Z')
  })

  it('drops a comment written after the window END, but only where a caller passes one', () => {
    // A run's window is frozen at `open-run` and gather runs after it, so a
    // comment written between `window_end` and the run completing is gathered
    // and cited. This week states `[window_start, window_end)` as the rows'
    // basis ("written 6 Sep – 13 Sep"), so it passes the closed half; Content
    // makes no such claim and passes nothing, and its digest must not change.
    const inside = cand({ commentDate: '2026-08-05T00:00:00Z' })
    const after = cand({ commentDate: '2026-08-12T00:00:00Z' })
    const closed = rankEngageCandidates([inside, after], { windowStart: WINDOW, windowEnd: '2026-08-09T00:00:00Z' })
    expect(closed).toHaveLength(1)
    expect(closed[0].comment.commentDate).toBe('2026-08-05T00:00:00Z')
    // Half-open at the far end too: a comment written AT window_end is out.
    expect(rankEngageCandidates([after], { windowStart: WINDOW, windowEnd: '2026-08-12T00:00:00Z' })).toHaveLength(0)
    // And with no upper bound the old behaviour stands, unchanged.
    expect(rankEngageCandidates([inside, after], { windowStart: WINDOW })).toHaveLength(2)
  })

  it('category priority beats strength and likes — a viral question cannot outrank purchase intent', () => {
    const viral = cand({ category: 'question', strength: 9, likes: 6128 })
    const intent = cand({ category: 'purchase_intent', strength: 4, likes: 1 })
    const out = rankEngageCandidates([viral, intent], { windowStart: WINDOW })
    expect(out[0]).toBe(intent)
  })

  it('within a category, strength beats likes; likes only tiebreak', () => {
    const liked = cand({ strength: 5, likes: 6128 })
    const strong = cand({ strength: 9, likes: 0 })
    const tiebreak = cand({ strength: 5, likes: 3 })
    const out = rankEngageCandidates([liked, tiebreak, strong], { windowStart: WINDOW })
    expect(out.map((c) => c.insightId)).toEqual([strong.insightId, liked.insightId, tiebreak.insightId])
  })

  it('dedupes per comment and caps two per video', () => {
    const url = 'https://t.example/same'
    const a = cand({ videoUrl: url, commentId: 'same-comment' })
    const b = cand({ videoUrl: url, commentId: 'same-comment' })
    const c = cand({ videoUrl: url })
    const d = cand({ videoUrl: url })
    const out = rankEngageCandidates([a, b, c, d], { windowStart: WINDOW })
    expect(out).toHaveLength(2)
  })

  it('hard-drops non-English and too-short comments — the digest must be actionable', () => {
    const chinese = cand({ text: '好好看👍❤期待第八季🎉🎉🎉', likes: 900 })
    const short = cand({ text: 'yes!!' })
    const real = cand({ text: 'does this work for above-knee amputees too?' })
    const out = rankEngageCandidates([chinese, short, real], { windowStart: WINDOW })
    expect(out).toHaveLength(1)
    expect(out[0]).toBe(real)
  })

  it('on-topic gate: pollution-video candidates drop, oblique-but-on-market ones stay', () => {
    const vocab = engageVocab([['ossur'], ['ottobock'], ['prosthetic leg', 'amputee', '#runningblade']])
    const junk = cand({ category: 'purchase_intent', strength: 9 })
    junk.theme = 'Game item giveaway requests'
    junk.videoTopics = ['gaming', 'Blox Fruits PvP', 'rage quit']
    const genuine = cand({ category: 'question', strength: 5 })
    genuine.theme = 'Fit and comfort questions'
    genuine.videoTopics = ['amputee', 'dancing', 'balance']
    const out = rankEngageCandidates([junk, genuine], { windowStart: WINDOW, vocab })
    expect(out).toHaveLength(1)
    expect(out[0]).toBe(genuine)
    // No vocab configured → gate off, both survive.
    expect(rankEngageCandidates([junk, genuine], { windowStart: WINDOW })).toHaveLength(2)
  })

  it('applies per-category and total caps', () => {
    const qs = Array.from({ length: 5 }, () => cand({ category: 'question' }))
    const pis = Array.from({ length: 5 }, () => cand({ category: 'purchase_intent' }))
    const out = rankEngageCandidates([...qs, ...pis], { windowStart: WINDOW, perCategoryCap: 3, totalCap: 4 })
    expect(out).toHaveLength(4)
    expect(out.filter((c) => c.category === 'purchase_intent')).toHaveLength(3)
    expect(out.filter((c) => c.category === 'question')).toHaveLength(1)
  })
})

describe('engageDeepLink', () => {
  it('deep-links to the comment on YouTube, the post elsewhere, nothing without a URL', () => {
    const yt = cand({ videoUrl: 'https://www.youtube.com/watch?v=x' })
    yt.comment.platform = 'youtube'
    expect(engageDeepLink(yt.comment)).toEqual({
      href: `https://www.youtube.com/watch?v=x&lc=${yt.comment.platformCommentId}`,
      commentLevel: true,
    })
    const tt = cand({ videoUrl: 'https://t.example/v' })
    expect(engageDeepLink(tt.comment)).toEqual({ href: 'https://t.example/v', commentLevel: false })
    const none = cand({ videoUrl: null })
    expect(engageDeepLink(none.comment)).toEqual({ href: null, commentLevel: false })
  })
})

describe('engageUnder — under your post, or under a video that names you (T14)', () => {
  it('is your post only when it came off your own account', () => {
    expect(engageUnder({ source: 'owned', is_client: true })).toBe('own_post')
    expect(engageUnder({ source: 'owned', is_client: false })).toBe('own_post')
    expect(engageUnder({ source: 'discovered', is_client: true })).toBe('names_you')
    expect(engageUnder({ source: 'discovered', is_client: false })).toBe('elsewhere')
    expect(engageUnder({ source: 'competitor_owned', is_client: false })).toBe('elsewhere')
  })
})

describe('loadEngageCandidates — each candidate says whose video it sits under', () => {
  const CLIENT = 'c1'
  const video = (id: string, over: Record<string, unknown>) => ({
    id: `row-${id}`, client_id: CLIENT, video_id: id, platform: 'instagram', video_url: `https://instagram.com/p/${id}`,
    account_name: 'someone', topics: ['prosthetic knee'], source: 'discovered', is_client: false, ...over,
  })
  const comment = (id: string, videoId: string) => ({
    id, author: '@asker', text: 'Where can I get fitted for one of these?', likes: 2,
    comment_date: '2026-10-08T10:00:00Z', platform: 'instagram', video_id: videoId, comment_id: `native-${id}`,
  })

  it('splits a post off your account from a creator’s video naming you', async () => {
    const db = fakeDb({
      audience_insights_current: [{ id: 'ins-1', client_id: CLIENT, category: 'question', theme: 'fitting', description: 'Where to get fitted', strength_score: 8 }],
      insight_evidence: [
        { id: 'ev-own', audience_insight_id: 'ins-1', comment_id: 'cm-own', source: 'comment' },
        { id: 'ev-about', audience_insight_id: 'ins-1', comment_id: 'cm-about', source: 'comment' },
        { id: 'ev-cat', audience_insight_id: 'ins-1', comment_id: 'cm-cat', source: 'comment' },
        { id: 'ev-gone', audience_insight_id: 'ins-1', comment_id: 'cm-gone', source: 'comment' },
      ],
      comments: [comment('cm-own', 'own'), comment('cm-about', 'review'), comment('cm-cat', 'cat'), comment('cm-gone', 'unread')],
      videos: [
        video('own', { account_name: 'ossur', source: 'owned', is_client: true }),
        video('review', { account_name: 'amputee.coach', is_client: true }),
        video('cat', { account_name: 'limbdiaries' }),
      ],
    })
    const out = await loadEngageCandidates(db.client as never, CLIENT, 'run-1')
    const under = Object.fromEntries(out.map((c) => [c.evidenceId, c.comment.under]))
    expect(under).toEqual({ 'ev-own': 'own_post', 'ev-about': 'names_you', 'ev-cat': 'elsewhere', 'ev-gone': null })
    expect(db.calls.find((c) => c.table === 'videos')?.columns).toContain('source, is_client')
  })
})

// THE WINDOWED READ (Phase 4 fix round): Content's reply list read every
// current engage insight's evidence, then every cited comment by id, on every
// view (Sealand's Content load: 143 statements, 99 of them these two stages).
// With a window it reads each chunk's evidence with its comment embedded and
// bounded by the window, one statement a chunk, and must hand back exactly
// the candidates the unbounded read gives inside the window, in the same order
// (the ranking's ties keep their input order).
describe('loadEngageCandidates: the windowed read', () => {
  const CLIENT = 'c1'
  const SINCE = '2026-10-04T04:03:00.000Z'
  const BEFORE = '2026-10-11T04:02:00.000Z'
  function tables() {
    const videos = Array.from({ length: 40 }, (_, i) => ({
      id: `vrow-${i}`, client_id: CLIENT, video_id: `nv${i}`, platform: ['tiktok', 'instagram'][i % 2], video_url: `https://x.example/${i}`,
      account_name: `acct${i}`, topics: ['prosthetic knee'], source: 'discovered', is_client: false,
    }))
    const insights: Record<string, unknown>[] = []
    const evidence: Record<string, unknown>[] = []
    const comments: Record<string, unknown>[] = []
    let j = 0
    for (let i = 0; i < 600; i++) {
      // Ids that do not sort with the insight order, so the chunking shows.
      insights.push({ id: `ins-${String((i * 37) % 600).padStart(4, '0')}`, client_id: CLIENT, category: 'question', theme: 'fitting', description: 'd', strength_score: (i % 3) + 1 })
      for (let k = 0; k < 2 + (i % 2); k++, j++) {
        const r = (j * 7919) % 100
        const date = r < 8 ? `2026-10-0${5 + (r % 4)}T10:00:00Z` : r < 10 ? '2026-10-11T09:00:00Z' : `2026-0${6 + (r % 3)}-1${r % 9}T10:00:00Z`
        comments.push({ id: `cm-${j}`, client_id: CLIENT, author: '@a', text: 'Where can I get fitted for one of these knees?', likes: j % 3, comment_date: date, platform: videos[j % 40].platform, video_id: videos[j % 40].video_id, comment_id: `n${j}` })
        evidence.push({ id: `ev-${String((j * 53) % 2000).padStart(5, '0')}-${j}`, audience_insight_id: insights[i].id, comment_id: `cm-${j}`, source: 'comment' })
      }
    }
    return { audience_insights_current: insights, insight_evidence: evidence, comments, videos }
  }

  it('gives the unbounded read\'s candidates inside the window, in its order, from far fewer statements', async () => {
    const all = fakeDb(tables())
    const unbounded = await loadEngageCandidates(all.client as never, CLIENT, 'run-1', {})
    const inWindow = unbounded.filter((c) => c.comment.commentDate! >= SINCE && c.comment.commentDate! < BEFORE)
    const windowed = fakeDb(tables())
    const got = await loadEngageCandidates(windowed.client as never, CLIENT, 'run-1', { commentsSince: SINCE, commentsBefore: BEFORE })
    expect(inWindow.length).toBeGreaterThan(20)
    expect(got.map((c) => c.evidenceId)).toEqual(inWindow.map((c) => c.evidenceId))
    expect(got.map((c) => c.comment.videoRowId)).toEqual(inWindow.map((c) => c.comment.videoRowId))
    expect(got.every((c) => c.comment.videoRowId?.startsWith('vrow-'))).toBe(true)
    // No comment is read by id; each chunk is one statement with its comment.
    const count = (db: ReturnType<typeof fakeDb>, t: string) => db.calls.filter((c) => c.table === t).length
    expect(count(windowed, 'comments')).toBe(0)
    expect(count(windowed, 'insight_evidence')).toBe(3) // 600 insights at 250 a chunk
    expect(count(all, 'insight_evidence') + count(all, 'comments')).toBeGreaterThan(20)
    expect(windowed.calls.find((c) => c.table === 'insight_evidence')?.columns).toContain('comments!inner(')
  })

  it('a lower bound alone reads to the present, as before', async () => {
    const db = fakeDb(tables())
    const got = await loadEngageCandidates(db.client as never, CLIENT, 'run-1', { commentsSince: SINCE })
    expect(got.some((c) => c.comment.commentDate! >= BEFORE)).toBe(true)
    expect(got.every((c) => c.comment.commentDate! >= SINCE)).toBe(true)
  })
})
