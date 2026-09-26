import type { ConfigChange } from '../config-log'
import { SEALAND_CLIENT_ID } from '../config'
import { scheduledUpdateAfter } from '../reading/reading-month'
import type { WeekRead, WeekReadingRow, WeekRun } from '../reading/week-line'
import type { MarketWeekRow } from '../reading/weeks'

// Week by week, on staging's real rows (market-first decision M; WP2.9 and
// WP3.13 part A).
//
// EVERY NUMBER BELOW IS STAGING'S (zfmxrrugaihxpubunleu, Sealand, data to
// 20 Sep), read with read-only SELECTs through the MCP on Sat 26 Sep 2026 and
// logged in ~/.claude/plans/verbatim-market-first/exec/logs/wp2-9-staging-reads.md.
// The SELECTs are the bodies MF4's two functions will carry (market_week_volumes,
// market_week_readings), and they reproduce decision M's figures to the video
// and the comment. Nothing is invented. Where a test needs a date that has not
// happened yet (the production schedule from 4 Oct), it is a STAND-IN and says
// so: the Sunday 06:00 SAST slot plus the 20 Sep staging run's own duration.

export const STAGING_CLIENT = SEALAND_CLIENT_ID

/** The four rival audiences staging holds rows for in these weeks (decision
 *  M's market counts them all: rival-filed 11 · 16 · 13 · 14 · 15 · 12). */
export const STAGING_RIVALS: readonly string[] = [
  'competitor:Cotopaxi', 'competitor:Freitag', 'competitor:Patagonia', 'competitor:The North Face',
]

// ---- market_week_volumes, 27 Jul to 21 Sep, no capture cut -----------------------
// Per week and market audience, as MF4 returns them: the median and the mean
// dated comments a video are the WHOLE market's for the week, repeated on each
// of its rows (the category alone reads a median of 7 in the week of 31 Aug;
// the market reads 6). No row for the weeks of 27 Jul and 3 Aug: nothing was
// gathered in them.

const v = (week: string, audience: string, videos: number, comments: number, commentsNextMonth: number,
  under5: number, medianDated: number, meanDated: number, olderVideos: number, unchecked: number): MarketWeekRow =>
  ({ week, audience, videos, comments, commentsNextMonth, under5, medianDated, meanDated, olderVideos, unchecked })

export const STAGING_WEEK_VOLUMES: readonly MarketWeekRow[] = [
  v('2026-08-10', 'competitor:Cotopaxi', 10, 147, 0, 2, 17, 23.81, 0, 0),
  v('2026-08-10', 'competitor:Freitag', 1, 45, 0, 0, 17, 23.81, 0, 0),
  v('2026-08-10', 'industry-other', 233, 5617, 0, 21, 17, 23.81, 0, 0),
  v('2026-08-17', 'competitor:Cotopaxi', 14, 125, 0, 7, 6.5, 11.71, 0, 0),
  v('2026-08-17', 'competitor:Freitag', 2, 23, 0, 1, 6.5, 11.71, 0, 0),
  v('2026-08-17', 'industry-other', 210, 2498, 0, 70, 6.5, 11.71, 0, 0),
  v('2026-08-24', 'competitor:Cotopaxi', 11, 110, 0, 7, 5, 9.79, 2, 0),
  v('2026-08-24', 'competitor:Freitag', 2, 24, 0, 1, 5, 9.79, 0, 0),
  v('2026-08-24', 'industry-other', 174, 1697, 0, 80, 5, 9.79, 78, 0),
  v('2026-08-31', 'competitor:Cotopaxi', 11, 111, 104, 7, 6, 14.3, 4, 0),
  v('2026-08-31', 'competitor:Freitag', 3, 17, 16, 1, 6, 14.3, 1, 0),
  v('2026-08-31', 'industry-other', 215, 3147, 2771, 83, 6, 14.3, 84, 4),
  v('2026-09-07', 'competitor:Cotopaxi', 7, 54, 0, 3, 10, 19.43, 3, 0),
  v('2026-09-07', 'competitor:Freitag', 3, 16, 0, 2, 10, 19.43, 1, 0),
  v('2026-09-07', 'competitor:Patagonia', 2, 56, 0, 0, 10, 19.43, 0, 0),
  v('2026-09-07', 'competitor:The North Face', 3, 13, 0, 1, 10, 19.43, 0, 0),
  v('2026-09-07', 'industry-other', 389, 7712, 0, 110, 10, 19.43, 70, 27),
  v('2026-09-14', 'competitor:Cotopaxi', 1, 48, 0, 0, 9.5, 17.18, 0, 0),
  v('2026-09-14', 'competitor:Freitag', 3, 8, 0, 2, 9.5, 17.18, 1, 1),
  v('2026-09-14', 'competitor:Patagonia', 4, 66, 0, 1, 9.5, 17.18, 0, 0),
  v('2026-09-14', 'competitor:The North Face', 4, 31, 0, 0, 9.5, 17.18, 0, 0),
  v('2026-09-14', 'industry-other', 306, 5309, 0, 88, 9.5, 17.18, 38, 53),
]

