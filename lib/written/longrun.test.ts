import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import type { QuoteVideo } from '../quote-gate'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '../rivals'
import type { DatedEvidence } from './evidence'
import {
  buildLongRunPool, CHANGE, composeLongRun, endedMonthOf, isLongRunEligible, judgeLongRunTheme, longRunMonths, longRunRowOf,
  LONGRUN_STEP_FLOOR_MS, maybeWriteLongRun, monthsPhrase, rankLongRun, scrubLongRun, selectLongRun, themesToJudge, windowOfMonths,
  type BuiltLongRun, type LongRunCandidate, type LongRunJudgement, type LongRunPool,
} from './longrun'
import { buildLongRunPrompts, longRunSchema, whoWords } from './longrun-write'
import type { PoolTheme } from './pool'
import type { WeekReadRow } from './store'

// The long-run read (pages build, 1 Oct): its window, its pool's rules, the
// scrub's no-change rule, compose's floors, and the step hook's never-throw
// contract. No database and no model: the reads are the week pool's own.

const SEALAND = SEALAND_CLIENT_ID
const AUG = '2026-08-01'
const SEP = '2026-09-01'

const bagVideo = (n: number, over: Partial<QuoteVideo> = {}): QuoteVideo => ({
  platform: 'youtube',
  videoId: `yt${n}`,
  caption: 'My everyday backpack for travel: a carry on review after six months',
  hashtags: ['backpack', 'onebag'],
  topics: ['travel backpack', 'carry on'],
  accountName: `Creator ${n}`,
  isClient: false,
  isCompetitor: false,
  competitorName: null,
  source: 'discovered',
  segment: 'market',
  ...over,
})

let seq = 0
function ev(o: { insight: string; video: number; text: string; date?: string; audience?: string; lane?: string | null; context?: Partial<QuoteVideo>; kind?: string; insider?: boolean }): DatedEvidence {
  seq += 1
  return {
    insightId: o.insight,
    kind: o.kind ?? 'pain_point',
    description: `Paraphrase of ${o.insight}`,
    theme: `slug_${o.insight}`,
    evidenceId: `e${String(seq).padStart(4, '0')}`,
    rank: 1,
    commentId: `c${seq}`,
    commentDate: o.date ?? '2026-09-24T00:00:00+00:00',
    author: `viewer${seq}`,
    text: o.text,
    lang: 'en',
    english: null,
    video: { uuid: `v-${o.video}`, platform: 'youtube', videoId: `yt${o.video}`, audience: o.audience ?? INDUSTRY_AUDIENCE, lane: o.lane === undefined ? 'full' : o.lane, accountName: `Creator ${o.video}` },
    context: bagVideo(o.video, o.context ?? {}),
    ...(o.insider ? { insider: true } : {}),
  }
}

const LINES = [
  'The straps on this backpack dig into my shoulders after an hour of walking.',
  'My back hurts when the backpack is full, the shoulder straps need more padding.',
  'The hip belt on this backpack is too thin and my hips are sore by the end of the day.',
  'This backpack has no load lifters so the weight pulls on my shoulders all day.',
  'I bought this backpack in green last spring for my trips.',
  'Which backpack is this one, the grey version from the video?',
]

const THEME: PoolTheme = {
  themeId: 'th-comfort',
  label: 'Comfort depends on structure and straps',
  description: 'People say a pack is comfortable when its straps and back panel carry the load.',
  kind: 'pain_point',
  matchKind: 'strong',
  memberIds: ['i1', 'i2', 'i3', 'i4', 'i5', 'i6'],
  weekVideos: 9,
}
const UNIVERSE = new Set([INDUSTRY_AUDIENCE, 'competitor:Cotopaxi', CLIENT_AUDIENCE])

