import { OSSUR_CLIENT_ID } from '../../config'
import { gateFor } from '../../quote-context'
import { cleanQuote } from '../../quotes'
import { quoteTextHash } from '../../quote-text'
import { judgeVersionFor, type Subject } from '../../subjects/types'
import { brandMonthPair, creatorThemes, type BrandCrossRow, type BrandMonthVideos, type CreatorVideo, type StoredBrandMonthRow } from '../../reading/cross'
import { readingMonthLabel } from '../../reading/month-label'
import type { PlacedSubjectRow, SubjectPlacement } from '../subject-place'
import type { ConvEvidenceRow, ConvVideoRow, RunTheme } from './market'
import { buildBrands, buildGroups, creatorsOf, groupProducts, monthWordsOf, personasOf, themeVideoSets, type FindingRow, type GroupProducts } from './voices'
import {
  buildBrandPage, buildCreatorPage, buildGroupPage, groupBrandRows,
  type BrandPage, type CreatorPage, type GroupBrandRows, type GroupPage, type LevelMonth, type LevelParams, type LevelQuote,
} from './voices-levels'

// THE LEVEL PAGES' RENDER FIXTURES (17 Oct; the G3 boards). Every page is
// built through its own builder (`buildGroupPage`, `buildBrandPage`,
// `buildCreatorPage`) from row-shaped inputs, so the fixtures exercise the code
// the loaders run. Illustrative, and the board's own where it has them: Össur's
// October so far (318 videos), Caregivers and family (45 of them), Ottobock
// (37 of 290 named without being asked), @stepbystep.amp (14 videos); and the
// thin board's Caretaker, September (97 of 521), every subject open.

export const LEVELS_FIXTURE_NOW = '2026-10-17T08:00:00.000Z'
const OCT = '2026-10-01'
const SEP = '2026-09-01'
const OTTO = '5ecfa431'

const ids = (prefix: string, from: number, to: number): string[] => Array.from({ length: to - from }, (_, i) => `${prefix}${from + i}`)

function subject(id: string, name: string, calibration: 'ready' | 'provisional' | 'failed'): PlacedSubjectRow {
  const checked = calibration !== 'provisional'
  const s: Subject = {
    id, client_id: OSSUR_CLIENT_ID, name, description: null, origin: 'manual' as Subject['origin'], source_ref: null, named_at: '2026-09-01T00:00:00.000Z',
    status: 'active' as Subject['status'], superseded_by: null, embedded_at: null, embed_input_version: null,
    calibrated_at: checked ? '2026-10-13T00:00:00.000Z' : null, calibration_precision: calibration === 'ready' ? 0.92 : calibration === 'failed' ? 0.09 : null,
    calibration_n: checked ? 40 : null, calibration_judge_version: checked ? judgeVersionFor(OSSUR_CLIENT_ID) : null,
  }
  return { subject: s, calibration }
}

/** Össur's six subjects, in their own order. */
const SUBJECTS: [string, string][] = [
  ['s-choose', 'Choosing the right device'], ['s-community', 'Community & encouragement'], ['s-cost', 'Cost & access'],
  ['s-fit', 'Fit & comfort'], ['s-function', 'Function & movement'], ['s-look', 'Look & style'],
]

/** A placement over conversations: each conversation's three members, all in
 *  its subject, so `placeSubject` takes it there (in the tier its check is in). */
function placementOf(subjects: readonly PlacedSubjectRow[], convSubject: Record<string, string>): { themesMembers: Map<string, string[]>; placed: SubjectPlacement } {
  const themesMembers = new Map<string, string[]>()
  const tier = (state: string) => {
    const order = subjects.filter((s) => s.calibration === state).map((s) => s.subject.id)
    const subjectsOf = new Map<string, string[]>()
    for (const [conv, sid] of Object.entries(convSubject)) {
      if (!order.includes(sid)) continue
      for (const m of [1, 2, 3].map((i) => `${conv}-m${i}`)) subjectsOf.set(m, [sid])
    }
    return { order, subjectsOf }
  }
  for (const conv of Object.keys(convSubject)) themesMembers.set(conv, [1, 2, 3].map((i) => `${conv}-m${i}`))
  const ready = tier('ready')
  const pending = tier('provisional')
  const failed = tier('failed')
  return {
    themesMembers,
    placed: {
      names: new Map(subjects.map((s) => [s.subject.id, s.subject.name])),
      order: ready.order, subjectsOf: ready.subjectsOf,
      pending: pending.order.length ? pending : null,
      failed: failed.order.length ? failed : null,
    },
  }
}

// ---- the group (G3-Voices-Group) -----------------------------------------------------------

