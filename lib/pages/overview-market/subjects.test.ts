import { describe, expect, it } from 'vitest'

import { buildSubjects, withMarketSides } from '../overview'
import { pooledDenominators } from '../../reading/market'
import { joins } from '../../reading/comparability'
import { pairOn } from '../../reading/pairs'
import { sealandJudge } from '../../test/sealand-pairs'
import { INDUSTRY_AUDIENCE, rivalKey } from '../../rivals'
import { subjectCountedFrom, unreadWords } from '../../subjects/read-in'
import { JUDGE_VERSION, type Subject } from '../../subjects/types'

// The market side of a subject row under WP1.1's states (deploy 2
// integration of WP1.1 and WP1.6). Staging's rows as the 24 Sep update wrote
// them: the category 351 (Aug) and 625 (Sep), Cotopaxi 22 and 12, Freitag 4
// and 6, and the four subjects of `calibrationOverviewFixture`. A failed
// subject and a month a subject was not read in carry no market figure, so
// the front page's data holds nothing WP1.1 withholds and never an invented 0.

const cotopaxi = rivalKey('Cotopaxi')
const freitag = rivalKey('Freitag')
const at = '2026-09-24T11:53:16.678Z'

function subject(id: string, name: string, precision: number | null, namedAt = '2026-09-23'): Subject {
  return {
    id, client_id: 'sealand', name, description: null, origin: 'client', source_ref: null,
    named_at: namedAt, status: 'active', superseded_by: null, embedded_at: null, embed_input_version: null,
    calibrated_at: precision == null ? null : at,
    calibration_precision: precision,
    calibration_n: precision == null ? null : 33,
    calibration_judge_version: precision == null ? null : JUDGE_VERSION,
  }
}

const row = (month: string, audience: string, subject_id: string, videos: number) => ({ month, audience, subject_id, videos, comments: 0 })
const confirmed = (id: string, changedAt: string) => ({ changed_at: changedAt, surface: 'subjects', after: { id, status: 'active' } })

function build(opts: { augustWritten: string; septemberWritten: string; communityConfirmed?: string; prevComparable?: boolean }) {
  const subjects = [
    subject('looks', 'Looks & style', 0.8571428571428571),
    subject('repair', 'Repair & warranty', 0.3333333333333333),
    subject('community', 'Community & purpose', null, '2026-09-24'),
    subject('water', 'Waterproofing', 1),
  ]
  const months = [
    row('2026-08-01', INDUSTRY_AUDIENCE, 'looks', 37), row('2026-08-01', cotopaxi, 'looks', 1),
    row('2026-09-01', INDUSTRY_AUDIENCE, 'looks', 102), row('2026-09-01', freitag, 'looks', 1),
    row('2026-08-01', INDUSTRY_AUDIENCE, 'repair', 14), row('2026-08-01', cotopaxi, 'repair', 1),
    row('2026-09-01', INDUSTRY_AUDIENCE, 'repair', 33), row('2026-09-01', cotopaxi, 'repair', 1),
    // Waterproofing has no August row here: whether that is a 0 or no
    // reading depends on when August was written (the second test).
    row('2026-09-01', INDUSTRY_AUDIENCE, 'water', 28),
  ]
  const denominators = [
    { month: '2026-08-01', audience: INDUSTRY_AUDIENCE, videos: 351, comments: 0 },
    { month: '2026-09-01', audience: INDUSTRY_AUDIENCE, videos: 625, comments: 0 },
    { month: '2026-08-01', audience: cotopaxi, videos: 22, comments: 0 },
    { month: '2026-09-01', audience: cotopaxi, videos: 12, comments: 0 },
    { month: '2026-08-01', audience: freitag, videos: 4, comments: 0 },
    { month: '2026-09-01', audience: freitag, videos: 6, comments: 0 },
  ]
  const changes = [
    confirmed('looks', '2026-09-24T11:46:16.982Z'),
    confirmed('repair', '2026-09-24T11:46:16.982Z'),
    confirmed('water', '2026-09-24T11:46:16.982Z'),
    confirmed('community', opts.communityConfirmed ?? '2026-09-24T12:41:06.517Z'),
  ]
  const read = {
    writtenAt: new Map([['2026-08-01', Date.parse(opts.augustWritten)], ['2026-09-01', Date.parse(opts.septemberWritten)]]),
    countedFrom: new Map(subjects.map((s) => [s.id, subjectCountedFrom({ id: s.id, named_at: s.named_at }, changes)])),
    unreadWords: unreadWords({ month: '2026-09-01', filling: true, nextUpdate: '2026-10-04T04:00:00.000Z' }),
  }
  const block = buildSubjects({
    subjects,
    months,
    denominators: new Map(),
    perAudience: new Map(denominators.map((d) => [`${d.month}|${d.audience}`, d.videos])),
    axis: ['2026-08-01', '2026-09-01'],
    month: '2026-09-01',
    prevMonth: '2026-08-01',
    leadRival: 'Cotopaxi',
    atLastMonth: null,
    thin: false,
    pair: null,
    asOf: '2026-10-02T06:00:00.000Z',
    read,
  })
  withMarketSides(block, {
    months,
    subjects,
    counts: pooledDenominators(denominators, [cotopaxi, freitag]),
    month: '2026-09-01',
    prevMonth: '2026-08-01',
    marketRivals: [cotopaxi, freitag],
    read,
    ...(opts.prevComparable != null ? { prevComparable: opts.prevComparable } : {}),
  })
  return Object.assign((id: string) => block.rows.find((r) => r.id === id)!, { block })
}