/** The market's own figures per week (the SELECT's whole-market row). */
export const STAGING_MARKET_WEEKS: Readonly<Record<string, { videos: number; comments: number; medianDated: number; meanDated: number; under5: number; olderVideos: number; unchecked: number }>> = {
  '2026-08-10': { videos: 244, comments: 5809, medianDated: 17, meanDated: 23.81, under5: 23, olderVideos: 0, unchecked: 0 },
  '2026-08-17': { videos: 226, comments: 2646, medianDated: 6.5, meanDated: 11.71, under5: 78, olderVideos: 0, unchecked: 0 },
  '2026-08-24': { videos: 187, comments: 1831, medianDated: 5, meanDated: 9.79, under5: 88, olderVideos: 80, unchecked: 0 },
  '2026-08-31': { videos: 229, comments: 3275, medianDated: 6, meanDated: 14.3, under5: 91, olderVideos: 89, unchecked: 4 },
  '2026-09-07': { videos: 404, comments: 7851, medianDated: 10, meanDated: 19.43, under5: 116, olderVideos: 74, unchecked: 27 },
  '2026-09-14': { videos: 318, comments: 5462, medianDated: 9.5, meanDated: 17.18, under5: 91, olderVideos: 39, unchecked: 54 },
}

/** Sealand's own posts in the same weeks (staging, the client arm the SQL drops):
 *  2, 4 and 3 full-lane videos. Their unchecked and next-month columns were not
 *  read, so they are NaN (not measured): a pooled read that took this row in
 *  would throw. */
export const STAGING_CLIENT_WEEKS: readonly MarketWeekRow[] = [
  v('2026-08-31', 'client', 2, 32, Number.NaN, 0, 16, 16, 0, Number.NaN),
  v('2026-09-07', 'client', 4, 179, Number.NaN, 0, 12.5, 44.75, 0, Number.NaN),
  v('2026-09-14', 'client', 3, 19, Number.NaN, 1, 6, 6.33, 0, Number.NaN),
]

/** The market's comments in each week, by the capture cut (comments.created_at
 *  before the Monday named): the fill a week gains update by update. */
export const STAGING_COMMENTS_BY_CUT: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  '2026-08-10': { '2026-08-18': 5038, '2026-08-25': 5038, '2026-09-10': 5793, '2026-09-14': 5809, '2026-09-21': 5809 },
  '2026-08-17': { '2026-08-18': 375, '2026-08-25': 375, '2026-09-10': 2604, '2026-09-14': 2621, '2026-09-21': 2646 },
  '2026-08-24': { '2026-08-18': 0, '2026-08-25': 0, '2026-09-10': 1809, '2026-09-14': 1814, '2026-09-21': 1831 },
  '2026-08-31': { '2026-08-18': 0, '2026-08-25': 0, '2026-09-10': 3062, '2026-09-14': 3219, '2026-09-21': 3275 },
  '2026-09-07': { '2026-08-18': 0, '2026-08-25': 0, '2026-09-10': 1508, '2026-09-14': 6580, '2026-09-21': 7851 },
  '2026-09-14': { '2026-08-18': 0, '2026-08-25': 0, '2026-09-10': 0, '2026-09-14': 0, '2026-09-21': 5462 },
}