const GROUPS = [
  { key: 'new-amputees', name: 'New amputees, first year', oneLiner: 'Learning everything at once: fit, skin, what’s normal.', range: [0, 96] },
  { key: 'long-time', name: 'Long-time users upgrading', oneLiner: 'Know what they want; fighting to get it paid for.', range: [96, 166] },
  { key: 'athlete', name: 'Active and athletic', oneLiner: 'Want proof a device keeps up: running, hiking, sport.', range: [166, 223] },
  { key: 'caregivers', name: 'Caregivers and family', oneLiner: 'Parents and partners asking on someone’s behalf.', range: [223, 268] },
  { key: 'clinicians', name: 'Clinicians and prosthetists', oneLiner: 'Answer questions in the comments; share fittings.', range: [268, 297] },
] as const

const CAREGIVER_CONVS: { id: string; label: string; description: string; subject: string; k: number; all: number }[] = [
  { id: 'reg-growing', label: 'Growing out of a socket', description: 'A child’s socket stops fitting within months, and parents ask how often that is normal.', subject: 's-fit', k: 12, all: 19 },
  { id: 'reg-paying', label: 'Paying for a device', description: 'Who pays for a leg, a knee or a liner, and what is left to pay out of pocket.', subject: 's-cost', k: 9, all: 41 },
  { id: 'reg-insurance', label: 'Insurance refusals for powered knees', description: 'Appeals for microprocessor knees that are turned down as not medically necessary.', subject: 's-cost', k: 8, all: 31 },
  { id: 'reg-kids-wear', label: 'Getting kids to wear it', description: 'Children who refuse their prosthesis at school, and what other parents tried.', subject: 's-community', k: 7, all: 9 },
  { id: 'reg-socket-change', label: 'Socket fit changing over time', description: 'A socket that fitted well starts to feel loose or tight as the limb changes.', subject: 's-fit', k: 5, all: 20 },
  { id: 'reg-parents', label: 'Advice from other parents', description: 'Parents trading what worked: clinics, routines and what to ask at a fitting.', subject: 's-community', k: 4, all: 11 },
]

const CAREGIVER_QUOTES: LevelQuote[] = [
  { ref: 'e:q1', text: 'My daughter outgrew her socket in four months. Is that normal?', lang: null, english: null, cite: 'Instagram · 4 Oct', from: { id: 'reg-growing', label: 'Growing out of a socket', href: '/dashboard/market/conversations/reg-growing?period=month&month=2026-10' } },
  { ref: 'e:q2', text: 'He refuses to wear it to school. Any tips from other parents?', lang: null, english: null, cite: 'TikTok · 6 Oct', from: { id: 'reg-kids-wear', label: 'Getting kids to wear it', href: '/dashboard/market/conversations/reg-kids-wear?period=month&month=2026-10' } },
  { ref: 'e:q3', text: 'Insurance covered the leg but not the liners. Nobody warned us.', lang: null, english: null, cite: 'Instagram · 9 Oct', from: { id: 'reg-paying', label: 'Paying for a device', href: '/dashboard/market/conversations/reg-paying?period=month&month=2026-10' } },
]

/** A month's market of `n` videos, `v0`…. */
const marketIds = (n: number): string[] => ids('v', 0, n)

/** The group's month (October so far, the board's). */
const OCT_MONTH: LevelMonth = { month: OCT, soFar: true, monthWords: monthWordsOf(OCT, true), monthLabel: readingMonthLabel(OCT, LEVELS_FIXTURE_NOW), n: 318 }

/** Caregivers and family, the board's: three ready subjects carded, Function &
 *  movement open, two more ready ones also in their videos. `checks` changes
 *  which subjects passed their check. */
