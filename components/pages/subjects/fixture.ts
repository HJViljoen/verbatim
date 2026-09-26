import { buildSeries, type DenominatorPoint, type MonthSeries, type NumeratorPoint, type SeriesChange } from '@/lib/reading/series'
import { nextMonth } from '@/lib/reading/monthly'
import { monthChange } from '@/lib/reading/bands'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { kindShares, redditRead } from '@/lib/reading/kinds'
import {
  axisNote,
  calibratedSides,
  railNote,
  setLine,
  SUPERSEDE_RULE,
  UNANSWERED_BASIS,
  UNANSWERED_CLAIMS_UNREADABLE,
  REDDIT_THREAD_CAP,
  unansweredLead,
  periodPhrase,
  trailLine,
  buildSides,
  gapSideOf,
  paneGap,
  byRailRank,
  MARKET_LINE,
  type StoredKindRow,
  type SubjectsData,
  type SubjectVoice,
} from '@/lib/pages/subjects'
import type { RefusedReason } from '@/lib/reading/verdicts'
import { claimEcho, ownCensusWithClaims, type OwnPostInput } from '@/lib/reading/own-posts'
import { claimCounts } from '@/lib/market-tiles'
import type { Subject } from '@/lib/subjects/types'
import { unreadWords } from '@/lib/subjects/read-in'
import { methodFixture, methodRecordFixture, methodRefusedFixture, recordBandFixture } from '@/lib/test/method-fixture'
import { FIXTURE_ENDED } from '@/lib/test/pair-fixture'

// The Subjects page's block fixtures (Phase 1 WP12).
//
// THREE STATES, ALL REAL. `subjectsFixture()` is the mock's own reading — six
// subjects, Durability selected, the category climbing three months running.
// `refusedFixture()` is the state PRODUCTION is in today: M4 unapplied, so the
// subjects, the months, the moves and the kind mix all come back as sentences
// saying what is not recorded yet. `candidatesFixture()` is a tenant that has
// been proposed a set and confirmed none of it — the state every tenant passes
// through, and the one where "0 named" would read as a bug.

const MONTH = '2026-09-01'
const NOW = '2026-09-28T09:00:00.000Z'
const AXIS = ['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', MONTH]

const RIVAL = 'competitor:Freitag'

/** The day the tracked rival was stopped, in the retired-rival arm. */
const RIVAL_STOPPED = '2026-08-12'

const subject = (over: Partial<Subject> = {}): Subject => ({
  id: 's1', client_id: 'c1', name: 'Durability', description: 'Whether the bag lasts',
  origin: 'category_theme', source_ref: null, named_at: '2026-08-19', status: 'active',
  superseded_by: null, embedded_at: null, embed_input_version: null,
  calibrated_at: '2026-09-01', calibration_precision: 0.9, calibration_n: 200,
  calibration_judge_version: null,
  ...over,
})

/**
 * @param retiredAt  The day the tracked rival was STOPPED, where the fixture is
 *   the retired-rival arm. It is not decoration: `buildSides` takes the rival's
 *   `retiredAt`, which is what labels the side "Freitag — stopped" and what
 *   makes the gap `refused: 'tracking_change'` — and the stop is a change to
 *   what this workspace tracks, so the rival's own series carries it as a dated
 *   `tracking_change` and the chart draws the rule. Passing only a refusal
 *   reason (which is what this fixture used to do) produces a pane that is
 *   pixel-identical to the live one but for one sentence, and proves nothing
 *   about how the page behaves when a rival was actually stopped.
 */
