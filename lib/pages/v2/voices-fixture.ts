import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../../config'
import { readingMonthLabel } from '../../reading/month-label'
import { judgeVersionFor } from '../../subjects/types'
import { brandMonthPair, creatorThemes, measuredSubjects, type PendingSubject, type BrandCrossRow, type BrandMonthVideos, type CreatorVideo, type GroupMonthVideos, type GroupSubjectRow, type StoredBrandMonthRow, type ThemeRef } from '../../reading/cross'
import {
  buildBrands, failedSubjectsOf, buildCreators, buildGroups, clientCountsOf, creatorVideoIds, crossKeys, groupProducts, monthWordsOf,
  type BrandSet, type VoicesData, type VoicesParams, type VoicesQuote,
} from './voices'

// The Voices page's render fixtures (depth v2, T4): an Össur-shaped month
// (five groups, brand rules and no brand rows yet, the creators of its
// market) and a Sealand-shaped one (its brands counted). Every figure is
// built through the page's own builders from row-shaped inputs, so the
// fixtures exercise the same code the loader runs. Illustrative: the groups'
// names and words follow the board (E3-Voices), and the brand numbers follow
// the T16 spot-checks of Sealand's September (Patagonia 65 videos naming it,
// 13 of 743 unprompted).

const SEP = '2026-09-01'
const AUG = '2026-08-01'
/** The fixtures' day: 13 October, a day the reading month is still
 *  September, so the bar carries its label (decision 3). */
export const VOICES_FIXTURE_NOW = '2026-10-13T08:00:00.000Z'

const ids = (prefix: string, n: number, from = 0): string[] => Array.from({ length: n }, (_, i) => `${prefix}${from + i}`)

/** A market of `n` videos, each on a platform in turn. */
function marketOf(n: number, platforms: readonly string[]): { id: string; platform: string }[] {
  return ids('v', n).map((id, i) => ({ id, platform: platforms[i % platforms.length] }))
}

interface PersonaIn {
  key: string
  name: string
  oneLiner: string
  wants: string
  blockers: string
  triggers: string
  howTheyTalk: string[]
  who: { signal: string; count: number }[]
  registryIds: string[]
  /** The group's videos this month: indexes into the market. */
  videos: [number, number]
  subjects: [string, string, number][]
}

function groupsFrom(personas: PersonaIn[], market: { id: string }[]): {
  profile: { personas: unknown; run_id: string; run_date: string }
  read: { videos: GroupMonthVideos[]; groups: GroupSubjectRow[] }
} {
  const videos: GroupMonthVideos[] = personas.map((p) => {
    const v = market.slice(p.videos[0], p.videos[1]).map((m) => m.id).sort()
    return { key: p.key, name: p.name, month: SEP, videoIds: v, n: v.length }
  })
  return {
    profile: {
      run_id: 'run-0927',
      run_date: '2026-09-27T05:00:00.000Z',
      personas: personas.map((p) => ({
        key: p.key, name: p.name, oneLiner: p.oneLiner, scope: 'category', wants: p.wants, blockers: p.blockers, triggers: p.triggers,
        howTheyTalk: p.howTheyTalk, who: p.who, insightIds: ids(`i-${p.key}-`, 30), evidenceCount: 30, sourceVideoCount: 60,
        prevalence: 'Common', platformMix: { tiktok: 30, instagram: 20 }, registryIds: p.registryIds, themeIds: [],
      })),
    },
    read: {
      videos,
      groups: personas.map((p, i) => ({
        key: p.key, name: p.name, month: SEP, n: videos[i].n,
        subjects: p.subjects.map(([subjectId, label, k]) => ({ subjectId, label, k, n: videos[i].n })),
      })),
    },
  }
}

// ---- Össur ------------------------------------------------------------------------

