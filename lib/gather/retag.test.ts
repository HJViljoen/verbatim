import { describe, expect, it } from 'vitest'
import {
  applyRefusals,
  configFingerprint,
  decideApply,
  editPlan,
  identitySkip,
  judgeable,
  movedAudiences,
  pairTotals,
  passAConsequences,
  planRetag,
  PRODUCTION_REF,
  projectRefOf,
  retagIdentities,
  STAGING_REF,
  tagsForAudience,
  type RetagPlan,
  type RetagRow,
} from './retag'
import type { VideoTags } from './tagging'
import type { GatherConfig } from './types'

// The corpus re-tag, decided without I/O. Every case here is one the 2026-09-24
// design or its skeptic named: identity rows by source AND by account, fallback
// tags never written, a plan replayed exactly, drift and re-runs told apart,
// and the project guard.

const SEALAND = 'ac16988e-c4f3-4baf-b388-73895852a554'

const config: GatherConfig = {
  brand_keywords: ['sealand gear', '#sealandgear', 'sealand bag'],
  competitor_names: ['Cotopaxi', 'Freitag', 'Patagonia', 'The North Face'],
  competitor_keywords: ['cotopaxi backpack', 'freitag bag', 'north face backpack', 'patagonia black hole'],
  industry_keywords: ['upcycled bag'],
  exclude_terms: ['ecuador', 'volcano'],
  platforms: ['instagram', 'youtube'],
  max_videos: 25,
  comment_depth: 50,
  report_period: 'weekly',
  own_handles: { instagram: 'sealandgear', tiktok: 'sealandgear' },
  subreddits: [],
}
const competitorHandles = { Freitag: { instagram: 'freitaglab' }, Cotopaxi: { instagram: 'cotopaxi' } }

const UNTAGGED: VideoTags = { is_client: false, is_competitor: false, competitor_name: null }
const CLIENT: VideoTags = { is_client: true, is_competitor: false, competitor_name: null }
const rival = (name: string): VideoTags => ({ is_client: false, is_competitor: true, competitor_name: name })

let n = 0
const row = (o: Partial<RetagRow> & Pick<RetagRow, 'caption'>): RetagRow => {
  n++
  return {
    id: `row-${n}`,
    video_id: `vid-${n}`,
    platform: 'instagram',
    source: 'discovered',
    account_name: `someone${n}`,
    hashtags: [],
    comments_count: 10,
    analyzed_lane: 'full',
    transcript_status: null,
    is_client: false,
    is_competitor: false,
    competitor_name: null,
    ...o,
  }
}

describe('identitySkip — by source AND by account', () => {
  const rows = [
    row({ caption: 'own post', source: 'owned', account_name: 'sealandgear', is_client: true }),
    row({ caption: 'rival post', source: 'competitor_owned', account_name: 'freitaglab', is_competitor: true, competitor_name: 'Freitag' }),
  ]
  const identities = retagIdentities(rows, config.own_handles, competitorHandles)

  it('spares owned and competitor_owned rows by source', () => {
    expect(identitySkip(rows[0], identities)).toBe('source owned')
    expect(identitySkip(rows[1], identities)).toBe('source competitor_owned')
  })

  // The skeptic's case. On production the reconcile never ran, so an own post
  // the keyword gather found first is still 'discovered'; sealandgear's handle
  // carries no brand keyword, so the judge would call it industry and the
  // re-tag would strip is_client from the client's own post.
  it('spares a DISCOVERED sealandgear post with no brand keyword — it never moves', () => {
    const own = row({ caption: 'new drop, link in bio 🎒', account_name: 'SealandGear', is_client: true })
    expect(identitySkip(own, identities)).toBe('the client’s own account')
    const plan = planRetag([own], new Map([[own.id, UNTAGGED]]), new Set(), identities, config)
    expect(plan.changes).toEqual([])
    expect(plan.spared.map((s) => s.row.id)).toEqual([own.id])
    expect(judgeable([own], identities)).toEqual([])
  })

  it('spares a tracked rival’s own account by account too', () => {
    const r = row({ caption: 'Freitag 21.8.', account_name: 'freitaglab', is_competitor: true, competitor_name: 'Freitag' })
    expect(identitySkip(r, identities)).toBe('Freitag’s own account')
  })

  it('reads an account the owned read stored, not only the configured handle', () => {
    const yt = [row({ caption: 'x', platform: 'youtube', source: 'owned', account_name: 'Sealand Gear SA', is_client: true })]
    const ids = retagIdentities(yt, { ...config.own_handles, youtube: 'UCabc' }, {})
    expect(identitySkip(row({ caption: 'y', platform: 'youtube', account_name: 'Sealand Gear SA' }), ids)).toBe('the client’s own account')
  })

  it('judges a stranger’s post', () => {
    expect(identitySkip(row({ caption: 'my freitag bag' }), identities)).toBeNull()
  })
})