function sidesAndSeries(retiredAt: string | null = null) {
  const denominators: DenominatorPoint[] = []
  const per = new Map<string, number>()
  const add = (month: string, audience: string, videos: number) => {
    denominators.push({
      month, audience, videos, comments: videos * 9,
      status: month === MONTH ? 'filling' : 'frozen',
      origin: 'live', read_at: `${month}T00:00:00Z`, run_id: 'r1',
    })
    per.set(`${month}|${audience}`, videos)
  }
  for (const m of AXIS) {
    // April is below the floor for your own audience — the mock's own case.
    add(m, CLIENT_AUDIENCE, m === '2026-04-01' ? 22 : 84)
    add(m, RIVAL, 142)
    add(m, INDUSTRY_AUDIENCE, 1388)
  }

  // SEPTEMBER IS 305, WHICH IS WHAT THE ARTBOARDS SAY (Block D wave 3, M13,
  // by agreement with the `subjects` package — this constant only).
  // `Subjects.dc.html` prints "22%" over "305 of 1,388 videos" on the Durability
  // row AND "Category 22% of 1,388" on its own chart's end label;
  // `Main.dc.html` and `MarketingBrief.dc.html` print the same pair, eight
  // times on the brief. At 340 the chart read 24.5% of 1,388 eighty pixels
  // under an Overview row reading 22% of 1,388 — the same measure, the same
  // month, the same sheet, two numbers — on the one artefact built to be
  // checked.
  const catK: Record<string, number> = {
    '2026-04-01': 160, '2026-05-01': 190, '2026-06-01': 214,
    '2026-07-01': 236, '2026-08-01': 264, [MONTH]: 305,
  }
  const readings = (audience: string, k: (m: string) => number): NumeratorPoint[] =>
    AXIS.map((m) => ({ month: m, audience, videos: k(m), comments: k(m) * 3, run_id: 'r1' }))

  // The stop, as the reading layer carries it: one logged change over the month
  // it happened in, on the audience it happened to.
  const stopped: SeriesChange[] = retiredAt
    ? [{
        changed_at: retiredAt,
        surface: 'settings.rivals',
        note: 'Freitag was stopped as a tracked rival from this month, so a comparison across it is partly a change in what we track.',
        months: `[${retiredAt.slice(0, 8)}01,${nextMonth(retiredAt.slice(0, 8) + '01')})`,
      }]
    : []

  const seriesFor = (subjectId: string, audience: string) => {
    const k = audience === INDUSTRY_AUDIENCE ? (m: string) => catK[m]
      : audience === CLIENT_AUDIENCE ? () => 26
        : () => 62
    return buildSeries({
      axis: AXIS, audience, denominators, readings: readings(audience, k),
      objectId: subjectId, objectLabel: 'Durability',
      ...(audience === RIVAL ? { changes: stopped } : {}),
    })
  }

  // TWO MONTHS, NOT ONE. August exists so the per-kind verdicts are REAL — a
  // fixture with one month makes `kindChange` return null for every kind, and
  // the block's movement strip is then a branch nothing renders. August's
  // shares are a little different from September's, so one kind clears its
  // band on the category (1,388 videos) and none does on your own 84.
  const kindRows: StoredKindRow[] = [CLIENT_AUDIENCE, RIVAL, INDUSTRY_AUDIENCE].flatMap((audience): StoredKindRow[] =>
    [
      { month: '2026-08-01', shares: { question: 0.31, praise: 0.32, objection: 0.19 } },
      { month: MONTH, shares: { question: 0.34, praise: 0.28, objection: 0.19 } },
    ].flatMap(({ month, shares }): StoredKindRow[] => {
      const n = per.get(`${month}|${audience}`) ?? 0
      return [
        { month, audience, kind: 'question', videos: Math.round(n * shares.question), comments: 0, platform_mix: { reddit: Math.round(n * 0.13), tiktok: Math.round(n * 0.21) } },
        { month, audience, kind: 'praise', videos: Math.round(n * shares.praise), comments: 0, platform_mix: null },
        { month, audience, kind: 'objection', videos: Math.round(n * shares.objection), comments: 0, platform_mix: { reddit: Math.round(n * 0.04) } },
      ]
    }),
  )

  const sides = buildSides({
    // No month pair applies: a fixture pins rendering, read after its months ended (lib/test/pair-fixture.ts).
    pair: null, asOf: FIXTURE_ENDED,
    subject: subject(),
    rivals: [{ name: 'Freitag', retiredAt }],
    leadRival: { name: 'Freitag', retiredAt },
    month: MONTH,
    prevMonth: '2026-08-01',
    axis: AXIS,
    perAudience: per,
    kindRows,
    seriesFor,
    thin: false,
  })
  const series = sides.map((s) => seriesFor('s1', s.audience))
  return { sides, series, per, kindRows }
}

// D1 · the gap, built rather than typed. On the mock's own numbers — 26 of
// your 84 videos against 62 of Freitag's 142 — it reads "too few to compare":
// 84 is under the 100-video floor, which is the same refusal the mock prints
// one cell away in its own change column. Both levels, both denominators and
// the earlier month still print.
//
// `refused` is what `retiredRivalFixture` passes, so the fourth state of the
// gapline — the one a wave-2 port has a branch for — is a real artefact rather
// than a branch nothing exercises.
function paneGapFor(sides: ReturnType<typeof sidesAndSeries>['sides'], refused?: RefusedReason) {
  const gapYou = sides.find((s) => s.kind === 'you') ?? null
  const gapRival = sides.find((s) => s.kind === 'rival') ?? null
  return paneGap({
    subject: { id: 's1', name: 'Durability' },
    a: gapYou ? gapSideOf(gapYou) : null,
    b: gapRival ? gapSideOf(gapRival) : null,
    basis:
      gapYou && gapRival
        ? {
            a: { audience: gapYou.audience, label: gapYou.label, value: { k: 26, n: 84 }, pct: 31, observed: true },
            b: { audience: gapRival.audience, label: gapRival.label, value: { k: 62, n: 142 }, pct: 43.7, observed: true },
          }
        : null,
    month: MONTH,
    prevMonth: '2026-08-01',
    ...(refused ? { refused } : {}),
    thin: false,
  })
}

/**
 * "Your own posts", September — the mock's own tile, built through the real
 * `ownPostCensus` so the fixture cannot drift from the function.
 *
 * NINE POSTS, THREE OVER THE FLOOR, AND FOUR OF THE NINE CARRYING NO HOOK. The
 * last part is the one a reviewer has to see: the hook rows sum to five of
 * nine, not to nine, because the classifier names a hook on some posts and not
 * others — and on the live tenant it is five of seventeen. A tile that draws
 * these as a partition is drawing a figure the data does not hold.
 */