export function groupFixture(opts: { checks?: 'board' | 'tracked' | 'none_ready'; params?: LevelParams; brands?: GroupBrandRows; products?: GroupProducts } = {}): GroupPage {
  const checks = opts.checks ?? 'board'
  const state = (id: string): 'ready' | 'provisional' | 'failed' => checks === 'none_ready' ? 'provisional'
    : checks === 'tracked' ? ({ 's-function': 'ready', 's-look': 'ready', 's-cost': 'provisional', 's-fit': 'failed' } as Record<string, 'ready' | 'provisional' | 'failed'>)[id] ?? 'ready'
      : id === 's-function' ? 'provisional' : 'ready'
  const subjects = SUBJECTS.map(([id, name]) => subject(id, name, state(id)))
  const market = marketIds(318)
  const profile = {
    run_id: 'run-1011', run_date: '2026-10-11T05:00:00.000Z',
    personas: GROUPS.map((g) => ({
      key: g.key, name: g.name, oneLiner: g.oneLiner, scope: 'category',
      wants: g.key === 'caregivers' ? 'Clear answers they can act on for someone else: what to buy, what’s covered, what recovery looks like.' : 'Proof.',
      blockers: g.key === 'caregivers' ? 'Not knowing whom to trust, and costs they didn’t expect, like liners and new sockets as a child grows.' : 'Costs.',
      triggers: g.key === 'caregivers' ? 'A clinician or another parent saying it worked for them.' : 'A clinician.',
      howTheyTalk: g.key === 'caregivers' ? ['my son’s leg', 'his prosthetist said', 'is this normal for kids?', 'we’re still waiting on insurance', 'she outgrew it already'] : [],
      who: g.key === 'caregivers' ? [{ signal: 'parent-of-a-child-amputee', count: 12 }, { signal: 'partner-of-an-amputee', count: 5 }, { signal: 'adult-child-caring-for-a-parent', count: 3 }] : [],
      insightIds: [`i-${g.key}`], registryIds: g.key === 'caregivers' ? CAREGIVER_CONVS.map((c) => c.id) : [],
    })),
  }
  const videos = GROUPS.map((g) => ({ key: g.key, name: g.name, month: OCT, videoIds: market.slice(g.range[0], g.range[1]), n: g.range[1] - g.range[0] }))
  const readyK: Record<string, number> = { 's-fit': 17, 's-cost': 14, 's-community': 11, 's-choose': 4, 's-look': 1, 's-function': 6 }
  const groups = [{
    key: 'caregivers', name: 'Caregivers and family', month: OCT, n: 45,
    subjects: subjects.filter((s) => s.calibration === 'ready').map((s) => ({ subjectId: s.subject.id, label: s.subject.name, k: readyK[s.subject.id] ?? 0, n: 45 })).sort((a, b) => b.k - a.k),
  }]
  const read = { videos, groups }
  const mine = videos.find((v) => v.key === 'caregivers')!.videoIds
  const platformOf = new Map(market.map((id, i) => [id, i % 3 === 0 ? 'tiktok' : i % 3 === 1 ? 'youtube' : 'instagram']))
  // Their 45: Instagram 21, TikTok 16, YouTube 8 (the board's).
  mine.forEach((id, i) => platformOf.set(id, i < 21 ? 'instagram' : i < 37 ? 'tiktok' : 'youtube'))
  // Each conversation: `k` of their videos and `all - k` of the market's others.
  let other = 0
  const refs = CAREGIVER_CONVS.map((c, i) => {
    const theirs = mine.slice(i * 3, i * 3 + c.k)
    const rest = market.slice(other, other + (c.all - c.k))
    other += c.all - c.k
    return { themeId: c.id, audience: 'industry-other', videoIds: [...theirs, ...rest] }
  })
  const { themesMembers, placed } = placementOf(subjects, Object.fromEntries(CAREGIVER_CONVS.map((c) => [c.id, c.subject])))
  const themes = new Map<string, RunTheme>(CAREGIVER_CONVS.map((c) => [c.id, { label: c.label, kind: 'question', memberIds: themesMembers.get(c.id) ?? [] }]))
  const persona = personasOf(profile).find((p) => p.key === 'caregivers')!
  return buildGroupPage({
    month: OCT_MONTH,
    persona,
    profileDate: profile.run_date,
    groups: buildGroups({ profile, read: { videos, groups: [] }, platformOf: new Map(), params: {} }),
    read,
    platformOf,
    subjects,
    placed,
    themes,
    labels: new Map(CAREGIVER_CONVS.map((c) => [c.id, c.label])),
    descriptions: new Map(CAREGIVER_CONVS.map((c) => [c.id, c.description])),
    themeSets: themeVideoSets(refs),
    levels: new Map([['s-fit', { k: 108, n: 318 }], ['s-cost', { k: 60, n: 318 }], ['s-community', { k: 51, n: 318 }], ['s-function', { k: 80, n: 318 }], ['s-look', { k: 12, n: 318 }], ['s-choose', { k: 70, n: 318 }]]),
    brands: opts.brands ?? {
      state: 'ready', line: null,
      rows: [
        { key: 'client', label: 'Össur', you: true, k: 6, href: '/dashboard/voices/brands/client' },
        { key: OTTO, label: 'Ottobock', you: false, k: 4, href: `/dashboard/voices/brands/${OTTO}` },
        { key: 'fillauer', label: 'Fillauer', you: false, k: 1, href: '/dashboard/voices/brands/fillauer' },
      ],
    },
    products: opts.products ?? groupProducts({
      state: 'ready', month: OCT, monthWords: OCT_MONTH.monthWords, params: {},
      products: [{ id: 'p-comfort', name: 'Iceross Comfort' }, { id: 'p-seal', name: 'Iceross Seal-In X' }],
      sets: {
        groups: new Map([['g-liners', { any: new Set(mine.slice(0, 10)), named: new Set(mine.slice(0, 3)), unclear: new Set(mine.slice(3, 10)), unbranded: new Set<string>() }]]),
        products: new Map([['p-comfort', new Set(mine.slice(0, 2))], ['p-seal', new Set(mine.slice(2, 3))]]),
        all: new Set(mine.slice(0, 10)),
      },
    }),
    quotes: CAREGIVER_QUOTES,
    params: opts.params ?? {},
  })
}