describe('planRetag', () => {
  const identities = retagIdentities([], config.own_handles, competitorHandles)
  const erda = row({ caption: 'was haltet ihr von diesen Freitag 🙇‍♀️ @sampagnebaby', is_competitor: true, competitor_name: 'Freitag' })
  const patagonia = row({ caption: 'Patagonia Black Hole duffel after 3 years', platform: 'youtube' })
  const genuine = row({ caption: 'my freitag bag', is_competitor: true, competitor_name: 'Freitag' })
  const failed = row({ caption: 'Freitag Live #friday', is_competitor: true, competitor_name: 'Freitag' })
  const industry = row({ caption: 'best travel daypacks' })

  const finalTags = new Map<string, VideoTags>([
    [erda.id, UNTAGGED],
    [patagonia.id, rival('Patagonia')],
    [genuine.id, rival('Freitag')],
    [failed.id, UNTAGGED], // tagWithoutJudge's answer — but no verdict
    [industry.id, UNTAGGED],
  ])
  const plan = planRetag([erda, patagonia, genuine, failed, industry], finalTags, new Set([failed.id]), identities, config)

  it('moves exactly the rows whose verdict differs from what is stored', () => {
    expect(plan.changes.map((c) => c.id)).toEqual([erda.id, patagonia.id])
    expect(plan.changes[0]).toEqual({ id: erda.id, video_id: erda.video_id, platform: 'instagram', before: rival('Freitag'), after: UNTAGGED })
  })

  it('never plans a row tagged without a judge — even when its tag would change', () => {
    expect(plan.changes.some((c) => c.id === failed.id)).toBe(false)
    expect(plan.fallback.map((r) => r.id)).toEqual([failed.id])
  })

  it('keeps the judged rows that stay, and only those — the rows --set may add', () => {
    expect(plan.kept.map((k) => k.id)).toEqual([genuine.id])
  })

  it('totals the moves by pair, and names every audience they touched', () => {
    expect(pairTotals(plan.changes)).toEqual([
      ['competitor:Freitag → industry-other', 1],
      ['industry-other → competitor:Patagonia', 1],
    ])
    expect(movedAudiences(plan.changes)).toEqual(['competitor:Freitag', 'competitor:Patagonia', 'industry-other'])
  })
})

const basePlan = (o: Partial<RetagPlan> = {}): RetagPlan => ({
  version: 1,
  clientId: SEALAND,
  project: STAGING_REF,
  createdAt: '2026-09-25T10:00:00.000Z',
  gitSha: 'abc123',
  method: 'gpt',
  promptVersion: 'attribution_v2',
  configFingerprint: 'f00d',
  costUsd: 0.08,
  judged: 960,
  failedBatches: 0,
  errors: [],
  fallbackIds: [],
  spared: 152,
  changes: [
    { id: 'erda', video_id: 'v-erda', platform: 'tiktok', before: rival('Freitag'), after: UNTAGGED },
    { id: 'alexa', video_id: 'v-alexa', platform: 'instagram', before: rival('Cotopaxi'), after: UNTAGGED },
    { id: 'reddit', video_id: 'v-r', platform: 'reddit', before: rival('Cotopaxi'), after: rival('Patagonia') },
  ],
  kept: [{ id: 'otto', video_id: 'v-otto', platform: 'youtube', tags: rival('Freitag') }],
  ...o,
})

describe('the plan file', () => {
  it('round-trips through JSON and replays to the same decisions', () => {
    const plan = basePlan()
    const back = JSON.parse(JSON.stringify(plan)) as RetagPlan
    expect(back).toEqual(plan)
    const stored = new Map(plan.changes.map((c) => [c.id, row({ caption: '', id: c.id, ...c.before })]))
    expect(decideApply(back, stored, []).map((d) => d.verdict)).toEqual(['write', 'write', 'write'])
  })
})

