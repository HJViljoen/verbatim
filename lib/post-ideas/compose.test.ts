import { describe, expect, it } from 'vitest'

import { composePostIdeas, copiesAComment, COPY_MIN_WORDS, postIdeaRows, subquestionsOf } from './compose'
import { POST_IDEA_MIN_COMMENTS, POST_IDEA_MIN_VIDEOS } from './select'
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
  comments: comments.map(([handle, videoId], i) => ({ handle, commentId: `${handle}-id`, videoId, text: `Does question ${n} part ${i} have an answer?` })),
  asked: { comments: comments.length, videos: new Set(comments.map(([, v]) => v)).size },
  play: PLAY,
  touch: 'none',
  ...over,
})

const LINER = candidate(1, [['c1', 'v1'], ['c2', 'v2'], ['c3', 'v2'], ['c4', 'v3'], ['c5', 'v4']])
const INSURANCE = candidate(2, [['c6', 'v5'], ['c7', 'v6'], ['c11', 'v6']], { play: { ...PLAY, format: null, formatMultiple: null, length: null } })
const WET = candidate(3, [['c8', 'v7'], ['c9', 'v8'], ['c12', 'v8']])
const SPARE = candidate(4, [['c10', 'v9'], ['c13', 'v9'], ['c14', 'v10']])

const WORD: Record<string, string> = { Q1: 'liners', Q2: 'insurance', Q3: 'water', Q4: 'sockets' }
/** Each conversation's comments, three or more across two videos or more:
 *  the evidence floor. */
const ALL: Record<string, string[]> = { Q1: ['c1', 'c2', 'c3', 'c4', 'c5'], Q2: ['c6', 'c7', 'c11'], Q3: ['c8', 'c9', 'c12'], Q4: ['c10', 'c13', 'c14'] }
const written = (handle: string, over: Partial<PostIdeasOutput['ideas'][number]> = {}): PostIdeasOutput['ideas'][number] => ({
  question: handle,
  title: `What about ${WORD[handle]}?`,
  cover: `What a post on ${WORD[handle]} explains and shows`,
  subquestions: [{ label: `Questions on ${WORD[handle]}`, comments: ALL[handle] }],
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
    expect(out.ideas[1].cover).toEqual({ text: 'What a post on insurance explains and shows', asked: { comments: 3, videos: 2 } })
    expect([out.ideas[0].format, out.ideas[0].formatMultiple, out.ideas[0].opening]).toEqual(['tutorial', 2.1, 'question'])
    expect([out.ideas[1].format, out.ideas[1].formatMultiple]).toEqual([null, null])
  })

  it('writes nothing where the writer gave nothing', () => {
    expect(composePostIdeas([LINER], null).ideas).toEqual([])
  })

  it('holds an idea left with no sub-question as thin', () => {
    const out = composePostIdeas([LINER, INSURANCE], { ideas: [written('Q1', { subquestions: [] }), written('Q2', { subquestions: [{ label: 'Whether insurance pays', comments: ['c99'] }] })] })
    expect(out.ideas).toEqual([])
    expect(out.held.map((h) => h.reason)).toEqual(['thin', 'thin'])
  })

  it('the evidence floor: three asking comments across two videos stand, after every drop; under it the idea is thin', () => {
    expect([POST_IDEA_MIN_COMMENTS, POST_IDEA_MIN_VIDEOS]).toEqual([3, 2])
    const at = (handles: string[]) => composePostIdeas([LINER], { ideas: [written('Q1', { subquestions: [{ label: 'How long it should last', comments: handles }] })] })
    // c1 v1, c2 v2, c3 v2: three comments on two videos, exactly at the floor.
    expect(at(['c1', 'c2', 'c3']).ideas).toHaveLength(1)
    // Two comments on two videos: under it.
    expect(at(['c1', 'c2']).held).toEqual([{ question: 'Q1', label: 'Questions 1', reason: 'thin' }])
    // Three comments on one video: under it.
    const oneVideo = candidate(1, [['c1', 'v1'], ['c2', 'v1'], ['c3', 'v1']])
    expect(composePostIdeas([oneVideo], { ideas: [written('Q1', { subquestions: [{ label: 'How long it should last', comments: ['c1', 'c2', 'c3'] }] })] }).held[0].reason).toBe('thin')
    // Counted after the drops: a comment that does not ask takes the idea under.
    const answered = candidate(1, [['c1', 'v1'], ['c2', 'v2'], ['c3', 'v2']])
    answered.comments[2].text = 'Mine lasted a long time, just keep it clean.'
    expect(composePostIdeas([answered], { ideas: [written('Q1', { subquestions: [{ label: 'How long it should last', comments: ['c1', 'c2', 'c3'] }] })] }).held[0].reason).toBe('thin')
    // Across sub-questions: two and one, on two videos, stand.
    expect(at(['c1', 'c2']).ideas).toEqual([])
    const split = composePostIdeas([LINER], { ideas: [written('Q1', { subquestions: [{ label: 'How long it should last', comments: ['c1', 'c2'] }, { label: 'The signs it is worn out', comments: ['c4'] }] })] })
    expect(split.ideas).toHaveLength(1)
  })

  it('holds a title that copies a sent comment word for word, or sits inside one, and drops such a label', () => {
    const asked = candidate(1, [['c1', 'v1'], ['c2', 'v2'], ['c3', 'v2']])
    asked.comments[0].text = 'How long should a silicone liner last before it stretches?'
    asked.comments[1].text = 'Does insurance pay for a second liner?'
    asked.comments[2].text = 'Is my liner worn out already?'
    const copied = composePostIdeas([asked], { ideas: [written('Q1', { title: 'How long should a silicone liner last before it stretches?' })] })
    expect(copied.held).toEqual([{ question: 'Q1', label: 'Questions 1', reason: 'title copies a comment' }])
    const inside = composePostIdeas([asked], { ideas: [written('Q1', { title: 'How long should a silicone liner last?' })] })
    expect(inside.held[0].reason).toBe('title copies a comment')
    // Its own words pass, and a short ordinary phrase is not a copy.
    const own = composePostIdeas([asked], {
      ideas: [written('Q1', {
        title: 'How long does a liner last?',
        subquestions: [
          { label: 'Does insurance pay for a second liner', comments: ['c2'] },
          { label: 'Second liner', comments: ['c2'] },
          { label: 'How long it should last', comments: ['c1', 'c3'] },
        ],
      })],
    })
    expect(own.ideas[0].subquestions.map((x) => x.label)).toEqual(['How long it should last', 'Second liner'])
    expect(own.scrub.droppedCopied).toBe(1)
  })

  it('never puts a comment that does not ask under a sub-question', () => {
    const mixed = candidate(1, [['c1', 'v1'], ['c2', 'v2']])
    mixed.comments[1].text = 'Make sure you check the airline dimensions first.'
    const { subquestions, scrub } = subquestionsOf(mixed, [{ label: 'Checking the size rules', comments: ['c1', 'c2'] }])
    expect(subquestions).toEqual([{ label: 'Checking the size rules', commentIds: ['c1-id'], videoIds: ['v1'] }])
    expect(scrub.droppedNotAsking).toBe(1)
  })
})

