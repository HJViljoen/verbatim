import { horizonWindow } from '@/lib/reading/horizon'
import {
  PRECEDENCE_RULE, ATTENTION_UNLOCK, CORPUS_DENOMINATOR_LINE, QUESTIONS_GROUPING_NOTE,
  QUESTIONS_SUBJECTS_NOTE, STANDINGS_UNREAD, buildStandingsBlock, competitiveSurfaceHref,
  buildSaidAbout, competitiveUnlockRows, questionsEmpty,
  type CompetitiveSurfaceData,
} from '@/lib/pages/competitive-surface'
import { methodRecordFixture, recordBandFixture } from '@/lib/test/method-fixture'
import { methodLines } from '@/lib/reading/method'
import { claimEcho, rivalOwnClaims, type OwnPostInput } from '@/lib/reading/own-posts'
import { buildHeadToHead, buildPlaybook, type PlaybookVideo } from '@/lib/pages/playbook'
import { LEAD_MIN_RATED } from '@/lib/pages/content-brief'

// Competitive's block fixtures (Phase 1 WP14).
//
// THE NUMBERS ARE ÖSSUR'S OWN, read read-only from `month_denominators` on
// 2026-09-18: August 20 / 73 / 628 videos and September 19 / 42 / 388, with
// 6 of September's own-brand videos also naming Ottobock. A fixture built from
// invented numbers cannot catch a block that divides by the wrong denominator.
//
// THREE STATES: the surface reading, a rival that is tracked and has never been
// read (Rareform's exact state), and a workspace whose months have not been
// read at all.

const NOW = '2026-09-18T09:00:00.000Z'
const MONTH = '2026-09-01'

/**
 * THE FOOTNOTE IS THIS PAGE'S TENANT, AND ITS OWN CORPUS.
 *
 * `methodFixture()` is shaped like Sealand's and is the right shared default
 * for the pages that use it; on THIS page every populated state's foot read
 * "Prepared for Sealand with Verbatim · 2,359 videos read in this window" under
 * a bar, a standings table, a head-to-head and a playbook that all say Össur
 * and 449. The fixtures are wave 2's review surface, so a footnote that
 * contradicts the page above it is a defect in the thing being reviewed.
 *
 * The coverage rows below sum to the SAME 449 the standings' September
 * denominator does (19 client · 42 Ottobock · 388 the rest), because
 * `methodLines` derives its "read in this window" from exactly that sum. The
 * composer is the real one, so the fixture can still never print a sentence
 * `methodLines` would not.
 */
const OSSUR_COVERAGE = [
  { audience: 'client', videos: 19, comments: 151, platformMix: { tiktok: 9, youtube: 6, instagram: 4 }, dualMention: 6, excludedUndated: 0 },
  { audience: 'competitor:Ottobock', videos: 42, comments: 645, platformMix: { tiktok: 21, youtube: 13, instagram: 8 }, dualMention: 0, excludedUndated: 1 },
  { audience: 'industry-other', videos: 388, comments: 10_534, platformMix: { tiktok: 195, youtube: 116, instagram: 77 }, dualMention: 0, excludedUndated: 12 },
]

/**
 * ONE RECORD BEHIND BOTH THE BAND AND THE FOOTNOTE.
 *
 * `ossurMethod()` overrode `coverage` only, so `language` stayed at the shared
 * Sealand default (474 of 1,755 — 27%) while the page bar's `record.line` was
 * hand-written and said 34%. Two answers to one question, 2,500px apart on one
 * page; in production both halves derive from one `lang` record and cannot
 * disagree, and `recordBandFixture`'s own docstring is about exactly this class
 * of defect one layer up. The band is composed by `howSoundLine` from the same
 * `RecordInputs` the footnote is composed from, so a fixture can no longer
 * print a sentence the composer would not.
 *
 * The language record is Össur's own shape rather than Sealand's: the corpus
 * this page reads is 2,359 analysed videos all-time, of which 1,755 have a
 * known spoken language. Kept at the shared numbers because nothing here has
 * measured Össur's, and a fixture that invents a figure is worse than one that
 * reuses a shaped default — what it may not do is state two of them.
 */
const ossurRecord = () => methodRecordFixture({ coverage: OSSUR_COVERAGE })

const ossurMethod = () => methodLines(ossurRecord(), { brand: 'Össur' })

