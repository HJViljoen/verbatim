import { horizonWindow } from '@/lib/reading/horizon'
import {
  PRECEDENCE_RULE, ATTENTION_UNLOCK, CORPUS_DENOMINATOR_LINE, QUESTIONS_GROUPING_NOTE,
  QUESTIONS_SUBJECTS_NOTE, STANDINGS_UNREAD, buildStandingsBlock, competitiveSurfaceHref,
  buildSaidAbout, competitiveUnlockRows, questionsEmpty,
  type CompetitiveSurfaceData,
} from '@/lib/pages/competitive-surface'
import { rivalOwnClaims, type OwnPostInput } from '@/lib/reading/own-posts'

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
        },
        {
          id: 'q2',
          text: 'People want to know what the battery costs to replace and how often it needs doing.',
          platform: 'youtube',
          videoHref: null,
          quotes: [{ ref: 'e:2', text: 'Hoeveel kos die battery om te vervang?', lang: 'af', english: 'How much does the battery cost to replace?' }],
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
    record: {
      line: 'your 4th monthly reading · 2 updates · 449 videos · 34% of what was said on camera was not in English',
      lines: ['2 updates delivered in this month.'],
      href: '/dashboard/settings',
    },
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