/** The thin board (G3-Voices-Group-Thin): Caretaker in September, the last
 *  full month; every subject's check still open; tips and who-they-are not
 *  described; brands not counted; your products not read; a Portuguese
 *  comment with its English. */
export function groupThinFixture(): GroupPage {
  const subjects = SUBJECTS.map(([id, name]) => subject(id, name, 'provisional'))
  const n = 521
  const market = marketIds(n)
  const convs = [
    { id: 'reg-praise', label: 'Praise for resilience and courage', description: 'Commenters praise the person’s grit and bravery, and their ability to keep going.', subject: 's-community', k: 31, all: 55 },
    { id: 'reg-how', label: 'How the prosthesis works', description: 'Viewers ask how the leg bends, grips and knows what to do next.', subject: 's-function', k: 18, all: 46 },
    { id: 'reg-where', label: 'Where can I get one', description: 'People ask where the device was fitted and who to contact for one.', subject: 's-cost', k: 11, all: 42 },
    { id: 'reg-style', label: 'Prosthetics as personal style', description: 'Covers, colours and designs that make a prosthesis part of how someone dresses.', subject: 's-look', k: 7, all: 28 },
  ]
  const profile = {
    run_id: 'run-1011', run_date: '2026-10-11T05:00:00.000Z',
    personas: [{
      key: 'caretaker', name: 'Caretaker', oneLiner: 'This person is supporting someone through limb loss or mobility change and is looking for ways to be useful without taking over the story.',
      scope: 'category', wants: 'They want their person to feel safe, capable, and seen, because recovery at home depends on patience, morale, and steady support.',
      blockers: 'They feel torn between hope and helplessness, especially when emotions run high or access is hard to secure.', triggers: '',
      howTheyTalk: ['my dad’s new leg', 'so proud of him', 'asking for my husband'], who: [], insightIds: ['i-caretaker'], registryIds: convs.map((c) => c.id),
    }],
  }
  const mine = market.slice(0, 97)
  const platformOf = new Map(mine.map((id, i) => [id, i < 50 ? 'tiktok' : i < 71 ? 'youtube' : i < 86 ? 'instagram' : 'reddit']))
  let other = 97
  const refs = convs.map((c, i) => {
    const theirs = mine.slice(i * 2, i * 2 + c.k)
    const rest = market.slice(other, other + (c.all - c.k))
    other += c.all - c.k
    return { themeId: c.id, audience: 'industry-other', videoIds: [...theirs, ...rest] }
  })
  const { themesMembers, placed } = placementOf(subjects, Object.fromEntries(convs.map((c) => [c.id, c.subject])))
  const month: LevelMonth = { month: SEP, soFar: false, monthWords: monthWordsOf(SEP, false), monthLabel: readingMonthLabel(SEP, LEVELS_FIXTURE_NOW), n }
  const videos = [{ key: 'caretaker', name: 'Caretaker', month: SEP, videoIds: mine, n: 97 }]
  return buildGroupPage({
    month,
    persona: personasOf(profile)[0],
    profileDate: profile.run_date,
    groups: buildGroups({ profile, read: { videos, groups: [] }, platformOf: new Map(), params: {} }),
    read: { videos, groups: [{ key: 'caretaker', name: 'Caretaker', month: SEP, n: 97, subjects: [] }] },
    platformOf,
    subjects,
    placed,
    themes: new Map<string, RunTheme>(convs.map((c) => [c.id, { label: c.label, kind: 'praise', memberIds: themesMembers.get(c.id) ?? [] }])),
    labels: new Map(convs.map((c) => [c.id, c.label])),
    descriptions: new Map(convs.map((c) => [c.id, c.description])),
    themeSets: themeVideoSets(refs),
    levels: new Map(),
    brands: groupBrandRows({
      brands: buildBrands({ clientId: OSSUR_CLIENT_ID, month: SEP, pairs: brandMonthPair({ month: SEP, brands: [{ brandKey: 'client', label: 'Össur', countState: 'counted' }, { brandKey: OTTO, label: 'Ottobock', countState: 'counted' }], rows: [], audiences: ['industry-other'], pair: null }), crosses: null, note: null, params: {} }),
      sets: [], videoIds: new Set(mine), params: {},
    }),
    products: groupProducts({ state: 'off', month: SEP, monthWords: month.monthWords, params: {} }),
    quotes: [
      { ref: 'e:t1', text: 'Watching my dad take his first steps on it made the whole year worth it.', lang: null, english: null, cite: 'TikTok · 14 Sep', from: { id: 'reg-praise', label: 'Praise for resilience and courage', href: '/dashboard/market/conversations/reg-praise?period=month&month=2026-09' } },
      { ref: 'e:t2', text: 'How does the knee know when he’s going down stairs? Asking for my husband.', lang: null, english: null, cite: 'YouTube · 9 Sep', from: { id: 'reg-how', label: 'How the prosthesis works', href: '/dashboard/market/conversations/reg-how?period=month&month=2026-09' } },
      { ref: 'e:t3', text: 'Onde vocês conseguiram a prótese? Minha mãe precisa de uma.', lang: 'pt', english: 'Where did you get the prosthesis? My mother needs one.', cite: 'Instagram · 21 Sep', from: { id: 'reg-where', label: 'Where can I get one', href: '/dashboard/market/conversations/reg-where?period=month&month=2026-09' } },
    ],
    params: {},
  })
}

