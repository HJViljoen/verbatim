import { describe, expect, it } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { loadUnanswered, UNANSWERED_GATE } from './subjects'

// SU3's "your posts" are the posts off your own accounts (depth v2, T14). The
// block read `is_client`, which is true of every creator's video that NAMES
// the brand, so a stranger's review sharing a question's words marked the
// question answered by you, and "your N posts" counted strangers.

const CLIENT = 'c1'
const RUN = 'run-1'
const LABEL = 'Questions about knee liner sizing'

/** Twelve category videos that asked the question, one insight each. */
const QUESTION_VIDEOS = Array.from({ length: UNANSWERED_GATE + 2 }, (_, i) => ({
  id: `q-${i}`, client_id: CLIENT, platform: 'tiktok', is_client: false, is_competitor: false, competitor_name: null,
  source: 'discovered', topics: ['amputee life'], upload_date: '2026-09-12',
}))
const INSIGHTS = QUESTION_VIDEOS.map((v, i) => ({
  id: `ins-${i}`, client_id: CLIENT, category: 'question', theme: 'liner_sizing', source_video_id: v.id,
}))

/** A creator's review that names the brand and shares the question's words. */
const CREATOR_ABOUT_YOU = {
  id: 'creator-review', client_id: CLIENT, platform: 'youtube', is_client: true, is_competitor: false, competitor_name: null,
  source: 'discovered', account_name: 'amputee.coach', topics: ['knee liner sizing', 'ossur review'], upload_date: '2026-09-15',
}
/** The brand's own post, about something else. */
const OWN_POST = {
  id: 'own-1', client_id: CLIENT, platform: 'instagram', is_client: true, is_competitor: false, competitor_name: null,
  source: 'owned', account_name: 'ossur', topics: ['running blade'], upload_date: '2026-09-20',
}

const tables = (videos: Record<string, unknown>[]) => ({
  audience_insights: INSIGHTS,
  videos: [...QUESTION_VIDEOS, ...videos],
  themes: [{ id: 't1', client_id: CLIENT, run_id: RUN, registry_id: 'reg-1', label: LABEL, supporting_insight_ids: INSIGHTS.map((i) => i.id) }],
  theme_registry: [{ id: 'reg-1', client_id: CLIENT, canonical_label: LABEL }],
})

const SEPTEMBER = {
  window: { from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' },
  period: 'September',
  themedRunId: RUN,
}

describe('loadUnanswered · your posts are your own accounts’ posts', () => {
  it('does not count a creator’s video naming the brand as yours, nor let it answer a question', async () => {
    const db = fakeDb(tables([CREATOR_ABOUT_YOU, OWN_POST]))
    const block = await loadUnanswered(db.client as never, CLIENT, INSIGHTS.map((i) => i.id), SEPTEMBER)
    expect(block.questionVideos).toBe(UNANSWERED_GATE + 2)
    expect(block.yourPosts).toBe(1)
    expect(block.rows).toEqual([expect.objectContaining({ id: 'reg-1', label: LABEL, answered: false })])
    expect(block.touch?.posts).toBe(1)
    expect(block.touch?.matched).toEqual([])
    expect(block.touch?.state).toBe('none')
    // The posts were read on the source, never on is_client.
    const postsRead = db.calls.find((c) => c.table === 'videos' && c.filters.includes('source=owned'))
    expect(postsRead?.filters).toEqual(expect.arrayContaining(['client_id=c1', 'upload_date>=2026-09-01', 'upload_date<2026-10-01']))
    expect(db.calls.some((c) => c.table === 'videos' && c.filters.includes('is_client=true'))).toBe(false)
  })

  it('still marks a question touched when one of YOUR posts shares its words', async () => {
    const own = { ...OWN_POST, id: 'own-liner', topics: ['knee liner sizing guide'] }
    const block = await loadUnanswered(fakeDb(tables([CREATOR_ABOUT_YOU, own])).client as never, CLIENT, INSIGHTS.map((i) => i.id), SEPTEMBER)
    expect(block.yourPosts).toBe(1)
    expect(block.rows[0].answered).toBe(true)
    expect(block.touch?.matched.map((m) => m.id)).toEqual(['own-liner'])
  })

  it('keeps a question asked under a video naming you out of the market’s questions, as before', async () => {
    // The question side is the market's (decision E): a question under a
    // creator's video about you is not counted, whatever its source.
    const askedUnderReview = { ...CREATOR_ABOUT_YOU, id: 'q-review' }
    const insights = [...INSIGHTS, { id: 'ins-review', client_id: CLIENT, category: 'question', theme: 'liner_sizing', source_video_id: 'q-review' }]
    const db = fakeDb({ ...tables([askedUnderReview, OWN_POST]), audience_insights: insights })
    const block = await loadUnanswered(db.client as never, CLIENT, insights.map((i) => i.id), SEPTEMBER)
    expect(block.questionVideos).toBe(UNANSWERED_GATE + 2)
  })
})
