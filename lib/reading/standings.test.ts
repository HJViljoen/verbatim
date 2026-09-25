import { describe, expect, it } from 'vitest'

import { attentionSplit } from './attention'
import { NOT_OBSERVED, buildStandings, standingText } from './standings'
import { BRANDS_PANEL, pairJudge, pairOn } from './pairs'
import { OSSUR_UPDATES } from '../test/sealand-pairs'

// Össur's panel at a 1 June 2026 cutoff, measured read-only 2026-09-15:
//   Aug  client 13 videos / 6 comments · Ottobock 10 / 92 · category 122 / 2,047
//   Sep  client 14 / 28          · Ottobock  8 / 45 · category  55 /   146
const AUG = [
  { audience: 'client', panel_videos: 13, attention_comments: 6, panel_platform_mix: { tiktok: 9, youtube: 4 } },
  { audience: 'competitor:Ottobock', panel_videos: 10, attention_comments: 92 },
  { audience: 'industry-other', panel_videos: 122, attention_comments: 2047 },
]
const SEP = [
  { audience: 'client', panel_videos: 14, attention_comments: 28 },
  { audience: 'competitor:Ottobock', panel_videos: 8, attention_comments: 45 },
  { audience: 'industry-other', panel_videos: 55, attention_comments: 146 },
]

const base = {
  month: '2026-09-01',
  rows: SEP,
  prevRows: AUG,
  prevMonth: '2026-08-01',
  rivals: [{ name: 'Ottobock' }],
  clientLabel: 'Össur',
  categoryLabel: 'The wider category',
  panelId: 'panel-1',
  prevPanelId: 'panel-1',
  // No month pair applies: these pin the panel's own rule and the bands.
  comparability: null,
}

describe('buildStandings', () => {
  // The table and the block above it read the same two shares off the same
  // rows. They used to be two implementations tested against the same figures,
  // which is a way of not noticing a drift rather than of preventing one.
  it('reads its shares through attentionSplit, not a second copy of it', () => {
    const rows = buildStandings(base)
    const split = new Map(attentionSplit(SEP).map((s) => [s.audience, s]))
    for (const row of rows) {
      if (!row.observed) continue
      expect(row.content).toEqual(split.get(row.audience)!.content)
      expect(row.attention).toEqual(split.get(row.audience)!.attention)
    }
  })

  // A rival's two verdicts carry one objectId and one audience and differ only
  // in what they count. Anything keyed by the object alone — the sent-figures
  // record is one, and its table has no UPDATE — keeps one and files it under
  // the other's denominator, so each says what it was read over.
  it('says what each of a row’s two verdicts counted, and over what', () => {
    const otto = buildStandings(base).find((r) => r.role === 'rival')!
    expect(otto.attentionVerdict!.countedOver).toEqual({
      measure: 'comments',
      population: 'the panel’s comments this month',
    })
    expect(otto.contentVerdict!.countedOver).toEqual({
      measure: 'videos',
      population: 'the panel’s videos this month',
    })
    // And the audience is the object on both, which is why neither may be read
    // as "Ottobock's videos".
    expect(otto.attentionVerdict!.audience).toBe(otto.contentVerdict!.audience)
    expect(otto.attentionVerdict!.objectId).toBe(otto.contentVerdict!.objectId)
  })

  it('draws a row per brand, client first, category last', () => {
    const rows = buildStandings(base)
    expect(rows.map((r) => r.role)).toEqual(['client', 'rival', 'category'])
    expect(rows.map((r) => r.label)).toEqual(['Össur', 'Ottobock', 'The wider category'])
  })

  it('gives every row two shares off two denominators', () => {
    const rows = buildStandings(base)
    const otto = rows.find((r) => r.role === 'rival')!
    expect(otto.content).toEqual({ k: 8, n: 77, pct: 10.4 })
    expect(otto.attention).toEqual({ k: 45, n: 219, pct: 20.5 })
  })

  it('tells posting apart from being talked about', () => {
    const rows = buildStandings({
      ...base,
      month: '2026-08-01',
      rows: [
        { audience: 'competitor:Ottobock', panel_videos: 70, attention_comments: 450 },
        { audience: 'industry-other', panel_videos: 390, attention_comments: 79724 },
        { audience: 'client', panel_videos: 54, attention_comments: 804 },
      ],
      prevRows: undefined,
      prevMonth: null,
    })
    const otto = rows.find((r) => r.role === 'rival')!
    expect(otto.content!.pct).toBe(13.6)
    expect(otto.attention!.pct).toBe(0.6)
  })

  it('draws BOTH bands on the month video count, never on the comments', () => {
    const rows = buildStandings(base)
    const otto = rows.find((r) => r.role === 'rival')!
    expect(otto.bandN).toBe(77)
    // The shown proportion is still comments over comments.
    expect(otto.attentionVerdict!.value).toEqual({ k: 45, n: 219 })
    // …and the band is the one a 77-video month deserves: too thin to answer.
    expect(otto.attentionVerdict!.state).toBe('too_little_data')
    expect(otto.contentVerdict!.state).toBe('too_little_data')
  })

  it('answers when the months carry the videos', () => {
    const big = (videos: number, comments: number) => [
      { audience: 'client', panel_videos: videos / 2, attention_comments: comments / 2 },
      { audience: 'competitor:Ottobock', panel_videos: videos / 2, attention_comments: comments / 2 },
    ]
    const rows = buildStandings({
      ...base,
      rows: [
        { audience: 'client', panel_videos: 300, attention_comments: 1000 },
        { audience: 'competitor:Ottobock', panel_videos: 100, attention_comments: 4000 },
      ],
      prevRows: big(800, 8000),
    })
    const otto = rows.find((r) => r.role === 'rival')!
    expect(otto.contentVerdict!.state).toBe('moved')
    expect(otto.contentVerdict!.changePts).toBe(-25)
    expect(otto.attentionVerdict!.state).toBe('moved')
    expect(otto.attentionVerdict!.changePts).toBe(30)
  })

  it('keeps a tracked rival the panel never saw, as NOT OBSERVED and never 0%', () => {
    const rows = buildStandings({ ...base, rivals: [{ name: 'Ottobock' }, { name: 'Ottobock Nordic' }] })
    const quiet = rows.find((r) => r.label === 'Ottobock Nordic')!
    expect(quiet.observed).toBe(false)
    expect(quiet.content).toBeNull()
    expect(quiet.attention).toBeNull()
    expect(quiet.contentVerdict).toBeNull()
    expect(standingText(quiet.content)).toBe(NOT_OBSERVED)
  })

  it('draws an audience nobody asked for rather than hiding conversation', () => {
    const rows = buildStandings({
      ...base,
      rows: [...SEP, { audience: 'competitor:Rareform', panel_videos: 4, attention_comments: 9 }],
      prevRows: undefined,
      prevMonth: null,
    })
    const untracked = rows.find((r) => r.audience === 'competitor:Rareform')!
    expect(untracked.role).toBe('rival')
    expect(untracked.label).toBe('Rareform')
    expect(untracked.observed).toBe(true)
  })

  it('refuses the comparison across a panel re-freeze, and still prints the levels', () => {
    const rows = buildStandings({ ...base, prevPanelId: 'panel-0' })
    const otto = rows.find((r) => r.role === 'rival')!
    expect(otto.contentVerdict!.state).toBe('refused')
    expect(otto.contentVerdict!.refusedReason).toBe('tracking_change')
    expect(otto.attentionVerdict!.state).toBe('refused')
    expect(otto.content!.pct).toBe(10.4)
    expect(otto.attention!.pct).toBe(20.5)
  })

  it('draws no verdict at all when there is no month to compare with', () => {
    const rows = buildStandings({ ...base, prevRows: undefined, prevMonth: null })
    expect(rows.every((r) => r.contentVerdict === null && r.attentionVerdict === null)).toBe(true)
  })

  it('carries the dual-mention count on the client row and nowhere else', () => {
    const rows = buildStandings({ ...base, dualMention: 24 })
    expect(rows.find((r) => r.role === 'client')!.dualMention).toBe(24)
    expect(rows.find((r) => r.role === 'rival')!.dualMention).toBeNull()
    expect(rows.find((r) => r.role === 'category')!.dualMention).toBeNull()
  })

  it('keys a rival off competitors, through the one rival-key rule', () => {
    const rows = buildStandings({ ...base, rivals: [{ name: 'Ottobock' }] })
    expect(rows.find((r) => r.role === 'rival')!.audience).toBe('competitor:Ottobock')
  })

  it('carries the panel id onto every row, so a reader can tell two eras apart', () => {
    const rows = buildStandings(base)
    expect(rows.every((r) => r.panelId === 'panel-1')).toBe(true)
  })
})