describe('the window', () => {
  it('whole months back to the first month the market cleared the floor, at most three', () => {
    expect(longRunMonths(SEP, AUG)).toEqual([AUG, SEP])
    expect(longRunMonths(SEP, '2026-06-01')).toEqual(['2026-07-01', AUG, SEP])
    expect(longRunMonths(SEP, SEP)).toEqual([SEP])
    expect(longRunMonths(SEP, null)).toEqual([SEP])
    expect(longRunMonths('2026-01-01', '2025-11-01')).toEqual(['2025-11-01', '2025-12-01', '2026-01-01'])
  })

  it('names its months in words', () => {
    expect(monthsPhrase([AUG, SEP])).toBe('August and September')
    expect(monthsPhrase(['2026-07-01', AUG, SEP])).toBe('July, August and September')
    expect(monthsPhrase([SEP])).toBe('September')
  })

  it('is half-open on whole months', () => {
    expect(windowOfMonths([AUG, SEP])).toEqual({ from: '2026-08-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' })
  })

  it('a run closes the month its week has carried past', () => {
    // 27 Sep to 4 Oct: September has ended.
    expect(endedMonthOf({ from: '2026-09-27T04:03:00Z', to: '2026-10-04T04:02:00Z' })).toBe(SEP)
    // 20 to 27 Sep: August is the last month that ended.
    expect(endedMonthOf({ from: '2026-09-20T04:02:00Z', to: '2026-09-27T04:03:00Z' })).toBe(AUG)
  })
})

describe('one theme over the window', () => {
  it('counts lenient-gated videos on the market and the client\'s own posts, by month, never a maker\'s or another lane', () => {
    const evidence = [
      ev({ insight: 'i1', video: 1, text: LINES[0], date: '2026-08-12T00:00:00Z' }),
      ev({ insight: 'i2', video: 2, text: LINES[1] }),
      ev({ insight: 'i3', video: 3, text: LINES[2], audience: CLIENT_AUDIENCE, context: { isClient: true, source: 'owned' } }),
      ev({ insight: 'i4', video: 4, text: LINES[3], audience: 'competitor:Cotopaxi' }),
      ev({ insight: 'i5', video: 5, text: LINES[4], context: { segment: 'maker' } }),
      ev({ insight: 'i6', video: 6, text: LINES[5], lane: 'light' }),
      ev({ insight: 'other', video: 7, text: LINES[0] }),
    ]
    const j = judgeLongRunTheme(SEALAND, THEME, evidence, UNIVERSE)
    expect(j.videoIds).toEqual(['v-1', 'v-2', 'v-3', 'v-4'])
    expect(j.monthVideoIds).toEqual({ [AUG]: ['v-1'], [SEP]: ['v-2', 'v-3', 'v-4'] })
    expect(j.videos.map((v) => v.audience)).toEqual([INDUSTRY_AUDIENCE, INDUSTRY_AUDIENCE, CLIENT_AUDIENCE, 'competitor:Cotopaxi'])
    expect(j.makerVideos).toBe(1)
    expect(j.notes.length).toBeGreaterThan(0)
  })

  it('a brand insider counts toward nothing', () => {
    const j = judgeLongRunTheme(SEALAND, THEME, [ev({ insight: 'i1', video: 1, text: LINES[0], insider: true })], UNIVERSE)
    expect(j.videoIds).toEqual([])
  })

  it('a candidate needs three videos and is not maker-led; ranked by videos, then months heard', () => {
    const base = { seenVideos: 4, makerVideos: 0 }
    expect(isLongRunEligible({ videoIds: ['a', 'b'], ...base })).toBe(false)
    expect(isLongRunEligible({ videoIds: ['a', 'b', 'c'], ...base })).toBe(true)
    expect(isLongRunEligible({ videoIds: ['a', 'b', 'c'], seenVideos: 4, makerVideos: 2 })).toBe(false)
    const j = (id: string, videos: number, months: number): LongRunJudgement => ({
      theme: { ...THEME, themeId: id }, videoIds: Array.from({ length: videos }, (_, i) => `${id}-${i}`),
      monthVideoIds: months === 2 ? { [AUG]: [`${id}-0`], [SEP]: [`${id}-1`] } : { [SEP]: [`${id}-0`] },
      kinds: [], dominantKind: null, notes: [], videos: [], seenVideos: videos, makerVideos: 0,
    })
    expect(rankLongRun([j('a', 4, 1), j('b', 4, 2), j('c', 9, 1), j('d', 2, 2)]).map((x) => x.theme.themeId)).toEqual(['c', 'b', 'a'])
  })
})

