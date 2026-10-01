import { describe, expect, it } from 'vitest'

import { newestDefaultKept, planRegate, rejudgeRows, type UnjudgedVideo } from './rejudge'

// The videos the gate let in unjudged before the 24 Sep fix, judged after all
// (the backfill's regate, 1 Oct). Pure parts.

const v = (id: string, video_id = id): UnjudgedVideo => ({ id, platform: 'youtube', video_id, account_name: 'a', caption: `caption ${id}`, hashtags: [] })
const gv = (video_id: string, source: string, kept: boolean, created_at: string) => ({ platform: 'youtube', video_id, source, kept, created_at })

describe('newestDefaultKept: the newest verdict governs', () => {
  it('a default keep never judged since is unjudged; one judged later is not, either way', () => {
    const rows = [
      gv('a', 'default', true, '2026-09-20T04:18:00Z'),
      gv('b', 'default', true, '2026-09-20T04:18:00Z'), gv('b', 'gpt', true, '2026-10-01T18:00:00Z'),
      gv('c', 'default', true, '2026-09-20T04:18:00Z'), gv('c', 'gpt', false, '2026-10-01T18:00:00Z'),
      gv('d', 'gpt', true, '2026-09-20T04:18:00Z'),
      gv('e', 'heuristic', false, '2026-09-20T04:18:00Z'),
    ]
    expect(newestDefaultKept(rows)).toEqual(['youtube\u0000a'])
  })
  it('the same id on two platforms is two videos', () => {
    expect(newestDefaultKept([gv('x', 'default', true, '2026-09-20T00:00:00Z'), { ...gv('x', 'gpt', true, '2026-10-01T00:00:00Z'), platform: 'tiktok' }]))
      .toEqual(['youtube\u0000x'])
  })
})

describe('planRegate', () => {
  const verdicts = new Map([
    ['k', { relevant: true, reason: 'about bags', source: 'gpt' as const }],
    ['d', { relevant: false, reason: 'a tank', source: 'gpt' as const }],
    ['h', { relevant: false, reason: 'cosplay makeup', source: 'heuristic' as const }],
    ['c', { relevant: false, reason: 'travel vlog', source: 'gpt' as const }],
    ['u', { relevant: true, reason: 'no verdict returned (gate failed open)', source: 'default' as const }],
  ])
  it('kept stay; dropped go unless something stored cites them; an undecided one is left as it is', () => {
    const plan = planRegate([v('k'), v('d'), v('h'), v('c'), v('u'), v('n')], (x) => verdicts.get(x.video_id), new Set(['c']))
    expect(plan.kept.map((x) => x.id)).toEqual(['k'])
    expect(plan.drop.map((x) => x.id)).toEqual(['d', 'h'])
    expect(plan.cited.map((x) => x.id)).toEqual(['c'])
    expect(plan.undecided.map((x) => x.id)).toEqual(['u', 'n'])
  })
  it('appends one verdict row per judged video, run_id null, the reason saying it was judged again; none for an undecided one', () => {
    const rows = rejudgeRows('client-1', [v('k'), v('d'), v('u')], (x) => verdicts.get(x.video_id))
    expect(rows.map((r) => [r.video_id, r.kept, r.source, r.run_id])).toEqual([['k', true, 'gpt', null], ['d', false, 'gpt', null]])
    expect(rows[1].reason).toBe('judged again after the 24 Sep fix: a tank')
    expect(rows[0]).toMatchObject({ client_id: 'client-1', platform: 'youtube', caption_excerpt: 'caption k' })
  })
})