const OSSUR_PERSONAS: PersonaIn[] = [
  {
    key: 'new-amputees', name: 'New amputees, first year', oneLiner: 'Learning everything at once: fit, skin, what’s normal.',
    wants: 'Know what’s normal while learning to walk again. Someone who has been there to say so.',
    blockers: 'Pain and skin problems nobody warned them about. Waiting months for a first socket.',
    triggers: 'Another amputee showing the same problem, and how they solved it.',
    howTheyTalk: ['is this normal?', 'my first socket', 'how long did it take you', 'my prosthetist said'],
    who: [{ signal: 'below knee amputee', count: 14 }, { signal: 'recent amputation', count: 9 }, { signal: 'diabetic amputee', count: 4 }],
    registryIds: ['reg-phantom', 'reg-first-socket', 'reg-skin'],
    videos: [0, 96], subjects: [['s-fit', 'Fit & comfort', 46], ['s-function', 'Function & movement', 29], ['s-cost', 'Cost & access', 17]],
  },
  {
    key: 'long-time', name: 'Long-time users upgrading', oneLiner: 'Know what they want; fighting to get it paid for.',
    wants: 'The next device, and someone to pay for it.', blockers: 'Insurance refusals and appeals that take months.',
    triggers: 'A clinician who will write the letter.', howTheyTalk: ['denied again', 'my third leg', 'worth the fight'],
    who: [{ signal: 'above knee amputee', count: 8 }], registryIds: ['reg-insurance', 'reg-knee-choice'],
    videos: [60, 130], subjects: [['s-cost', 'Cost & access', 31], ['s-choose', 'Choosing the right device', 22], ['s-function', 'Function & movement', 18]],
  },
  {
    key: 'athlete', name: 'Active and athletic', oneLiner: 'Want proof a device keeps up: running, hiking, sport.',
    wants: 'Proof a device keeps up with their sport.', blockers: 'Sports gear judged ‘not medically necessary’.',
    triggers: 'Seeing a blade or knee used in the sport they do.', howTheyTalk: ['running blade', 'back on the trail'],
    who: [], registryIds: ['reg-running', 'reg-phantom'],
    videos: [100, 157], subjects: [['s-function', 'Function & movement', 29], ['s-community', 'Community & encouragement', 23], ['s-fit', 'Fit & comfort', 11]],
  },
  {
    key: 'caregivers', name: 'Caregivers and family', oneLiner: 'Parents and partners asking on someone’s behalf.',
    wants: 'Clear answers they can act on for someone else: what to buy, what’s covered, what recovery looks like.',
    blockers: 'Not knowing whom to trust, and costs they didn’t expect, like liners and new sockets as a child grows.',
    triggers: 'A clinician or another parent saying it worked for them.',
    howTheyTalk: ['my son’s leg', 'his prosthetist said', 'is this normal for kids?', 'we’re still waiting on insurance', 'she outgrew it already'],
    who: [{ signal: 'parent of child amputee', count: 12 }, { signal: 'partner of amputee', count: 5 }, { signal: 'adult child caregiver', count: 3 }],
    registryIds: ['reg-growing', 'reg-insurance', 'reg-kids-wear'],
    videos: [150, 195], subjects: [['s-fit', 'Fit & comfort', 17], ['s-cost', 'Cost & access', 14], ['s-community', 'Community & encouragement', 11]],
  },
  {
    key: 'clinicians', name: 'Clinicians and prosthetists', oneLiner: 'Answer questions in the comments; share fittings.',
    wants: 'To correct myths and show good fittings.', blockers: 'Patients arriving with expectations set by social videos.',
    triggers: 'A wrong claim in a popular video.', howTheyTalk: [], who: [], registryIds: ['reg-knee-choice'],
    videos: [190, 219], subjects: [['s-choose', 'Choosing the right device', 15], ['s-fit', 'Fit & comfort', 10], ['s-function', 'Function & movement', 6]],
  },
]

/** Össur's six subjects, in their own order (the names production holds). */
const OSSUR_SUBJECTS: [string, string][] = [
  ['s-choose', 'Choosing the right device'], ['s-community', 'Community & encouragement'], ['s-cost', 'Cost & access'],
  ['s-fit', 'Fit & comfort'], ['s-function', 'Function & movement'], ['s-look', 'Look & style'],
]

/** Which of Össur's subjects have passed their check: every one (the
 *  board's month), none (production on 13 Oct: all six provisional), two
 *  of the six (a mixed month), or the tracked-always four (14 Oct: one
 *  ready, one ready and thin, one open, one failed; the other two not
 *  followed). */
export type OssurSubjectChecks = 'ready' | 'provisional' | 'mixed' | 'tracked'
const MIXED_READY = new Set(['s-cost', 's-function'])
/** The tracked-always four: Function & movement ready, Look & style ready and
 *  thin, Cost & access open, Fit & comfort failed (being re-described). */
const TRACKED_CHECKS: Record<string, 'ready' | 'provisional' | 'failed'> = { 's-function': 'ready', 's-look': 'ready', 's-cost': 'provisional', 's-fit': 'failed' }

/** Ruling U6 as the reader applies it: Össur's subjects through
 *  `measuredSubjects` (lib/reading/cross.ts), the one rule. */
function ossurMeasured(checks: OssurSubjectChecks) {
  const checkOf = (id: string): 'ready' | 'provisional' | 'failed' | 'off' => checks === 'tracked' ? TRACKED_CHECKS[id] ?? 'off'
    : checks === 'ready' || (checks === 'mixed' && MIXED_READY.has(id)) ? 'ready' : 'provisional'
  return measuredSubjects(OSSUR_SUBJECTS.map(([id, name]) => {
    const c = checkOf(id)
    const checked = c === 'ready' || c === 'failed'
    return {
      // Össur's checks are held against its own judge since 14 Oct.
      id, client_id: OSSUR_CLIENT_ID, name, status: c === 'off' ? 'retired' : 'active', calibration_judge_version: checked ? judgeVersionFor(OSSUR_CLIENT_ID) : null,
      calibrated_at: checked ? '2026-10-13T00:00:00.000Z' : null,
      // 0.09 on 33 labels: even the top of its likely range is under the floor.
      calibration_precision: c === 'ready' ? 0.92 : c === 'failed' ? 0.09 : null, calibration_n: c === 'ready' ? 40 : c === 'failed' ? 33 : null,
    }
  }))
}