function cand(id: string, o: { aug?: number; sep?: number; audience?: string; named?: string[] } = {}): LongRunCandidate {
  const aug = Array.from({ length: o.aug ?? 2 }, (_, i) => `${id}-a${i}`)
  const sep = Array.from({ length: o.sep ?? 4 }, (_, i) => `${id}-s${i}`)
  const videoIds = [...aug, ...sep]
  const whoVideos = videoIds.map((v) => ({ id: v, audience: o.audience ?? INDUSTRY_AUDIENCE, named: o.named ?? [] }))
  return {
    id, themeId: `th-${id}`, label: `Theme ${id}`, description: null, kinds: ['question'], dominantKind: 'question',
    videoIds, monthVideoIds: { ...(aug.length ? { [AUG]: aug } : {}), ...(sep.length ? { [SEP]: sep } : {}) }, notes: [`People say ${id}.`],
    whoVideos, who: [],
  }
}

const POOL = (candidates: LongRunCandidate[]): LongRunPool => ({
  clientId: SEALAND, runId: 'run-27', month: SEP, months: [AUG, SEP], window: windowOfMonths([AUG, SEP]), candidates, thin: false,
})

const idea = (headline: string, based_on: string[], body = 'Buyers ask where to buy it.\n\nThe route to order is part of the product.') => ({ headline, body, based_on })

describe('compose', () => {
  it('prints ideas heard in both months with five videos or more, largest first, each candidate once', () => {
    const pool = POOL([cand('C1', { aug: 1, sep: 3 }), cand('C2', { aug: 3, sep: 6 }), cand('C3', { aug: 2, sep: 2 })])
    const data = composeLongRun({
      pool,
      written: { ideas: [idea('Small one', ['C1', 'C3']), idea('Big one', ['C2']), idea('Reuses C2', ['C2'])], in_short: 'Buyers ask before they buy.' },
      company: 'Sealand', model: 'gpt-5.4', costUsd: 0.123456,
    })
    expect(data.ideas.map((i) => i.headline)).toEqual(['Big one', 'Small one'])
    expect(data.ideas[0]).toMatchObject({ videos: 9, basedOn: ['th-C2'], months: [{ month: AUG, videos: 3 }, { month: SEP, videos: 6 }], sure: 'reasonable' })
    expect(data.ideas[1].body).toEqual(['Buyers ask where to buy it.', 'The route to order is part of the product.'])
    expect(data.held.map((h) => h.headline)).toEqual(['Reuses C2'])
    expect(data).toMatchObject({ kind: 'longrun', version: 1, promptVersion: 'longrun_read_v1', months: [AUG, SEP], inShort: 'Buyers ask before they buy.', costUsd: 0.1235 })
  })

  it('holds an idea heard in one month only, or not in the read\'s month, or under five videos', () => {
    const pool = POOL([cand('C1', { aug: 0, sep: 8 }), cand('C2', { aug: 8, sep: 0 }), cand('C3', { aug: 1, sep: 2 })])
    const data = composeLongRun({ pool, written: { ideas: [idea('Sep only', ['C1']), idea('Aug only', ['C2']), idea('Thin', ['C3'])], in_short: 'Lead.' }, company: 'Sealand', model: 'm', costUsd: 0 })
    expect(data.ideas).toEqual([])
    expect(data.held.map((h) => h.reason)).toEqual([
      'not heard across the months (September)',
      'not heard across the months (August)',
      'too little evidence (3 videos)',
    ])
    expect(data.inShort).toBe('')
  })

  it('holds a contradicted headline, an invented id, and a lead the conversation contradicts', () => {
    const pool = POOL([cand('C1'), cand('C2')])
    const data = composeLongRun({
      pool,
      written: { ideas: [idea('Wrong', ['C1']), idea('Invented', ['C9']), idea('Right', ['C2'])], in_short: 'Bad lead.' },
      contradicted: new Map([['Wrong', 'They say the opposite'], ['Bad lead.', null]]),
      company: 'Sealand', model: 'm', costUsd: 0,
    })
    expect(data.ideas.map((i) => i.headline)).toEqual(['Right'])
    expect(data.held.map((h) => h.reason)).toEqual(['the conversation contradicts it: They say the opposite', 'it cites no candidate that is left', 'the conversation contradicts it'])
    expect(data.inShort).toBe('')
  })

  it('says who each idea is about, one brand per video, the client first and the category last', () => {
    const pool = POOL([
      cand('C1', { aug: 1, sep: 2, audience: CLIENT_AUDIENCE }),
      cand('C2', { aug: 1, sep: 1, audience: 'competitor:Cotopaxi' }),
      cand('C3', { aug: 1, sep: 2, named: ['Patagonia', 'The North Face'] }),
      cand('C4', { aug: 1, sep: 1 }),
    ])
    const data = composeLongRun({ pool, written: { ideas: [idea('Mixed', ['C1', 'C2', 'C3', 'C4'])], in_short: '' }, company: 'Sealand', model: 'm', costUsd: 0 })
    expect(data.ideas[0].who).toEqual([
      { about: 'client', videos: 3 },
      { about: 'rival:Patagonia', videos: 3 },
      { about: 'rival:Cotopaxi', videos: 2 },
      { about: 'market', videos: 2 },
    ])
    expect(data.ideas[0].who.reduce((n, p) => n + p.videos, 0)).toBe(data.ideas[0].videos)
  })

  it('caps at five', () => {
    const cs = Array.from({ length: 7 }, (_, i) => cand(`C${i + 1}`, { aug: 2, sep: 3 + i }))
    const data = composeLongRun({ pool: POOL(cs), written: { ideas: cs.map((c) => idea(`Idea ${c.id}`, [c.id])), in_short: 'Lead.' }, company: 'Sealand', model: 'm', costUsd: 0 })
    expect(data.ideas.map((i) => i.headline)).toEqual(['Idea C7', 'Idea C6', 'Idea C5', 'Idea C4', 'Idea C3'])
    expect(data.held.filter((h) => h.reason === 'over the cap')).toHaveLength(2)
  })

  it('stores no comment words and a thin pool composes empty', () => {
    const thin = composeLongRun({ pool: { ...POOL([]), thin: true }, written: null, company: 'Sealand', model: '', costUsd: 0 })
    expect(thin.ideas).toEqual([])
    expect(thin.inShort).toBe('')
  })
})