/** The degraded footnote, same tenant: no month-by-month coverage on record. */
const ossurMethodRefused = () =>
  methodLines(
    methodRecordFixture({
      coverage: null,
      language: { analysed: 2_359, unknown: 2_359, english: 0, notEnglish: 0, basis: 'video_speech' },
    }),
    { brand: 'Össur' },
  )

const den = (month: string, audience: string, videos: number, comments: number, dual = 0) => ({
  month,
  audience,
  videos,
  comments,
  platform_mix: { tiktok: Math.round(videos * 0.5), youtube: Math.round(videos * 0.3), instagram: Math.round(videos * 0.2) },
  dual_mention: dual,
  status: 'filling' as const,
  run_id: 'run-a',
})

const OSSUR = [
  den('2026-07-01', 'client', 8, 36, 4),
  den('2026-07-01', 'competitor:Ottobock', 10, 59),
  den('2026-07-01', 'industry-other', 118, 1400),
  den('2026-08-01', 'client', 20, 237, 3),
  den('2026-08-01', 'competitor:Ottobock', 73, 1264),
  den('2026-08-01', 'industry-other', 628, 23542),
  den(MONTH, 'client', 19, 151, 6),
  den(MONTH, 'competitor:Ottobock', 42, 645),
  den(MONTH, 'industry-other', 388, 10534),
]

/**
 * CO4 · what the tracked rivals published in September, as three of the states
 * the block has to draw at once.
 *
 * Ottobock is Össur's one configured rival and has handles on three platforms
 * (read read-only from `tracking_configs` 2026-09-18), so it is a real census:
 * posts, a comment floor, hooks on some of them and not others. The other two
 * are the states a reviewer has to see beside it — a rival whose accounts are
 * configured and who published nothing this month, and a rival nobody has
 * configured an account for at all, which is NOT the same absence.
 *
 * Every census carries `claimsNote`, because a rival's claims are never a
 * tenant's to read: an empty claims list on its own reads as "they claimed
 * nothing", which is a statement about them rather than about our permissions.
 */
function ownClaimsFixture() {
  const post = (id: string, day: number, comments: number, hook: string | null, format: string | null) => ({
    id, upload_date: `2026-09-${String(day).padStart(2, '0')}`, comments_count: comments,
    hook_style: hook, classified_type: format, platform: 'youtube',
  })
  const inputs: OwnPostInput[] = [
    {
      month: MONTH, audience: 'competitor:Ottobock', audienceLabel: 'Ottobock',
      videos: [
        post('o1', 3, 61, 'demonstration', 'educational'),
        post('o2', 8, 22, 'personal-story', 'testimonial'),
        post('o3', 15, 9, 'demonstration', 'educational'),
        post('o4', 19, 4, null, null),
        post('o5', 26, 1, null, null),
        // August, and therefore not in this census — the basis line's reason.
        { ...post('o0', 29, 88, 'demonstration', 'educational'), upload_date: '2026-08-29' },
      ],
      claims: [], membership: [], echoes: [],
      handles: { youtube: '@ottobock', tiktok: '@ottobock', instagram: '@ottobock' },
    },
    {
      month: MONTH, audience: 'competitor:Rareform', audienceLabel: 'Rareform',
      videos: [], claims: [], membership: [], echoes: [],
      handles: { tiktok: '@rareform' },
    },
    {
      month: MONTH, audience: 'competitor:Patagonia', audienceLabel: 'Patagonia',
      videos: [], claims: [], membership: [], echoes: [],
      handles: {},
    },
  ]
  return rivalOwnClaims(inputs)
}


