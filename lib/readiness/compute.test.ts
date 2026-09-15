import { describe, it, expect } from 'vitest'

import { computeReadiness, longestGapDays, summarise } from './compute'
import type { CommunityInput, MonthCountRow, ReadinessInputs, ReadinessRow } from './types'

// Both workspaces' shapes, from the read-only production measurements the
// Phase 0 research recorded (research/subjects-readiness-data.md §2–§8,
// gap-02 §3, gap-04 §1, gap-05 §2) and re-read on 2026-09-15 before this was
// written. The fixtures are not a re-measurement — they are the two shapes the
// rules have to be right about: one workspace with no rival accounts at all and
// a category audience that clears the floor, one with every rival configured,
// almost nothing read from them, and a category audience two months short.
//
// Where a fixture is deliberately thinner than production it says so: the
// month history carries the four months the product actually draws plus enough
// empty ones to reproduce each audience's month COUNT, and those filler months
// carry too few comments to clear anything. So video-clearing counts reproduce
// production exactly and comment-clearing counts are the fixture's own.

const FLOOR = 100
const NOW = '2026-09-15T12:00:00.000Z'

/** Months before 2026-06 that exist and clear nothing — the long thin tail of
 *  older content discovery picked up (research §4b). */
function filler(audience: string, count: number): MonthCountRow[] {
  // Walking back from 2026-05, so no filler month collides with one of the four
  // the fixture carries for real.
  return Array.from({ length: count }, (_, k) => {
    const index = 2026 * 12 + 4 - k
    const month = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`
    return { month, audience, videos: 3, comments: 20 }
  })
}

function months(real: [string, string, number, number][], fill: [string, number][]): MonthCountRow[] {
  return [
    ...real.map(([month, audience, videos, comments]) => ({ month, audience, videos, comments })),
    ...fill.flatMap(([audience, n]) => filler(audience, n)),
  ]
}

function community(name: string, status: CommunityInput['status'], probed: boolean, postsStored: number): CommunityInput {
  return { name, status, probed, postsStored }
}

const find = (rows: ReadinessRow[], id: string): ReadinessRow => {
  const row = rows.find((r) => r.id === id)
  if (!row) throw new Error(`no readiness row ${id}`)
  return row
}

// ---- Össur: paying, prosthetics ---------------------------------------------

function ossur(over: Partial<ReadinessInputs> = {}): ReadinessInputs {
  return {
    tenant: 'Össur',
    now: NOW,
    rivals: [{ name: 'Ottobock', handlePlatforms: [], captured: 0, capturedRecently: 0, analysed: 0 }],
    terms: { brand: 1, competitor: 1, industry: 5, exclude: 0, updatedAt: '2026-08-18T14:48:31.755Z' },
    communities: [
      community('amputee', 'active', true, 23),
      community('bionics', 'active', true, 0),
      community('prosthetics', 'active', true, 26),
      ...['adaptivefitness', 'amputeeathletes', 'paralympics', 'prosthetictalk', 'upperlimbamputee']
        .map((n) => community(n, 'candidate', false, 0)),
      ...Array.from({ length: 9 }, (_, k) => community(`ruled${k}`, 'rejected', true, 0)),
    ],
    reddit: { postsStored: 149, postsFromUnconfigured: 99 },
    embeddings: { embedded: 1680, total: 3129, lastEmbeddedAt: null },
    subjectSet: { defined: null },
    monthly: {
      tracked: ['client', 'competitor:Ottobock', 'industry-other'],
      months: months(
        [
          ['2026-06-01', 'client', 16, 181], ['2026-07-01', 'client', 8, 36],
          ['2026-08-01', 'client', 20, 237], ['2026-09-01', 'client', 19, 151],
          ['2026-06-01', 'competitor:Ottobock', 34, 325], ['2026-07-01', 'competitor:Ottobock', 10, 59],
          ['2026-08-01', 'competitor:Ottobock', 73, 1264], ['2026-09-01', 'competitor:Ottobock', 42, 645],
          ['2026-06-01', 'industry-other', 182, 2865], ['2026-07-01', 'industry-other', 118, 1400],
          ['2026-08-01', 'industry-other', 628, 23542], ['2026-09-01', 'industry-other', 388, 10534],
        ],
        [['client', 40], ['competitor:Ottobock', 16], ['industry-other', 51]],
      ),
    },
    reads: {
      analysed: 1596, speech: 798, translated: 208, onScreenText: 269, unflagged: 0,
      gateRows: 1700, gateKept: 1051, gateFirstAt: '2026-08-23T04:20:00.000Z',
    },
    updates: [
      { id: 'd346b0f7', status: 'completed', startedAt: '2026-09-13T04:06:38.483Z', completedAt: '2026-09-13T06:26:49.308Z' },
      { id: '29a56395', status: 'completed', startedAt: '2026-09-06T12:28:50.672Z', completedAt: '2026-09-06T12:41:40.114Z' },
      { id: 'eb8f307a', status: 'completed', startedAt: '2026-08-30T08:22:08.554Z', completedAt: '2026-08-30T09:38:53.882Z' },
      { id: 'e0f3fcd0', status: 'failed', startedAt: '2026-08-30T04:03:30.712Z', completedAt: '2026-08-30T06:22:58.848Z' },
      { id: 'dceba083', status: 'partial', startedAt: '2026-08-23T04:01:20.409Z', completedAt: '2026-08-23T05:05:27.554Z' },
      { id: '147899d3', status: 'partial', startedAt: '2026-08-16T04:01:36.283Z', completedAt: '2026-08-16T07:07:55.837Z' },
      { id: 'ef1e28a3', status: 'completed', startedAt: '2026-08-09T10:38:04.865Z', completedAt: '2026-08-09T14:54:00.907Z' },
      { id: 'bb71a4a6', status: 'failed', startedAt: '2026-07-05T04:01:29.370Z', completedAt: '2026-07-05T04:31:30.514Z' },
    ],
    slotsRecorded: false,
    delivery: {
      period: 'weekly',
      schedules: [{ name: 'Weekly digest', active: true, recipients: 4, lastSentAt: '2026-09-13T06:28:00.513Z' }],
    },
    changeLog: { available: false, rows: 0, firstLoggedAt: null, lastChangeAt: null },
    recommendations: { total: 56, withLineage: 5, decisions: null },
    retention: { cohortDay: '2026-08-23', cohortRows: 768, nightlyCap: 5000, dueAfterDays: 25 },
    floor: FLOOR,
    recentUpdates: 8,
    ...over,
  }
}

// ---- Sealand: trial, bags ----------------------------------------------------

function sealand(over: Partial<ReadinessInputs> = {}): ReadinessInputs {
  return {
    ...ossur(),
    tenant: 'Sealand',
    rivals: [
      { name: 'Cotopaxi', handlePlatforms: ['instagram', 'tiktok', 'youtube'], captured: 31, capturedRecently: 31, analysed: 3 },
      { name: 'Freitag', handlePlatforms: ['instagram', 'tiktok', 'youtube'], captured: 28, capturedRecently: 28, analysed: 0 },
      { name: 'Rareform', handlePlatforms: ['instagram', 'tiktok'], captured: 14, capturedRecently: 14, analysed: 0 },
    ],
    terms: { brand: 3, competitor: 4, industry: 10, exclude: 0, updatedAt: '2026-09-13T10:00:58.467Z' },
    communities: [
      community('backpacks', 'active', true, 41),
      community('onebag', 'active', false, 17),
      community('travelgear', 'active', true, 0),
      community('ecocraft', 'candidate', false, 0),
      community('travelbackpacks', 'candidate', false, 0),
      ...Array.from({ length: 15 }, (_, k) => community(`ruled${k}`, 'rejected', true, 0)),
    ],
    reddit: { postsStored: 292, postsFromUnconfigured: 216 },
    embeddings: { embedded: 785, total: 2872, lastEmbeddedAt: null },
    monthly: {
      tracked: ['client', 'competitor:Cotopaxi', 'competitor:Freitag', 'competitor:Rareform', 'industry-other'],
      months: months(
        [
          ['2026-09-01', 'client', 3, 27],
          ['2026-06-01', 'competitor:Cotopaxi', 5, 74], ['2026-07-01', 'competitor:Cotopaxi', 1, 5],
          ['2026-08-01', 'competitor:Cotopaxi', 33, 412], ['2026-09-01', 'competitor:Cotopaxi', 27, 237],
          ['2026-08-01', 'competitor:Freitag', 5, 95], ['2026-09-01', 'competitor:Freitag', 8, 43],
          ['2026-06-01', 'industry-other', 45, 925], ['2026-07-01', 'industry-other', 35, 710],
          ['2026-08-01', 'industry-other', 369, 10239], ['2026-09-01', 'industry-other', 437, 9397],
        ],
        [['client', 14], ['competitor:Cotopaxi', 6], ['competitor:Freitag', 2], ['industry-other', 62]],
      ),
    },
    reads: {
      analysed: 1010, speech: 630, translated: 139, onScreenText: 333, unflagged: 0,
      gateRows: 2777, gateKept: 1091, gateFirstAt: '2026-09-09T12:10:00.000Z',
    },
    updates: [
      { id: 'cb0d97b2', status: 'partial', startedAt: '2026-09-13T10:03:04.451Z', completedAt: '2026-09-13T13:07:52.340Z' },
      { id: '093acddb', status: 'completed', startedAt: '2026-09-10T07:02:10.201Z', completedAt: '2026-09-10T07:17:02.291Z' },
      { id: '5a2ebc43', status: 'completed', startedAt: '2026-09-09T12:08:47.213Z', completedAt: '2026-09-09T12:31:15.553Z' },
      { id: 'f1', status: 'failed', startedAt: '2026-08-17T15:27:27.603Z', completedAt: '2026-08-17T15:39:34.786Z' },
      { id: 'c1', status: 'completed', startedAt: '2026-08-17T15:05:59.583Z', completedAt: '2026-08-17T15:18:12.919Z' },
      { id: 'c2', status: 'completed', startedAt: '2026-08-17T13:42:52.556Z', completedAt: '2026-08-17T14:53:54.496Z' },
      { id: 'c3', status: 'completed', startedAt: '2026-08-17T10:47:59.722Z', completedAt: '2026-08-17T13:36:32.032Z' },
      { id: 'p1', status: 'partial', startedAt: '2026-08-17T06:52:34.423Z', completedAt: '2026-08-17T10:01:50.784Z' },
    ],
    delivery: {
      period: 'paused',
      schedules: [{ name: 'Weekly digest', active: false, recipients: 0, lastSentAt: null }],
    },
    recommendations: { total: 65, withLineage: 5, decisions: null },
    retention: { cohortDay: '2026-08-24', cohortRows: 351, nightlyCap: 5000, dueAfterDays: 25 },
    ...over,
  }
}

// ---- The page as a whole ------------------------------------------------------

describe('computeReadiness', () => {
  it('prints thirteen rows, in one order, for either workspace', () => {
    const ids = computeReadiness(ossur()).map((r) => r.id)
    expect(ids).toEqual([
      'rival-accounts', 'tracked-terms', 'communities', 'searchable-findings', 'subject-set',
      'months-of-history', 'anomaly-baseline', 'read-depth', 'update-record', 'delivery',
      'change-record', 'decisions', 'retention',
    ])
    expect(computeReadiness(sealand()).map((r) => r.id)).toEqual(ids)
  })

  it('never puts pipeline vocabulary in a label', () => {
    const banned = /\b(run|runs|pass a|pass b|pass c|pass d|pass e|corpus|tier ?\d|t\d\b)/i
    for (const inputs of [ossur(), sealand()]) {
      for (const row of computeReadiness(inputs)) {
        expect(`${row.block} · ${row.input}`).not.toMatch(banned)
      }
    }
  })
})

// ---- 1 · rival accounts -------------------------------------------------------

describe('rival accounts', () => {
  it('is missing on a workspace whose one rival has no accounts configured', () => {
    const row = find(computeReadiness(ossur()), 'rival-accounts')
    expect(row.status).toBe('missing')
    expect(row.owner).toBe('client')
    expect(row.detail).toContain('No accounts configured for 1 tracked rival')
    expect(row.notes).toEqual(['Ottobock — no accounts configured'])
  })

  it('is only partly there when every rival is configured and one is read', () => {
    const row = find(computeReadiness(sealand()), 'rival-accounts')
    expect(row.status).toBe('partial')
    expect(row.detail).toContain('3 of 3 tracked rivals have accounts configured')
    expect(row.detail).toContain('73 posts of their own captured, 3 read')
    expect(row.notes[0]).toBe('Cotopaxi — Instagram, TikTok & YouTube · 31 posts captured, 31 in the last 30 days, 3 read')
    expect(row.notes[2]).toContain('Rareform')
    expect(row.notes[2]).toContain('none read yet')
  })

  it('is in place only once every configured rival has been read', () => {
    const read = sealand().rivals.map((r) => ({ ...r, analysed: 2 }))
    expect(find(computeReadiness(sealand({ rivals: read })), 'rival-accounts').status).toBe('exists')
  })
})

// ---- 2 · terms ----------------------------------------------------------------

describe('tracked terms', () => {
  it('counts the three buckets and stays partly there while no change is recorded', () => {
    const row = find(computeReadiness(ossur()), 'tracked-terms')
    expect(row.status).toBe('partial')
    expect(row.detail).toBe('1 brand term, 1 rival term, 5 category terms · last edited 18 Aug 2026.')
    expect(row.notes[0]).toContain('No configuration change has been recorded yet')
  })

  it('is in place once terms exist in every bucket and changes are recorded', () => {
    const inputs = ossur({ changeLog: { available: true, rows: 91, firstLoggedAt: '2026-09-15T00:00:00Z', lastChangeAt: '2026-09-15T00:00:00Z' } })
    expect(find(computeReadiness(inputs), 'tracked-terms').status).toBe('exists')
  })

  it('names ops, not the client, when only the missing record holds it back', () => {
    // Both workspaces today: every bucket has words in it, and the row sits at
    // `partial` solely because nothing writes a change down. Telling the client
    // to add or drop a term would not move the pill by a word.
    const row = find(computeReadiness(ossur()), 'tracked-terms')
    expect(row.status).toBe('partial')
    expect(row.owner).toBe('ops')
    expect(row.unlocks).toContain('Apply the change log')
  })

  it('goes back to the client the moment a bucket is empty', () => {
    const inputs = ossur({ terms: { brand: 1, competitor: 0, industry: 5, exclude: 0, updatedAt: null } })
    const row = find(computeReadiness(inputs), 'tracked-terms')
    expect(row.owner).toBe('client')
    expect(row.unlocks).toContain('Tell us what to add or drop')
  })

  it('is the client’s once the log exists but nothing has been recorded in it', () => {
    const inputs = ossur({ changeLog: { available: true, rows: 0, firstLoggedAt: null, lastChangeAt: null } })
    const row = find(computeReadiness(inputs), 'tracked-terms')
    expect(row.status).toBe('partial')
    expect(row.owner).toBe('client')
  })

  it('is missing when nothing is tracked at all', () => {
    const inputs = ossur({ terms: { brand: 0, competitor: 0, industry: 0, exclude: 0, updatedAt: null } })
    const row = find(computeReadiness(inputs), 'tracked-terms')
    expect(row.status).toBe('missing')
    expect(row.detail).toContain('last edited never')
  })
})

// ---- 3 · communities ----------------------------------------------------------

describe('watched communities', () => {
  it('names a watched community that has produced nothing, and counts what is unconfigured', () => {
    const row = find(computeReadiness(ossur()), 'communities')
    expect(row.status).toBe('partial')
    expect(row.detail).toBe('3 watched, 5 proposed and not yet sampled, 9 ruled out · 66% of stored Reddit posts come from communities nobody configured.')
    expect(row.notes).toEqual([
      'r/amputee — 23 posts',
      'r/bionics — nothing stored from it yet',
      'r/prosthetics — 26 posts',
    ])
  })

  it('does not count a community set watched by hand as a gap, but does name it', () => {
    const row = find(computeReadiness(sealand()), 'communities')
    expect(row.detail).toContain('3 watched, 2 proposed and not yet sampled, 15 ruled out')
    expect(row.notes).toEqual([
      'r/backpacks — 41 posts',
      'r/onebag — 17 posts · watched by hand, never sampled',
      'r/travelgear — nothing stored from it yet',
    ])
  })

  it('is missing when nothing is watched', () => {
    const inputs = ossur({ communities: [community('amputee', 'candidate', false, 0)] })
    expect(find(computeReadiness(inputs), 'communities').status).toBe('missing')
  })
})

// ---- 4 · searchable findings ---------------------------------------------------

describe('searchable findings', () => {
  it('reads the share, and says the date is not recorded rather than guessing', () => {
    const row = find(computeReadiness(ossur()), 'searchable-findings')
    expect(row.status).toBe('partial')
    expect(row.detail).toBe('1,680 of 3,129 findings are searchable (53.7%) · no date recorded.')
    expect(row.notes).toEqual(['1,449 findings cannot be found by a question asked about them'])
  })

  it('reads Sealand at a quarter', () => {
    expect(find(computeReadiness(sealand()), 'searchable-findings').detail)
      .toBe('785 of 2,872 findings are searchable (27.3%) · no date recorded.')
  })

  it('is in place at full coverage, with the date once there is one', () => {
    const inputs = ossur({ embeddings: { embedded: 3129, total: 3129, lastEmbeddedAt: '2026-09-20T06:10:00Z' } })
    const row = find(computeReadiness(inputs), 'searchable-findings')
    expect(row.status).toBe('exists')
    expect(row.detail).toContain('last written 20 Sep 2026')
    expect(row.notes).toEqual([])
  })

  it('is missing when nothing is searchable', () => {
    const inputs = ossur({ embeddings: { embedded: 0, total: 3129, lastEmbeddedAt: null } })
    expect(find(computeReadiness(inputs), 'searchable-findings').status).toBe('missing')
  })
})

// ---- 5 · subjects --------------------------------------------------------------

describe('the subject set', () => {
  it('says the product holds no such thing rather than "none named"', () => {
    const row = find(computeReadiness(ossur()), 'subject-set')
    expect(row.status).toBe('missing')
    expect(row.owner).toBe('engineering')
    expect(row.detail).toBe('There is no subject set — the product holds no such thing yet.')
  })

  it('reads the count once there is one', () => {
    const inputs = ossur({ subjectSet: { defined: 6 } })
    const row = find(computeReadiness(inputs), 'subject-set')
    expect(row.status).toBe('exists')
    expect(row.detail).toBe('6 subjects named.')
  })
})

// ---- 6 and 7 · the monthly reading and its baseline ---------------------------

describe('months of history', () => {
  it('reproduces the category-only answer on the paying workspace', () => {
    const row = find(computeReadiness(ossur()), 'months-of-history')
    expect(row.status).toBe('exists')
    expect(row.detail).toBe('4 months clear 100 videos in the category; 1 of 3 audiences clear any.')
    // Video counts are production's: 4 of 55 category months, none in the
    // other two. Comment counts are the fixture's — its filler months carry
    // 20 comments each, where production's carry enough for two more.
    expect(row.notes).toEqual([
      'Your own brand — 0 of 44 months clear 100 videos (3 clear 100 comments)',
      'Ottobock — 0 of 20 months clear 100 videos (3 clear 100 comments)',
      'The category — 4 of 55 months clear 100 videos (4 clear 100 comments)',
    ])
  })

  it('is only partly there on a workspace two months short', () => {
    const row = find(computeReadiness(sealand()), 'months-of-history')
    expect(row.status).toBe('partial')
    expect(row.detail).toBe('2 months clear 100 videos in the category; 1 of 5 audiences clear any.')
    expect(row.notes).toContain('Rareform — 0 of 0 months clear 100 videos (0 clear 100 comments) · no month at all')
  })

  it('says "not seeded yet" rather than throwing when the reading has not landed', () => {
    const row = find(computeReadiness(ossur({ monthly: null })), 'months-of-history')
    expect(row.status).toBe('missing')
    expect(row.detail).toContain('Not seeded yet')
    expect(row.unlocks).toContain('Apply the monthly reading')
  })

  it('is missing when nothing clears the floor anywhere', () => {
    const thin = { tracked: ['client'], months: [{ month: '2026-08-01', audience: 'client', videos: 20, comments: 30 }] }
    const row = find(computeReadiness(ossur({ monthly: thin })), 'months-of-history')
    expect(row.status).toBe('missing')
    expect(row.detail).toBe('No month yet carries 100 videos in any audience — the biggest holds 20.')
  })
})

describe('the baseline behind an unusual week', () => {
  it('is ready on the category audience and forming on every other, on the paying workspace', () => {
    const row = find(computeReadiness(ossur()), 'anomaly-baseline')
    expect(row.status).toBe('exists')
    expect(row.detail).toBe('Baseline ready in 1 of 3 audiences; the rest are still forming.')
    expect(row.notes).toEqual([
      'Your own brand — baseline forming — 0 of 3 months',
      'Ottobock — baseline forming — 0 of 3 months',
      'The category — baseline ready',
    ])
  })

  it('is one month of three on the trial workspace', () => {
    const row = find(computeReadiness(sealand()), 'anomaly-baseline')
    expect(row.status).toBe('partial')
    expect(row.notes).toContain('The category — baseline forming — 1 of 3 months')
    expect(row.detail).toBe('No audience has a baseline yet — the fullest is 1 of 3 months.')
  })

  it('reads the three months behind the instant it is given, not the month it is in', () => {
    // At 15 Sep, June/July/August are the complete months; September is still
    // filling and must not count even though it carries 388 videos.
    const august = find(computeReadiness(ossur({ now: '2026-09-01T00:00:00.000Z' })), 'anomaly-baseline')
    expect(august.notes).toContain('The category — baseline ready')
    const july = find(computeReadiness(ossur({ now: '2026-08-01T00:00:00.000Z' })), 'anomaly-baseline')
    // May, June, July: only two of the three are read at all, and only two clear.
    expect(july.notes).toContain('The category — baseline forming — 2 of 3 months')
  })

  it('says "not seeded yet" rather than throwing when the reading has not landed', () => {
    const row = find(computeReadiness(sealand({ monthly: null })), 'anomaly-baseline')
    expect(row.status).toBe('missing')
    expect(row.detail).toContain('Not seeded yet')
  })
})

// ---- 8 · how much of each video was read --------------------------------------

describe('how much was read', () => {
  it('excludes Reddit from the denominator and dates the set-aside record', () => {
    const row = find(computeReadiness(ossur()), 'read-depth')
    expect(row.status).toBe('partial')
    expect(row.detail).toBe('Speech read on 798 of 1,596 videos (50%), translated 208 (13%), on-screen text 269 (16.9%) · Reddit excluded.')
    expect(row.notes[0]).toBe('38.2% of what was looked at was set aside — recorded only from 23 Aug 2026, so no month before that can show it.')
  })

  it('reads the trial workspace’s own shares', () => {
    expect(find(computeReadiness(sealand()), 'read-depth').detail)
      .toBe('Speech read on 630 of 1,010 videos (62.4%), translated 139 (13.8%), on-screen text 333 (33%) · Reddit excluded.')
  })

  it('is in place only when the set-aside record reaches back past the first update', () => {
    const inputs = ossur({ reads: { ...ossur().reads, gateFirstAt: '2026-01-01T00:00:00Z' } })
    expect(find(computeReadiness(inputs), 'read-depth').status).toBe('exists')
  })

  it('is missing when nothing records what was set aside', () => {
    const inputs = ossur({ reads: { ...ossur().reads, gateRows: 0, gateKept: 0, gateFirstAt: null } })
    const row = find(computeReadiness(inputs), 'read-depth')
    expect(row.status).toBe('missing')
    expect(row.notes[0]).toContain('is not recorded at all')
  })
})

// ---- 9 · the update record ----------------------------------------------------

describe('the update record', () => {
  it('counts what finished, lists them one line each, and says the slot is not recorded yet', () => {
    const row = find(computeReadiness(ossur()), 'update-record')
    expect(row.status).toBe('partial')
    expect(row.detail).toContain('6 of the last 8 updates finished')
    expect(row.notes.slice(0, 3)).toEqual([
      '13 Sep 2026 — finished',
      '6 Sep 2026 — finished',
      '30 Aug 2026 — finished',
    ])
    expect(row.notes).toContain('30 Aug 2026 — did not finish')
    expect(row.notes).toContain('23 Aug 2026 — finished, with gaps')
    expect(row.notes.at(-1)).toBe('Which scheduled slot each update served is not recorded yet, so a missed slot cannot be told from a manual update.')
  })

  it('marks each update scheduled or by hand once the slot is recorded', () => {
    const updates = ossur().updates.map((u, k) => ({ ...u, scheduledFor: k < 3 ? '2026-09-13T04:00:00Z' : null }))
    const row = find(computeReadiness(ossur({ slotsRecorded: true, updates })), 'update-record')
    expect(row.notes[0]).toBe('13 Sep 2026 — finished · on schedule')
    expect(row.notes[3]).toBe('30 Aug 2026 — did not finish · by hand')
    expect(row.notes).toHaveLength(8)
  })

  it('names an update that took longer than the stretch it covered', () => {
    const updates = ossur().updates.map((u, k) => ({ ...u, stalled: k === 0 }))
    const row = find(computeReadiness(ossur({ updates })), 'update-record')
    expect(row.status).toBe('partial')
    expect(row.notes[0]).toBe('13 Sep 2026 — finished · took longer than the stretch it covered')
  })

  it('is missing when nothing has finished', () => {
    const updates = ossur().updates.map((u) => ({ ...u, status: 'failed' }))
    const row = find(computeReadiness(ossur({ updates })), 'update-record')
    expect(row.status).toBe('missing')
    expect(row.detail).toBe('No update has finished for this workspace yet.')
  })

  it('is in place when every recent update finished', () => {
    const updates = ossur().updates.map((u) => ({ ...u, status: 'completed' }))
    expect(find(computeReadiness(ossur({ updates })), 'update-record').status).toBe('exists')
  })
})

describe('longestGapDays', () => {
  it('measures between updates that produced something, ignoring the ones that did not', () => {
    expect(longestGapDays([
      { status: 'completed', startedAt: '2026-08-09T10:00:00Z' },
      { status: 'failed', startedAt: '2026-08-20T10:00:00Z' },
      { status: 'partial', startedAt: '2026-09-13T10:00:00Z' },
    ])).toBe(35)
  })

  it('is null below two updates', () => {
    expect(longestGapDays([])).toBeNull()
    expect(longestGapDays([{ status: 'completed', startedAt: '2026-08-09T10:00:00Z' }])).toBeNull()
  })
})

// ---- 10 · delivery -------------------------------------------------------------

describe('delivery', () => {
  it('is in place with an address list and a send behind it', () => {
    const row = find(computeReadiness(ossur()), 'delivery')
    expect(row.status).toBe('exists')
    expect(row.detail).toBe('1 schedule · 4 addresses · last sent 13 Sep 2026.')
  })

  it('is missing while the workspace is paused', () => {
    const row = find(computeReadiness(sealand()), 'delivery')
    expect(row.status).toBe('missing')
    expect(row.detail).toBe('Updates are paused for this workspace, so nothing is sent.')
    expect(row.notes).toEqual(['Weekly digest — off, no addresses'])
  })

  it('is only partly there when a live schedule has never sent', () => {
    const inputs = ossur({ delivery: { period: 'weekly', schedules: [{ name: 'Weekly digest', active: true, recipients: 2, lastSentAt: null }] } })
    const row = find(computeReadiness(inputs), 'delivery')
    expect(row.status).toBe('partial')
    expect(row.detail).toContain('nothing sent yet')
  })
})

// ---- 11 and 12 · the two records that do not exist yet -------------------------

describe('the change record', () => {
  it('says it is not recorded yet, and carries the boundary sentence', () => {
    const row = find(computeReadiness(ossur()), 'change-record')
    expect(row.status).toBe('missing')
    expect(row.detail).toBe('Not recorded yet — nothing in the product writes down a configuration change.')
    expect(row.notes[0]).toContain('reconstructed from what each update searched')
  })

  it('counts the changes once they are there', () => {
    const inputs = ossur({ changeLog: { available: true, rows: 33, firstLoggedAt: '2026-07-01T00:00:00Z', lastChangeAt: '2026-09-13T10:00:58Z' } })
    const row = find(computeReadiness(inputs), 'change-record')
    expect(row.status).toBe('exists')
    expect(row.detail).toBe('33 changes recorded · last on 13 Sep 2026.')
    expect(row.notes[0]).toContain('No change was recorded before 2026-07-01')
  })
})

describe('what was decided', () => {
  it('separates "nothing can record a decision" from "nobody has made one"', () => {
    expect(find(computeReadiness(ossur()), 'decisions').detail)
      .toBe('Nothing can record a decision yet · 5 of 56 carry a link to the one before (8.9%).')
    const ready = ossur({ recommendations: { total: 56, withLineage: 5, decisions: 0 } })
    expect(find(computeReadiness(ready), 'decisions').detail)
      .toBe('No decision recorded · 5 of 56 carry a link to the one before (8.9%).')
    expect(find(computeReadiness(ready), 'decisions').status).toBe('missing')
  })

  it('is only partly there while some recommendation has no link back', () => {
    const inputs = sealand({ recommendations: { total: 65, withLineage: 60, decisions: 2 } })
    const row = find(computeReadiness(inputs), 'decisions')
    expect(row.status).toBe('partial')
    expect(row.detail).toContain('2 decisions recorded')
  })

  it('is in place when every recommendation is linked and decisions are being made', () => {
    const inputs = sealand({ recommendations: { total: 65, withLineage: 65, decisions: 4 } })
    expect(find(computeReadiness(inputs), 'decisions').status).toBe('exists')
  })

  it('does not ask the client for an act nobody can perform yet', () => {
    // Today on both workspaces. The owner column is there to separate the red
    // that costs no engineering time from the red that does; naming the client
    // beside "mark a recommendation done" while nothing can record one does
    // the opposite.
    const row = find(computeReadiness(ossur()), 'decisions')
    expect(row.owner).toBe('ops')
    expect(row.unlocks).toContain('Apply the record of what was decided')

    const ready = ossur({ recommendations: { total: 56, withLineage: 5, decisions: 0 } })
    const readyRow = find(computeReadiness(ready), 'decisions')
    expect(readyRow.owner).toBe('client')
    expect(readyRow.unlocks).toContain('Mark a recommendation done')
  })
})

// ---- 13 · retention ------------------------------------------------------------

describe('retention', () => {
  it('dates the next batch due to be read again', () => {
    const row = find(computeReadiness(ossur()), 'retention')
    expect(row.status).toBe('exists')
    expect(row.detail).toBe('768 comments fall due to be read again on 17 Sep 2026 — one night covers it.')
  })

  it('reads the trial workspace’s own batch', () => {
    expect(find(computeReadiness(sealand()), 'retention').detail)
      .toBe('351 comments fall due to be read again on 18 Sep 2026 — one night covers it.')
  })

  it('is only partly there when a batch is bigger than a night', () => {
    const inputs = ossur({ retention: { cohortDay: '2026-09-13', cohortRows: 6000, nightlyCap: 5000, dueAfterDays: 25 } })
    const row = find(computeReadiness(inputs), 'retention')
    expect(row.status).toBe('partial')
    expect(row.detail).toContain('more than one night covers (5,000)')
  })

  it('is in place with nothing waiting', () => {
    const inputs = ossur({ retention: { cohortDay: null, cohortRows: 0, nightlyCap: 5000, dueAfterDays: 25 } })
    const row = find(computeReadiness(inputs), 'retention')
    expect(row.status).toBe('exists')
    expect(row.detail).toBe('Nothing is waiting to be read again.')
    expect(row.notes).toEqual([])
  })
})

// ---- The summary ---------------------------------------------------------------

describe('summarise', () => {
  it('counts both unready states and names them', () => {
    const rows = computeReadiness(ossur())
    const s = summarise(rows)
    expect(s.exists + s.partial + s.missing).toBe(13)
    expect(s.label).toBe(`${s.missing} missing · ${s.partial} partly there`)
  })

  it('says so when nothing is outstanding', () => {
    expect(summarise([{ id: 'a', block: 'b', input: 'i', status: 'exists', detail: '', owner: 'ops', unlocks: '', notes: [] }]).label)
      .toBe('everything in place')
  })
})