describe('the pool', () => {
  it('names candidates in rank order, attributes each video, and is thin on one month or under three candidates', () => {
    const j = (id: string): LongRunJudgement => ({
      theme: { ...THEME, themeId: id, label: `Label ${id}` }, videoIds: [`${id}-1`, `${id}-2`, `${id}-3`],
      monthVideoIds: { [SEP]: [`${id}-1`, `${id}-2`, `${id}-3`] }, kinds: ['praise'], dominantKind: 'praise', notes: [],
      videos: [{ id: `${id}-1`, audience: INDUSTRY_AUDIENCE, comments: ['k1'] }, { id: `${id}-2`, audience: CLIENT_AUDIENCE, comments: [] }, { id: `${id}-3`, audience: INDUSTRY_AUDIENCE, comments: [] }],
      seenVideos: 3, makerVideos: 0,
    })
    const head = { clientId: SEALAND, runId: 'run', month: SEP, months: [AUG, SEP], window: windowOfMonths([AUG, SEP]) }
    const p = buildLongRunPool(head, [j('a'), j('b'), j('c')], new Map([['k1', ['Cotopaxi']]]), 'Sealand')
    expect(p.candidates.map((c) => c.id)).toEqual(['C1', 'C2', 'C3'])
    expect(p.candidates[0].who).toEqual([{ about: 'client', videos: 1 }, { about: 'rival:Cotopaxi', videos: 1 }, { about: 'market', videos: 1 }])
    expect(p.thin).toBe(false)
    expect(buildLongRunPool(head, [j('a'), j('b')], new Map(), 'Sealand').thin).toBe(true)
    expect(buildLongRunPool({ ...head, months: [SEP] }, [j('a'), j('b'), j('c')], new Map(), 'Sealand').thin).toBe(true)
  })
})

describe('themesToJudge', () => {
  it('the bigger themes, and any on three of the client\'s own posts', () => {
    const rows = [
      { audience: INDUSTRY_AUDIENCE, theme_id: 'big', videos: 4 },
      { audience: 'competitor:Cotopaxi', theme_id: 'big', videos: 2 },
      { audience: INDUSTRY_AUDIENCE, theme_id: 'small', videos: 4 },
      { audience: CLIENT_AUDIENCE, theme_id: 'own', videos: 3 },
      { audience: CLIENT_AUDIENCE, theme_id: 'tiny-own', videos: 2 },
    ]
    expect(themesToJudge(rows)).toEqual([{ theme_id: 'big', videos: 6 }, { theme_id: 'own', videos: 3 }])
  })
})