// ---- the brand (G3-Voices-Brand) -----------------------------------------------------------

const BRANDS = [
  { brandKey: 'client', label: 'Össur', countState: 'counted' as const },
  { brandKey: OTTO, label: 'Ottobock', countState: 'counted' as const },
  { brandKey: 'fillauer', label: 'Fillauer', countState: 'counted' as const },
  { brandKey: 'blatchford', label: 'Blatchford', countState: 'counted' as const },
  { brandKey: 'proteor', label: 'Proteor', countState: 'none' as const },
]

/** Month rows, pooled into one audience: Ottobock's Aug 52 of 520, Sep 74 of
 *  713, Oct so far 37 of 290 named without being asked (the board's). */
function brandRows(): (StoredBrandMonthRow & { k_content: number; k_comment: number })[] {
  const row = (month: string, brand_key: string, k_any: number, k_organic: number, n: number, n_organic: number, k_content = 0, k_comment = 0) => ({ month, audience: 'industry-other', brand_key, k_any, k_organic, n, n_organic, k_content, k_comment })
  return [
    row('2026-08-01', OTTO, 70, 52, 600, 520), row(SEP, OTTO, 96, 74, 820, 713), row(OCT, OTTO, 49, 37, 318, 290, 21, 34),
    row(SEP, 'client', 60, 50, 820, 713), row(OCT, 'client', 56, 41, 318, 290, 30, 40),
    row(SEP, 'fillauer', 10, 8, 820, 713), row(OCT, 'fillauer', 11, 9, 318, 290, 5, 7),
    row(SEP, 'blatchford', 7, 5, 820, 713), row(OCT, 'blatchford', 7, 6, 318, 290, 3, 5),
    row(OCT, 'proteor', 0, 0, 318, 290),
  ]
}

const FINDINGS: FindingRow[] = [
  { id: 'f1', run_id: 'run-1011', category: 'topic_ownership', competitor_name: 'Ottobock', title: 'Ottobock’s talk turns on getting a knee paid for', finding: 'Where your market talks about knees in general, the videos naming Ottobock are mostly about approvals, appeals and who pays. People name the knee they were refused before they say how it walks, and the praise that does come is for getting one at all.', impact_level: 'high', created_at: '2026-10-11T05:00:00.000Z' },
  { id: 'f2', run_id: 'run-1011', category: 'content_gap', competitor_name: 'Ottobock', title: 'When people describe a long fight with insurance over a knee, the knee they name is an Ottobock one', finding: null, impact_level: 'medium', created_at: '2026-10-11T05:00:00.000Z' },
  { id: 'f3', run_id: 'run-1011', category: 'sentiment_differential', competitor_name: 'Ottobock', title: 'Prosthetists in the comments mention it as what their clinic fits first', finding: 'That makes it the knee people measure others against when they ask what to try.', impact_level: 'medium', created_at: '2026-10-11T05:00:00.000Z' },
]

/** A brand's page, the board's Ottobock unless `key` names another. `counted`
 *  false: Össur before its back-read (no month row), the rival half standing. */
