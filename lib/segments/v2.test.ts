import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { JUDGE_ROLES, ROLE_SEGMENT, judgeReason, type JudgeRole, type SegmentJudgeBatchResult } from './judge'
import {
  AGENT_DRAW, HAND_CHECK_PRECISION, HEINRICH_DRAW, V2_PLAN_KIND, drawHandCheck, freshJudgements, judgeLogArgs, judgeRows, parsePlan,
  SEGMENT_V2_NOTE, parseMaxUsd, researchSample, scoreHandCheck, seededOrder, stratumOf, tallyLabels, v2Mode,
  type HandCheckItem, type PlanLabel, type PlanVideo, type V2Plan,
} from './v2'

// Figures are staging's (the 20 Sep copy): 5,256 stored Sealand videos, of
// which 1,015 are category videos of the full lane, and the research's 150 hand
// labels are the md5-first 150 of the 850 Aug–Sep category videos (CQ §C; the
// sample was re-derived from WP0.1's export on 27 Sep: population 850, 150).
// The research's class shares on that 150 (B 52, BA 11, M 40, R 5, N 31, O 11,
// CQ F18) are the mix the plan fixture below is built from.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('rows and the ledger', () => {
  it('a judgement becomes a judge row of segments_v2 with the role in its reason', () => {
    const rows = judgeRows(SEALAND_CLIENT_ID, [{ videoId: id(1), segment: 'maker', reason: judgeReason('maker') }], 'scripts/label-segments.ts --rule segments_v2 --apply')
    expect(rows).toEqual([{
      client_id: SEALAND_CLIENT_ID, video_id: id(1), rule_version: 'segments_v2', segment: 'maker', method: 'judge',
      reason: 'judge_role:maker', actor_label: 'scripts/label-segments.ts --rule segments_v2 --apply',
    }])
  })

  it('leaves out what is held, and a repeat, so one insert never trips the one-judge-row index', () => {
    const js = [{ videoId: id(1) }, { videoId: id(2) }, { videoId: id(2) }, { videoId: id(3) }]
    expect(freshJudgements(js, new Set([id(1)])).map((j) => j.videoId)).toEqual([id(2), id(3)])
  })

  it('a batch becomes one ai_call_log row on pass segment_judge', () => {
    const r: SegmentJudgeBatchResult = {
      judgements: [], missing: [id(2)], usage: { prompt_tokens: 5_150, completion_tokens: 1_487 }, costUsd: 0.0044, durationMs: 9_800, error: null,
      call: { model: 'gpt-4.1-mini', promptVersion: 'segments_v2.p1', systemPrompt: 's', userPrompt: 'u', response: { verdicts: [] } },
    }
    const a = judgeLogArgs(r, { clientId: SEALAND_CLIENT_ID, runId: null, callIndex: 3 })
    expect(a).toMatchObject({ pass: 'segment_judge', callIndex: 3, model: 'gpt-4.1-mini', promptVersion: 'segments_v2.p1', validationStatus: 'partial', error: null })
    expect(judgeLogArgs({ ...r, missing: [] }, { clientId: SEALAND_CLIENT_ID, runId: null, callIndex: 1 }).validationStatus).toBe('ok')
    expect(judgeLogArgs({ ...r, error: 'Request timed out.' }, { clientId: SEALAND_CLIENT_ID, runId: null, callIndex: 1 }).validationStatus).toBe('error')
  })
})