describe('selectLongRun', () => {
  it('keeps room for the themes led by the client\'s talk and by the rivals\', in rank order', () => {
    const m = (id: string, about: 'market' | 'client' | 'rival:Cotopaxi') => ({ id, who: [{ about, videos: 3 }] as { about: typeof about; videos: number }[] })
    const ranked = [m('a', 'market'), m('b', 'market'), m('c', 'market'), m('d', 'client'), m('e', 'rival:Cotopaxi'), m('f', 'client')]
    expect(selectLongRun(ranked, 3).map((x) => x.id)).toEqual(['d', 'e', 'f'])
    expect(selectLongRun(ranked, 4).map((x) => x.id)).toEqual(['a', 'd', 'e', 'f'])
    expect(selectLongRun(ranked, 20).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })
})

describe('the scrub: what holds, never what changed', () => {
  it('drops a sentence that compares in time, keeps the rest', () => {
    const out = scrubLongRun({
      ideas: [{ headline: 'Buyers ask where to buy', body: 'Buyers ask which link to use. They increasingly ask about stock.\n\nThe route to order has become part of the product. The route to order is part of the product.', based_on: ['C1'] }],
      in_short: 'Buyers like the idea of a sustainable bag. Since August they ask harder questions.',
    }, { company: 'Sealand' })
    expect(out.output.ideas[0].body).toBe('Buyers ask which link to use.\n\nThe route to order is part of the product.')
    expect(out.output.in_short).toBe('Buyers like the idea of a sustainable bag.')
    expect(out.counts.droppedAdvice).toBe(3)
  })

  it('drops digits, process talk, advice and direction words as the week does', () => {
    const out = scrubLongRun({
      ideas: [{ headline: 'Straps decide comfort', body: 'People name the straps. The 35L pack is heavy. Our searches found it. Sealand should show the straps. Demand is growing.', based_on: ['C1'] }],
      in_short: '',
    }, { company: 'Sealand' })
    expect(out.output.ideas[0].body).toBe('People name the straps.')
  })

  it('leaves ordinary market words alone', () => {
    for (const s of ['A bag that turns heads on the train.', 'Buyers settle the question by asking for photos.', 'Owners describe the bag after a year of use.']) {
      expect(CHANGE.some(({ re }) => re.test(s)), s).toBe(false)
    }
  })
})

describe('the prompt', () => {
  it('names the months, shows each candidate in words with no figure, and forbids change', () => {
    const c = cand('C1', { aug: 1, sep: 4, audience: 'competitor:Cotopaxi' })
    c.who = [{ about: 'rival:Cotopaxi', videos: 5 }]
    const pool = { ...POOL([c, cand('C2', { aug: 0, sep: 5 })]) }
    pool.candidates[1].who = [{ about: 'market', videos: 5 }]
    const { system, user } = buildLongRunPrompts({ company: 'Sealand', pool, context: null })
    expect(system).toContain('What holds across August and September')
    expect(system).toContain('WHAT HOLDS, NEVER WHAT CHANGED')
    expect(user).toContain('Heard in: August and September')
    expect(user).toContain('Heard in: September only')
    expect(user).toContain('Whose videos: Cotopaxi (videos about it, or comments naming it)')
    expect(user).toContain('other bags in the market')
    expect(user.replace(/\bC\d+\b/g, '')).not.toMatch(/\d/)
  })

  it('who in words, most first, no counts', () => {
    expect(whoWords([{ about: 'market', videos: 2 }, { about: 'client', videos: 6 }], 'Sealand', 'bags')).toBe('Sealand (its own posts, or comments naming it), most; other bags in the market')
  })

  it('the schema is strict-shaped: ideas then the lead', () => {
    const parsed = longRunSchema().parse({ ideas: [{ headline: 'h', body: 'b', based_on: ['C1'] }], in_short: 'x' })
    expect(Object.keys(parsed)).toEqual(['ideas', 'in_short'])
  })
})

// ---- The step's hook ---------------------------------------------------------------------

const admin = {} as SupabaseClient
const WINDOW_OCT = { from: '2026-09-27T04:03:00Z', to: '2026-10-04T04:02:00Z' }

function builtLongRun(ideas = 2): BuiltLongRun {
  const cs = [cand('C1'), cand('C2'), cand('C3')]
  const data = composeLongRun({ pool: POOL(cs), written: { ideas: cs.slice(0, ideas).map((c) => idea(`On ${c.id}`, [c.id])), in_short: 'Lead.' }, company: 'Sealand', model: 'gpt-5.4', costUsd: 0.2 })
  return { status: data.ideas.length > 0 ? 'ready' : 'thin', data, pool: POOL(cs), called: true, raw: null, scrub: null, check: null }
}

function hookDeps(over: Record<string, unknown> = {}) {
  const saved: WeekReadRow[] = []
  const alerts: { subject: string; text: string }[] = []
  const builds: { month: string; logRunId?: string }[] = []
  const deps = {
    written: async () => false,
    window: async () => WINDOW_OCT,
    build: (async (_a: SupabaseClient, o: { month: string; logRunId?: string }) => { builds.push(o); return builtLongRun() }) as never,
    save: async (_a: SupabaseClient, row: WeekReadRow) => { saved.push(row) },
    alert: async (subject: string, text: string) => { alerts.push({ subject, text }); return { sent: true } },
    now: () => 1_000,
    ...over,
  }
  return { deps, saved, alerts, builds }
}

const HOOK = { clientId: 'client-1', runId: 'run-oct', company: 'Sealand', startedAt: 1_000 }

describe('maybeWriteLongRun', () => {
  it('writes the month the run closed, under the run, as a month row', async () => {
    const { deps, saved, alerts, builds } = hookDeps()
    const r = await maybeWriteLongRun(admin, HOOK, deps)
    expect(r).toMatchObject({ status: 'ready', month: SEP, ideas: 2 })
    expect(builds[0]).toMatchObject({ month: SEP, logRunId: 'run-oct' })
    expect(saved[0]).toMatchObject({ client_id: 'client-1', run_id: 'run-oct', kind: 'month', month: SEP, status: 'ready', window_start: '2026-08-01T00:00:00.000Z', window_end: '2026-10-01T00:00:00.000Z' })
    expect(alerts).toEqual([])
  })

  it('is not due once the month is written', async () => {
    const { deps, saved, builds } = hookDeps({ written: async () => true })
    expect((await maybeWriteLongRun(admin, HOOK, deps)).status).toBe('not_due')
    expect(builds).toEqual([])
    expect(saved).toEqual([])
  })

  it('a due check that cannot be read writes nothing and alerts nobody', async () => {
    const { deps, saved, alerts } = hookDeps({ written: async () => { throw new Error('read failed') } })
    expect(await maybeWriteLongRun(admin, HOOK, deps)).toMatchObject({ status: 'skipped', error: 'read failed' })
    expect(saved).toEqual([])
    expect(alerts).toEqual([])
  })

  it('without the time for it, it is not started, and the operator is told once with the script', async () => {
    const { deps, alerts, builds } = hookDeps({ now: () => 1_000 + 250_000 - LONGRUN_STEP_FLOOR_MS + 1 })
    expect((await maybeWriteLongRun(admin, HOOK, deps)).status).toBe('skipped')
    expect(builds).toEqual([])
    expect(alerts).toHaveLength(1)
    expect(alerts[0].text).toContain('scripts/longrun-read.ts --client client-1 --month 2026-09')
  })

  it('a failed build stores a failed month row, alerts once, and never throws', async () => {
    const { deps, saved, alerts } = hookDeps({ build: async () => { throw new Error('writer 500') } })
    expect(await maybeWriteLongRun(admin, HOOK, deps)).toMatchObject({ status: 'failed', error: 'writer 500' })
    expect(saved).toEqual([{ client_id: 'client-1', run_id: 'run-oct', kind: 'month', month: null, window_start: null, window_end: null, data: null, status: 'failed', cost_usd: 0 }])
    expect(alerts).toHaveLength(1)
  })

  it('the row keeps the read whole', () => {
    const row = longRunRowOf('client-1', 'run-oct', builtLongRun())
    expect(row.data).toMatchObject({ kind: 'longrun', months: [AUG, SEP] })
    expect(JSON.stringify(row.data)).not.toMatch(/"text":"[^"]/)
  })
})