export function brandFixture(opts: { key?: string; counted?: boolean; params?: LevelParams } = {}): BrandPage {
  const key = opts.key ?? OTTO
  const counted = opts.counted ?? true
  const rows = counted ? brandRows() : []
  const market = marketIds(318)
  const pairs = brandMonthPair({ month: OCT, brands: BRANDS, rows, audiences: ['industry-other'], pair: null })
  const sets: BrandMonthVideos[] = BRANDS.map((b, bi) => {
    const k = rows.find((r) => r.month === OCT && r.brand_key === b.brandKey)?.k_any ?? 0
    const any = market.filter((_, i) => i % 6 === bi % 6).slice(0, k)
    return { ...b, month: OCT, any, organic: any, n: 318, nOrganic: 290 }
  })
  const otto = sets.find((s) => s.brandKey === OTTO)!.any
  const kinds: BrandCrossRow[] = [{ brandKey: OTTO, label: 'Ottobock', month: OCT, base: 'any', n: 49, cells: [{ id: 'pain_point', label: 'pain_point', k: 24, n: 49 }, { id: 'question', label: 'question', k: 19, n: 49 }, { id: 'praise', label: 'praise', k: 16, n: 49 }, { id: 'feature_request', label: 'feature_request', k: 5, n: 49 }] }]
  const subjects: BrandCrossRow[] = [{ brandKey: OTTO, label: 'Ottobock', month: OCT, base: 'any', n: 49, cells: [{ id: 's-cost', label: 'Cost & access', k: 26, n: 49 }, { id: 's-choose', label: 'Choosing the right device', k: 11, n: 49 }, { id: 's-fit', label: 'Fit & comfort', k: 7, n: 49 }, { id: 's-look', label: 'Look & style', k: 2, n: 49 }] }]
  const brands = buildBrands({
    clientId: OSSUR_CLIENT_ID, month: OCT, pairs, crosses: counted ? { videos: sets, kinds, subjects } : null, note: null, params: opts.params ?? {},
    clientCounts: true,
  })
  const row = brands.all.find((r) => r.brandKey === key)!
  // Groups over its 49: Long-time 21, New amputees 12, Active 9, Clinicians 6, Caregivers 4.
  const groupSets = new Map<string, string[]>([
    ['long-time', otto.slice(0, 21)], ['new-amputees', otto.slice(0, 12)], ['athlete', otto.slice(10, 19)],
    ['clinicians', otto.slice(20, 26)], ['caregivers', otto.slice(30, 34)],
  ])
  const personas = personasOf({ run_id: 'run-1011', run_date: '2026-10-11', personas: GROUPS.map((g) => ({ key: g.key, name: g.name, oneLiner: g.oneLiner, insightIds: [] })) })
  // Creators at the floor and the videos of theirs naming it.
  const creatorRows: { platform: string; account: string; videos: string[]; followers: number }[] = [
    { platform: 'youtube', account: 'The Amputee Diaries', videos: [...otto.slice(0, 3), ...market.slice(300, 306)], followers: 96000 },
    { platform: 'instagram', account: '@c.leg.life', videos: [...otto.slice(3, 6), ...market.slice(306, 308)], followers: 22000 },
    { platform: 'instagram', account: '@limbcare.clinic', videos: [...otto.slice(6, 8), ...market.slice(308, 312)], followers: 12000 },
    { platform: 'tiktok', account: '@stepbystep.amp', videos: [otto[8], ...market.slice(312, 318)], followers: 182000 },
    { platform: 'reddit', account: 'r/amputee', videos: market.slice(250, 260), followers: 16000 },
  ]
  const cv: CreatorVideo[] = creatorRows.flatMap((c) => c.videos.map((v) => ({ videoId: v, audience: 'industry-other', platform: c.platform, account: c.account, followers: c.followers, scrapedAt: '2026-10-11T06:00:00.000Z' })))
  const creators = creatorThemes({ month: OCT, videos: cv, refs: [] })
  const creatorVideoIds = new Map(creatorRows.map((c) => [`${c.platform}|${c.account}`, c.videos]))
  const platformOf = new Map(market.map((id, i) => [id, i % 49 < 21 ? 'tiktok' : i % 49 < 37 ? 'youtube' : 'instagram']))
  otto.forEach((id, i) => platformOf.set(id, i < 21 ? 'tiktok' : i < 37 ? 'youtube' : 'instagram'))
  return buildBrandPage({
    month: OCT_MONTH,
    row,
    brands,
    set: sets.find((s) => s.brandKey === key) ?? null,
    rows,
    audiences: ['industry-other'],
    kinds: counted ? kinds.find((k) => k.brandKey === key) ?? null : null,
    subjects: counted ? subjects.find((k) => k.brandKey === key) ?? null : null,
    pending: [{ id: 's-function', label: 'Function & movement' }],
    noun: null,
    personas,
    groupSets: counted ? groupSets : null,
    creators,
    creatorVideoIds,
    platformOf,
    findings: FINDINGS,
    findingsDate: '2026-10-11T05:00:00.000Z',
    window: { from: '2026-07-14', to: '2026-10-12' },
    asked: [
      { registryId: 'reg-insurance', label: 'Insurance refusals for powered knees', videos: 14 },
      { registryId: 'reg-cleg-worth', label: 'Is the C-Leg worth the fight', videos: 6 },
      { registryId: 'reg-waterproof', label: 'Waterproof knees', videos: 3 },
    ],
    claims: [
      { id: 'k1', claim: 'Approval stories from people who won an appeal, told as a long fight that was worth it.' },
      { id: 'k2', claim: 'Clinic visits that show a fitting and the first steps on a new knee.' },
    ],
    said: [
      { ref: 'c:o1', text: 'Got the C-Leg approved after a year of fighting. Worth it, but the fight nearly broke me.', lang: null, english: null, cite: 'YouTube · 3 Oct', from: { id: 'reg-insurance', label: 'Insurance refusals for powered knees', href: '/dashboard/market/conversations/reg-insurance?period=month&month=2026-10' } },
      { ref: 'c:o2', text: 'My clinic only fits Ottobock, so that’s the only knee insurance will look at.', lang: null, english: null, cite: 'Instagram · 28 Sep', from: { id: 'reg-paying', label: 'Paying for a device', href: '/dashboard/market/conversations/reg-paying?period=month&month=2026-10' } },
      { ref: 'c:o3', text: 'Genium or Rheo for stairs? Has anyone here tried both?', lang: null, english: null, cite: 'TikTok · 6 Oct', from: { id: 'reg-knee-choice', label: 'Choosing a microprocessor knee', href: '/dashboard/market/conversations/reg-knee-choice?period=month&month=2026-10' } },
    ],
    nowMonth: '2026-10-01',
    params: opts.params ?? {},
  })
}