describe('decideApply — re-checked against the rows as they are now', () => {
  const plan = basePlan()
  const stored = (o: Record<string, Partial<RetagRow>>) => new Map(plan.changes.map((c) => [c.id, row({ caption: '', id: c.id, ...c.before, ...(o[c.id] ?? {}) })]))

  it('writes a row still in its planned before-state', () => {
    expect(decideApply(plan, stored({}), [])[0]).toMatchObject({ verdict: 'write' })
  })

  it('calls a row already at its after-state applied, not drift — a re-run after a partial apply', () => {
    const d = decideApply(plan, stored({ erda: { ...UNTAGGED } }), [])
    expect(d[0]).toMatchObject({ verdict: 'already' })
  })

  it('leaves a row that moved elsewhere since the plan, and says where it is', () => {
    const d = decideApply(plan, stored({ alexa: { is_competitor: true, competitor_name: 'Patagonia' } }), [])
    expect(d[1]).toMatchObject({ verdict: 'drift', reason: 'stored competitor:Patagonia, plan expected competitor:Cotopaxi' })
  })

  it('refuses a row that has become an own post since the plan — by source or by account', () => {
    const ids = retagIdentities([], config.own_handles, competitorHandles)
    const d = decideApply(plan, stored({ erda: { source: 'owned' }, alexa: { account_name: 'sealandgear' } }), ids)
    expect(d[0]).toMatchObject({ verdict: 'identity', reason: 'source owned' })
    expect(d[1]).toMatchObject({ verdict: 'identity', reason: 'the client’s own account' })
  })

  it('reports a row that is gone', () => {
    const s = stored({})
    s.delete('reddit')
    expect(decideApply(plan, s, [])[2]).toMatchObject({ verdict: 'missing' })
  })
})

describe('applyRefusals — the guards', () => {
  const ok = {
    plan: basePlan(),
    clientId: SEALAND,
    project: STAGING_REF,
    supabaseUrl: `https://${STAGING_REF}.supabase.co`,
    configFingerprint: 'f00d',
    inflight: [] as { id: string; status: string }[],
    allowInflight: false,
  }

  it('lets a clean apply through', () => {
    expect(applyRefusals(ok)).toEqual([])
  })

  it('refuses when the Supabase host is not --project', () => {
    expect(applyRefusals({ ...ok, supabaseUrl: `https://${PRODUCTION_REF}.supabase.co` })[0])
      .toBe(`the Supabase URL points at ${PRODUCTION_REF}, not --project ${STAGING_REF}`)
  })

  it('refuses a plan judged against another project — a staging plan on production', () => {
    const r = applyRefusals({ ...ok, project: PRODUCTION_REF, supabaseUrl: `https://${PRODUCTION_REF}.supabase.co` })
    expect(r).toEqual([`the plan was judged against ${STAGING_REF}, not ${PRODUCTION_REF}`])
  })

  it('refuses another client’s plan, and a plan whose config has changed since', () => {
    expect(applyRefusals({ ...ok, clientId: 'other' })).toHaveLength(1)
    expect(applyRefusals({ ...ok, configFingerprint: 'beef' })[0]).toContain('tracking config changed')
  })

  it('refuses while a run is in flight', () => {
    expect(applyRefusals({ ...ok, inflight: [{ id: 'ddbbffe4', status: 'analyzing' }] }))
      .toEqual(['a run is in flight for this client: ddbbffe4 (analyzing)'])
  })

  it('accepts --allow-inflight for the staging ref only', () => {
    expect(applyRefusals({ ...ok, inflight: [{ id: 'ddbbffe4', status: 'analyzing' }], allowInflight: true })).toEqual([])
  })

  it('refuses --allow-inflight against production, run or no run', () => {
    const prod = { ...ok, plan: basePlan({ project: PRODUCTION_REF }), project: PRODUCTION_REF, supabaseUrl: `https://${PRODUCTION_REF}.supabase.co`, allowInflight: true }
    expect(applyRefusals(prod)).toEqual(['--allow-inflight is refused against production'])
    expect(applyRefusals({ ...prod, inflight: [{ id: 'r1', status: 'running' }] })).toEqual([
      '--allow-inflight is refused against production',
      'a run is in flight for this client: r1 (running)',
    ])
  })

  it('refuses a plan that carries a row tagged without a judge', () => {
    expect(applyRefusals({ ...ok, plan: basePlan({ fallbackIds: ['erda'] }) })[0]).toContain('tagged without a judge')
  })
})

describe('projectRefOf', () => {
  it('reads the ref off a Supabase URL and nothing else', () => {
    expect(projectRefOf(`https://${PRODUCTION_REF}.supabase.co`)).toBe(PRODUCTION_REF)
    expect(projectRefOf('http://localhost:54321')).toBeNull()
    expect(projectRefOf(undefined)).toBeNull()
  })
})