// ---- CO3 and CO7's videos (Phase 1 Block D, D6) --------------------------------
//
// ÖSSUR'S OWN SEPTEMBER AND AUGUST, read read-only on 2026-09-18 and rebuilt
// here as the rows the loader would have read.
//
// WHAT IS REPRODUCED EXACTLY: September published 757 / 109 / 145 by audience,
// classified 687 / 84 / 124, hooks 647 / 81 / 118, each format's own count and
// its own measured median, the judged and positive counts, and Össur's own
// accounts yielding 29 posts in August and 8 in September.
//
// OTTOBOCK'S OWN POSTS ARE CO4'S FIVE, AND THEY HAVE TO BE. `ownClaimsFixture`
// gives Ottobock a real September census — five posts, three of them over the
// comment floor — and this array gave the same rival `owned: 0` in both months,
// so `buildHeadToHead` read `ownPosts: null` and CO3 printed "one side's
// accounts are not configured" two tiles from CO4's "5 posts · 3 of 5 drew at
// least 5 comments". Nothing in the code binds the two reads; in production
// both come off `videos.source` and cannot disagree, so the fixture may not
// either. Five in September and the one August post CO4's census excludes by
// date, which is what makes CO3's "then" column real.
//
// WHAT IS NEAR AND NOT EXACT, AND WHY — stated because a fixture comment that
// claims a figure it does not build is worse than no comment. Production's
// rated counts (non-Reddit, rate > 0) are 483 / 77 / 86 with medians
// 3.0 / 2.1 / 2.6; this expansion builds 438 / 63 / 72 with medians
// 3.1 / 1.8 / 2.6. The gap is 45 / 14 / 14 videos that carry a rate and NO
// `classified_type`, which the per-format expansion below has nowhere to put:
// it hands a rate only to a classified video. The medians drift with it,
// because every rated video of a format here carries that format's median
// rather than its own spread.
//
// THREE OF THOSE FACTS ARE WHY THE FIXTURE IS REAL RATHER THAN INVENTED:
//   · the classified n is well under the published one on every side (84 of
//     109 on the client's own), which is the gap mock-gap D6 says the artboard
//     hides by printing "read from all 1,388 category videos";
//   · the own-post counts are the CENSUS's, not a second answer to it — CO3's
//     row and CO4's tile are read off one fact in production and off one
//     `owned` count here, so the page cannot print two of them;
//   · September's judged counts are 5 and 19, far under any band's floor, so
//     the positive-share row refuses a comparison on live data. An invented
//     fixture would have handed it 71 and 126 and never exercised the refusal.

interface AudienceSpec {
  audience: string
  published: number
  /** [classified_type, videos, median engagement, videos carrying a rate] */
  formats: [string, number, number | null, number][]
  /** [hook_style, videos] */
  hooks: [string, number][]
  judged: number
  positive: number
  owned: number
  source: 'owned' | 'competitor_owned'
}

const SEPTEMBER: AudienceSpec[] = [
  {
    audience: 'industry-other',
    published: 757,
    formats: [
      ['story', 280, 3.4, 206], ['educational', 113, 2.9, 66], ['promotional', 105, 1.3, 30],
      ['testimonial', 73, 2.9, 60], ['entertainment', 54, 3.1, 39], ['tutorial', 20, 2.1, 16],
      ['behind-the-scenes', 19, 1.7, 9], ['how-to', 11, 1.3, 6], ['review', 6, 3.7, 4],
      ['comparison', 3, 0.5, 1], ['challenge', 3, 2.6, 1],
    ],
    hooks: [
      ['personal-story', 309], ['bold-claim', 169], ['question', 66], ['demonstration', 38],
      ['listicle', 18], ['before-after', 16], ['controversy', 12], ['statistic', 10],
      ['shock-value', 8], ['trend-riding', 1],
    ],
    judged: 252, positive: 171, owned: 0, source: 'owned',
  },
  {
    audience: 'client',
    published: 109,
    formats: [
      ['story', 28, 2.4, 21], ['testimonial', 21, 1.6, 14], ['promotional', 18, 1.1, 12],
      ['tutorial', 6, 1.8, 6], ['educational', 3, 1.3, 2], ['entertainment', 3, 7.6, 3],
      ['behind-the-scenes', 2, 10.3, 2], ['how-to', 1, 15.2, 1], ['comparison', 1, 2.3, 1],
      ['review', 1, 2.1, 1],
    ],
    hooks: [
      ['personal-story', 45], ['bold-claim', 21], ['before-after', 5], ['question', 5],
      ['demonstration', 2], ['shock-value', 2], ['trend-riding', 1],
    ],
    judged: 5, positive: 5, owned: 8, source: 'owned',
  },
  {
    audience: 'competitor:Ottobock',
    published: 145,
    formats: [
      ['promotional', 30, 2.8, 13], ['story', 27, 3.4, 15], ['testimonial', 26, 2.1, 18],
      ['educational', 15, 1.9, 10], ['tutorial', 7, 3.2, 4], ['behind-the-scenes', 7, 0.9, 3],
      ['review', 5, 1.5, 4], ['how-to', 4, 2.6, 3], ['entertainment', 3, 14.5, 2],
    ],
    hooks: [
      ['personal-story', 48], ['bold-claim', 34], ['demonstration', 13], ['question', 13],
      ['listicle', 7], ['statistic', 2], ['shock-value', 1],
    ],
    // FIVE, MATCHING CO4's SEPTEMBER CENSUS (`ownClaimsFixture`). See the
    // header: one fact, read twice on one screen, may not have two answers.
    judged: 19, positive: 17, owned: 5, source: 'competitor_owned',
  },
]