// ---- A judged plan, on the research's class mix ---------------------------------------
//
// 150 category full-lane videos labelled in the research's proportions
// (B 52 + R 5 → buyer 57, BA 11, M 40, N 31, O 11), plus 20 rival videos and 10
// unanalysed ones the hand check must never draw.
const MIX: [JudgeRole, number][] = [['buyer', 57], ['buyer-adjacent', 11], ['maker', 40], ['off-topic', 31], ['other', 11]]
function planFixture(): V2Plan {
  const labels: PlanLabel[] = []
  const videos: PlanVideo[] = []
  let n = 0
  const add = (role: JudgeRole, category: boolean, lane: string | null) => {
    n++
    labels.push({ videoId: id(n), role, segment: ROLE_SEGMENT[role], reason: judgeReason(role), why: '' })
    videos.push({ id: id(n), platform: 'youtube', account: `acct ${n}`, caption: `caption ${n}`, hashtags: [], topics: [], category, lane })
  }
  for (const [role, count] of MIX) for (let i = 0; i < count; i++) add(role, true, 'full')
  for (let i = 0; i < 20; i++) add('maker', false, 'full')
  for (let i = 0; i < 10; i++) add('off-topic', true, null)
  return {
    kind: V2_PLAN_KIND, version: 'segments_v2', project: 'zfmxrrugaihxpubunleu', clientId: SEALAND_CLIENT_ID, createdAt: '2026-11-09T09:00:00Z',
    gitSha: 'test', model: 'gpt-4.1-mini', promptVersion: 'segments_v2.p1', maxUsd: 1, costUsd: 0.47, calls: [], labels, missing: [], videos,
  }
}

describe('the plan file', () => {
  it('reads back a plan and refuses another project’s, another tenant’s, or a mislabelled one', () => {
    const p = planFixture()
    expect(parsePlan(JSON.parse(JSON.stringify(p)), { project: 'zfmxrrugaihxpubunleu', clientId: SEALAND_CLIENT_ID }).labels).toHaveLength(180)
    expect(() => parsePlan(p, { project: 'mkwjlckescdveosvrvaq' })).toThrow(/judged on zfmxrrugaihxpubunleu, not --project mkwjlckescdveosvrvaq/)
    expect(() => parsePlan(p, { clientId: 'e52cac94-30e1-426a-9a36-31b11e0b30b6' })).toThrow(/is client/)
    expect(() => parsePlan({ ...p, kind: 'segments_v1' })).toThrow(/not a segments_v2 plan/)
    const bad = planFixture()
    bad.labels[0] = { ...bad.labels[0], segment: 'noise' }
    expect(() => parsePlan(bad)).toThrow(/does not match its role/)
    const twice = planFixture()
    twice.labels.push(twice.labels[0])
    expect(() => parsePlan(twice)).toThrow(/twice/)
  })

  it('tallies roles and segments', () => {
    const t = tallyLabels(planFixture().labels.slice(0, 150))
    expect(t.roles).toEqual({ buyer: 57, 'buyer-adjacent': 11, maker: 40, 'off-topic': 31, other: 11 })
    expect(t.segments).toEqual({ market: 79, maker: 40, noise: 31 })
  })
})

describe('the research’s 150', () => {
  it('are the md5-first 150 of the Aug–Sep category videos of the full lane', () => {
    const videos = Array.from({ length: 200 }, (_, i) => ({ id: id(i), is_client: i === 3, is_competitor: i === 4, analyzed_lane: i === 5 ? null : 'full' }))
    const videoMonths = videos.map((v, i) => ({ video_id: v.id, month: i === 6 ? '2026-07-01' : i % 2 ? '2026-08-01' : '2026-09-01' }))
    const s = researchSample({ videos, videoMonths })
    expect(s).toHaveLength(150)
    for (const out of [id(3), id(4), id(5), id(6)]) expect(s).not.toContain(out)
    // ordered by md5(id), as segments-parity.ts orders them
    expect(researchSample({ videos, videoMonths }, 1000)).toHaveLength(196)
    expect(new Set(s).size).toBe(150)
  })
})