describe('configFingerprint', () => {
  it('ignores key order and moves with any term or handle', () => {
    const a = configFingerprint(config, competitorHandles)
    expect(configFingerprint({ ...config }, { Cotopaxi: { instagram: 'cotopaxi' }, Freitag: { instagram: 'freitaglab' } })).toBe(a)
    expect(configFingerprint({ ...config, exclude_terms: ['ecuador'] }, competitorHandles)).not.toBe(a)
    expect(configFingerprint({ ...config, own_handles: {} }, competitorHandles)).not.toBe(a)
  })
})

describe('editPlan — a reviewer can correct a plan, exactly', () => {
  const names = config.competitor_names

  it('drops a row by id or by its video id', () => {
    const p = editPlan(basePlan(), { drop: ['erda', 'v-alexa'], set: [] }, names)
    expect(p.changes.map((c) => c.id)).toEqual(['reddit'])
    expect(p.edits).toEqual(['dropped erda (competitor:Freitag → industry-other)', 'dropped alexa (competitor:Cotopaxi → industry-other)'])
  })

  it('re-points a planned change, keeping its recorded before-state', () => {
    const p = editPlan(basePlan(), { drop: [], set: [{ id: 'reddit', audience: 'industry-other' }] }, names)
    expect(p.changes.find((c) => c.id === 'reddit')).toMatchObject({ before: rival('Cotopaxi'), after: UNTAGGED })
  })

  it('treats setting a change back to where it was as a drop', () => {
    const p = editPlan(basePlan(), { drop: [], set: [{ id: 'erda', audience: 'competitor:Freitag' }] }, names)
    expect(p.changes.some((c) => c.id === 'erda')).toBe(false)
  })

  it('moves a row the judge kept — the plan’s before-state becomes the check', () => {
    const p = editPlan(basePlan(), { drop: [], set: [{ id: 'otto', audience: 'industry-other' }] }, names)
    expect(p.changes.at(-1)).toEqual({ id: 'otto', video_id: 'v-otto', platform: 'youtube', before: rival('Freitag'), after: UNTAGGED })
    expect(p.kept).toEqual([])
  })

  it('refuses what it cannot apply exactly', () => {
    expect(() => editPlan(basePlan(), { drop: ['nope'], set: [] }, names)).toThrow('not a planned change')
    expect(() => editPlan(basePlan(), { drop: [], set: [{ id: 'nope', audience: 'client' }] }, names)).toThrow('not a row the judge saw')
    expect(() => editPlan(basePlan(), { drop: [], set: [{ id: 'erda', audience: 'competitor:Osprey' }] }, names)).toThrow('tracked competitor')
    expect(() => editPlan(basePlan(), { drop: [], set: [{ id: 'otto', audience: 'competitor:freitag' }] }, names)).toThrow('there already')
    expect(() => editPlan(basePlan(), { drop: ['erda'], set: [{ id: 'erda', audience: 'client' }] }, names)).toThrow()
    const twin = basePlan({ changes: [...basePlan().changes, { id: 'erda-yt', video_id: 'v-erda', platform: 'youtube', before: CLIENT, after: UNTAGGED }] })
    expect(() => editPlan(twin, { drop: ['v-erda'], set: [] }, names)).toThrow('pass the row id')
  })

  it('knows the tracked audiences, in their configured spelling', () => {
    expect(tagsForAudience('competitor:the north face', names)).toEqual(rival('The North Face'))
    expect(tagsForAudience('client', names)).toEqual(CLIENT)
    expect(tagsForAudience('rival', names)).toBeNull()
  })
})

describe('passAConsequences — what the next run’s Pass A does about the moves', () => {
  it('re-reads full-lane moves, and counts the claims lane in and out', () => {
    const moves = [
      { change: { before: UNTAGGED, after: rival('Patagonia') }, row: row({ caption: '', analyzed_lane: 'full' }) },
      { change: { before: rival('Freitag'), after: UNTAGGED }, row: row({ caption: '', analyzed_lane: 'full' }) },
      { change: { before: UNTAGGED, after: rival('Patagonia') }, row: row({ caption: '', analyzed_lane: null, transcript_status: 'ok' }) },
      { change: { before: rival('Cotopaxi'), after: UNTAGGED }, row: row({ caption: '', analyzed_lane: 'claims_only' }) },
      { change: { before: UNTAGGED, after: rival('Patagonia') }, row: row({ caption: '', analyzed_lane: null, transcript_status: null }) },
    ]
    expect(passAConsequences(moves)).toEqual({ reread: 2, enterClaims: 1, leaveClaims: 1 })
  })
})