/** The thin subject of the tracked-always four: two of the caregivers'
 *  videos, and no other group's. */
const TRACKED_THIN: Record<string, number> = { caregivers: 2 }

/** A read's subjects as the loader hands them on (`loadGroupSubjects`): the
 *  ready ones counted, a ready one the group never touches at 0 after the
 *  rest (14 Oct, `groupSubjects`), the rest pending by name with its state. */
function measuredRead<T extends { groups: GroupSubjectRow[] }>(read: T, checks: OssurSubjectChecks): T & { pendingSubjects: PendingSubject[] } {
  const m = ossurMeasured(checks)
  const groups = read.groups.map((g) => {
    const counted = g.subjects
      .filter((x) => m.names.has(x.subjectId))
      .concat(checks === 'tracked' && TRACKED_THIN[g.key] ? [{ subjectId: 's-look', label: 'Look & style', k: TRACKED_THIN[g.key], n: g.n }] : [])
      .filter((x) => x.k > 0)
      .sort((a, b) => b.k - a.k || a.subjectId.localeCompare(b.subjectId))
    const zeros = g.n > 0 ? [...m.names].filter(([id]) => !counted.some((x) => x.subjectId === id)).map(([subjectId, label]) => ({ subjectId, label, k: 0, n: g.n })) : []
    return { ...g, subjects: [...counted, ...zeros] }
  })
  return { ...read, groups, pendingSubjects: m.pending }
}

const OSSUR_LABELS = new Map([
  ['reg-phantom', 'Phantom pain and itching'],
  ['reg-first-socket', 'Waiting for a first socket'],
  ['reg-skin', 'Skin problems under the liner'],
  ['reg-insurance', 'Insurance refusals for powered knees'],
  ['reg-knee-choice', 'Choosing a microprocessor knee'],
  ['reg-running', 'Running on a blade'],
  ['reg-growing', 'Growing out of a socket'],
  ['reg-kids-wear', 'Getting kids to wear it'],
])

/** Each conversation's month videos (`month_evidence_refs` theme rows). */
function refsOver(market: { id: string }[], spans: Record<string, [number, number][]>): ThemeRef[] {
  return Object.entries(spans).map(([themeId, ranges]) => ({
    themeId, audience: 'industry-other', videoIds: ranges.flatMap(([a, b]) => market.slice(a, b).map((m) => m.id)),
  }))
}

const OSSUR_QUOTES: VoicesQuote[] = [
  { ref: 'e:q1', text: 'My daughter outgrew her socket in four months. Is that normal?', english: null, lang: null, platform: 'instagram', cite: 'Instagram · 14 Sep · under a category video' },
  { ref: 'e:q2', text: 'He refuses to wear it to school. Any tips from other parents?', english: null, lang: null, platform: 'tiktok', cite: 'TikTok · 16 Sep · under a category video' },
  { ref: 'e:q3', text: 'Insurance covered the leg but not the liners. Nobody warned us.', english: null, lang: null, platform: 'instagram', cite: 'Instagram · 19 Sep · under a category video' },
]

interface CreatorIn {
  platform: string
  account: string
  videos: [number, number]
  followers: number | null
}

function creatorsFrom(market: { id: string; platform: string }[], creators: CreatorIn[]): CreatorVideo[] {
  const owner = new Map<string, CreatorIn>()
  for (const c of creators) for (const m of market.slice(c.videos[0], c.videos[1])) if (!owner.has(m.id)) owner.set(m.id, c)
  return market.map((m, i) => {
    const c = owner.get(m.id)
    return {
      videoId: m.id, audience: 'industry-other', platform: c?.platform ?? m.platform,
      account: c?.account ?? `account${i}`, followers: c?.followers ?? 0, scrapedAt: '2026-09-28T06:00:00.000Z',
    }
  })
}

const OSSUR_CREATORS: CreatorIn[] = [
  { platform: 'reddit', account: 'r/amputee', videos: [0, 25], followers: 16126 },
  { platform: 'tiktok', account: 'A L I S', videos: [100, 108], followers: 186221 },
  { platform: 'youtube', account: 'The Amputee Diaries', videos: [150, 157], followers: 96000 },
  { platform: 'instagram', account: 'runningon.carbon', videos: [110, 116], followers: 41200 },
  { platform: 'instagram', account: 'limbcare.clinic', videos: [190, 195], followers: 12000 },
  { platform: 'tiktok', account: 'newleg.newlife', videos: [200, 204], followers: 58000 },
  { platform: 'youtube', account: 'Stepping Forward', videos: [210, 213], followers: 3100 },
]