describe('the hand check draw', () => {
  it('draws 50 for the agent (20 maker, 20 off-topic, 10 market) and 20 for Heinrich, disjoint and seeded', () => {
    const plan = planFixture()
    const d = drawHandCheck(plan, new Set(), 'nov-2026')
    expect(d.agent).toHaveLength(50)
    expect(d.heinrich).toHaveLength(20)
    expect(AGENT_DRAW).toEqual({ maker: 20, 'off-topic': 20, market: 10 })
    expect(HEINRICH_DRAW).toEqual({ maker: 10, 'off-topic': 10, market: 0 })
    const role = new Map(plan.labels.map((l) => [l.videoId, l.role]))
    const count = (items: HandCheckItem[], s: string) => items.filter((i) => stratumOf(role.get(i.id)!) === s).length
    expect([count(d.agent, 'maker'), count(d.agent, 'off-topic'), count(d.agent, 'market')]).toEqual([20, 20, 10])
    expect([count(d.heinrich, 'maker'), count(d.heinrich, 'off-topic'), count(d.heinrich, 'market')]).toEqual([10, 10, 0])
    const all = [...d.agent, ...d.heinrich].map((i) => i.id)
    expect(new Set(all).size).toBe(70)
    // the same seed draws the same videos; another seed a fresh set
    expect(drawHandCheck(plan, new Set(), 'nov-2026').agent.map((i) => i.id)).toEqual(d.agent.map((i) => i.id))
    expect(drawHandCheck(plan, new Set(), 'another').agent.map((i) => i.id)).not.toEqual(d.agent.map((i) => i.id))
    expect(() => drawHandCheck(plan, new Set(), ' ')).toThrow(/seed/)
  })

  it('draws only category videos of the full lane, never one of the research’s 150, and works blind', () => {
    const plan = planFixture()
    const excluded = new Set(plan.labels.filter((l) => l.role === 'maker').slice(0, 5).map((l) => l.videoId))
    const d = drawHandCheck(plan, excluded, 'nov-2026')
    const byId = new Map(plan.videos.map((v) => [v.id, v]))
    for (const it of [...d.agent, ...d.heinrich]) {
      expect(byId.get(it.id)!.category).toBe(true)
      expect(byId.get(it.id)!.lane).toBe('full')
      expect(excluded.has(it.id)).toBe(false)
      expect(it.label).toBeNull()
      expect(Object.keys(it)).not.toContain('role')
    }
    expect(d.eligible).toBe(145)
    expect(d.excluded).toBe(5)
    // 40 makers, 5 excluded: 35 left, of the 30 wanted, so none short
    expect(d.short).toEqual([])
  })

  it('says which stratum it could not fill', () => {
    const plan = planFixture()
    plan.labels = plan.labels.filter((l) => l.role !== 'off-topic' || Number(l.videoId.slice(-3)) % 3 === 0)
    const d = drawHandCheck(plan, new Set(), 'nov-2026')
    expect(d.short).toEqual([['off-topic', 30, 10]])
  })

  it('is seeded by md5 of seed and id', () => {
    expect(seededOrder([id(1), id(2), id(3)], 's')).toEqual(seededOrder([id(3), id(1), id(2)], 's'))
  })
})