// ---- market_week_readings, pooled over the market, per depth band ---------------
// Videos (n) per band, and k for the six kinds and Looks & style, no capture
// cut (everything staging holds). Bands in WEEK_DEPTH_BANDS order: 1-4, 5-19, 20+.

export const STAGING_BAND_N: Readonly<Record<string, readonly [number, number, number]>> = {
  '2026-08-10': [23, 110, 111],
  '2026-08-17': [78, 110, 38],
  '2026-08-24': [88, 72, 27],
  '2026-08-31': [91, 80, 58],
  '2026-09-07': [116, 162, 126],
  '2026-09-14': [91, 135, 92],
}

export const STAGING_BAND_K: Readonly<Record<string, Readonly<Record<string, readonly [number, number, number]>>>> = {
  '2026-08-10': { praise: [9, 80, 97], question: [5, 43, 75], purchase_intent: [4, 41, 50], pain_point: [6, 34, 59], feature_request: [0, 6, 17], objection: [0, 24, 40], looks: [2, 10, 8] },
  '2026-08-17': { praise: [25, 68, 32], question: [11, 47, 25], purchase_intent: [12, 32, 22], pain_point: [2, 24, 21], feature_request: [4, 11, 9], objection: [4, 21, 12], looks: [3, 9, 4] },
  '2026-08-24': { praise: [23, 35, 22], question: [17, 30, 21], purchase_intent: [11, 31, 17], pain_point: [5, 16, 16], feature_request: [5, 15, 4], objection: [6, 9, 4], looks: [3, 8, 0] },
  '2026-08-31': { praise: [27, 51, 53], question: [21, 35, 36], purchase_intent: [13, 24, 38], pain_point: [10, 21, 28], feature_request: [5, 13, 18], objection: [3, 12, 14], looks: [5, 10, 7] },
  '2026-09-07': { praise: [34, 111, 105], question: [16, 71, 73], purchase_intent: [18, 89, 103], pain_point: [11, 47, 57], feature_request: [5, 24, 37], objection: [5, 21, 33], looks: [5, 32, 28] },
  '2026-09-14': { praise: [31, 85, 79], question: [15, 53, 62], purchase_intent: [16, 73, 59], pain_point: [8, 41, 51], feature_request: [7, 19, 35], objection: [6, 17, 27], looks: [6, 17, 15] },
}

/** Staging's Looks & style subject id. */
export const STAGING_LOOKS_ID = '723d1389-4eb0-47f1-b6e1-f368d990fb2a'

/** Staging's Price subject, pooled per band in the weeks of 7 and 14 Sep: 13
 *  then 8 market videos, so it never clears 10 in both weeks of a pair. */
export const STAGING_PRICE_ID = 'cf7bd22c-9a38-47c6-80dd-e8d3c5b3852d'
export const STAGING_PRICE_K: Readonly<Record<string, readonly [number, number, number]>> = {
  '2026-09-07': [0, 10, 3],
  '2026-09-14': [0, 3, 5],
}

// ---- The week of 31 Aug at 14 days, per audience (its cutoff is 21 Sep 00:00 UTC,
// after staging's last capture at 20 Sep 06:53, so no comment is cut) ------------

