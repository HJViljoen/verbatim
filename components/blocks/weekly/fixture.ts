import type { WeeklyData } from '@/lib/pages/weekly'
import type { LedgerLine } from '@/lib/pages/overview-market'
import { marketArrivalsFixture, ossurArrivalsFixture } from '@/components/pages/overview/fixture'
import { marketWeekFixture, ossurWeeksFixture } from '@/components/pages/week/fixture'

// "Your market this week" fixtures (market-first WP3.7). Real figures only.
//
// THE WEEKLY IS TWO PAGES' READINGS, SO ITS FIXTURE IS TWO PAGES' FIXTURES:
//   · the front page on September (`marketArrivalsFixture`: production's 24
//     Sep figures, 655 market videos and 626 in the category; plan §2.2) for
//     WR2's subjects, WR3's board and WR6's change block;
//   · This week on Sealand's 20 Sep update (`marketWeekFixture`: staging, read
//     27 Sep) for what the update brought in (436 videos, 9,471 comments), the
//     themes it first heard (2 of 374), For sales and Worth a reply;
//   · the market's level and "With this update" per subject, and our changes
//     in September, as staging's `loadWeekly` read them at a 22 Sep clock
//     (654 videos and 16,204 comments; Looks & style +73, Comfort +28,
//     Durability +20, Waterproofing +16, Price +13 on the 20 Sep update's
//     days; the change log to 22 Sep).
// So the two halves carry two sources' counts (655 against 654); each is real
// and each block prints its own source's.

const SEP = '2026-09-01'
const AT = '2026-09-22T12:00:00.000Z'

/** Staging's change log, September, to 22 Sep (`loadWhatWeChanged`'s lines). */
export const SEALAND_SEPTEMBER_CHANGES: LedgerLine[] = [
 {
  "changeId": "507750e5-5686-4521-8166-e06fb372b86f",
  "date": "2026-09-20T04:18:34.305242+00:00",
  "surface": "other",
  "words": "An update gathered less than usual because a spending cap was reached.",
  "detail": null,
  "reach": null,
  "months": []
 },
 {
  "changeId": "703065c0-c602-4034-a48d-36299f5c3f07",
  "date": "2026-09-17T16:24:22.289181+00:00",
  "surface": "handles",
  "words": "A TikTok account added for The North Face",
  "detail": null,
  "reach": null,
  "months": []
 },
 {
  "changeId": "1120cb35-34d5-44d1-b401-1c08e10e71a0",
  "date": "2026-09-17T16:02:56.854932+00:00",
  "surface": "handles",
  "words": "Accounts added for Freedom of Movement, Old School, Patagonia and The North Face",
  "detail": null,
  "reach": null,
  "months": []
 },
 {
  "changeId": "515cc98d-0f30-4b4f-8dba-34bd92aa7e4c",
  "date": "2026-09-17T16:02:56.854932+00:00",
  "surface": "rivals",
  "words": "4 rivals added",
  "detail": null,
  "reach": null,
  "months": []
 },
 {
  "changeId": "62042dd6-0ed5-4cca-9120-7238010dd931",
  "date": "2026-09-17T16:02:56.854932+00:00",
  "surface": "terms",
  "words": "5 search terms added; 9 exclusions added",
  "detail": null,
  "reach": {
   "month": "2026-09-01",
   "touched": 33,
   "of": 654,
   "readWith": "2026-09-20T08:33:47.358+00:00"
  },
  "months": [
   {
    "month": "2026-07-01",
    "touched": 0,
    "of": 27,
    "readWith": "2026-09-20T08:33:47.358+00:00"
   },
   {
    "month": "2026-08-01",
    "touched": 0,
    "of": 377,
    "readWith": "2026-09-20T08:33:47.358+00:00"
   },
   {
    "month": "2026-09-01",
    "touched": 33,
    "of": 654,
    "readWith": "2026-09-20T08:33:47.358+00:00"
   }
  ]
 },
 {
  "changeId": "1bf52851-7cc0-48c3-adfa-135588bbfeab",
  "date": "2026-09-13T10:00:58.467+00:00",
  "surface": "terms",
  "words": "4 search terms added",
  "detail": null,
  "reach": {
   "month": "2026-09-01",
   "touched": 182,
   "of": 654,
   "readWith": "2026-09-20T08:33:47.358+00:00"
  },
  "months": [
   {
    "month": "2026-07-01",
    "touched": 0,
    "of": 27,
    "readWith": "2026-09-20T08:33:47.358+00:00"
   },
   {
    "month": "2026-08-01",
    "touched": 0,
    "of": 377,
    "readWith": "2026-09-20T08:33:47.358+00:00"
   },
   {
    "month": "2026-09-01",
    "touched": 182,
    "of": 654,
    "readWith": "2026-09-20T08:33:47.358+00:00"
   }
  ]
 },
 {
  "changeId": "3c22ae27-d26a-4f42-91d0-53ada2c2fd72",
  "date": "2026-09-09T18:21:36.570181+00:00",
  "surface": "handles",
  "words": "Accounts added for Cotopaxi, Freitag and Rareform",
  "detail": null,
  "reach": null,
  "months": []
 },
 {
  "changeId": "0e7e4ac7-c45b-4dfa-a42f-4baa43c51b35",
  "date": "2026-09-09T18:17:56.893748+00:00",
  "surface": "terms",
  "words": "7 search terms out and 7 in",
  "detail": null,
  "reach": {
   "month": "2026-09-01",
   "touched": 159,
   "of": 654,
   "readWith": "2026-09-20T08:33:47.358+00:00"
  },
  "months": [
   {
    "month": "2026-07-01",
    "touched": 9,
    "of": 27,
    "readWith": "2026-09-20T08:33:47.358+00:00"
   },
   {
    "month": "2026-08-01",
    "touched": 167,
    "of": 377,
    "readWith": "2026-09-20T08:33:47.358+00:00"
   },
   {
    "month": "2026-09-01",
    "touched": 159,
    "of": 654,
    "readWith": "2026-09-20T08:33:47.358+00:00"
   }
  ]
 },
 {
  "changeId": "4e74fb1b-d7d6-4d23-99ec-b157f430508a",
  "date": "2026-09-09T18:10:00+00:00",
  "surface": "entity_retag",
  "words": "Stored videos filed again under the brand they are about",
  "detail": null,
  "reach": null,
  "months": []
 },
 {
  "changeId": "94d0dcb7-d37a-4267-b494-4779a2ab4050",
  "date": "2026-09-09T16:24:15+00:00",
  "surface": "rivals",
  "words": "3 rivals out and 1 in",
  "detail": null,
  "reach": null,
  "months": []
 },
 {
  "changeId": "495024e2-5aa6-4496-a8ec-908a28f12020",
  "date": "2026-09-09T00:00:00+00:00",
  "surface": "subreddits",
  "words": "2 communities added",
  "detail": null,
  "reach": {
   "month": "2026-09-01",
   "touched": 12,
   "of": 654,
   "readWith": "2026-09-20T08:33:47.358+00:00"
  },
  "months": [
   {
    "month": "2026-07-01",
    "touched": 0,
    "of": 27,
    "readWith": "2026-09-20T08:33:47.358+00:00"
   },
   {
    "month": "2026-08-01",
    "touched": 2,
    "of": 377,
    "readWith": "2026-09-20T08:33:47.358+00:00"
   },
   {
    "month": "2026-09-01",
    "touched": 12,
    "of": 654,
    "readWith": "2026-09-20T08:33:47.358+00:00"
   }
  ]
 }
]

