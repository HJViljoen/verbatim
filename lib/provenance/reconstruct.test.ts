import { describe, expect, it } from 'vitest'

import {
  gatherOf, planProvenance, provenanceSummary, recordingStartOf, splitTerms,
  type ProvenanceGather, type ProvenanceInput, type ProvenanceVideo,
} from './reconstruct'

// Sealand's gathers as staging holds them (WP0.1's export, the first
// keyword_performance row of each run; GC F28 for the eras). The terms are each
// era's own. Run ids are the runs' first eight characters.
const ERA_A = ['#sealandgear', 'cotopaxi', 'eco backpack', 'freitag', 'patagonia', 'poler', 'recycled bag',
  'sealand gear', 'sealandgear', 'sustainable backpack', 'sustainable bags', 'topo designs', 'upcycled bag']
const ERA_B = ['#sealandgear', 'eco backpack', 'recycled bag', 'sealand gear', 'sustainable backpack', 'upcycled bag',
  'cotopaxi backpack', 'freitag bag', 'rareform bag', 'recycled sailcloth', 'sailcloth bag', 'sealand bag', 'upcycled backpack']
const ERA_C = [...ERA_B, 'frtg', 'handmade bag', 'sustainable fashion', 'travel gear']
const g = (runId: string, at: string, terms: string[]): ProvenanceGather => ({ runId, at, terms: new Set(terms) })
const GATHERS: ProvenanceGather[] = [
  g('2039968a', '2026-07-09T13:20:55Z', ERA_A),
  g('c704eab3', '2026-08-17T10:57:31Z', [...ERA_A, 'r/backpacks']),
  g('093acddb', '2026-09-09T10:30:31Z', [...ERA_A, 'r/backpacks', 'r/travelgear']),
  g('cb0d97b2', '2026-09-09T18:17:56Z', [...ERA_B, 'r/backpacks', 'r/travelgear', 'r/onebag']),
  g('5a2ebc43', '2026-09-13T10:12:30Z', [...ERA_C, 'r/backpacks', 'r/travelgear', 'r/onebag']),
  g('b67b56de', '2026-09-20T04:18:34Z', [...ERA_C, 'north face backpack', 'r/backpacks', 'r/travelgear', 'r/onebag']),
  g('27sepgat', '2026-09-27T04:20:00Z', [...ERA_C, 'north face backpack', 'r/backpacks', 'r/travelgear', 'r/onebag']),
]
const STAGING = { label: 'staging@2026-09-20', takenAt: '2026-09-20T06:54:00Z' }
const PROD = { label: 'snapshot@2026-09-28', takenAt: '2026-09-28T07:00:00Z' }

const video = (over: Partial<ProvenanceVideo> & { id: string }): ProvenanceVideo => ({
  platform: 'tiktok', videoId: `p-${over.id}`, firstSeen: '2026-09-20T05:10:00Z', sourceKeywords: [], source: 'discovered', ...over,
})

function plan(videos: ProvenanceVideo[], extra: Partial<ProvenanceInput> & {
  staging?: Record<string, string[]>; prod?: Record<string, string[]>
} = {}) {
  const snapshots = []
  if (extra.prod) snapshots.push({ ...PROD, sourceKeywords: new Map(Object.entries(extra.prod)) })
  if (extra.staging) snapshots.push({ ...STAGING, sourceKeywords: new Map(Object.entries(extra.staging)) })
  return planProvenance({
    videos,
    verdicts: extra.verdicts ?? [
      // Gate recording begins with the 9 Sep 10:30 gather (staging's first verdict).
      { runId: '093acddb', platform: 'instagram', videoId: 'first-verdict', keyword: 'freitag', kept: true, createdAt: '2026-09-09T10:30:30Z' },
    ],
    gathers: GATHERS,
    snapshots,
    now: { label: 'snapshot@2026-09-30', takenAt: '2026-09-30T08:00:00Z' },
  })
}

describe('gatherOf: the gather that stored a video', () => {
  it('is the latest gather begun before first_seen, a search can run for hours', () => {
    expect(gatherOf('2026-09-09T11:10:05Z', GATHERS)?.runId).toBe('093acddb')
    expect(gatherOf('2026-09-09T19:32:00Z', GATHERS)?.runId).toBe('cb0d97b2')
    // a keyword row may land a moment after the first insert
    expect(gatherOf('2026-09-09T18:17:40Z', GATHERS)?.runId).toBe('cb0d97b2')
  })

  it('is none when no gather began within a day', () => {
    expect(gatherOf('2026-09-05T12:00:00Z', GATHERS)).toBeNull()
    expect(gatherOf('not a date', GATHERS)).toBeNull()
  })

  it('gate recording begins with the gather of the earliest verdict', () => {
    const start = recordingStartOf([{ runId: '093acddb', platform: 'instagram', videoId: 'x', keyword: 'freitag', kept: false, createdAt: '2026-09-09T10:30:30Z' }], GATHERS)
    expect(new Date(start!).toISOString()).toBe('2026-09-09T10:30:30.000Z')
    expect(recordingStartOf([], GATHERS)).toBeNull()
  })
})

