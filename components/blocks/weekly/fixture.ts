import type { WeeklyData } from '@/lib/pages/weekly'
import type { WeekFlag } from '@/lib/reports/weekly'
import { weekCheck, weekSentence } from '@/lib/reports/weekly'
import { overviewFixture, refusedFixture } from '@/components/pages/overview/fixture'
import { quoteRef } from '@/lib/renderables/quotes-freeze'

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
    // The masthead's two dates: this update, and the one behind it.
    update: { date: '2026-09-13T06:00:00.000Z', previous: '2026-09-05T06:00:00.000Z' },
    method: overview.method,
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
      // FIVE HEARD, THREE SHOWN — the shape the count printed off the slice
      // made invisible. The stat row prints `newThemesTotal`; the cards below
      // are the largest few.
      newThemes: [
        { label: 'Zips failing after a year', videos: 12 },
        { label: 'Laptop sleeve sizing', videos: 6 },
        { label: 'Strap hardware rattle', videos: 4 },
      ],
      newThemesTotal: 5,
      newThemesNote: null,
      rivalPosts: [
        { rival: 'Freitag', account: '@freitag', platform: 'instagram', views: 41000, commentsRead: 310, uploadDate: '2026-09-09', href: 'https://instagram.com/p/x' },
      ],
      rivalPostsNote: null,
      // NEW ON YOUR SUBJECTS — the mock's three quotes, which this artefact
      // printed none of. Three shown of 41 counted, which is the shape the
      // block has to print honestly.
      quotes: [
        { subject: 'Durability', quote: { ref: quoteRef.evidence('ev-w1'), text: 'Third winter on mine and the strap has not given at all' }, cite: 'YouTube · 9 Sep', href: 'https://www.youtube.com/watch?v=w1' },
        { subject: 'Waterproofing', quote: { ref: quoteRef.evidence('ev-w2'), text: 'Rode through an hour of rain and the laptop came out dry', lang: 'nl', english: 'Rode through an hour of rain and the laptop came out dry' }, cite: 'Instagram · 10 Sep', href: 'https://www.instagram.com/p/w2' },
        { subject: 'Repair and warranty', quote: { ref: quoteRef.evidence('ev-w3'), text: 'They fixed the zip for free eighteen months in' }, cite: 'TikTok · 11 Sep', href: 'https://www.tiktok.com/@x/video/w3' },
      ],
      quotesTotal: 41,
      quotesNote: null,
    },
    // §4 IS `ForSalesData` — the counted shape This week's loader produces,
    // which this artefact now calls rather than reading the month a second
    // time (block D wave 2).
    sales: {
      window: WINDOW,
      // VIDEOS DATED IN THE WINDOW, not videos gathered. `incoming.gathered`
      // is 271 — what this update LOOKED at — and this is
      // `window_denominators` over the same days, dated by the comment. They
      // are different measures and the fixture keeps them different numbers,
      // because a fixture in which they agree teaches a reviewer that they
      // are one thing. 205 is the n the flag's own week side rests on.
      videos: 205,
      grouping: 'theme',
      objections: [
        {
          id: 't-price',
          label: 'Price against longevity',
          videos: 96,
          quotes: [
            { quote: { ref: 'e:2', text: 'Beautiful, but I cannot justify that for a bag.', lang: 'en', english: null }, cite: 'TikTok · 12 Sep · under a category video', href: 'https://www.tiktok.com/@x/video/1' },
          ],
        },
        { id: 't-recycled', label: 'Is it really recycled', videos: 41, quotes: [] },
        { id: 't-zips', label: 'Zips', videos: 22, quotes: [] },
      ],
      // SEVEN GROUPS, THREE SHOWN — the shape `objections.slice(1).length`
      // made invisible by always answering "2 more objections".
      objectionsTotal: 7,
      praise: [
        { quote: { ref: 'e:3', text: 'Dit het twee winters gehou.', lang: 'af', english: 'It held through two winters.' }, cite: 'TikTok · 11 Sep · under a category video', href: null },
      ],
      // Two shown of twelve counted — the shape a slice-then-count made
      // invisible, and the reason `switchingTotal` is taken before the cap.
      switching: [
        { quote: { ref: 'e:9', text: 'Moving off Freitag after the strap went', lang: 'en', english: null }, cite: 'Reddit · 12 Sep · under a Freitag video', href: null },
      ],
      switchingTotal: 12,
      rivalComplaints: [
        { id: 'competitor:Freitag', label: 'Freitag', videos: 41, quotes: [] },
      ],
      brief: { href: '/dashboard/reports', label: 'Open the sales brief →' },
      unread: null,
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
      // WHAT THE QUEUE SURFACED, and the split by intent. Both are bounded by
      // `rankEngageCandidates` (three a kind, twelve in all, plus three
      // flagged), which is why the row is headed "Surfaced" and says so.
      surfaced: 12,
      surfacedCounts: [
        { label: 'question', count: 7 },
        { label: 'objection', count: 3 },
        { label: 'buying signal', count: 2 },
      ],
      rising: overview.category.growing,
      risingNote: null,
      format: { label: 'Talking head', multiple: 2.4, videos: 31, of: 402 },
      runnerUp: { label: 'Commute POV', multiple: 1.8, videos: 24 },
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
    // SEALAND TODAY: subjects are not recorded, so there are no quotes to be
    // new ON — and the section says which of those two things is true rather
    // than printing nothing.
    incoming: {
      ...data.incoming,
      analysed: null,
      newThemes: [],
      newThemesTotal: 0,
      newThemesNote: 'No theme was heard for the first time in this update.',
      rivalPosts: [],
      rivalPostsNote: 'No tracked rival posted in this update’s window.',
      quotes: [],
      quotesTotal: null,
      quotesNote: 'Quotes are counted against your subjects once subjects are recorded for this workspace. Until then this update’s comments are read, grouped and counted — they are simply not yours to name.',
    },
    // The degraded arm: the window was read and nothing in it was an
    // objection, a switch or a piece of praise — and `videos` is null, so
    // `forSalesEmpty` says which of those two facts is the reason.
    sales: {
      ...data.sales,
      videos: null,
      grouping: 'theme',
      objections: [],
      objectionsTotal: 0,
      praise: [],
      switching: [],
      switchingTotal: null,
      rivalComplaints: [],
    },
    content: {
      ...data.content,
      worthAReply: [],
      worthAReplyNote: 'Nothing is waiting for a reply from this update.',
      surfaced: null,
      surfacedCounts: [],
      rising: overview.category.growing,
      risingNote: overview.category.moversNote,
      format: null,
      runnerUp: null,
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
    // THE WHOLE UPDATE IS THIN, NOT HALF OF IT. The thin state overrode
    // `incoming` alone and left §4 on the base window's 205, so one email said
    // "38 videos gathered" in WR3 and "of 205 videos dated in the window"
    // twice in WR4, five inches apart. A fixture state is a whole reading.
    sales: { ...data.sales, videos: 31 },
    ...over,
  }
}