/** A group's products, as the board's panel draws them ("Iceross Comfort 2
 *  of 45 · Couldn't tell which product 7 of 45"): two named products and the
 *  talk about a liner that could not tell which, over the group's videos. */
function ossurGroupProducts(videoIds: readonly string[], params: VoicesParams) {
  const ids = [...videoIds]
  const sets = {
    groups: new Map([['g-liners', { any: new Set(ids.slice(0, 11)), named: new Set(ids.slice(0, 3)), unclear: new Set(ids.slice(3, 10)), unbranded: new Set(ids.slice(10, 11)) }]]),
    products: new Map([['p-comfort', new Set(ids.slice(0, 2))], ['p-seal', new Set(ids.slice(2, 3))], ['p-rheo', new Set<string>()]]),
    all: new Set(ids.slice(0, 11)),
  }
  const products = [{ id: 'p-comfort', name: 'Iceross Comfort' }, { id: 'p-seal', name: 'Iceross Seal-In' }, { id: 'p-rheo', name: 'Rheo Knee' }]
  return groupProducts({ state: 'ready', sets, products, month: SEP, monthWords: monthWordsOf(SEP, false), params })
}

/** Össur's September: groups and creators read; brand rules, no brand row.
 *  `checks`: which of its subjects have passed their check (every one, the
 *  board's month, unless named). */
export function ossurVoicesFixture(params: VoicesParams = {}, checks: OssurSubjectChecks = 'ready'): VoicesData {
  const market = marketOf(487, ['tiktok', 'instagram', 'youtube', 'reddit'])
  const built = groupsFrom(OSSUR_PERSONAS, market)
  const profile = built.profile
  const read = measuredRead(built.read, checks)
  const platformOf = new Map(market.map((m) => [m.id, m.platform]))
  const groups = buildGroups({ profile, read, platformOf, params })
  const tracked = [{ brandKey: 'client', label: 'Össur', countState: 'counted' as const }, { brandKey: '5ecfa431', label: 'Ottobock', countState: 'counted' as const }]
  const pairs = brandMonthPair({ month: SEP, brands: tracked, rows: [], audiences: ['industry-other'], pair: null })
  // No month row yet (the back-read has not run): every brand "not counted
  // yet", and the latest update's finding about Ottobock still the note.
  const brands = buildBrands({ clientId: OSSUR_CLIENT_ID, month: SEP, pairs, crosses: null, note: { rival: 'Ottobock', title: 'Ottobock’s talk turns on getting a knee paid for' }, params })
  const refs = refsOver(market, {
    'reg-phantom': [[0, 10]], 'reg-first-socket': [[10, 30]], 'reg-skin': [[30, 45]], 'reg-insurance': [[60, 90], [150, 158]],
    'reg-knee-choice': [[110, 125], [190, 200]], 'reg-running': [[100, 124]], 'reg-growing': [[150, 162]], 'reg-kids-wear': [[170, 177]],
  })
  const creatorVideos = creatorsFrom(market, OSSUR_CREATORS)
  const read2 = creatorThemes({ month: SEP, videos: creatorVideos, refs })
  const videoIds = creatorVideoIds(creatorVideos.map((v) => ({ id: v.videoId, platform: v.platform, account: v.account })))
  const creators = buildCreators({ month: SEP, read: read2, labels: OSSUR_LABELS, videoIds, brands: [], params })
  // Why a failed subject shows no figure, once on the page (the loader's rule).
  const failed = failedSubjectsOf(read.pendingSubjects)
  return {
    client: 'Össur', month: SEP, soFar: false, monthWords: monthWordsOf(SEP, false), monthLabel: readingMonthLabel(SEP, VOICES_FIXTURE_NOW), videos: market.length,
    groups, brands, creators, params,
    ...(failed.length > 0 ? { subjectsFailed: failed } : {}),
  }
}

// ---- Össur's thin states (the parity pass, 13 Oct) ---------------------------------
//
// The page keeps the board's shape when the month is thin: these two pin it.
// `ossurThin` is Össur as production reads it today, and thinner: no brand
// row (rules, no back-read), no finding to note, one group whose comments
// fall on no video this month, one whose videos carry no subject, and two
// creators at the floor. `ossurCounted` is the day after the brand back-read:
// Ottobock counted, and Össur's own row still "not counted yet", because no
// match of its name outside its own posts has been read by hand
// (`clientNameCounts`, NAME_READS holds none for Össur).

/** Össur today, thinner: every section drawn from very little, and none of
 *  its subjects checked (all six provisional, as production holds them on
 *  13 Oct): no group carries a subject count (ruling U6). */
