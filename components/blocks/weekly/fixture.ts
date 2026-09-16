import type { WeeklyData } from '@/lib/pages/weekly'
import type { WeekFlag } from '@/lib/reports/weekly'
import { weekCheck, weekSentence } from '@/lib/reports/weekly'
import { overviewFixture, refusedFixture } from '@/components/pages/overview/fixture'

// The weekly report's fixtures (Phase 1 WP17).
//
// THREE STATES, ALL REAL. `weeklyFixture()` is a week that flagged, over a
// month that read — the shape the mock draws. `quietFixture()` is the ordinary
// week, which the coverage report says is nearly every week: nothing unusual,
// and that is the right answer rather than a failure. `formingFixture()` is
// SEALAND TODAY — under three months of baseline, subjects not recorded,
// nothing to quote — and it is the one the WP's "done when" asks for, because
// it is what a new workspace actually receives.
//
// The subjects, movers and record come from Overview's own fixtures, because
// WR2, WR5's rising line and WR6 are Overview's blocks at report width and a
// second fixture for them would be a second reading.

const MONTH = '2026-09-01'
const NOW = '2026-09-18T09:00:00.000Z'
const WINDOW = { from: '2026-09-06', to: '2026-09-13' }

export const weekFlag = (over: Partial<WeekFlag> = {}): WeekFlag => ({
  objectKind: 'kind',
  label: 'Objections',
  denominator: 'every audience together',
  weekK: 29,
  weekN: 205,
  baselineK: 38,
  baselineN: 1089,
  changePts: 10.7,
  bandPts: 5,
  sentences: ['People are asking the same question about the zip before they buy, and asking it under other brands’ videos.'],
  quotes: [{ ref: 'e:1', text: 'Zip gave out after eleven months.', lang: 'en', english: null }],
  href: '/dashboard/week',
  ...over,
})

function base(overview = overviewFixture()): WeeklyData {
  return {
    brand: overview.brand,
    month: MONTH,
    monthStatus: 'filling',
    readingAt: NOW,
    runId: 'run-1',
    window: WINDOW,
    section1: {
      month: MONTH,
      daysIn: 18,
      window: WINDOW,
      sentence: weekSentence({
        month: MONTH,
        daysIn: 18,
        label: 'Will it survive a wet commute',
        objectId: 't1',
        audience: 'the category',
        k: 130,
        n: 1388,
        atLastMonth: { k: 96, n: 1290 },
      }),
      check: weekCheck({ state: 'nothing_unusual', flags: [] }),
    },
    subjects: overview.subjects,
    contributions: { s1: 7, s2: 3 },
    contributionsNote: 'How much of each subject arrived since the last update is not recorded for this workspace yet.',
    incoming: {
      gathered: 271,
      analysed: 264,
      platforms: [
        { platform: 'tiktok', videos: 94 },
        { platform: 'youtube', videos: 122 },
        { platform: 'instagram', videos: 48 },
        { platform: 'reddit', videos: 7 },
      ],
      monthVideos: 2359,
      newThemes: [{ label: 'Zips failing after a year', videos: 12 }],
      newThemesNote: null,
      rivalPosts: [
        { rival: 'Freitag', account: '@freitag', platform: 'instagram', views: 41000, commentsRead: 310, uploadDate: '2026-09-09', href: 'https://instagram.com/p/x' },
      ],
      rivalPostsNote: null,
    },
    sales: {
      rows: [
        {
          kind: 'objection',
          kindLabel: 'Objection',
          label: 'Price',
          rival: 'Freitag',
          quote: { ref: 'e:2', text: 'Beautiful, but I cannot justify that for a bag.', lang: 'en', english: null },
          cite: 'tiktok · 12 Sep · under a video we read',
          href: 'https://www.tiktok.com/@x/video/1',
        },
        {
          kind: 'praise',
          kindLabel: 'Selling point',
          label: 'Durability',
          rival: null,
          quote: { ref: 'e:3', text: 'Dit het twee winters gehou.', lang: 'af', english: 'It held through two winters.' },
          cite: 'tiktok · 11 Sep · under a video we read',
          href: null,
        },
      ],
      hasMore: true,
      note: null,
      briefHref: '/dashboard/reports',
    },
    content: {
      worthAReply: [
        {
          ref: 'm:1',
          text: 'Does the strap come off?',
          lang: 'en',
          english: null,
          context: 'under your post · 41 likes',
          intentLabel: 'Question',
          href: 'https://www.youtube.com/watch?v=x&lc=1',
        },
      ],
      worthAReplyNote: null,
      rising: overview.category.growing,
      risingNote: null,
      format: { label: 'talking head', multiple: 2.4, videos: 31 },
      weekHref: '/dashboard/week',
      briefHref: '/dashboard/reports',
    },
    coverage: { line: overview.record.line, lines: overview.record.lines, href: '/dashboard/settings' },
  }
}

/** A week that flagged, over a month that read. */
export function weeklyFixture(over: Partial<WeeklyData> = {}): WeeklyData {
  const data = base()
  return {
    ...data,
    section1: {
      ...data.section1,
      check: weekCheck({ state: 'flagged', flags: [weekFlag()], flaggedCount: 1 }),
    },
    ...over,
  }
}

/** The ordinary week: the check ran and nothing cleared. */
export function quietFixture(over: Partial<WeeklyData> = {}): WeeklyData {
  return { ...base(), ...over }
}

/** Sealand today: baseline forming, subjects not recorded, nothing to quote. */
export function formingFixture(over: Partial<WeeklyData> = {}): WeeklyData {
  const overview = refusedFixture()
  const data = base(overview)
  return {
    ...data,
    subjects: overview.subjects,
    contributions: null,
    section1: {
      ...data.section1,
      sentence: weekSentence({
        month: MONTH,
        daysIn: 18,
        label: 'Will it survive a wet commute',
        objectId: 't1',
        audience: 'the category',
        k: 130,
        n: 1388,
        atLastMonth: null,
      }),
      check: weekCheck({ state: 'baseline_forming', flags: [], monthsClearing: 1 }),
    },
    incoming: { ...data.incoming, analysed: null, newThemes: [], newThemesNote: 'No theme was heard for the first time in this update.', rivalPosts: [], rivalPostsNote: 'No tracked rival posted in this update’s window.' },
    sales: { rows: [], hasMore: false, note: 'Grouped by what customers raised; your subjects are not recorded for this workspace yet.', briefHref: '/dashboard/reports' },
    content: {
      ...data.content,
      worthAReply: [],
      worthAReplyNote: 'Nothing is waiting for a reply from this update.',
      rising: overview.category.growing,
      risingNote: overview.category.moversNote,
      format: null,
    },
    coverage: { line: overview.record.line, lines: overview.record.lines, href: '/dashboard/settings' },
    ...over,
  }
}

/** A thin update: the check is suppressed and the reason is printed. */
export function thinFixture(over: Partial<WeeklyData> = {}): WeeklyData {
  const data = base()
  return {
    ...data,
    section1: {
      ...data.section1,
      check: weekCheck({
        state: 'suppressed',
        flags: [],
        suppression: {
          reason: 'thin',
          note: 'This update read well under its usual number of videos, so this week is not compared with the months behind it.',
        },
      }),
    },
    incoming: { ...data.incoming, gathered: 38, analysed: 34, platforms: [{ platform: 'tiktok', videos: 38 }] },
    ...over,
  }
}