function ownPostsInput(): OwnPostInput {
  const post = (id: string, day: number, comments: number, hook: string | null, format: string | null) => ({
    id, upload_date: `2026-09-${String(day).padStart(2, '0')}`, comments_count: comments,
    hook_style: hook, classified_type: format,
  })
  return {
    month: MONTH,
    audience: CLIENT_AUDIENCE,
    audienceLabel: 'You',
    videos: [
      post('p1', 2, 41, 'demonstration', 'review'),
      post('p2', 5, 18, 'bold-claim', 'promotional'),
      post('p3', 9, 7, 'demonstration', 'behind-the-scenes'),
      post('p4', 11, 4, 'personal-story', 'story'),
      post('p5', 14, 2, 'statistic', null),
      post('p6', 17, 1, null, null),
      post('p7', 21, 0, null, null),
      post('p8', 24, 3, null, null),
      post('p9', 27, 1, null, null),
      // August: outside the census, and the reason the basis line exists.
      post('p0', 30, 55, 'demonstration', 'review'),
    ].map((v, i) => (i === 9 ? { ...v, upload_date: '2026-08-30' } : v)),
    claims: [
      { id: 'cl1', source_video_id: 'p1', entity: 'client', claim: 'Built to last a decade', quote: '' },
      { id: 'cl2', source_video_id: 'p3', entity: 'client', claim: 'built to last a decade', quote: '' },
      { id: 'cl3', source_video_id: 'p2', entity: 'client', claim: 'Made from 100% recycled sails', quote: '' },
      { id: 'cl4', source_video_id: 'p4', entity: 'client', claim: 'Waterproof', quote: '' },
    ],
    membership: [
      { subjectId: 's1', label: 'Durability', videoIds: ['p1', 'p3', 'p4'] },
      { subjectId: 's2', label: 'Recycled materials', videoIds: ['p2'] },
    ],
    echoes: [
      claimEcho({ audience: CLIENT_AUDIENCE, audienceLabel: 'You', reading: { k: 26, n: 84 }, stance: 'echoes' }),
      claimEcho({ audience: CLIENT_AUDIENCE, audienceLabel: 'You', reading: { k: 9, n: 84 }, stance: 'contradicts' }),
      claimEcho({ audience: CLIENT_AUDIENCE, audienceLabel: 'You', reading: { k: 0, n: 84 }, stance: 'silent' }),
    ],
    // Three subjects named, four of the nine posts analysed — so the subject
    // half is a real match here and carries no note. On production today the
    // same field is zero analysed posts and the census says so instead
    // (`refusedOwnPostsInput` below is that reading).
    subjectScope: { named: 3, analysedPosts: 4 },
  }
}

/**
 * The same census on a workspace whose SUBJECT SET cannot be read — which is
 * the state `refusedFixture()` is the fixture for.
 *
 * WHY IT IS ITS OWN INPUT AND NOT THE POPULATED ONE. `refusedFixture` built
 * its census from `ownPostsInput()`, whose membership names Durability and
 * Recycled materials — so the rail said "Your subjects are not recorded for
 * this workspace yet" and the tile 200px below it printed "SUBJECTS MATCHED ·
 * Durability 3 of 9 · Recycled materials 1 of 9". One screenful, two answers,
 * and the shot the package calls "the state production is in today" was not
 * that state.
 *
 * AND THE SHAPE IS THE LOADER'S, NOT AN INVENTION. `loadOwnPosts` reads the
 * subject rows first and only goes looking for membership where it HAS a set;
 * with M4 unapplied `loadSubjectRows` answers NULL, so `membership` is `[]` and
 * `subjectScope` is `null` — "this census cannot see the set", which is not
 * the same as "the set is empty". `SUBJECTS_NONE_NAMED` would be the wrong
 * sentence here: it invites the reader to name one, 200px under a rail that
 * has just said the set cannot be added to. The rail owns that state and this
 * tile stays quiet about it.
 *
 * The posts, the hooks, the formats and the claims half are untouched:
 * `videos` is tenant-readable whatever the month tables say.
 */
function refusedOwnPostsInput(): OwnPostInput {
  return { ...ownPostsInput(), membership: [], subjectScope: null }
}

/** A rail row's own banded change, through the real `monthChange` — 84 videos
 *  a side, so every row reads "too few to compare" exactly as the mock does. */
function railVerdict(id: string, label: string, k: number) {
  const point = (month: string, at: number) => ({ month, videos: 84, k: at, audience: CLIENT_AUDIENCE, regime: 'n/a' as const })
  return monthChange({
    comparability: null, // no month pair applies: a fixture pins rendering (lib/test/pair-fixture.ts)
    object: { kind: 'subject' as const, id, label },
    audience: CLIENT_AUDIENCE,
    curr: point(MONTH, k),
    prev: point('2026-08-01', k - 3),
  })
}

