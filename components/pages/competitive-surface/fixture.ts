import { horizonWindow } from '@/lib/reading/horizon'
import {
  PRECEDENCE_RULE, ATTENTION_UNLOCK, CORPUS_DENOMINATOR_LINE, QUESTIONS_GROUPING_NOTE,
  QUESTIONS_SUBJECTS_NOTE, STANDINGS_UNREAD, buildStandingsBlock, competitiveSurfaceHref,
  competitiveUnlockRows, questionsEmpty,
  type CompetitiveSurfaceData,
} from '@/lib/pages/competitive-surface'
import { methodFixture, methodRefusedFixture } from '@/lib/test/method-fixture'

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
    unlocks: { rows: competitiveUnlockRows() },
    record: {
      line: 'your 4th monthly reading · 2 updates · 449 videos · 34% of what was said on camera was not in English',
      lines: ['2 updates delivered in this month.'],
      href: '/dashboard/settings',
    },
    method: methodFixture(),
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
    method: methodRefusedFixture(),
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
  }
}