/** Sealand's "your market this week" on the 20 Sep update. */
export function weeklyFixture(over: Partial<WeeklyData> = {}): WeeklyData {
  const overview = marketArrivalsFixture()
  const week = marketWeekFixture()
  const data: WeeklyData = {
    brand: overview.brand,
    month: SEP,
    monthStatus: 'filling',
    readingAt: AT,
    runId: week.update.id,
    window: { from: '2026-09-10', to: '2026-09-20' },
    update: { date: week.update.date, previous: week.update.previous },
    barLine: 'as at the 20 Sep update · next update Sun 27 Sep',
    market: { videos: 654, comments: 16204 },
    cameIn: week.cameIn.market ?? null,
    overview,
    contributions: { 's-looks': 73, 's-comfort': 28, 's-durability': 20, 's-waterproofing': 16, 's-price': 13 },
    heard: week.heard ?? null,
    sales: week.sales,
    replies: week.replies,
    changes: SEALAND_SEPTEMBER_CHANGES,
  }
  return { ...data, ...over }
}

/** The same on 11 Oct, when every page reads September (ended) and the
 *  update's days fall in October: the came-in line names October, and no
 *  subject's "with this update" is counted into September. */
export function octoberUpdateFixture(): WeeklyData {
  const d = weeklyFixture()
  return {
    ...d,
    readingAt: '2026-10-11T12:00:00.000Z',
    cameIn: d.cameIn ? { ...d.cameIn, month: '2026-10-01', update: '2026-10-11T08:30:00.000Z' } : null,
    contributions: null,
  }
}

/** Össur's on its 13 Sep update (paused, §2.13): no subject named, no maker
 *  rule; 168 of September's 362 market videos came in with it (staging). */
export function ossurWeeklyFixture(): WeeklyData {
  const overview = ossurArrivalsFixture()
  const week = ossurWeeksFixture()
  return {
    brand: overview.brand,
    month: SEP,
    monthStatus: 'filling',
    readingAt: AT,
    runId: week.update.id,
    window: week.window ? { from: week.window.from.slice(0, 10), to: week.window.to.slice(0, 10) } : null,
    update: { date: week.update.date, previous: week.update.previous },
    barLine: 'as at the 13 Sep update',
    market: { videos: 362, comments: 10726 },
    cameIn: week.cameIn.market ?? null,
    overview,
    contributions: null,
    heard: week.heard ?? null,
    sales: week.sales,
    replies: week.replies,
    changes: [],
  }
}