/** Six voices on Durability, across the audiences — the mock's own set. */
const VOICES: SubjectVoice[] = [
  {
    quote: { ref: 'e:1', text: 'Three winters on the bike and the seams are still perfect. The zip, less so.' },
    cite: '14 Sep · under a category video',
    href: 'https://www.tiktok.com/@maker/video/7312345678901234567',
    from: 'under a category video',
    platform: 'tiktok',
    source: 'comment',
    onScreen: null,
  },
  {
    quote: { ref: 'e:6', text: "I've had this bag through two Cape Town winters and it's the only one that never leaked" },
    cite: '11 Sep · creator video, transcript',
    href: null,
    from: 'under a category video',
    platform: 'tiktok',
    source: 'video',
    // THE FRAME HAS ITS OWN EVIDENCE ROW, so it carries its own ref: `e:9` is
    // the `video_text` row on the same video as `e:6`. A bare string here is
    // what let a snapshot store a third party's words.
    onScreen: { ref: 'e:9', text: '1 bag. 3 years. 0 regrets' },
  },
  {
    quote: { ref: 'e:8', text: "If the strap buckle breaks in two months I'm not paying R4,000 again" },
    cite: '24 Sep · under a post of yours',
    href: null,
    from: 'under a post of yours',
    platform: 'tiktok',
    source: 'comment',
    onScreen: null,
  },
  {
    quote: { ref: 'e:2', text: 'Nach 14 Monaten ist der Reißverschluss hin', lang: 'de', english: 'After 14 months the zip is done' },
    cite: '22 Sep · under a Freitag video',
    href: null,
    from: 'under a Freitag video',
    platform: 'youtube',
    source: 'comment',
    onScreen: null,
  },
  {
    quote: { ref: 'e:3', text: 'Does it fit a 16 inch MacBook or am I dreaming' },
    cite: '21 Sep · under a category video',
    href: null,
    from: 'under a category video',
    platform: 'youtube',
    source: 'comment',
    onScreen: null,
  },
  {
    quote: { ref: 'e:7', text: "Die sak hou vir ewig, maar die prys is 'n grap", lang: 'af', english: 'The bag lasts forever, but the price is a joke' },
    cite: '7 Sep · under a post of yours',
    href: null,
    from: 'under a post of yours',
    platform: 'instagram',
    source: 'comment',
    onScreen: null,
  },
]

export function subjectsFixture(over: Partial<SubjectsData> = {}): SubjectsData {
  const { sides, series } = sidesAndSeries()
  const gap = paneGapFor(sides)
  const rows = [
    { id: 's1', name: 'Durability', pct: 31, k: 26 },
    { id: 's2', name: 'Recycled materials', pct: 46, k: 39 },
    { id: 's3', name: 'Waterproofing', pct: 20, k: 17 },
  ]
  const unansweredRows = [
    { id: 'will it survive a wet commute', label: 'Will it survive a wet commute', videos: 130, reddit: 49, answered: false },
    { id: 'zips failing after a year', label: 'Zips failing after a year', videos: 71, reddit: 20, answered: false },
  ]

  return {
    brand: 'Sealand',
    month: MONTH,
    monthStatus: 'filling',
    readingAt: NOW,
    horizon: 'last_12',
    axis: AXIS,
    substrate: 'seeded',
    notes: [],
    list: {
      rows: rows.map((r, i) => ({
        id: r.id,
        name: r.name,
        description: i === 0 ? 'Whether the bag lasts' : null,
        origin: 'category_theme' as const,
        namedAt: '2026-08-19',
        status: 'active' as const,
        calibration: 'ready' as const,
        level: { k: r.k, n: 84, pct: r.pct },
        note: null,
        // 84 videos against a 100-video floor: the mock's own "too few to
        // compare" on every rail row. The 84 is the mock's invented volume
        // (F12): Sealand's own audience carries about 9 videos a month, and
        // staging holds no own-audience month row for August or September.
        // This row is the rail as stored before WP1.1 (a client level and its
        // badge); `calibrationFixture` is the rail WP1.1 builds.
        verdict: railVerdict(r.id, r.name, r.k),
        selected: i === 0,
        href: `/dashboard/subjects?item=${r.id}`,
      })),
      proposed: [],
      rule: SUPERSEDE_RULE,
      notRecorded: null,
      setLine: setLine(rows.length, 0),
      canEdit: true,
    },
    selected: {
      id: 's1',
      name: 'Durability',
      description: 'Whether the bag lasts',
      namedAt: '2026-08-19',
      origin: 'category_theme',
      calibration: 'ready',
      index: 1,
      of: 3,
      sides,
      series,
      // THE MOCK'S SIX, AND ALL FOUR KINDS OF EVIDENCE. Two of them are the
      // ones this fixture has always carried; the other four are what a
      // three-across grid actually has to lay out, and they are the states a
      // port has to get right: a creator speaking on camera with the video's
      // own on-screen text beside it, two machine translations, a quote under
      // your OWN post, and one under a rival's.
      voices: VOICES,
      voicesFrom: 41,
      voicesSampled: false,
      unanswered: {
        rows: unansweredRows,
        questionVideos: 214,
        yourPosts: 9,
        lead: unansweredLead(unansweredRows, 9, periodPhrase('last_12', MONTH)),
        basis: UNANSWERED_BASIS,
        claims: UNANSWERED_CLAIMS_UNREADABLE,
        reddit: REDDIT_THREAD_CAP,
        refusal: null,
      },
      move: null,
      behind: { videos: 26, href: '/dashboard/videos?subject=s1' },
      gap,
      trail: trailLine(series.find((x) => x.audience === INDUSTRY_AUDIENCE) ?? null, 'The category'),
      axisNote: axisNote(sides, 100, series),
      notRecorded: null,
    },
    ownPosts: ownCensusWithClaims(ownPostsInput(), true),
    // The mock's own ledger: thirteen claims, three of them echoed.
    sayHear: claimCounts([
      ...Array.from({ length: 3 }, () => ({ audience: 'echoes' })),
      ...Array.from({ length: 2 }, () => ({ audience: 'contradicts' })),
      ...Array.from({ length: 8 }, () => ({ audience: 'silent' })),
    ]),
    // The first three rows of that ledger, in `ledgerRows` order.
    sayHearClaims: [
      { claim: 'Made from 100% recycled sails', state: 'pushed_back' },
      { claim: 'Built to last a decade', state: 'echoed' },
      { claim: 'Waterproof', state: 'silent' },
    ],
    record: {
      // THROUGH THE REAL COMPOSERS. The band was hand-written as "4 updates ·
      // 2,359 videos · TikTok, YouTube, Instagram, Reddit" — a shape
      // `howSoundLine` has never produced, three facts where the composer
      // carries five, silently dropping the not-in-English share and the
      // tracking-change count that this same page states verbatim 1,600px
      // lower. One record, one composer, one band.
      ...recordBandFixture(methodRecordFixture()),
    },
    method: methodFixture(),
    ...over,
  }
}