/** August, as the aggregates alone — the previous month is only ever read for
 *  the head-to-head's "then", which wants totals and not a format table. */
const AUGUST: AudienceSpec[] = [
  { audience: 'industry-other', published: 1681, formats: [['story', 1387, 2.7, 1387]], hooks: [], judged: 538, positive: 439, owned: 0, source: 'owned' },
  { audience: 'client', published: 112, formats: [['story', 73, 2.7, 73]], hooks: [], judged: 11, positive: 9, owned: 29, source: 'owned' },
  // ONE, which is the August post `ownClaimsFixture` carries and excludes from
  // September's census by date — so CO3's "then" column has the same origin.
  { audience: 'competitor:Ottobock', published: 247, formats: [['story', 222, 2.8, 222]], hooks: [], judged: 48, positive: 42, owned: 1, source: 'competitor_owned' },
]

/** One audience's month, expanded into the rows the loader reads. Each format's
 *  rated videos carry that format's own measured median, so the group medians
 *  come back exactly and the audience median is a real median of a real set. */
function expand(spec: AudienceSpec, month: string): PlaybookVideo[] {
  const day = (i: number) => `${month.slice(0, 8)}${String((i % 27) + 1).padStart(2, '0')}`
  const out: PlaybookVideo[] = []
  for (let i = 0; i < spec.published; i++) {
    out.push({
      id: `${spec.audience}-${month}-${i}`,
      upload_date: day(i),
      platform: i % 4 === 3 ? 'youtube' : 'tiktok',
      classified_type: null,
      hook_style: null,
      engagement_rate: null,
      is_client: spec.audience === 'client',
      is_competitor: spec.audience.startsWith('competitor:'),
      competitor_name: spec.audience.startsWith('competitor:') ? spec.audience.slice('competitor:'.length) : null,
      source: i < spec.owned ? spec.source : 'discovered',
      sentiment: i < spec.positive ? 'positive' : i < spec.judged ? 'neutral' : null,
      sentiment_source: i < spec.judged ? 'audience' : null,
      analyzed_lane: 'full',
    })
  }
  let at = 0
  for (const [key, k, med, rated] of spec.formats) {
    for (let i = 0; i < k && at < out.length; i++, at++) {
      out[at].classified_type = key
      if (i < rated && med !== null) out[at].engagement_rate = med
    }
  }
  let hookAt = 0
  for (const [key, k] of spec.hooks) {
    for (let i = 0; i < k && hookAt < out.length; i++, hookAt++) out[hookAt].hook_style = key
  }
  return out
}

export const PLAYBOOK_VIDEOS: PlaybookVideo[] = [
  ...SEPTEMBER.flatMap((s) => expand(s, MONTH)),
  ...AUGUST.flatMap((s) => expand(s, '2026-08-01')),
]

