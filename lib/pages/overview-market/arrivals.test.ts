import { describe, expect, it } from 'vitest'

import { ARRIVAL_THEMES_SHOWN, arrivalMonths, arrivalThemes, buildArrivals, latestUpdate } from './arrivals'

// "With this update" (market-first WP2.7), on staging's own counts: Sealand,
// `update_arrivals` read read-only on 26 Sep.
//   the 9 Sep update  (093acddb): September 72 videos first read, 1,742 comments
//   the 10 Sep update (cb0d97b2): September 136 and 2,463; August 156 and 4,639
//   the 20 Sep update (b67b56de): September 395 and 11,999; August 1 and 99
// September's market comments by first capture: 4,205 by the 10 Sep update's
// finish and 16,204 by the 20 Sep update's, which is all of them.

const RUNS = [
  { id: '093acddb-a95a-4833-ad40-0f26df08ef18', started_at: '2026-09-09T12:08:47.213Z', completed_at: '2026-09-09T12:31:15.553Z' },
  { id: 'cb0d97b2-7d9b-451d-b427-721a6dcade71', started_at: '2026-09-10T07:02:10.201Z', completed_at: '2026-09-10T07:17:02.291Z' },
  { id: 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4', started_at: '2026-09-20T04:02:57.897Z', completed_at: '2026-09-20T08:33:47.358Z' },
]
const ARRIVED = {
  '093acddb-a95a-4833-ad40-0f26df08ef18': [{ month: '2026-09-01', videos_first_read: 72, comments_captured: 1742 }],
  'cb0d97b2-7d9b-451d-b427-721a6dcade71': [
    { month: '2026-08-01', videos_first_read: 156, comments_captured: 4639 },
    { month: '2026-09-01', videos_first_read: 136, comments_captured: 2463 },
  ],
  'b67b56de-17b6-429d-b5f7-e53a3c37f7d4': [
    { month: '2026-08-01', videos_first_read: 1, comments_captured: 99 },
    { month: '2026-09-01', videos_first_read: 395, comments_captured: 11999 },
  ],
}

describe('what came in with an update (WP2.7)', () => {
  it('counts that add to the month: two updates’ comments are the month’s change between them', () => {
    const at10 = 4205
    const at20 = 16204
    const sep20 = arrivalMonths(ARRIVED['b67b56de-17b6-429d-b5f7-e53a3c37f7d4']).find((m) => m.month === '2026-09-01')!
    expect(sep20.commentsCaptured).toBe(at20 - at10)
    // And every update's September comments together are the month's.
    const all = Object.values(ARRIVED).flatMap((rows) => arrivalMonths(rows)).filter((m) => m.month === '2026-09-01')
    expect(all.reduce((t, m) => t + m.commentsCaptured, 0)).toBe(at20)
  })

  it('keeps the rows by month, oldest first, and drops a row that is not a pair of counts', () => {
    expect(arrivalMonths([
      { month: '2026-09-01', videos_first_read: '395', comments_captured: '11999' },
      { month: '2026-08-01T00:00:00+00:00', videos_first_read: 1, comments_captured: 99 },
      { month: '2026-07-01', videos_first_read: -1, comments_captured: 3 },
      { month: '2026-06-01', videos_first_read: 2.5, comments_captured: 3 },
    ])).toEqual([
      { month: '2026-08-01', videosFirstRead: 1, commentsCaptured: 99 },
      { month: '2026-09-01', videosFirstRead: 395, commentsCaptured: 11999 },
    ])
  })

  it('reads the update "as at" names: the latest that finished on or before the clock', () => {
    expect(latestUpdate(RUNS, '2026-09-20T12:00:00.000Z')?.id).toBe('b67b56de-17b6-429d-b5f7-e53a3c37f7d4')
    // Before the 20 Sep update finished, the 10 Sep one.
    expect(latestUpdate(RUNS, '2026-09-20T06:00:00.000Z')?.id).toBe('cb0d97b2-7d9b-451d-b427-721a6dcade71')
    expect(latestUpdate(RUNS, '2026-09-01T00:00:00.000Z')).toBeNull()
  })

  // The 20 Sep update's nine themes first heard with 10+ category videos in
  // September (staging, 26 Sep).
  const NINE = [
    { id: '184e2461', label: 'Admiration for handmade craftsmanship', videos: 65 },
    { id: 'fb4361bb', label: 'Questions about materials and tools', videos: 25 },
    { id: 'daf78e91', label: 'Tutorial praised as easy to follow', videos: 14 },
    { id: '2c7238b7', label: 'Interest in shipping and locations', videos: 13 },
    { id: 'f329a7dd', label: 'Confusion about airline size rules', videos: 12 },
    { id: '056a478a', label: 'Appreciation for smart packing tips', videos: 12 },
    { id: '8285e151', label: 'Praise for laptop carry features', videos: 11 },
    { id: '4f4bc420', label: 'Laundry planning for travel', videos: 10 },
    { id: 'aed3a6d0', label: 'Preference for secondhand fashion', videos: 10 },
  ]

  it('names the themes not led by makers, largest first, and counts the ones that are (decision F)', () => {
    const shares = {
      maker: new Map<string, number | null>([['184e2461', 0.8], ['fb4361bb', 0.5], ['daf78e91', null], ['2c7238b7', 0.1]]),
      noise: new Map<string, number | null>([['aed3a6d0', 0.6]]),
    }
    const t = arrivalThemes(NINE, shares, new Map([['2c7238b7', { fromNewSearches: 4, of: 13 }]]))
    expect(t.grouped).toEqual({ makers: 2, setAside: 1 })
    expect(t.newThemes.map((x) => x.label)).toEqual([
      // Ties at 12 fall to the registry id, so the order never depends on how
      // the rows came back.
      'Tutorial praised as easy to follow', 'Interest in shipping and locations', 'Appreciation for smart packing tips',
      'Confusion about airline size rules', 'Praise for laptop carry features', 'Laundry planning for travel',
    ])
    expect(t.newThemes[1]).toEqual({ registryId: '2c7238b7', label: 'Interest in shipping and locations', k: 13, fromNewSearches: 4 })
    // Not measured is null, never a zero.
    expect(t.newThemes[0].fromNewSearches).toBeNull()
  })

  it('groups nothing where the shares are not measured', () => {
    const t = arrivalThemes(NINE, null, new Map())
    expect(t.grouped).toEqual({ makers: 0, setAside: 0 })
    expect(t.newThemes).toHaveLength(9)
    expect(ARRIVAL_THEMES_SHOWN).toBe(5)
  })

  it('names nothing heard first when the update opened a new clustering regime (WP1.9), and counts the re-grouping', () => {
    const b = buildArrivals({
      run: { id: 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4', date: '2026-09-20T08:33:47.358Z' },
      rows: ARRIVED['b67b56de-17b6-429d-b5f7-e53a3c37f7d4'],
      current: { month: '2026-09-01', videos: 654, updates: 3 },
      themes: { shown: NINE, regrouped: { themes: 468 } },
      shares: null,
      provenance: new Map(),
    })
    expect(b.newThemes).toEqual([])
    expect(b.regrouped).toBe(468)
    expect(b.months.map((m) => m.month)).toEqual(['2026-08-01', '2026-09-01'])
  })
})