/** The state production is in today: M4 authored and not applied. */
export function refusedFixture(over: Partial<SubjectsData> = {}): SubjectsData {
  const base = subjectsFixture()
  return {
    ...base,
    method: methodRefusedFixture(),
    substrate: 'missing',
    list: {
      rows: [],
      proposed: [],
      rule: SUPERSEDE_RULE,
      notRecorded: 'Your subjects are not recorded for this workspace yet.',
      setLine: setLine(0, 0),
      canEdit: true,
    },
    selected: null,
    // THE CENSUS SURVIVES M4 AND THE CLAIMS DO NOT. `videos` is tenant-readable
    // whatever the month tables say, so a workspace with no subject reading
    // still knows what it published — and `video_claims` has no tenant policy
    // until M8, so the claims half is NAMED rather than drawn as zero. This is
    // the state production is in today and the state wave 2 is reviewed in.
    //
    // AND THE SUBJECT HALF GOES WITH THE SET. The membership rows are read
    // THROUGH the subject rows, so a set that cannot be read matches nothing —
    // see `refusedOwnPostsInput`. Naming two subjects here contradicted the
    // rail one tile up, on the one arm a real tenant sees.
    ownPosts: ownCensusWithClaims(refusedOwnPostsInput(), false),
    sayHear: null,
    sayHearClaims: [],
    ...over,
  }
}

/** A tenant that has been proposed a set and confirmed none of it. */
export function candidatesFixture(over: Partial<SubjectsData> = {}): SubjectsData {
  const base = subjectsFixture()
  return {
    ...base,
    list: {
      // A proposed subject IS in the list — that is where its Confirm control
      // lives — and it carries no level, because nothing has counted it.
      rows: [
        { id: 'p1', name: 'Durability', description: null, origin: 'category_theme' as const, namedAt: '2026-08-19', status: 'proposed' as const, calibration: 'calibrating' as const, level: null, note: railNote('calibrating', false, 'proposed'), verdict: null, selected: false, href: '' },
        { id: 'p2', name: 'Recycled materials', description: null, origin: 'own_claims' as const, namedAt: '2026-08-19', status: 'proposed' as const, calibration: 'calibrating' as const, level: null, note: railNote('calibrating', false, 'proposed'), verdict: null, selected: false, href: '' },
      ],
      proposed: [
        { id: 'p1', name: 'Durability', because: 'the category raised it in the videos we read' },
        { id: 'p2', name: 'Recycled materials', because: 'you said this in your own posts' },
      ],
      rule: SUPERSEDE_RULE,
      notRecorded: null,
      setLine: setLine(0, 2),
      canEdit: true,
    },
    selected: null,
    ...over,
  }
}

/** The kind mix as `buildSides` produced it, for a test that wants the shares
 *  without rebuilding the fixture. */
export function fixtureKindShares() {
  const { kindRows, per } = sidesAndSeries()
  const rowsHere = kindRows.filter((r) => r.audience === INDUSTRY_AUDIENCE)
  const shares = kindShares(
    rowsHere.map((r) => ({ kind: r.kind, videos: r.videos, comments: r.comments, ...(r.platform_mix ? { platform_mix: r.platform_mix } : {}) })),
    per.get(`${MONTH}|${INDUSTRY_AUDIENCE}`) ?? 0,
  )
  return { shares, reddit: redditRead(shares) }
}