export function ossurThinVoicesFixture(params: VoicesParams = {}): VoicesData {
  const market = marketOf(212, ['tiktok', 'instagram', 'youtube', 'reddit'])
  const personas = OSSUR_PERSONAS.map((p): PersonaIn => (
    p.key === 'clinicians' ? { ...p, videos: [0, 0], subjects: [] }
      : p.key === 'athlete' ? { ...p, videos: [100, 112], subjects: [] }
        : p
  ))
  const built = groupsFrom(personas, market)
  const profile = built.profile
  const read = measuredRead(built.read, 'provisional')
  const platformOf = new Map(market.map((m) => [m.id, m.platform]))
  const groups = buildGroups({ profile, read, platformOf, params })
  const tracked = [{ brandKey: 'client', label: 'Össur', countState: 'counted' as const }, { brandKey: '5ecfa431', label: 'Ottobock', countState: 'counted' as const }]
  const pairs = brandMonthPair({ month: SEP, brands: tracked, rows: [], audiences: ['industry-other'], pair: null })
  const brands = buildBrands({ clientId: OSSUR_CLIENT_ID, month: SEP, pairs, crosses: null, note: null, params })
  const refs = refsOver(market, { 'reg-running': [[100, 110]], 'reg-insurance': [[150, 158]] })
  const creatorVideos = creatorsFrom(market, OSSUR_CREATORS.slice(0, 3))
  const read2 = creatorThemes({ month: SEP, videos: creatorVideos, refs })
  const videoIds = creatorVideoIds(creatorVideos.map((v) => ({ id: v.videoId, platform: v.platform, account: v.account })))
  const creators = buildCreators({ month: SEP, read: read2, labels: OSSUR_LABELS, videoIds, brands: [], params })
  return {
    client: 'Össur', month: SEP, soFar: false, monthWords: monthWordsOf(SEP, false), monthLabel: readingMonthLabel(SEP, VOICES_FIXTURE_NOW), videos: market.length,
    groups, brands, creators, params,
  }
}

/** Össur after the brand back-read: the rivals counted, its own row not yet,
 *  and two of its six subjects checked (a mixed month, ruling U6), unless
 *  `checks` names another state (the tracked-always four, 14 Oct). */
export function ossurCountedVoicesFixture(params: VoicesParams = {}, checks: OssurSubjectChecks = 'mixed'): VoicesData {
  const base = ossurVoicesFixture(params, checks)
  const market = marketOf(487, ['tiktok', 'instagram', 'youtube', 'reddit'])
  const OTTO = '5ecfa431'
  const tracked = [{ brandKey: 'client', label: 'Össur', countState: 'counted' as const }, { brandKey: OTTO, label: 'Ottobock', countState: 'counted' as const }]
  const rows: StoredBrandMonthRow[] = [
    { month: SEP, audience: 'industry-other', brand_key: 'client', k_any: 41, k_organic: 30, n: 487, n_organic: 402 },
    { month: SEP, audience: 'industry-other', brand_key: OTTO, k_any: 37, k_organic: 12, n: 487, n_organic: 402 },
    { month: AUG, audience: 'industry-other', brand_key: OTTO, k_any: 20, k_organic: 6, n: 330, n_organic: 270 },
  ]
  const pairs = brandMonthPair({ month: SEP, brands: tracked, rows, audiences: ['industry-other'], pair: null })
  const setOf = (from: number, k: number): string[] => Array.from({ length: k }, (_, i) => market[(from + i * 5) % market.length].id)
  const videos: BrandMonthVideos[] = [
    { ...tracked[0], month: SEP, any: setOf(1, 41), organic: setOf(1, 30), n: 487, nOrganic: 402 },
    { ...tracked[1], month: SEP, any: setOf(100, 37), organic: setOf(100, 12), n: 487, nOrganic: 402 },
  ]
  const cross = (key: string, n: number, cells: [string, string, number][]): BrandCrossRow => ({
    brandKey: key, label: key === OTTO ? 'Ottobock' : 'Össur', month: SEP, base: 'any', n,
    cells: cells.map(([id, label, k]) => ({ id, label, k, n })),
  })
  const kinds = [cross('client', 41, [['praise', 'praise', 24], ['pain_point', 'pain_point', 9]]), cross(OTTO, 37, [['praise', 'praise', 12], ['pain_point', 'pain_point', 18]])]
  // The lens's subject rows over each brand's videos, cut by the reader to
  // the ready subjects (`measuredSubjects`): a provisional one's count, here
  // Fit & comfort's, never reaches the page. A ready subject on none of the
  // brand's videos keeps its cell at 0, after the rest (14 Oct, `brandSubjects`).
  const measured = ossurMeasured(checks)
  const lensSubjects = [
    cross('client', 41, [['s-function', 'Function & movement', 16], ['s-fit', 'Fit & comfort', 30]]),
    cross(OTTO, 37, [['s-cost', 'Cost & access', 21], ['s-fit', 'Fit & comfort', 25], ['s-function', 'Function & movement', 9], ...(checks === 'tracked' ? [['s-look', 'Look & style', 1] as [string, string, number]] : [])]),
  ]
  const subjects = lensSubjects.map((b) => {
    const cells = b.cells.filter((c) => measured.names.has(c.id))
    const zeros = b.n > 0 ? [...measured.names].filter(([id]) => !cells.some((c) => c.id === id)).map(([id, label]) => ({ id, label, k: 0, n: b.n })) : []
    return { ...b, cells: [...cells, ...zeros] }
  })
  const crosses = { videos, kinds, subjects, pendingSubjects: measured.pending }
  const brands = buildBrands({
    clientId: OSSUR_CLIENT_ID, month: SEP, pairs, crosses,
    note: { rival: 'Ottobock', title: 'Ottobock’s talk turns on getting a knee paid for' }, params,
  })
  const counted = new Set(brands.rows.map((r) => r.brandKey))
  const brandSets: BrandSet[] = videos.filter((b) => counted.has(b.brandKey)).map((b) => ({ label: b.label, you: b.brandKey === 'client', any: new Set(b.any) }))
  const refs = refsOver(market, {
    'reg-phantom': [[0, 10]], 'reg-first-socket': [[10, 30]], 'reg-skin': [[30, 45]], 'reg-insurance': [[60, 90], [150, 158]],
    'reg-knee-choice': [[110, 125], [190, 200]], 'reg-running': [[100, 124]], 'reg-growing': [[150, 162]], 'reg-kids-wear': [[170, 177]],
  })
  const creatorVideos = creatorsFrom(market, OSSUR_CREATORS)
  const read2 = creatorThemes({ month: SEP, videos: creatorVideos, refs })
  const videoIds = creatorVideoIds(creatorVideos.map((v) => ({ id: v.videoId, platform: v.platform, account: v.account })))
  const creators = buildCreators({ month: SEP, read: read2, labels: OSSUR_LABELS, videoIds, brands: brandSets, params })
  return { ...base, brands, creators }
}