// ---- the creator (G3-Voices-Creator) -------------------------------------------------------

const CREATOR_CONVS = [
  { id: 'reg-running', label: 'Running on a blade' },
  { id: 'reg-liner', label: 'How long a liner lasts' },
  { id: 'reg-socket-pain', label: 'Socket fit causes pain' },
  { id: 'reg-trail', label: 'Feet for trail running' },
  { id: 'reg-skin', label: 'Skin irritation from silicone' },
  { id: 'reg-paying', label: 'Paying for a device' },
  { id: 'reg-praise', label: 'Praise for resilience and courage' },
]

const V = (n: number): string => `00000000-0000-4000-8000-0000000c${String(n).padStart(4, '0')}`

/** @stepbystep.amp on TikTok, October so far (the board's): 14 videos, 182k
 *  followers, six in Running on a blade of the 24 in it. `video` opens one
 *  video's comments; `all` lists every video. */
export function creatorFixture(opts: { video?: number; all?: boolean } = {}): CreatorPage {
  const n = 318
  const account = '@stepbystep.amp'
  const mine = Array.from({ length: 14 }, (_, i) => V(i + 1))
  const market: CreatorVideo[] = [
    ...mine.map((id) => ({ videoId: id, audience: 'industry-other', platform: 'tiktok', account, followers: 182000, scrapedAt: '2026-10-11T06:00:00.000Z' })),
    ...[
      ['youtube', 'The Amputee Diaries', 9], ['instagram', '@runningon.carbon', 8], ['instagram', '@limbcare.clinic', 6], ['tiktok', '@newleg.newlife', 5],
      ['instagram', '@c.leg.life', 5], ['youtube', '@peg.leg.pete', 4], ['tiktok', '@bladerunner.kim', 4], ['instagram', '@amp.fitness.lab', 3], ['reddit', 'r/amputee', 12],
    ].flatMap(([platform, acc, k], ci) => Array.from({ length: k as number }, (_, i) => ({ videoId: `o${ci}-${i}`, audience: 'industry-other', platform: platform as string, account: acc as string, followers: 1000, scrapedAt: '2026-10-11T06:00:00.000Z' }))),
  ]
  // Their videos in each conversation (6, 3, 2, 2) of all its videos (24, 35, 11, 7).
  const refs = [
    { themeId: 'reg-running', videoIds: [mine[0], mine[2], mine[4], mine[5], mine[6], mine[7], ...ids('x-run-', 0, 18)], commentIds: ['c1', 'c5', 'c6'] },
    { themeId: 'reg-liner', videoIds: [mine[1], mine[8], mine[9], ...ids('x-lin-', 0, 32)], commentIds: ['c4'] },
    { themeId: 'reg-socket-pain', videoIds: [mine[3], mine[10], ...ids('x-soc-', 0, 9)], commentIds: ['c2', 'c8'] },
    { themeId: 'reg-trail', videoIds: [mine[2], mine[11], ...ids('x-tra-', 0, 5)], commentIds: ['c7'] },
    { themeId: 'reg-skin', videoIds: [mine[1]], commentIds: ['c3'] },
    { themeId: 'reg-paying', videoIds: [mine[0]], commentIds: ['c9'] },
    { themeId: 'reg-praise', videoIds: [mine[3]], commentIds: ['c10'] },
  ]
  const read = creatorThemes({ month: OCT, videos: market, refs: refs.map((r) => ({ themeId: r.themeId, audience: 'industry-other', videoIds: r.videoIds })) })
  const people = creatorsOf(read).filter((c) => c.videos >= 3)
  const creator = people.find((c) => c.account === account)!
  const caption = ['First 5k on the Cheetah, and what nobody tells you about the socket', 'Three signs your liner is done, and what my clinic never told me about replacing it', 'Hill sprints, week six: the blade against my everyday foot', 'Your questions: does running hurt the residual limb?']
  const counts: [number, number][] = [[22, 340], [14, 212], [11, 96], [7, 58], [6, 50], [5, 44], [5, 40], [4, 33], [3, 30], [3, 28], [2, 20], [2, 19], [1, 12], [1, 9]]
  const videos: ConvVideoRow[] = mine.map((id, i) => ({
    id, platform: 'tiktok', video_id: `t${i + 1}`, video_url: `https://www.tiktok.com/@stepbystep.amp/video/${i + 1}`, account_name: account,
    caption: caption[i] ?? `Video ${i + 1}`, comments_count: counts[i][1], upload_date: ['2026-10-08', '2026-10-03', '2026-09-30', '2026-09-27'][i] ?? '2026-10-01',
    is_client: false, is_competitor: false, competitor_name: null, hashtags: [], topics: [], source: 'discovered',
  }))
  // The counted comments: on each video, its count of comment ids; the
  // printable ones carry the board's words.
  const words: Record<string, [string, number, string | null, string | null]> = {
    c1: ['Mile 3 on the new foot and I forgot I was wearing it.', 0, null, null],
    c2: ['How long before you could run without the socket rubbing?', 0, null, null],
    c9: ['Is the Cheetah covered anywhere or is it all out of pocket?', 0, null, null],
    c3: ['This liner gave me a rash after a week.', 1, null, null],
    c4: ['Mine lasted eight months before it started slipping. Is that normal?', 1, null, null],
    c5: ['The everyday foot looks so stiff next to the blade.', 2, null, null],
    c7: ['¿Con qué pie corres en la montaña? Yo no encuentro uno que aguante.', 2, 'es', 'Which foot do you run with in the mountains? I can’t find one that holds up.'],
    c8: ['Does it hurt after? My knee aches after two miles on mine.', 3, null, null],
    c10: ['Thank you for being so honest about the bad days.', 3, null, null],
  }
  const evidence: ConvEvidenceRow[] = []
  const allComments: string[] = []
  counts.forEach(([k], vi) => {
    for (let j = 0; j < k; j++) {
      const named = Object.entries(words).filter(([, w]) => w[1] === vi).map(([cid]) => cid)
      const cid = named[j] ?? `cc${vi}-${j}`
      allComments.push(cid)
      const w = words[cid]
      evidence.push({
        evidenceId: `e-${cid}`, insightId: `i-${cid}`, commentId: cid, quote: w ? w[0] : null, rank: 1, redacted: !w,
        comment: { date: `2026-10-0${(j % 8) + 1}T10:00:00.000Z`, platform: 'tiktok', videoId: `t${vi + 1}`, author: `viewer-${cid}` },
      })
    }
  })
  // Every counted comment belongs to the conversation of its video's refs.
  const refsWithAll = refs.map((r) => ({ ...r, commentIds: [...r.commentIds, ...allComments.filter((c) => c.startsWith('cc') && r.videoIds.includes(mine[Number(c.slice(2).split('-')[0])]))] }))
  const translations = new Map<string, { lang: string; english: string | null }>()
  for (const w of Object.values(words)) if (w[2]) translations.set(quoteTextHash(cleanQuote(w[0])), { lang: w[2], english: w[3] })
  const brandSets = [
    { brandKey: 'client', label: 'Össur', you: true, any: new Set([mine[0], mine[1], mine[5], mine[9]]) },
    { brandKey: OTTO, label: 'Ottobock', you: false, any: new Set([mine[3]]) },
  ]
  const personas = personasOf({ run_id: 'r', run_date: '2026-10-11', personas: GROUPS.map((g) => ({ key: g.key, name: g.name, oneLiner: g.oneLiner, insightIds: [] })) })
  return buildCreatorPage({
    month: { ...OCT_MONTH, n },
    creator,
    people,
    labels: new Map(CREATOR_CONVS.map((c) => [c.id, c.label])),
    refs: refsWithAll,
    videos,
    evidence,
    translations,
    gate: gateFor(OSSUR_CLIENT_ID, {}),
    brandSets,
    personas,
    groupSets: new Map([['athlete', mine.slice(0, 9)], ['new-amputees', mine.slice(5, 10)], ['long-time', mine.slice(12, 14)]]),
    kinds: { brandKey: creator.key, label: account, month: OCT, base: 'any', n: 14, cells: [{ id: 'praise', label: 'praise', k: 11, n: 14 }, { id: 'question', label: 'question', k: 9, n: 14 }, { id: 'pain_point', label: 'pain_point', k: 3, n: 14 }, { id: 'feature_request', label: 'feature_request', k: 2, n: 14 }] },
    noun: 'device',
    params: { ...(opts.video != null ? { video: mine[opts.video] } : {}), ...(opts.all ? { videos: true } : {}) },
  })
}

/** Every level page the render tests and the shots draw. */
export const VOICES_LEVEL_FIXTURES = {
  group: () => groupFixture(),
  'group-thin': () => groupThinFixture(),
  'group-tracked': () => groupFixture({ checks: 'tracked' }),
  brand: () => brandFixture(),
  'brand-you': () => brandFixture({ key: 'client' }),
  'brand-not-counted': () => brandFixture({ counted: false }),
  creator: () => creatorFixture(),
  'creator-open': () => creatorFixture({ video: 2 }),
  'creator-all': () => creatorFixture({ all: true }),
} as const