export function competitiveFixture(over: Partial<CompetitiveSurfaceData> = {}): CompetitiveSurfaceData {
  const window = horizonWindow('last_3', NOW, '2026-06-01')
  const standings = buildStandingsBlock({
    brand: 'Össur',
    rivals: [{ name: 'Ottobock', retiredAt: null }],
    denominators: OSSUR,
    axis: window.months,
    readAxis: window.months,
    month: MONTH,
    changes: [{ changed_at: '2026-09-02T00:00:00.000Z', surface: 'terms', source: 'logged', affects_months: null }],
  })

  return {
    brand: 'Össur',
    month: MONTH,
    monthStatus: 'filling',
    readingAt: NOW,
    horizon: 'last_3',
    window,
    rivals: {
      options: [
        {
          audience: 'competitor:Ottobock',
          name: 'Ottobock',
          state: 'observed',
          analysed: 319,
          retiredAt: null,
          href: competitiveSurfaceHref('Ottobock', {}),
          selected: true,
        },
      ],
      selected: {
        audience: 'competitor:Ottobock',
        name: 'Ottobock',
        state: 'observed',
        analysed: 319,
        retiredAt: null,
        href: competitiveSurfaceHref('Ottobock', {}),
        selected: true,
      },
      identityRecorded: false,
      empty: null,
    },
    standings,
    // FLOORED AS THE LOADER FLOORS IT (CO6). A fixture that promotes an
    // unfloored conclusion reviews a page the loader does not build.
    playbook: buildPlaybook({ month: MONTH, brand: 'Össur', rival: 'Ottobock', videos: PLAYBOOK_VIDEOS, conclusionMinRated: LEAD_MIN_RATED }),
    headToHead: buildHeadToHead({
      month: MONTH,
      brand: 'Össur',
      rival: 'Ottobock',
      videos: PLAYBOOK_VIDEOS,
      denominators: OSSUR,
    }),
    questions: {
      rival: 'Ottobock',
      videos: 33,
      insights: 37,
      quotes: 71,
      platformMix: { tiktok: 18, youtube: 8, instagram: 4, reddit: 3 },
      rows: [
        {
          id: 'q1',
          text: 'Viewers ask about the specific prosthetic model shown (3r85 or 3r80) and where to buy it.',
          platform: 'tiktok',
          videoHref: 'https://www.tiktok.com/@x/video/1',
          quotes: [{ ref: 'e:1', text: 'Where can I get one of these fitted in Ireland?', lang: 'en', english: null }],
          // THE WINDOW'S CITATIONS BEHIND THIS ROW, not the two shown
          // (`QuestionRow.comments`, Block D wave 2). `quotes` is capped for
          // display; this is what the row is a reading of.
          comments: 41,
        },
        {
          id: 'q2',
          text: 'People want to know what the battery costs to replace and how often it needs doing.',
          platform: 'youtube',
          videoHref: null,
          quotes: [{ ref: 'e:2', text: 'Hoeveel kos die battery om te vervang?', lang: 'af', english: 'How much does the battery cost to replace?' }],
          comments: 27,
        },
      ],
      floor: 10,
      cleared: true,
      subreddits: ['amputee', 'prosthetics', 'bionics'],
      empty: null,
      groupingNote: QUESTIONS_GROUPING_NOTE,
      subjectsNote: QUESTIONS_SUBJECTS_NOTE,
    },
    ownClaims: ownClaimsFixture(),
    // CO5 · empty on every row today and the row says why, which is the point:
    // the block did not exist at all before, not even as an unlock.
    saidAbout: buildSaidAbout(
      [{ name: 'Ottobock' }, { name: 'Rareform' }, { name: 'Patagonia' }],
      (audience) => (audience === 'competitor:Ottobock' ? 42 : 0),
    ),
    // Read off the censuses above: accounts ARE configured for these rivals, so
    // CO4 no longer says nobody is watching them.
    unlocks: { rows: competitiveUnlockRows(ownClaimsFixture()) },
    // COMPOSED, NOT WRITTEN (CO8). See `ossurRecord` above: the band and the
    // method footnote are two readings of one record and may not state two
    // language shares.
    record: { ...recordBandFixture(ossurRecord()), href: '/dashboard/settings' },
    method: ossurMethod(),
    ...over,
  }
}

/** A rival the tenant configured and nothing of whose content has ever been
 *  read.
 *
 *  NOT RAREFORM'S STATE, and it used to claim to be. Rareform has ONE analysed
 *  video on Sealand, and `rivalState` returns 'quiet' the moment `analysed` is
 *  above zero — the live page reads "Rareform tracked · nothing of theirs was
 *  read this window · 1 of their videos read". The fixture paired 'configured'
 *  with `analysed: 1`, a combination the loader cannot produce, and the test on
 *  it asserted "nothing of theirs has been read yet" against a row that also
 *  renders "· 1 of their videos read". `quietRivalFixture` below is Rareform. */