// ---- Sealand -----------------------------------------------------------------------

const COTO = 'c0000000-0000-0000-0000-000000000001'
const FREI = 'c0000000-0000-0000-0000-000000000002'
const PATA = 'c0000000-0000-0000-0000-000000000003'
const RARE = 'c0000000-0000-0000-0000-000000000004'
const TNF = 'c0000000-0000-0000-0000-000000000005'
const FOM = 'c0000000-0000-0000-0000-000000000006'

/** Sealand's one September name read (lib/brands/precision.ts NAME_READS). */
const SEALAND_NAMED = 'a8fdd6fe-e2d6-434c-a207-6f17eb3f9b26'

const SEALAND_BRANDS = [
  { brandKey: 'client', label: 'Sealand', countState: 'counted' as const },
  { brandKey: COTO, label: 'Cotopaxi', countState: 'counted' as const },
  { brandKey: 'c-fom', label: 'Freedom of Movement', countState: 'none' as const },
  { brandKey: FREI, label: 'Freitag', countState: 'counted' as const },
  { brandKey: PATA, label: 'Patagonia', countState: 'counted' as const },
  { brandKey: RARE, label: 'Rareform', countState: 'counted' as const },
  { brandKey: TNF, label: 'The North Face', countState: 'counted' as const },
]
void FOM

/** month_brand_readings, pooled into one audience: [k_any, k_organic] for
 *  September (n 940, n_organic 743) and August (n 412, n_organic 250). */
const STORED: Record<string, { sep: [number, number]; aug: [number, number] }> = {
  client: { sep: [1, 1], aug: [0, 0] },
  [COTO]: { sep: [52, 5], aug: [20, 1] },
  [FREI]: { sep: [7, 2], aug: [3, 0] },
  [PATA]: { sep: [65, 13], aug: [30, 4] },
  [RARE]: { sep: [1, 0], aug: [0, 0] },
  [TNF]: { sep: [64, 10], aug: [28, 5] },
}

function storedRows(stored: typeof STORED = STORED): StoredBrandMonthRow[] {
  return Object.entries(stored).flatMap(([brand_key, v]) => [
    { month: SEP, audience: 'industry-other', brand_key, k_any: v.sep[0], k_organic: v.sep[1], n: 940, n_organic: 743 },
    { month: AUG, audience: 'industry-other', brand_key, k_any: v.aug[0], k_organic: v.aug[1], n: 412, n_organic: 250 },
  ])
}

const KIND_CELLS: Record<string, [string, number][]> = {
  client: [['question', 1]],
  [COTO]: [['praise', 31], ['question', 30], ['pain_point', 19], ['purchase_intent', 22]],
  [FREI]: [['praise', 4], ['pain_point', 2], ['question', 3]],
  [PATA]: [['praise', 50], ['question', 45], ['pain_point', 43], ['purchase_intent', 43], ['feature_request', 28], ['objection', 26], ['switching_signal', 13], ['demographic_signal', 6]],
  [RARE]: [['praise', 1]],
  [TNF]: [['praise', 38], ['pain_point', 33], ['question', 29], ['objection', 12]],
}