/**
 * The same pane, with the lead rival RETIRED — the fourth state of the gapline
 * (D1), and the one `refusedFixture()` cannot carry because its pane is null.
 *
 * A retired rival is a tracking change: the set we track moved inside the
 * window, so a difference across it is partly a difference in our own
 * bookkeeping. The two levels and both denominators still print — `retireRival`
 * never deletes, precisely so the frozen months still render — and only the
 * difference is withheld, as "comparison refused".
 */
export function retiredRivalFixture(): SubjectsData {
  const base = subjectsFixture()
  const { sides, series } = sidesAndSeries(RIVAL_STOPPED)
  return {
    ...base,
    selected: base.selected
      ? {
          ...base.selected,
          sides,
          series,
          gap: paneGapFor(sides, 'tracking_change'),
          axisNote: axisNote(sides, 100, series),
        }
      : null,
  }
}

/**
 * The rail and pane under the three calibration states (decision C, WP1.1),
 * on staging's real figures: Sealand, September as the 24 Sep update wrote it
 * (read_at 12:15 UTC; next update Sun 27 Sep), the pooled market of 654 videos
 * (625 in the category, and 12 Cotopaxi, 6 Freitag, 5 Patagonia and 6 The
 * North Face filed under a tracked brand), and each subject's September rows
 * summed over those audiences. The calibrations are staging's, written 24 Sep:
 * five ready (Looks & style 0.857, Comfort 0.917, Durability, Price and
 * Waterproofing 1.0, all on 33 labels), Repair & warranty failed (0.333 on
 * 33). The six were named 23 Sep.
 *
 * COMMUNITY & PURPOSE WAS NEVER READ (WP1.1 review, finding 1). It was named
 * 24 Sep and created at 12:41, after the update wrote September at 12:15, and
 * it has no row in `month_subject_readings` in any month. It is provisional
 * (never checked), and its row prints no figure: "no reading yet"
 * (`unreadWords`, default M-a), never its calibration word. Its pane is the
 * base fixture's layout (the mock's invented volumes, F12) read as that
 * subject: no "you" side (provisional),
 * and every other side "no reading yet", never 0.
 */
export function calibrationFixture(over: Partial<SubjectsData> = {}): SubjectsData {
  const base = subjectsFixture()
  const N = 654
  const unreadNote = unreadWords({ month: '2026-09-01', filling: true, nextUpdate: '2026-09-27T04:00:00.000Z' })
  const row = (id: string, name: string, calibration: 'ready' | 'provisional' | 'failed', k: number | null, selected = false) => ({
    id,
    name,
    description: null,
    origin: 'category_theme' as const,
    namedAt: k == null ? '2026-09-24' : '2026-09-23',
    status: 'active' as const,
    calibration,
    level: null,
    market: calibration === 'failed' || k == null ? null : { k, n: N, pct: Math.round((k / N) * 1000) / 10 },
    note: railNote(calibration, k != null, 'active', k == null ? unreadNote : null),
    verdict: null,
    selected,
    href: calibration === 'failed' ? '' : `/dashboard/subjects?item=${id}`,
  })
  const rows = [
    row('s-looks', 'Looks & style', 'ready', 103),
    row('s-comfort', 'Comfort', 'ready', 43),
    row('s-durability', 'Durability', 'ready', 39),
    row('s-repair', 'Repair & warranty', 'failed', 36),
    row('s-water', 'Waterproofing', 'ready', 29),
    row('s-price', 'Price', 'ready', 25),
    row('s-community', 'Community & purpose', 'provisional', null, true),
  ]
  // Not read: every point of every line loses its k (null, never 0).
  const unreadLine = <L extends { points: { k: number | null; kComments: number | null; pct: number | null }[] }>(line: L): L =>
    ({ ...line, points: line.points.map((p) => ({ ...p, k: null, kComments: null, pct: null })) })
  return {
    ...base,
    list: { ...base.list, rows, setLine: setLine(rows.length, 0) },
    selected: base.selected
      ? {
          ...base.selected,
          id: 's-community',
          name: 'Community & purpose',
          namedAt: '2026-09-24',
          calibration: 'provisional',
          unread: unreadNote,
          index: 7,
          of: 7,
          sides: calibratedSides(base.selected.sides, 'provisional').map((side) => ({
            ...side, k: null, pct: null, observed: false, silence: 'no_reading' as const, previous: null,
          })),
          // The loader builds the lines from the sides, so no line of your own.
          series: base.selected.series.filter((x) => x.audience !== CLIENT_AUDIENCE).map(unreadLine),
          ...(base.selected.chartSeries ? { chartSeries: base.selected.chartSeries.filter((x) => x.audience !== CLIENT_AUDIENCE).map(unreadLine) } : {}),
          gap: null,
          behind: null,
        }
      : null,
    ...over,
  }
}

/**
 * The pane of a READ subject under default M-b: Waterproofing selected on the
 * rail WP1.1 builds (`calibrationFixture`, staging's Sealand September: 29 of
 * the market's 654 videos), its headline figure the rail row's own. Its sides
 * and gap are the base fixture's layout (the mock's invented volumes, F12),
 * the Phase 1 brand comparison that stays below the headline unchanged.
 */