export function unreadRivalFixture(): CompetitiveSurfaceData {
  const base = competitiveFixture()
  const option = {
    audience: 'competitor:Rareform',
    name: 'Rareform',
    state: 'configured' as const,
    analysed: 0,
    retiredAt: null,
    href: competitiveSurfaceHref('Rareform', {}),
    selected: true,
  }
  return {
    ...base,
    rivals: { ...base.rivals, options: [...base.rivals.options.map((o) => ({ ...o, selected: false })), option], selected: option },
    // THE RIVAL COLUMN IS PRESENT AND EMPTY, WITH ITS REASON. A side that was
    // never read is not a side that published nothing, and CO7's third column
    // has to say which — `formatReading` puts that sentence on `unread` and the
    // cells stay null so nothing prints a zero for it.
    playbook: buildPlaybook({ month: MONTH, brand: 'Össur', rival: 'Rareform', videos: PLAYBOOK_VIDEOS, conclusionMinRated: LEAD_MIN_RATED }),
    headToHead: buildHeadToHead({
      month: MONTH,
      brand: 'Össur',
      rival: 'Rareform',
      videos: PLAYBOOK_VIDEOS,
      denominators: OSSUR,
    }),
    questions: {
      ...base.questions,
      rival: 'Rareform',
      videos: 0,
      insights: 0,
      quotes: 0,
      platformMix: {},
      rows: [],
      cleared: false,
      empty: questionsEmpty({ rival: 'Rareform', videos: 0, floor: 10 }),
    },
  }
}

/** Rareform's actual state on Sealand: tracked, one analysed video, nothing
 *  read in this window and no question under any of it. */
export function quietRivalFixture(): CompetitiveSurfaceData {
  const base = unreadRivalFixture()
  const option = { ...base.rivals.selected!, state: 'quiet' as const, analysed: 1 }
  return {
    ...base,
    rivals: {
      ...base.rivals,
      options: base.rivals.options.map((o) => (o.name === 'Rareform' ? option : o)),
      selected: option,
    },
  }
}

/** The default horizon: one month on the axis, so a block titled "Standings
 *  over the months" has no line to draw and says so. */
export function oneMonthFixture(): CompetitiveSurfaceData {
  const base = competitiveFixture()
  const window = horizonWindow('this_month', NOW, '2026-06-01')
  return {
    ...base,
    horizon: 'this_month',
    window,
    standings: buildStandingsBlock({
      brand: 'Össur',
      rivals: [{ name: 'Ottobock', retiredAt: null }],
      denominators: OSSUR,
      axis: window.months,
      readAxis: ['2026-08-01', ...window.months],
      month: MONTH,
      changes: [],
    }),
  }
}

/** A workspace whose months have not been read at all: the standings refuse,
 *  and say so in their own words rather than drawing an empty table. */
export function unreadMonthsFixture(): CompetitiveSurfaceData {
  const base = competitiveFixture()
  return {
    ...base,
    method: ossurMethodRefused(),
    // FIVE OF SEVEN OVERVIEW BLOCKS STILL SAY "not recorded" UNTIL M1–M9 ARE
    // APPLIED, and wave 2 is reviewed in that state — so the degraded arm is
    // part of the handover, not an afterthought. Nothing read means nothing to
    // put side by side and no format to read, and both are null rather than
    // empty tables: an empty table claims a measurement.
    headToHead: null,
    playbook: null,
    standings: {
      ...base.standings,
      rows: [],
      series: [],
      denominators: [],
      rules: [],
      dualMention: null,
      caveat: null,
      denominatorLine: CORPUS_DENOMINATOR_LINE,
      precedence: PRECEDENCE_RULE,
      unlock: ATTENTION_UNLOCK,
      empty: STANDINGS_UNREAD,
    },
    // THE CENSUS DOES NOT DEPEND ON THE MONTH TABLES and does not vanish with
    // them: `videos` is readable whatever `month_denominators` says. What this
    // workspace has is no configured account anywhere, so every row is the
    // no-accounts absence and none of them is a zero.
    ownClaims: rivalOwnClaims([
      { month: MONTH, audience: 'competitor:Ottobock', audienceLabel: 'Ottobock', videos: [], claims: [], membership: [], echoes: [], handles: {} },
    ]),
    saidAbout: buildSaidAbout([{ name: 'Ottobock' }], () => 0),
  }
}