const SUBJECT_CELLS: Record<string, [string, string, number][]> = {
  client: [['s-dura', 'Durability', 1]],
  [COTO]: [['s-looks', 'Looks & style', 18], ['s-dura', 'Durability', 12], ['s-price', 'Price', 9]],
  [FREI]: [['s-purpose', 'Community & purpose', 3]],
  [PATA]: [['s-dura', 'Durability', 19], ['s-comfort', 'Comfort', 17], ['s-repair', 'Repair & warranty', 14], ['s-water', 'Waterproofing', 10], ['s-price', 'Price', 6], ['s-buy', 'Buying & delivery', 5]],
  [RARE]: [],
  [TNF]: [['s-comfort', 'Comfort', 21], ['s-dura', 'Durability', 15], ['s-water', 'Waterproofing', 8]],
}

const SEALAND_PERSONAS: PersonaIn[] = [
  {
    key: 'one-bag', name: 'One-bag travellers', oneLiner: 'Pack light for long trips and compare every litre.',
    wants: 'One bag that does carry-on, day trips and the office.', blockers: 'Airline size rules and bags that look bigger than they are.',
    triggers: 'A packing video that fits a whole trip into one bag.', howTheyTalk: ['carry-on only', 'fits under the seat', 'how many litres'],
    who: [{ signal: 'frequent traveller', count: 11 }], registryIds: ['reg-airline', 'reg-laundry'],
    videos: [0, 74], subjects: [['s-dura', 'Durability', 22], ['s-comfort', 'Comfort', 19], ['s-water', 'Waterproofing', 9]],
  },
  {
    key: 'eco', name: 'Sustainability-minded buyers', oneLiner: 'Want to know what a bag is made of and who made it.',
    wants: 'Proof a recycled bag lasts as long as a new one.', blockers: 'Claims they cannot check.',
    triggers: 'A maker showing the material up close.', howTheyTalk: ['made from sails', 'upcycled'],
    who: [], registryIds: ['reg-material'],
    videos: [60, 110], subjects: [['s-purpose', 'Community & purpose', 21], ['s-dura', 'Durability', 12]],
  },
  {
    key: 'commuters', name: 'Daily commuters', oneLiner: 'Laptop, lunch and rain, every day.',
    wants: 'A bag that keeps a laptop dry on a bike.', blockers: 'Straps that dig in and zips that fail.',
    triggers: 'A wet-weather test.', howTheyTalk: ['laptop sleeve', 'rain cover'], who: [], registryIds: ['reg-laptop'],
    videos: [120, 158], subjects: [['s-water', 'Waterproofing', 14], ['s-comfort', 'Comfort', 11]],
  },
]

const SEALAND_LABELS = new Map([
  ['reg-airline', 'Confusion over airline size rules'],
  ['reg-laundry', 'Laundry planning while traveling'],
  ['reg-material', 'What recycled sailcloth feels like'],
  ['reg-laptop', 'Keeping a laptop dry'],
  ['reg-question-patagonia', 'Is the Black Hole worth it'],
])

const SEALAND_CREATORS: CreatorIn[] = [
  { platform: 'reddit', account: 'r/onebag', videos: [0, 30], followers: 951602 },
  { platform: 'youtube', account: 'Pack Hacker', videos: [30, 42], followers: 512000 },
  { platform: 'tiktok', account: 'travelwithkate', videos: [42, 50], followers: 88400 },
  { platform: 'instagram', account: 'patagonia', videos: [50, 56], followers: 5800000 },
  { platform: 'reddit', account: 'r/backpacks', videos: [56, 61], followers: 210000 },
  { platform: 'youtube', account: 'Bag Lab', videos: [61, 64], followers: 23000 },
]

/** Sealand's September: brands counted, Patagonia's Competitive pane on its
 *  panel. `youQuiet`: Sealand named in its one video only when asked (k_any
 *  1, k_organic 0), so its row prints a 0 and its crosses still read. The
 *  crosses are the loader's: only the brands `crossKeys` picks are crossed. */