const BANDS = ['1-4', '5-19', '20+'] as const
const SUBJECT_IDS = {
  community: '1db58231-9327-4815-9898-ed3008bb353c',
  waterproofing: '27ac98cd-57e5-4322-922d-df90fa0ab859',
  repair: '3f6d49f4-cedd-492d-a957-1c840c1258a1',
  looks: STAGING_LOOKS_ID,
  durability: '98349b72-6783-424d-8397-8b43bf06741b',
  price: 'cf7bd22c-9a38-47c6-80dd-e8d3c5b3852d',
  comfort: 'fba00f77-4720-4f8e-b48f-3d4c53222e9f',
} as const

type Ks = Readonly<Record<string, readonly number[]>>
const AUG31: readonly { audience: string; n: readonly number[]; k: Ks }[] = [
  {
    audience: 'competitor:Cotopaxi', n: [7, 2, 2],
    k: {
      feature_request: [1, 1, 0], objection: [0, 1, 2], pain_point: [0, 2, 1], praise: [1, 2, 2], purchase_intent: [1, 0, 1], question: [4, 0, 1],
      buying_trigger: [0, 0, 0], demographic_signal: [0, 0, 0], switching_signal: [0, 0, 0],
      community: [0, 0, 0], waterproofing: [0, 0, 0], repair: [0, 1, 0], looks: [0, 0, 0], durability: [1, 1, 1], price: [0, 1, 0], comfort: [0, 1, 1],
    },
  },
  {
    audience: 'competitor:Freitag', n: [1, 2],
    k: {
      feature_request: [0, 0], objection: [0, 0], pain_point: [0, 0], praise: [0, 1], purchase_intent: [0, 1], question: [0, 2],
      buying_trigger: [0, 0], demographic_signal: [0, 1], switching_signal: [0, 0],
      community: [0, 0], waterproofing: [0, 0], repair: [0, 0], looks: [0, 0], durability: [0, 0], price: [0, 0], comfort: [0, 0],
    },
  },
  {
    audience: 'industry-other', n: [83, 76, 56],
    k: {
      feature_request: [4, 12, 18], objection: [3, 11, 12], pain_point: [10, 19, 27], praise: [26, 48, 51], purchase_intent: [12, 23, 37], question: [17, 33, 35],
      buying_trigger: [0, 1, 1], demographic_signal: [1, 2, 4], switching_signal: [0, 2, 5],
      community: [0, 1, 2], waterproofing: [0, 4, 4], repair: [1, 4, 7], looks: [5, 10, 7], durability: [1, 4, 7], price: [1, 4, 2], comfort: [1, 2, 3],
    },
  },
]

/** `market_week_readings` for the week of 31 Aug at 14 days, as PostgREST would
 *  return it: a row for every audience, object and band with videos, k maybe 0.
 *  The objects are every kind Sealand's current insights carry on staging (the
 *  six the line reads, plus buying_trigger, demographic_signal and
 *  switching_signal) and the seven non-retired subjects: 8 audience-bands × 16
 *  objects = 128 rows. Re-read on 26 Sep with the committed MF4 body
 *  (mf/mf2 c6ca81ee) as a read-only SELECT, which lists all nine kinds. */
export const STAGING_AUG31_READINGS: readonly WeekReadingRow[] = AUG31.flatMap(({ audience, n, k }) =>
  Object.entries(k).flatMap(([obj, ks]) => ks.map((kk, i) => {
    const isSubject = obj in SUBJECT_IDS
    return {
      audience,
      object_kind: isSubject ? 'subject' : 'kind',
      object_id: isSubject ? SUBJECT_IDS[obj as keyof typeof SUBJECT_IDS] : obj,
      depth_band: BANDS[i],
      k: kk,
      n: n[i],
    }
  })))

// ---- Runs --------------------------------------------------------------------------

/** Sealand's staging runs (pipeline_runs: id, status, started_at, completed_at).
 *  Staging's run rows before 20 Sep are reconstructed (plan §5.11), and they
 *  show why no staging week was read with one update a week: four updates on
 *  Mon 17 Aug, then nothing until Wed 9 Sep. */