export function marketPaneFixture(over: Partial<SubjectsData> = {}): SubjectsData {
  const data = calibrationFixture()
  const base = subjectsFixture()
  const rows = data.list.rows.map((r) => ({ ...r, selected: r.id === 's-water' }))
  const water = rows.find((r) => r.id === 's-water')!
  return {
    ...data,
    list: { ...data.list, rows },
    selected: {
      ...base.selected!,
      id: 's-water',
      name: 'Waterproofing',
      namedAt: '2026-09-23',
      calibration: 'ready',
      unread: null,
      market: water.market ?? null,
      index: 5,
      of: 7,
    },
    ...over,
  }
}

// ---- WP2.2 · Subjects on the market -----------------------------------------

/** One month of a subject's pooled market line, as `marketLineOf` builds it. */
function marketPoint(month: string, k: number | null, n: number, frozen = false): MonthSeries['points'][number] {
  return {
    month,
    state: (frozen ? 'frozen' : 'filling') as 'frozen' | 'filling',
    videos: n,
    comments: null,
    k,
    kComments: null,
    pct: k == null ? null : Math.round((k / n) * 1000) / 10,
    audience: MARKET_LINE,
    status: (frozen ? 'frozen' : 'filling') as 'frozen' | 'filling',
    origin: 'live' as const,
    readAt: null,
    runId: null,
    frozenAt: null,
    clusteringKey: null,
    labels: [],
  }
}

/** A subject's pooled market line over `points`. */
export function marketLineFixture(id: string, name: string, points: MonthSeries['points'], refused: Record<string, string> = {}): MonthSeries {
  return {
    audience: MARKET_LINE,
    names: [MARKET_LINE],
    objectId: id,
    objectLabel: name,
    points,
    notes: [],
    firstReadable: points.find((p) => p.k != null)?.month ?? null,
    substrate: 'seeded' as const,
    refusedSteps: refused,
  }
}

/** Staging's four September voices on Looks & style (Sealand, read with the
 *  20 Sep update): three comments on one Reddit thread in the category, one on
 *  a Freitag Instagram post. The refs are the evidence rows' own ids. */
const MARKET_VOICES: SubjectVoice[] = [
  { quote: { ref: 'e:521a5978-a0f9-41d0-977b-279a0b16f349', text: 'Ugh this look is AMAZING. I LOVE what you did with the skirt!' }, cite: '8 Sep · under a category video', href: null, from: 'under a category video', platform: 'reddit', source: 'comment', onScreen: null, likes: 6, maker: false },
  { quote: { ref: 'e:1ad5d602-ae03-429d-b2bb-8744ecd16de9', text: 'that’s so cool and cute😍' }, cite: '17 Sep · under a Freitag video', href: null, from: 'under a Freitag video', platform: 'instagram', source: 'comment', onScreen: null, likes: null, maker: false },
  { quote: { ref: 'e:c09627e3-7ea5-409d-ae2e-5a2cda5561f2', text: 'IMO, that makes the skirt' }, cite: '9 Sep · under a category video', href: null, from: 'under a category video', platform: 'reddit', source: 'comment', onScreen: null, likes: 1, maker: false },
  { quote: { ref: 'e:5ae1397a-a151-42fd-a96d-33b9dc552567', text: 'wow another amazing look with cool suspendery garter belty hardware!! i love it.' }, cite: '8 Sep · under a category video', href: null, from: 'under a category video', platform: 'reddit', source: 'comment', onScreen: null, likes: 7, maker: false },
]

/**
 * THE PAGE WP2.2 BUILDS, on staging's real figures (Sealand, September 2026,
 * read with the 20 Sep update; the reading month at a 2 Oct clock): the market
 * of 654 videos (377 in August), each subject's pooled k (Looks & style 103,
 * Comfort 43, Durability 39, Repair & warranty 36, Waterproofing 29, Price 25;
 * August 38, 28, 17, 15, 15, 5), the maker read (MF2 `lens_readings` over the
 * month's 220 maker videos: 35, 1, 9, 8, 2, 3), Repair & warranty failed
 * (0.333 on 33) and Community & purpose not read. Looks & style selected: its
 * kinds (praise 93, 4, 4, 4, question 2, none hitting a problem), 2 question
 * videos this month, and its four September voices (none under a maker's
 * video on staging).
 */