describe('withMarketSides under the three calibration states (WP1.1 with WP1.6)', () => {
  const byId = build({ augustWritten: '2026-09-24T12:15:41.468Z', septemberWritten: '2026-09-24T12:15:41.468Z' })

  it('keeps the calibration buildSubjects set, one state per row', () => {
    expect(['looks', 'repair', 'community', 'water'].map((id) => byId(id).calibration)).toEqual(['ready', 'failed', 'provisional', 'ready'])
  })

  it('a ready subject carries its pooled market side and the month before', () => {
    // Category plus the tracked brands: 102 + 1 of 625 + 12 + 6; August 37 + 1 of 351 + 22 + 4.
    expect(byId('looks').market).toMatchObject({ k: 103, n: 643, observed: true })
    expect(byId('looks').marketPrev).toMatchObject({ k: 38, n: 377 })
  })

  it('a failed subject carries no market figure in either month', () => {
    expect(byId('repair').market).toMatchObject({ k: null, pct: null, observed: false })
    expect(byId('repair').marketPrev).toBeNull()
  })

  it('a subject the month was not read for carries no market level, never 0', () => {
    expect(byId('community').unread).toBeTruthy()
    expect(byId('community').market).toMatchObject({ k: null, pct: null, observed: false })
  })

  it('a subject read in September but counted after August was written has no August level, never 0', () => {
    // August last written on 20 Sep, before Waterproofing was confirmed on
    // 24 Sep; September written after it.
    const late = build({ augustWritten: '2026-09-20T12:00:00.000Z', septemberWritten: '2026-09-24T12:15:41.468Z' })
    expect(late('water').market).toMatchObject({ k: 28, n: 643 })
    expect(late('water').marketPrev).toBeNull()
    // With August written after it was counted, the missing row is a real 0.
    expect(byId('water').marketPrev).toMatchObject({ k: 0, n: 377 })
  })

  it('a subject read in the month and cited on no video carries a market level of 0, never "no reading" (deploy 2 review)', () => {
    // Community & purpose confirmed before both months were written, and cited
    // on no video in either: read, so its zeros are measured zeros. The
    // market side follows the read-in test, not whether any row exists.
    const early = build({ augustWritten: '2026-09-24T12:15:41.468Z', septemberWritten: '2026-09-24T12:15:41.468Z', communityConfirmed: '2026-09-24T11:46:16.982Z' })
    expect(early('community').unread ?? null).toBeNull()
    expect(early('community').market).toMatchObject({ k: 0, n: 643, observed: true })
    expect(early('community').marketPrev).toMatchObject({ k: 0, n: 377 })
  })
})

// T0a, OV-45 (the one condition): "The market by subject" printed August
// beside a search-inflated September with no pair check at all. The loader
// now hands `withMarketSides` the market pair's answer
// (`joins(pair(prevMonth, month, 'market'))`), and a refused pair leaves no
// month before on the block or on any row.
describe('withMarketSides under a refused market pair (T0a, OV-45)', () => {
  const written = { augustWritten: '2026-09-24T12:15:41.468Z', septemberWritten: '2026-09-24T12:15:41.468Z' }

  it('the judge on Sealand’s September refuses the market pair, so no month before is carried', () => {
    const judge = pairOn(sealandJudge('2026-10-02T06:00:00.000Z'))
    const prevComparable = joins(judge('2026-08-01', '2026-09-01', 'market'))
    expect(prevComparable).toBe(false)
    const byId = build({ ...written, prevComparable })
    expect(byId.block.market?.prev).toBeNull()
    for (const id of ['looks', 'repair', 'community', 'water']) expect(byId(id).marketPrev ?? null).toBeNull()
    // This month's level stands.
    expect(byId('looks').market).toMatchObject({ k: 103, n: 643, observed: true })
  })

  it('a pair that joins keeps the month before, as before', () => {
    const byId = build({ ...written, prevComparable: true })
    expect(byId.block.market?.prev).toEqual({ month: '2026-08-01', n: 377 })
    expect(byId('looks').marketPrev).toMatchObject({ k: 38, n: 377 })
  })
})