export const STAGING_RUNS: readonly WeekRun[] = [
  { id: '1256d38d-27f1-4d98-be59-eecf114c3d75', status: 'completed', startedAt: '2026-08-08T16:15:36.097Z', finishedAt: '2026-08-08T16:37:50.613Z' },
  { id: '6077c21d-c2c3-42e3-a6ab-21a480cad03d', status: 'completed', startedAt: '2026-08-08T16:24:35.715Z', finishedAt: '2026-08-09T17:22:30.409Z' },
  { id: 'f4c5d868-bbda-4e35-b7c5-e9267cb809e1', status: 'partial', startedAt: '2026-08-17T06:52:34.423Z', finishedAt: '2026-08-17T10:01:50.784Z' },
  { id: 'c704eab3-54ac-403a-818c-b78e653284e0', status: 'completed', startedAt: '2026-08-17T10:47:59.722Z', finishedAt: '2026-08-17T13:36:32.032Z' },
  { id: 'b5d05d24-7857-45d3-bc18-75d7a198dfc1', status: 'completed', startedAt: '2026-08-17T13:42:52.556Z', finishedAt: '2026-08-17T14:53:54.496Z' },
  { id: '7df7a420-f370-4f4d-a675-58d954d5454f', status: 'completed', startedAt: '2026-08-17T15:05:59.583Z', finishedAt: '2026-08-17T15:18:12.919Z' },
  { id: '9edd3968-f1bc-4d0f-b1ec-539df28b0832', status: 'failed', startedAt: '2026-08-17T15:27:27.603Z', finishedAt: '2026-08-17T15:39:34.786Z' },
  { id: '093acddb-a95a-4833-ad40-0f26df08ef18', status: 'completed', startedAt: '2026-09-09T12:08:47.213Z', finishedAt: '2026-09-09T12:31:15.553Z' },
  { id: 'cb0d97b2-7d9b-451d-b427-721a6dcade71', status: 'completed', startedAt: '2026-09-10T07:02:10.201Z', finishedAt: '2026-09-10T07:17:02.291Z' },
  { id: '5a2ebc43-9b7b-4c88-a2db-893b5fd643c5', status: 'failed', startedAt: '2026-09-15T08:21:22.334Z', finishedAt: '2026-09-15T08:38:58.007Z' },
  { id: 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4', status: 'partial', startedAt: '2026-09-20T04:02:57.897Z', finishedAt: '2026-09-20T08:33:47.358Z' },
  { id: 'ddbbffe4-2605-45cc-a251-e6592fc2ed08', status: 'analyzing', startedAt: '2026-09-24T12:16:54.403Z', finishedAt: null },
]

/** The finish instants of staging's completed or partial runs: the updates. */
export const STAGING_UPDATES: readonly string[] = STAGING_RUNS
  .filter((r) => (r.status === 'completed' || r.status === 'partial') && r.finishedAt)
  .map((r) => r.finishedAt as string)

/** The 20 Sep staging run took 4 h 30 min 49.5 s (04:02:57.897 to 08:33:47.358). */
export const STAGING_RUN_DURATION_MS = Date.parse('2026-09-20T08:33:47.358Z') - Date.parse('2026-09-20T04:02:57.897Z')

/** STAND-INS for production's Sunday updates from 4 Oct (not knowable yet):
 *  the 06:00 SAST slot (04:00 UTC) plus the 20 Sep staging run's duration, one
 *  completed run a week. */
export function standInSundayRuns(sundays: readonly string[]): WeekRun[] {
  return sundays.map((day) => {
    const start = Date.parse(`${day}T04:00:00.000Z`)
    return {
      id: `stand-in-${day}`,
      status: 'completed',
      startedAt: new Date(start).toISOString(),
      finishedAt: new Date(start + STAGING_RUN_DURATION_MS).toISOString(),
    }
  })
}

/** Sealand's schedule as `nextUpdateAfter`: weekly on Sunday, the product's
 *  own rule (`scheduledUpdateAfter`, 06:00 SAST = 04:00 UTC). */
export const SEALAND_NEXT_UPDATE = scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' })

// ---- The change log -------------------------------------------------------------------

const change = (id: string, changed_at: string, surface: string, source: string, extra: Partial<ConfigChange> = {}): ConfigChange => ({
  id, client_id: STAGING_CLIENT, changed_at, surface: surface as ConfigChange['surface'], field: null, before: null, after: null,
  actor_kind: 'script', actor_user_id: null, actor_label: null, run_id: null, source: source as ConfigChange['source'],
  rows_affected: null, note: null, affects_audiences: null, affects_months: null, ...extra,
})

/** Staging's config_changes rows from August on that bear on the weeks (ids,
 *  instants, surfaces and the community sides as the table holds them; each
 *  community side keeps only name and status, which is all
 *  `activeCommunities` reads). Rows the product never reads as a change of ours
 *  (schedule, cadence, subjects) are represented by one cadence row. */
export const STAGING_CHANGES: readonly ConfigChange[] = [
  change('1d358148-5851-4fbf-b30c-41a03274ce40', '2026-08-17T00:00:00.000Z', 'subreddits', 'reconstructed', { before: null, after: { name: 'cycling', status: 'candidate' } }),
  change('31326f7c-a4b6-4d8c-a989-3e0f52dcbedd', '2026-08-17T00:00:00.000Z', 'subreddits', 'reconstructed', { before: { name: 'outdoorgear', status: 'candidate' }, after: { name: 'outdoorgear', status: 'rejected' } }),
  change('8d8793db-f6a7-436b-b2b7-c358ce5185ee', '2026-08-17T07:05:43.716Z', 'handles', 'reconstructed', { field: 'own_handles' }),
  change('a43a98a8-e73d-4af9-9098-41e3d87eca47', '2026-09-09T00:00:00.000Z', 'subreddits', 'reconstructed', { before: { name: 'travelgear', status: 'candidate' }, after: { name: 'travelgear', status: 'active' } }),
  change('c93001c7-3d74-40e5-b6d5-d8e0c22a7a85', '2026-09-09T00:00:00.000Z', 'subreddits', 'reconstructed', { before: { name: 'backpacks', status: 'candidate' }, after: { name: 'backpacks', status: 'active' } }),
  change('94d0dcb7-d37a-4267-b494-4779a2ab4050', '2026-09-09T16:24:15.000Z', 'rivals', 'reconstructed', { field: 'competitor_names' }),
  change('4e74fb1b-d7d6-4d23-99ec-b157f430508a', '2026-09-09T18:10:00.000Z', 'entity_retag', 'reconstructed'),
  change('0e7e4ac7-c45b-4dfa-a42f-4baa43c51b35', '2026-09-09T18:17:56.893Z', 'terms', 'reconstructed'),
  change('29a262e8-3eb8-44e2-a64a-cadcc3300e53', '2026-09-09T18:17:56.893Z', 'terms', 'reconstructed'),
  change('3c22ae27-d26a-4f42-91d0-53ada2c2fd72', '2026-09-09T18:21:36.570Z', 'handles', 'reconstructed', { field: 'competitor_handles' }),
  change('1e064999-11fe-437d-9e85-a53de370c587', '2026-09-13T00:00:00.000Z', 'subreddits', 'reconstructed', { before: { name: 'sailboats', status: 'candidate' }, after: { name: 'sailboats', status: 'rejected' } }),
  change('1bf52851-7cc0-48c3-adfa-135588bbfeab', '2026-09-13T10:00:58.467Z', 'terms', 'reconstructed', { field: 'industry_keywords', actor_kind: 'sql' }),
  change('7ab5408e-1fdb-403f-9030-1db1680e3e90', '2026-09-13T10:00:58.467Z', 'terms', 'reconstructed', { field: 'competitor_keywords', actor_kind: 'sql' }),
  change('13f1ac3f-06a6-4ec4-9ffa-f36048450f25', '2026-09-15T12:16:03.827Z', 'cadence', 'trigger', { field: 'report_period' }),
  change('1120cb35-34d5-44d1-b401-1c08e10e71a0', '2026-09-17T16:02:56.854Z', 'handles', 'trigger', { field: 'competitor_handles' }),
  change('515cc98d-0f30-4b4f-8dba-34bd92aa7e4c', '2026-09-17T16:02:56.854Z', 'rivals', 'trigger', { field: 'competitor_names' }),
  change('62042dd6-0ed5-4cca-9120-7238010dd931', '2026-09-17T16:02:56.854Z', 'terms', 'trigger', { field: 'industry_keywords' }),
  change('8e580089-3d1a-4d2c-855b-3ab97dc90cf2', '2026-09-17T16:02:56.854Z', 'terms', 'trigger', { field: 'competitor_keywords' }),
  change('da8ef0d2-0d8d-4bb5-9cc0-5d5db2f22236', '2026-09-17T16:02:56.854Z', 'terms', 'trigger', { field: 'exclude_terms' }),
  change('703065c0-c602-4034-a48d-36299f5c3f07', '2026-09-17T16:24:22.289Z', 'handles', 'trigger', { field: 'competitor_handles' }),
  change('9049f869-4bfa-4a98-a604-c72aa65aa438', '2026-09-20T04:04:05.059Z', 'subreddits', 'trigger', {
    actor_kind: 'pipeline',
    before: [{ name: 'backpacks', status: 'active' }, { name: 'travelgear', status: 'active' }, { name: 'onebag', status: 'active' }, { name: 'ecocraft', status: 'candidate' }, { name: 'travelbackpacks', status: 'candidate' }],
    after: [{ name: 'backpacks', status: 'active' }, { name: 'travelgear', status: 'active' }, { name: 'onebag', status: 'active' }, { name: 'ecocraft', status: 'rejected' }, { name: 'travelbackpacks', status: 'rejected' }],
  }),
  change('507750e5-5686-4521-8166-e06fb372b86f', '2026-09-20T04:18:34.305Z', 'other', 'reconstructed', { field: 'gather_capped' }),
  // The MF1 rehearsal's two rows, dated 26 Sep 12:00 as log-tracking-eras'
  // stand-in for the fix deploy (Status, 26 Sep).
  change('ce19f0ac-eba8-4748-9579-33b95b993fde', '2026-09-26T12:00:00.000Z', 'gate_rule', 'reconstructed', { field: 'relevance_gate' }),
  change('3b8d32f9-3562-46aa-9585-7d48d5edbc0a', '2026-09-26T12:00:00.000Z', 'attribution', 'reconstructed', { field: 'attribution_v3' }),
]

// ---- Kept reads built from staging's weeks ----------------------------------------------

/** A kept read from a staging week's real depth figures (videos, mean and median
 *  dated comments a video, the bands, unchecked and older videos). The cadence,
 *  the run and the dates are the caller's, because staging never ran one update
 *  a week. */
export function readFromStaging(stagingWeek: string, over: Partial<WeekRead> = {}): WeekRead {
  const row = STAGING_MARKET_WEEKS[stagingWeek]
  if (!row) throw new Error(`no staging week ${stagingWeek}`)
  return {
    week: stagingWeek,
    ageDays: 14,
    capturedBefore: '2026-09-21T00:00:00Z',
    readThroughRun: 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4',
    runsInWeek: 1,
    runsAfter: [1, 1],
    lateRun: false,
    videos: row.videos,
    meanDated: row.comments / row.videos,
    medianDated: row.medianDated,
    bands: STAGING_BAND_N[stagingWeek],
    unchecked: row.unchecked,
    olderVideos: row.olderVideos,
    promptVersion: 'pass_a_v4.1',
    laneRule: 'min_comments:default=5,reddit=3',
    rescrapeCapped: null,
    methodVersion: 'week_line_v1',
    computedAt: '2026-09-21T09:00:00.000Z',
    offCadence: 0,
    comments: row.comments,
    ...over,
  }
}