/**
 * The arm where a rival's own claims and what is said about them ARE readable.
 *
 * WHY IT EXISTS, AND WHY IT IS NOT A LIE. Four of the five states above carry
 * `RIVAL_CLAIMS_WITHHELD` and an empty `saidAbout`, because M8's policy is
 * `entity = 'client'` and a tenant session may not select a rival's claim rows
 * — which is the honest state of the app page today and is the one wave 2
 * reviews it in. But `CompetitiveSurfaceData.ownClaims` / `.saidAbout` are the
 * shape a SERVICE-ROLE surface hands the same blocks (a document, a share
 * render — `lib/pages/competitive-surface.ts:buildSaidAbout` takes a
 * `claimsFor` for exactly that), and with no populated arm anywhere the claim
 * row, the echo legend, the quote ref and the `pass_a_brand_claim` marker
 * would be four pieces of markup nothing on the repo ever renders.
 *
 * THE WORDS ARE THE SHAPE PASS A WRITES, digits included — "for over 30 years",
 * "3R80" — because that is the trade `pass_a_brand_claim`'s policy row is about
 * and a fixture that avoided digits would prove nothing about it.
 */
export function claimsReadFixture(): CompetitiveSurfaceData {
  const base = competitiveFixture()
  const audience = 'competitor:Ottobock'
  const post = (id: string, day: number, comments: number, hook: string | null, format: string | null) => ({
    id, upload_date: `2026-09-${String(day).padStart(2, '0')}`, comments_count: comments,
    hook_style: hook, classified_type: format, platform: 'youtube',
  })
  const input: OwnPostInput = {
    month: MONTH,
    audience,
    audienceLabel: 'Ottobock',
    videos: [
      post('o1', 3, 61, 'demonstration', 'educational'),
      post('o2', 8, 22, 'personal-story', 'testimonial'),
      post('o3', 15, 9, 'demonstration', 'educational'),
      post('o4', 19, 4, null, null),
      post('o5', 26, 1, null, null),
    ],
    claims: [
      { id: 'k1', source_video_id: 'o1', entity: 'competitor', claim: 'Every knee is tested for over 30 years of walking', quote: 'We test every knee for the equivalent of thirty years of walking.' },
      { id: 'k2', source_video_id: 'o2', entity: 'competitor', claim: 'The 3R80 is built for everyday life, not the clinic', quote: 'This is built for your day, not for a gait lab.' },
      { id: 'k3', source_video_id: 'o3', entity: 'competitor', claim: 'Fitting takes one appointment', quote: 'One appointment and you walk out on it.' },
    ],
    membership: [],
    // ONE PER RETURNED ROW, IN THE RETURNED ROWS' ORDER — the three states the
    // legend has to draw at once: carried, pushed back, and counted-and-silent.
    echoes: [
      claimEcho({ audience, audienceLabel: 'Ottobock', reading: { k: 31, n: 42 }, stance: 'echoes' }),
      claimEcho({ audience, audienceLabel: 'Ottobock', reading: { k: 9, n: 42 }, stance: 'contradicts' }),
      claimEcho({ audience, audienceLabel: 'Ottobock', reading: { k: 0, n: 42 }, stance: 'silent' }),
    ],
    handles: { youtube: '@ottobock', tiktok: '@ottobock', instagram: '@ottobock' },
  }
  const ownClaims = [
    ...rivalOwnClaims([input]),
    ...base.ownClaims.filter((c) => c.audience !== audience),
  ]
  return {
    ...base,
    ownClaims,
    // THE READINESS ROWS ARE RECOMPUTED OVER THIS ARM'S OWN CENSUSES. They were
    // inherited from the base fixture, so this state printed six of Ottobock's
    // claims in the second tile and "is not printed here" in the fifth.
    unlocks: { rows: competitiveUnlockRows(ownClaims) },
    saidAbout: buildSaidAbout(
      [{ name: 'Ottobock' }, { name: 'Rareform' }],
      (a) => (a === 'competitor:Ottobock' ? 42 : 0),
      (a) =>
        a === 'competitor:Ottobock'
          ? [
              { claim: 'The knee is quiet enough to wear in an office', quote: 'Honestly you cannot hear it in a meeting room.', videoId: 'v1', id: 'k9' },
              { claim: 'The knee is quiet enough to wear in an office', quote: 'Nobody in the office has ever noticed it.', videoId: 'v2', id: 'k10' },
              { claim: 'Service turnaround is slow outside Europe', quote: 'Mine took eleven weeks to come back from service.', videoId: 'v3', id: 'k11' },
            ]
          : [],
    ),
  }
}