describe('planProvenance', () => {
  it('a kept verdict and a snapshot taken before any later gather: exact, the whole first union', () => {
    // stored by the 20 Sep gather; staging was copied at 06:54, before the next gather
    const v = video({ id: 'a1', videoId: 'tt1', firstSeen: '2026-09-20T05:10:00Z' })
    const [row] = plan([v], {
      staging: { a1: ['handmade bag', 'travel gear'] },
      verdicts: [{ runId: 'b67b56de', platform: 'tiktok', videoId: 'tt1', keyword: 'handmade bag', kept: true, createdAt: '2026-09-20T05:10:01Z' }],
    })
    expect(row).toMatchObject({ firstRunId: 'b67b56de', firstTerms: ['handmade bag', 'travel gear'], method: 'exact', evidence: 'staging@2026-09-20' })
  })

  it('a kept verdict with no such snapshot: exact on the verdict’s keyword alone', () => {
    const v = video({ id: 'a2', videoId: 'tt2', firstSeen: '2026-09-13T10:40:00Z' })
    const [row] = plan([v], {
      staging: { a2: ['handmade bag', 'sustainable fashion'] },
      verdicts: [{ runId: '5a2ebc43', platform: 'tiktok', videoId: 'tt2', keyword: 'handmade bag', kept: true, createdAt: '2026-09-13T10:40:01Z' }],
    })
    expect(row).toMatchObject({ firstRunId: '5a2ebc43', firstTerms: ['handmade bag'], method: 'exact', evidence: 'gate_verdicts' })
  })

  it('the production snapshot comes before the staging export', () => {
    const v = video({ id: 'a3', videoId: 'tt3', firstSeen: '2026-09-27T04:30:00Z' })
    const [row] = plan([v], {
      prod: { a3: ['north face backpack'] },
      staging: {},
      verdicts: [{ runId: '27sepgat', platform: 'tiktok', videoId: 'tt3', keyword: 'north face backpack', kept: true, createdAt: '2026-09-27T04:30:01Z' }],
    })
    expect(row).toMatchObject({ method: 'exact', evidence: 'snapshot@2026-09-28', firstTerms: ['north face backpack'] })
  })

  it('era A, still naming an era-A term: reconstructed, the terms that gather searched only', () => {
    // stored by the 17 Aug gather; by 20 Sep a 13 Sep term had resurfaced it too
    const v = video({ id: 'b1', firstSeen: '2026-08-17T11:07:20Z' })
    const [row] = plan([v], { staging: { b1: ['patagonia', 'travel gear'] } })
    expect(row).toMatchObject({ firstRunId: 'c704eab3', firstTerms: ['patagonia'], method: 'reconstructed', evidence: 'staging@2026-09-20' })
  })

  it('era A, overwritten by later terms alone: ambiguous (GC F29)', () => {
    const v = video({ id: 'b2', firstSeen: '2026-08-17T11:07:20Z' })
    const [row] = plan([v], { staging: { b2: ['cotopaxi backpack'] } })
    expect(row).toMatchObject({ firstRunId: 'c704eab3', firstTerms: [], method: 'ambiguous', evidence: 'era_a' })
  })

  it('stored by the 9 Sep 18:17 gather with no verdict (989 such on staging): its era-B terms, reconstructed', () => {
    const v = video({ id: 'c1', platform: 'youtube', firstSeen: '2026-09-09T19:32:00Z' })
    const [row] = plan([v], { staging: { c1: ['freitag bag'] } })
    expect(row).toMatchObject({ firstRunId: 'cb0d97b2', firstTerms: ['freitag bag'], method: 'reconstructed' })
  })

  it('stored by the 9 Sep 10:30 gather with no verdict, carrying only a later term: ambiguous', () => {
    const v = video({ id: 'c2', platform: 'youtube', firstSeen: '2026-09-09T11:10:00Z' })
    const [row] = plan([v], { staging: { c2: ['handmade bag'] } })
    expect(row).toMatchObject({ firstRunId: '093acddb', method: 'ambiguous', evidence: 'staging@2026-09-20' })
  })

  it('a community harvest goes to first_subreddits', () => {
    const v = video({ id: 'd1', platform: 'reddit', videoId: 'rd1', firstSeen: '2026-09-09T18:40:00Z' })
    const [row] = plan([v], {
      staging: { d1: ['r/onebag'] },
      verdicts: [{ runId: 'cb0d97b2', platform: 'reddit', videoId: 'rd1', keyword: 'r/onebag', kept: true, createdAt: '2026-09-09T18:40:01Z' }],
    })
    expect(row).toMatchObject({ firstTerms: [], firstSubreddits: ['r/onebag'], method: 'exact' })
  })

  it('an account read is found by no search: exact, evidence "account"', () => {
    const v = video({ id: 'e1', source: 'owned', sourceKeywords: [] })
    expect(plan([v])[0]).toMatchObject({ firstTerms: [], firstSubreddits: [], method: 'exact', evidence: 'account' })
  })

  it('the current source_keywords are the last snapshot', () => {
    // stored by the 27 Sep gather, read on 30 Sep before any later gather
    const v = video({ id: 'f1', firstSeen: '2026-09-27T04:25:00Z', sourceKeywords: ['upcycled bag'] })
    expect(plan([v])[0]).toMatchObject({ method: 'exact', evidence: 'snapshot@2026-09-30', firstTerms: ['upcycled bag'] })
  })

  it('summarises by method and evidence', () => {
    const rows = plan([video({ id: 'e1', source: 'owned' }), video({ id: 'e2', source: 'competitor_owned' })])
    expect(provenanceSummary(rows)).toEqual({ 'exact:account': 2 })
  })

  it('splits and de-duplicates terms', () => {
    expect(splitTerms([' upcycled bag', 'r/onebag', 'upcycled bag', '', 'r/onebag'])).toEqual({ terms: ['upcycled bag'], subreddits: ['r/onebag'] })
  })
})