describe('postIdeaRows: what the step upserts', () => {
  it('is a row per idea that the reader parses back, with no comment words in it', () => {
    const out = composePostIdeas([LINER, INSURANCE, WET], {
      ideas: [
        written('Q1', { subquestions: [{ label: 'How long it should last', comments: ['c1', 'c2', 'c3'] }] }),
        written('Q2'),
        written('Q3'),
      ],
    })
    expect(out.ideas).toHaveLength(3)
    const rows = postIdeaRows({ clientId: 'client', runId: 'run', window: { from: '2026-10-05T00:00:00Z', to: '2026-10-12T00:00:00Z' }, ideas: out.ideas, model: 'gpt-5.4', promptVersion: 'post_ideas_v1' })
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3])
    const parsed = parsePostIdeaRow({ ...rows[0], id: 'id-1', created_at: '2026-10-12T08:00:00Z' })
    expect(parsed?.subquestions).toEqual([{ label: 'How long it should last', commentIds: ['c1-id', 'c2-id', 'c3-id'], videoIds: ['v1', 'v2'] }])
    expect(parsed?.cover.length).toEqual(PLAY.length)
    expect(JSON.stringify(rows)).not.toMatch(/Does question/)
    // The CHECK: a format and its multiple are both set or both null.
    expect([rows[1].format, rows[1].format_multiple]).toEqual([null, null])
  })
})

describe('copiesAComment', () => {
  it('is a whole comment, or a phrase of four words or more inside one, case and punctuation aside', () => {
    expect(COPY_MIN_WORDS).toBe(4)
    const sent = ['how much does a transtibial prosthesis cost in sao paulo']
    expect(copiesAComment('How much does a transtibial prosthesis cost in Sao Paulo?', sent)).toBe(true)
    expect(copiesAComment('How much does a transtibial prosthesis cost', sent)).toBe(true)
    expect(copiesAComment('Prosthesis cost', sent)).toBe(false)
    expect(copiesAComment('What a prosthetic leg costs', sent)).toBe(false)
    // A whole word only: "much does a trans" is not inside on a word boundary.
    expect(copiesAComment('much does a trans', sent)).toBe(false)
  })
})