export function marketSubjectsFixture(over: Partial<SubjectsData> = {}): SubjectsData {
  const base = calibrationFixture()
  const AUG = 377
  const SEP = 654
  const prev: Record<string, number> = { 's-looks': 38, 's-comfort': 28, 's-durability': 17, 's-water': 15, 's-price': 5 }
  const makers: Record<string, number> = { 's-looks': 35, 's-comfort': 1, 's-durability': 9, 's-water': 2, 's-price': 3 }
  const rows = [...base.list.rows]
    .map((r) => ({
      ...r,
      marketPrev: r.market && prev[r.id] != null ? { k: prev[r.id], n: AUG } : null,
      makerShare: r.market && makers[r.id] != null ? makers[r.id] / r.market.k : null,
      selected: r.id === 's-looks',
    }))
    .sort(byRailRank)
  const line = marketLineFixture('s-looks', 'Looks & style', [marketPoint('2026-08-01', 38, AUG), marketPoint('2026-09-01', 103, SEP)], { '2026-09-01': 'Not read as a change: we changed our searches in September.' })
  return {
    ...base,
    readingAt: '2026-10-02T06:00:00.000Z',
    horizon: 'this_month',
    axis: ['2026-09-01'],
    chartAxis: ['2026-08-01', '2026-09-01'],
    list: { ...base.list, rows, base: { month: '2026-09-01', n: SEP, prev: { month: '2026-08-01', n: AUG } } },
    selected: {
      ...base.selected!,
      id: 's-looks',
      name: 'Looks & style',
      namedAt: '2026-09-23',
      calibration: 'ready',
      unread: null,
      market: { k: 103, n: SEP, pct: 15.7 },
      marketLine: line,
      chip: 'not read as a change: we changed our searches in September',
      makers: { k: 35, of: 103 },
      kindsIn: {
        of: 103,
        rows: [
          { kind: 'praise', label: 'Praising it', k: 93 },
          { kind: 'purchase_intent', label: 'Ready to buy', k: 4 },
          { kind: 'feature_request', label: 'Asking for something', k: 4 },
          { kind: 'objection', label: 'Pushing back', k: 4 },
          { kind: 'question', label: 'Asking how it works', k: 2 },
          { kind: 'pain_point', label: 'Hitting a problem', k: 0 },
        ],
      },
      nextPair: { prevMonth: '2026-10-01', month: '2026-11-01', sameAgeFrom: '2026-12-06T04:00:00.000Z', inFullExpected: '2027-01-03T04:00:00.000Z' },
      monthStates: {
        '2026-08-01': 'ended · still filling until the 4 Oct update',
        '2026-09-01': 'ended · still filling until the 1 Nov update',
        '2026-10-01': 'so far from 16 Oct · ended from 1 Nov',
        '2026-11-01': 'settles with the 3 Jan update',
      },
      voices: MARKET_VOICES,
      voicesFrom: 4,
      voicesSampled: false,
      unanswered: { ...base.selected!.unanswered, rows: [], questionVideos: 2, yourPosts: 20, lead: null, refusal: '2 videos asked something about this subject; we do not rank a gap under 10.' },
      index: 1,
      of: 7,
    },
    ...over,
  }
}

/** Waterproofing selected over the last 3 months (staging, GR F24): 16
 *  question videos, its three question groups, and none of Sealand's 56 posts
 *  in the window sharing two or more of their words. Its kinds are staging's
 *  September (pain 11, question 10, praise 8, requests 7, ready to buy 5,
 *  pushback 2, leaving 1, of 29) and its makers 2 of 29. */
export function waterproofingFixture(): SubjectsData {
  const data = marketSubjectsFixture()
  const rows = data.list.rows.map((r) => ({ ...r, selected: r.id === 's-water' }))
  const unansweredRows = [
    { id: 'r-demand', label: 'Demand for real waterproofing', videos: 3, reddit: 1, answered: false },
    { id: 'r-zips', label: 'Worries about zippers in rain', videos: 2, reddit: 0, answered: false },
    { id: 'r-canvas', label: 'Coated canvas cracking concerns', videos: 1, reddit: 0, answered: false },
  ]
  return {
    ...data,
    horizon: 'last_3',
    list: { ...data.list, rows },
    selected: {
      ...data.selected!,
      id: 's-water',
      name: 'Waterproofing',
      market: { k: 29, n: 654, pct: 4.4 },
      marketLine: marketLineFixture('s-water', 'Waterproofing', [marketPoint('2026-08-01', 15, 377), marketPoint('2026-09-01', 29, 654)], { '2026-09-01': 'Not read as a change: we changed our searches in September.' }),
      makers: { k: 2, of: 29 },
      kindsIn: {
        of: 29,
        rows: [
          { kind: 'pain_point', label: 'Hitting a problem', k: 11 },
          { kind: 'question', label: 'Asking how it works', k: 10 },
          { kind: 'praise', label: 'Praising it', k: 8 },
          { kind: 'feature_request', label: 'Asking for something', k: 7 },
          { kind: 'purchase_intent', label: 'Ready to buy', k: 5 },
          { kind: 'objection', label: 'Pushing back', k: 2 },
          { kind: 'switching_signal', label: 'Leaving for something else', k: 1 },
        ],
      },
      unanswered: { ...data.selected!.unanswered, rows: unansweredRows, questionVideos: 16, yourPosts: 56, lead: unansweredLead(unansweredRows, 56, 'in the last 3 months'), refusal: null },
    },
  }
}

/** Össur on the market page: no subject named (plan §2.13). */
export function ossurMarketFixture(): SubjectsData {
  const data = marketSubjectsFixture()
  return {
    ...data,
    brand: 'Össur',
    list: { ...data.list, rows: [], proposed: [], setLine: setLine(0, 0), base: { month: '2026-09-01', n: null, prev: null } },
    selected: null,
  }
}
