import { describe, it, expect } from 'vitest'

import { isMissingPostIdeas, parsePostIdeaRow, subquestionCounts } from './types'

const row = {
  id: '00000000-0000-4000-8000-0000000000e1',
  client_id: '00000000-0000-4000-8000-0000000000c0',
  run_id: '00000000-0000-4000-8000-0000000000a1',
  window_start: '2026-10-05T00:00:00+00:00',
  window_end: '2026-10-12T00:00:00+00:00',
  rank: 1,
  registry_id: '00000000-0000-4000-8000-0000000000f1',
  title: 'How long does a liner last, and how do you know it is time to replace it?',
  cover: { text: 'How long liners usually last, the signs it is time, and what wears them out faster' },
  subquestions: [
    { label: 'How long it should last', commentIds: ['c1', 'c2', 'c2'], videoIds: ['v1', 'v2'] },
    { label: 'The signs it is worn out', commentIds: ['c3'], videoIds: ['v1'] },
  ],
  format: 'tutorial',
  format_multiple: '2.1',
  opening: 'question',
  opening_multiple: 1.8,
  model: 'gpt-4.1-mini',
  prompt_version: 'post_ideas_v1',
  created_at: '2026-10-12T08:00:00+00:00',
}

describe('parsePostIdeaRow', () => {
  it('reads a stored row, a numeric multiple PostgREST sent as a string included', () => {
    const parsed = parsePostIdeaRow(row)
    expect(parsed?.rank).toBe(1)
    expect(parsed?.format_multiple).toBe(2.1)
    expect(parsed?.opening_multiple).toBe(1.8)
    expect(parsed?.subquestions[0]).toEqual(row.subquestions[0])
    expect(parsed?.cover.text).toBe(row.cover.text)
  })

  it('reads a row with no format or opening chosen', () => {
    const parsed = parsePostIdeaRow({ ...row, format: null, format_multiple: null, opening: null, opening_multiple: null })
    expect(parsed).not.toBeNull()
    expect([parsed?.format, parsed?.format_multiple, parsed?.opening, parsed?.opening_multiple]).toEqual([null, null, null, null])
  })

  it('reads no row whose jsonb or rank is not the shape this code writes', () => {
    expect(parsePostIdeaRow(null)).toBeNull()
    expect(parsePostIdeaRow({ ...row, rank: 4 })).toBeNull()
    expect(parsePostIdeaRow({ ...row, cover: 'a cover' })).toBeNull()
    expect(parsePostIdeaRow({ ...row, subquestions: [{ label: 'x', commentIds: 'c1', videoIds: [] }] })).toBeNull()
    // a count the model typed is not a count: a sub-question carries ids only
    expect(parsePostIdeaRow({ ...row, subquestions: [{ label: 'x', count: 11 }] })).toBeNull()
    expect(parsePostIdeaRow({ ...row, title: null })).toBeNull()
  })
})

describe('subquestionCounts', () => {
  it('counts distinct comments and videos from the ids, never a stored number', () => {
    expect(subquestionCounts(row.subquestions[0])).toEqual({ comments: 2, videos: 2 })
    expect(subquestionCounts({ label: 'none yet', commentIds: [], videoIds: [] })).toEqual({ comments: 0, videos: 0 })
  })
})

describe('isMissingPostIdeas', () => {
  it('is the table missing, and nothing else', () => {
    expect(isMissingPostIdeas({ code: 'PGRST205', message: 'Could not find the table \'public.post_ideas\' in the schema cache' })).toBe(true)
    expect(isMissingPostIdeas({ code: '42P01', message: 'relation "public.post_ideas" does not exist' })).toBe(true)
    expect(isMissingPostIdeas({ code: '42501', message: 'permission denied for table post_ideas' })).toBe(false)
    expect(isMissingPostIdeas({ code: 'PGRST205', message: 'Could not find the table \'public.week_reads\' in the schema cache' })).toBe(false)
  })
})
