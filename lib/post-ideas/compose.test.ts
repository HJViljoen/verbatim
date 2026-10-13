import { describe, expect, it } from 'vitest'

import { composePostIdeas, postIdeaRows, subquestionsOf } from './compose'
import type { IdeaCandidate, IdeaPlay } from './select'
import { parsePostIdeaRow, subquestionCounts } from './types'
import type { PostIdeasOutput } from './write'

// The writer's words made into stored ideas (T13): code's rank, code's
// counts, the writer's words after the scrub.

const PLAY: IdeaPlay = {
  format: 'tutorial', formatMultiple: 2.1, opening: 'question', openingMultiple: 1.8,
  length: { fromSeconds: 30, toSeconds: 45, videos: 6, basis: 'format' }, videos: 40, rated: 31,
}

const candidate = (n: number, comments: [string, string][], over: Partial<IdeaCandidate> = {}): IdeaCandidate => ({
  handle: `Q${n}`,
  themeId: `th-${n}`,
  label: `Questions ${n}`,
  description: null,
  weekVideos: 10,
  lenientVideos: 8,
  comments: comments.map(([handle, videoId], i) => ({ handle, commentId: `${handle}-id`, videoId, text: `comment ${n}.${i}` })),
  asked: { comments: comments.length, videos: new Set(comments.map(([, v]) => v)).size },
  play: PLAY,
  touch: 'none',
  ...over,
})

const LINER = candidate(1, [['c1', 'v1'], ['c2', 'v2'], ['c3', 'v2'], ['c4', 'v3'], ['c5', 'v4']])
const INSURANCE = candidate(2, [['c6', 'v5'], ['c7', 'v6']], { play: { ...PLAY, format: null, formatMultiple: null, length: null } })
const WET = candidate(3, [['c8', 'v7'], ['c9', 'v8']])
const SPARE = candidate(4, [['c10', 'v9']])

const WORD: Record<string, string> = { Q1: 'liners', Q2: 'insurance', Q3: 'water', Q4: 'sockets' }
const written = (handle: string, over: Partial<PostIdeasOutput['ideas'][number]> = {}): PostIdeasOutput['ideas'][number] => ({
  question: handle,
  title: `What about ${WORD[handle]}?`,
  cover: `What a post on ${WORD[handle]} explains and shows`,
  subquestions: [],
  ...over,
})

describe('subquestionsOf: labels over this conversation\'s comments, counted from the ids', () => {
  it('maps handles to comment and video ids, each comment once, biggest first by videos', () => {
    const { subquestions } = subquestionsOf(LINER, [
      { label: 'The signs it is worn out', comments: ['c4'] },
      { label: 'How long it should last', comments: ['c1', 'c2', 'c3'] },
      { label: 'Whether liners differ', comments: ['c3', 'c5'] },
    ])
    expect(subquestions.map((s) => s.label)).toEqual(['How long it should last', 'The signs it is worn out', 'Whether liners differ'])
    expect(subquestions[0]).toEqual({ label: 'How long it should last', commentIds: ['c1-id', 'c2-id', 'c3-id'], videoIds: ['v1', 'v2'] })
    // c3 went to the first label that named it.
    expect(subquestions[2].commentIds).toEqual(['c5-id'])
    expect(subquestions.map((s) => subquestionCounts(s).videos)).toEqual([2, 1, 1])
  })

  it('drops a handle the writer invented or took from another conversation, and a label left with none', () => {
    const { subquestions } = subquestionsOf(LINER, [
      { label: 'Whether insurance pays', comments: ['c6', 'c99'] },
      { label: 'How long it should last', comments: ['C1', ' c2 '] },
    ])
    expect(subquestions).toEqual([{ label: 'How long it should last', commentIds: ['c1-id', 'c2-id'], videoIds: ['v1', 'v2'] }])
  })

  it('merges two labels that read the same, scrubs every label, and keeps at most five', () => {
    const { subquestions, scrub } = subquestionsOf(LINER, [
      { label: 'How long it lasts', comments: ['c1'] },
      { label: 'how long it lasts.', comments: ['c2'] },
      { label: 'Silicone heals sores', comments: ['c3'] },
    ])
    expect(subquestions).toEqual([{ label: 'How long it lasts', commentIds: ['c1-id', 'c2-id'], videoIds: ['v1', 'v2'] }])
    expect(scrub.droppedMedical).toBe(1)
    const six = subquestionsOf(LINER, ['a', 'b', 'c', 'd', 'e'].map((x, i) => ({ label: `Topic ${x}`, comments: [`c${i + 1}`] })).concat([{ label: 'Topic f', comments: ['c9'] }]))
    expect(six.subquestions).toHaveLength(5)
  })
})