describe('standingText', () => {
  it('never prints a zero in place of a silence', () => {
    expect(standingText(null)).toBe(NOT_OBSERVED)
    expect(standingText({ k: 0, n: 0, pct: null })).toBe(NOT_OBSERVED)
    expect(standingText({ k: 0, n: 77, pct: 0 })).toBe('0%')
  })
})

describe('buildStandings under the month-pair rule (decision D, WP1.3)', () => {
  // ONE TENANT (WP1.3 review fix): Össur's panel counts, judged on Össur's
  // own updates (first run 6 Apr, last 13 Sep, paused since). On 2 Oct its
  // September was never read past its end, so the brands view refuses August
  // against September before any change of ours is consulted; no change log
  // is passed, and none is needed for that answer.
  const ossurPair = () =>
    pairOn(pairJudge({ now: '2026-10-02T06:00:00.000Z', changes: [], rows: [], updates: OSSUR_UPDATES }))('2026-08-01', '2026-09-01', BRANDS_PANEL)

  it('refuses both verdicts on every row where the brands view refuses the pair, keeping the shares', () => {
    // A row whose sides clear the band's floors is refused for the pair; one
    // under them reads "too few to compare", the true reason (deploy 1
    // review). Neither is ever "moved".
    const pair = ossurPair()
    const rows = buildStandings({ ...base, comparability: pair })
    const verdicts = rows.filter((x) => x.observed).flatMap((r) => [r.contentVerdict, r.attentionVerdict])
    const refused = verdicts.filter((v) => v?.state === 'refused')
    expect(refused.length).toBeGreaterThan(0)
    for (const v of refused) {
      expect(v?.refusedReason).toBe('incomplete')
      expect(v?.pair?.cause).toBe('not_yet')
    }
    for (const v of verdicts.filter((x) => x?.state !== 'refused')) {
      expect(v?.state).toBe('too_little_data')
      expect(v?.pair).toBeUndefined()
    }
    for (const r of rows.filter((x) => x.observed)) expect(r.content).not.toBeNull()
  })

  it('a re-frozen panel still refuses first, as the panel\'s own rule', () => {
    const pair = ossurPair()
    const rows = buildStandings({ ...base, prevPanelId: 'panel-0', comparability: pair })
    const otto = rows.find((r) => r.role === 'rival')!
    expect(otto.contentVerdict?.refusedReason).toBe('tracking_change')
    expect(otto.contentVerdict?.pair).toBeUndefined()
    expect(otto.attentionVerdict?.pair).toBeUndefined()
  })
})