describe('the hand check score, against 0.8', () => {
  const plan = planFixture()
  const draw = drawHandCheck(plan, new Set(), 'nov-2026')
  const role = new Map(plan.labels.map((l) => [l.videoId, l.role]))
  /** Label every item as the judge did, except `wrong` of each marked stratum. */
  const labelAll = (items: HandCheckItem[], wrong: { maker: number; offTopic: number; missed?: number }) => {
    let m = 0; let o = 0; let x = 0
    return items.map((it): HandCheckItem => {
      const said = role.get(it.id)!
      if (said === 'maker' && m++ < wrong.maker) return { ...it, label: 'buyer' as const }
      if (said === 'off-topic' && o++ < wrong.offTopic) return { ...it, label: 'other' as const }
      if (stratumOf(said) === 'market' && x++ < (wrong.missed ?? 0)) return { ...it, label: 'maker' as const }
      return { ...it, label: said }
    })
  }

  it('passes at 0.8 on both: the agent’s 50 plus Heinrich’s 20, pooled', () => {
    expect(HAND_CHECK_PRECISION).toBe(0.8)
    // 30 maker and 30 off-topic drawn: 6 wrong of each is exactly 0.8
    const items = labelAll([...draw.agent, ...draw.heinrich], { maker: 6, offTopic: 6, missed: 2 })
    const s = scoreHandCheck(items, plan.labels)
    expect(s.maker).toEqual({ k: 24, n: 30, precision: 0.8, pass: true })
    expect(s.offTopic).toEqual({ k: 24, n: 30, precision: 0.8, pass: true })
    expect(s.marketMissed).toEqual({ k: 2, n: 10 })
    expect(s.verdict).toBe('pass')
  })

  it('falls below on either: v2 then ships as a check only', () => {
    const items = labelAll([...draw.agent, ...draw.heinrich], { maker: 7, offTopic: 0 })
    const s = scoreHandCheck(items, plan.labels)
    expect(s.maker.precision).toBeCloseTo(23 / 30, 10)
    expect(s.maker.pass).toBe(false)
    expect(s.offTopic.pass).toBe(true)
    expect(s.verdict).toBe('below')
  })

  it('is incomplete until every item is labelled; a skip leaves the count; an unknown video is named', () => {
    const items = labelAll(draw.agent, { maker: 0, offTopic: 0 })
    items[0] = { ...items[0], label: null }
    expect(scoreHandCheck(items, plan.labels).verdict).toBe('incomplete')
    items[0] = { ...items[0], label: 'skip' }
    const s = scoreHandCheck(items, plan.labels)
    expect(s.labelled).toBe(50)
    expect(s.maker.n + s.offTopic.n + s.marketMissed.n).toBe(49)
    expect(s.verdict).toBe('pass')
    const stray = scoreHandCheck([...items, { ...items[1], id: id(9999) }], plan.labels)
    expect(stray.unknown).toEqual([id(9999)])
    expect(stray.verdict).toBe('incomplete')
  })

  it('knows every role', () => {
    expect(JUDGE_ROLES.map(stratumOf)).toEqual(['market', 'market', 'maker', 'off-topic', 'market'])
  })
})

describe('the script’s modes: only --spend reaches the model, and never with a write', () => {
  it('prices by default, judges only with --spend and a plan file, reviews or applies a plan', () => {
    expect(v2Mode({ apply: false, spend: false })).toBe('project')
    expect(v2Mode({ apply: false, spend: true, planOut: 'p.json' })).toBe('judge')
    expect(v2Mode({ apply: false, spend: false, fromPlan: 'p.json' })).toBe('review')
    expect(v2Mode({ apply: true, spend: false, fromPlan: 'p.json' })).toBe('apply')
  })

  it('refuses every mix that would spend and write at once, or spend and lose what it paid for', () => {
    expect(() => v2Mode({ apply: true, spend: true, planOut: 'p.json' })).toThrow(/two pastes/)
    expect(() => v2Mode({ apply: false, spend: true })).toThrow(/--plan-out/)
    expect(() => v2Mode({ apply: false, spend: true, planOut: 'a', fromPlan: 'b' })).toThrow(/takes no --spend/)
    expect(() => v2Mode({ apply: false, spend: false, planOut: 'p.json' })).toThrow(/only by a judged run/)
    expect(() => v2Mode({ apply: true, spend: false })).toThrow(/--apply --from-plan/)
  })

  it('--max-usd defaults to decision L’s top, $1.00, and takes only a plain number', () => {
    expect(parseMaxUsd(undefined)).toBe(1)
    expect(parseMaxUsd('0.75')).toBe(0.75)
    for (const bad of ['', 'one', '-1', '1e3', 'NaN']) expect(() => parseMaxUsd(bad)).toThrow(/US dollars/)
  })

  it('the change row’s note is client words: no digit, no em dash', () => {
    expect(SEGMENT_V2_NOTE).not.toMatch(/\d/)
    expect(SEGMENT_V2_NOTE).not.toContain('—')
    expect(SEGMENT_V2_NOTE).toContain('Nothing was taken out of any count.')
  })
})