describe('composePostIdeas', () => {
  it('ranks the ideas in code\'s order, whatever order the writer answered in, and stops at three', () => {
    const out = composePostIdeas([LINER, INSURANCE, WET, SPARE], { ideas: [written('Q3'), written('Q4'), written('Q1'), written('Q2')] })
    expect(out.ideas.map((i) => [i.rank, i.registryId])).toEqual([[1, 'th-1'], [2, 'th-2'], [3, 'th-3']])
    expect(out.held).toEqual([])
  })

  it('holds a conversation the writer skipped, or whose title or cover the scrub emptied, and the next takes its rank', () => {
    const out = composePostIdeas([LINER, INSURANCE, WET, SPARE], {
      ideas: [
        written('Q1', { cover: 'Silicone liners prevent skin irritation.' }),
        written('Q3', { title: 'Liners last 6 months?' }),
        written('Q4'),
      ],
    })
    expect(out.ideas.map((i) => [i.rank, i.registryId])).toEqual([[1, 'th-4']])
    expect(out.held).toEqual([
      { question: 'Q1', label: 'Questions 1', reason: 'cover held (effect on the body)' },
      { question: 'Q2', label: 'Questions 2', reason: 'not written' },
      { question: 'Q3', label: 'Questions 3', reason: 'title held' },
    ])
  })

  it('holds a second idea that asks the same question as an earlier one', () => {
    const out = composePostIdeas([LINER, INSURANCE], { ideas: [written('Q1', { title: 'How long does a liner last?' }), written('Q2', { title: 'How long does a liner last' })] })
    expect(out.ideas).toHaveLength(1)
    expect(out.held[0].reason).toBe('the same question as Q1')
  })

  it('puts code\'s length and what was asked in the cover, and the format and opening beside it, null where code chose none', () => {
    const out = composePostIdeas([LINER, INSURANCE], { ideas: [written('Q1'), written('Q2')] })
    expect(out.ideas[0].cover).toEqual({ text: 'What a post on liners explains and shows', length: PLAY.length, asked: { comments: 5, videos: 4 } })
    expect(out.ideas[1].cover).toEqual({ text: 'What a post on insurance explains and shows', asked: { comments: 2, videos: 2 } })
    expect([out.ideas[0].format, out.ideas[0].formatMultiple, out.ideas[0].opening]).toEqual(['tutorial', 2.1, 'question'])
    expect([out.ideas[1].format, out.ideas[1].formatMultiple]).toEqual([null, null])
  })

  it('writes nothing where the writer gave nothing', () => {
    expect(composePostIdeas([LINER], null).ideas).toEqual([])
  })
})

describe('postIdeaRows: what the step upserts', () => {
  it('is a row per idea that the reader parses back, with no comment words in it', () => {
    const out = composePostIdeas([LINER, INSURANCE, WET], {
      ideas: [
        written('Q1', { subquestions: [{ label: 'How long it should last', comments: ['c1', 'c2'] }] }),
        written('Q2'),
        written('Q3'),
      ],
    })
    const rows = postIdeaRows({ clientId: 'client', runId: 'run', window: { from: '2026-10-05T00:00:00Z', to: '2026-10-12T00:00:00Z' }, ideas: out.ideas, model: 'gpt-5.4', promptVersion: 'post_ideas_v1' })
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3])
    const parsed = parsePostIdeaRow({ ...rows[0], id: 'id-1', created_at: '2026-10-12T08:00:00Z' })
    expect(parsed?.subquestions).toEqual([{ label: 'How long it should last', commentIds: ['c1-id', 'c2-id'], videoIds: ['v1', 'v2'] }])
    expect(parsed?.cover.length).toEqual(PLAY.length)
    expect(JSON.stringify(rows)).not.toMatch(/comment \d/)
    // The CHECK: a format and its multiple are both set or both null.
    expect([rows[1].format, rows[1].format_multiple]).toEqual([null, null])
  })
})
