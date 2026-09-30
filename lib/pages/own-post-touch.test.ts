import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ownPostFilings, type OwnPostSubjectRow } from '../reading/own-posts'
import { questionTouch, type QuestionPost } from './own-post-touch'
import { questionsTouchLine } from '../../components/pages/subjects/unanswered'

// sw-2 item 2: one subject, three pages, three answers. Buying & delivery read
// "19 of your 61 posts" on Your moves (the word check AND the post-and-claim
// judge's filing), "0 of your 61 posts touched on it" on Your market and "None
// of your 25 posts shared two or more of its words" on Subjects (the word
// check alone). The three pages now call one rule and say it in one way.

const posts: QuestionPost[] = [
  { id: 'a', topics: ['Available online and in store'], upload_date: '2026-07-21', video_url: null },
  { id: 'b', topics: ['Protect Our Paths clean-up'], upload_date: '2026-09-03', video_url: null },
  { id: 'c', topics: ['Shipping times to Europe and delivery costs'], upload_date: '2026-09-10', video_url: null },
]
const filed = (video: string, touches: boolean, words: string[] = []): OwnPostSubjectRow => ({
  video_id: video, claim_id: null, subject_id: 'buying', touches, matched_words: words,
  method: 'judge', judge_version: 'own_post_subjects_v1', decided_at: '2026-09-29T14:20:00.000Z',
})

describe('questionTouch: a subject touched by words or by the judge', () => {
  const filings = ownPostFilings([filed('a', true, ['Available online and in store']), filed('b', false), filed('c', false)])
  const labels = ['Questions about shipping and delivery costs']

  it('counts the judge’s filing as well as the words, so a word-only page cannot read none', () => {
    const words = questionTouch({ labels, posts })
    const both = questionTouch({ labels, posts, judge: { subjectId: 'buying', filings } })
    expect(words.matched.map((m) => m.id)).toEqual(['c'])
    expect(both.matched.map((m) => [m.id, m.by])).toEqual([['a', 'judge'], ['c', 'words']])
    expect(both.state).toBe('touched')
  })

  it('prints the Subjects line in Your market’s words, "touched on it"', () => {
    const touch = questionTouch({ labels, posts, judge: { subjectId: 'buying', filings } })
    expect(questionsTouchLine({ rows: [], yourPosts: 3, touch }, 'in September')).toBe('2 of your 3 posts in September touched on it.')
    const none = questionTouch({ labels, posts: posts.slice(1, 2), judge: { subjectId: 'buying', filings } })
    expect(questionsTouchLine({ rows: [], yourPosts: 1, touch: none }, 'in September')).toBe('None of your 1 post in September touched on it.')
    const unfiled = questionTouch({ labels, posts: posts.slice(1, 2), judge: { subjectId: 'buying', filings: null } })
    expect(questionsTouchLine({ rows: [], yourPosts: 1, touch: unfiled }, 'in September'))
      .toBe('None of your 1 post in September touched on it so far: some of your posts are still to be read for this.')
    // A pane stored before the touch prints the line it was sent with.
    expect(questionsTouchLine({ rows: [], yourPosts: 3 }, 'in September')).toBe('None of your 3 posts shared two or more of its words.')
  })

  it('is the rule all three pages call, with the judge', () => {
    const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
    expect(read('lib/pages/overview.ts')).toMatch(/questionTouch\(\{[\s\S]{0,300}judge: \{ subjectId: top\.subjectId/)
    expect(read('lib/pages/subjects.ts')).toMatch(/questionTouch\(\{[\s\S]{0,300}judge: \{ subjectId: input\.subjectId/)
    expect(read('lib/pages/market-surface.ts')).toMatch(/questionTouch\(\{ labels, posts: input\.posts, judge: \{ subjectId: x\.id/)
  })
})