export function sealandVoicesFixture(params: VoicesParams = {}, opts: { youQuiet?: boolean } = {}): VoicesData {
  const market = marketOf(940, ['tiktok', 'youtube', 'instagram', 'reddit'])
  const { profile, read } = groupsFrom(SEALAND_PERSONAS, market)
  const platformOf = new Map(market.map((m) => [m.id, m.platform]))
  const groups = buildGroups({ profile, read, platformOf, params })
  const stored: typeof STORED = opts.youQuiet ? { ...STORED, client: { sep: [1, 0], aug: [0, 0] } } : STORED
  const pairs = brandMonthPair({ month: SEP, brands: SEALAND_BRANDS, rows: storedRows(stored), audiences: ['industry-other'], pair: null })
  // THE LOADER'S PATH: a brand is crossed (its month set, kinds and
  // subjects) only where `crossKeys` picks it, as `loadVoicesBase` asks
  // `loadBrandCrosses` for those keys alone.
  const keys = new Set(crossKeys(pairs))
  // The month sets: each brand's k_any videos, the client's the one name read.
  // Spread over the month's market (every seventh video, from each brand's
  // own offset), so the creators' chips name more than one brand.
  const crossed = SEALAND_BRANDS.filter((b) => keys.has(b.brandKey))
  const videos: BrandMonthVideos[] = crossed.map((b) => {
    const bi = SEALAND_BRANDS.indexOf(b)
    const v = stored[b.brandKey]
    const any = b.brandKey === 'client' ? [SEALAND_NAMED] : v ? Array.from({ length: v.sep[0] }, (_, i) => market[(bi * 3 + i * 7) % market.length].id) : []
    return { ...b, month: SEP, any, organic: any.slice(0, v?.sep[1] ?? 0), n: 940, nOrganic: 743 }
  })
  const cross = (cells: Record<string, [string, number][]>): BrandCrossRow[] => crossed.map((b) => ({
    brandKey: b.brandKey, label: b.label, month: SEP, base: 'any', n: stored[b.brandKey]?.sep[0] ?? 0,
    cells: (cells[b.brandKey] ?? []).map(([id, k]) => ({ id, label: id, k, n: stored[b.brandKey]?.sep[0] ?? 0 })),
  }))
  const kinds = cross(KIND_CELLS)
  const subjects: BrandCrossRow[] = crossed.map((b) => ({
    brandKey: b.brandKey, label: b.label, month: SEP, base: 'any', n: stored[b.brandKey]?.sep[0] ?? 0,
    cells: (SUBJECT_CELLS[b.brandKey] ?? []).map(([id, label, k]) => ({ id, label, k, n: stored[b.brandKey]?.sep[0] ?? 0 })),
  }))
  const crosses = { videos, kinds, subjects }
  const brands = buildBrands({
    clientId: SEALAND_CLIENT_ID, month: SEP, pairs, crosses,
    note: { rival: 'Patagonia', title: 'Patagonia is praised for lasting for years, and the repair promise is what people repeat' },
    params,
    clientCounts: clientCountsOf(SEALAND_CLIENT_ID, SEP, pairs, crosses),
  })
  const refs = refsOver(market, { 'reg-airline': [[0, 20]], 'reg-laundry': [[3, 11], [100, 108]], 'reg-material': [[60, 75]], 'reg-laptop': [[120, 140]] })
  const creatorVideos = creatorsFrom(market, SEALAND_CREATORS)
  const read2 = creatorThemes({ month: SEP, videos: creatorVideos, refs })
  const videoIds = creatorVideoIds(creatorVideos.map((v) => ({ id: v.videoId, platform: v.platform, account: v.account })))
  const counted = new Set(brands.rows.map((r) => r.brandKey))
  const brandSets: BrandSet[] = videos.filter((b) => counted.has(b.brandKey)).map((b) => ({ label: b.label, you: b.brandKey === 'client', any: new Set(b.any) }))
  const creators = buildCreators({ month: SEP, read: read2, labels: SEALAND_LABELS, videoIds, brands: brandSets, params })
  return {
    client: 'Sealand', month: SEP, soFar: false, monthWords: monthWordsOf(SEP, false), monthLabel: readingMonthLabel(SEP, VOICES_FIXTURE_NOW), videos: market.length,
    groups, brands, creators, params,
  }
}

/** The fixture each shot and render test draws (the root; the level pages'
 *  are `VOICES_LEVEL_FIXTURES`, lib/pages/v2/voices-levels-fixture.ts). */
export const VOICES_FIXTURES = {
  ossur: () => ossurVoicesFixture(),
  sealand: () => sealandVoicesFixture(),
  // The parity pass (13 Oct): the board's shape in Össur's thin states.
  'ossur-thin': () => ossurThinVoicesFixture(),
  'ossur-counted': () => ossurCountedVoicesFixture(),
  // Ruling U6: none of Össur's subjects checked (production, 13 Oct), and two
  // of six checked.
  'ossur-provisional': () => ossurVoicesFixture({}, 'provisional'),
  'ossur-mixed': () => ossurVoicesFixture({}, 'mixed'),
  // A tracked subject is never hidden (14 Oct): one ready, one ready and
  // thin, one whose check is open, one being re-described.
  'ossur-tracked': () => ossurCountedVoicesFixture({}, 'tracked'),
  // Your own row counted with nobody naming it unprompted: still crossed.
  'sealand-you-quiet': () => sealandVoicesFixture({}, { youQuiet: true }),
} as const
