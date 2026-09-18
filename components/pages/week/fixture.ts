import { LATER_LINE, PRIVACY_LINE, coverageLine, subjectLead, typicalContribution, typicalTag, type SubjectWeekRow, type WeekData, type WeekWindow } from '@/lib/pages/week'
import { bandVerdict } from '@/lib/reading/verdicts'
import { buildUpdateSeries, monthsOfWindow, type UpdateSeries } from '@/lib/reading/updates'
import { quoteRef } from '@/lib/renderables/quotes-freeze'

// Two fixtures for This week's blocks (Phase 1 WP15).
//
// SHAPED ON PRODUCTION, NOT INVENTED. Every count below was measured read-only
// against the live database on 2026-09-16 and is named where it came from, so a
// block test that passes is a block that renders the rows this product actually
// has. The mock's dataset.md is invented data and is a source of LAYOUT, never
// of numbers (the plan says so); these are the numbers.
//
//   `weekFixture()` is Össur-shaped: baseline ready (232 · 136 · 721 videos
//   over the floor), one flag — objections, 28 of 205 against 38 of 1,089,
//   which is the only flag the Phase 0 replay raised in eleven weeks — a
//   seven-day window inside one month, two of 303 first-heard themes clearing
//   the floor, and zero competitor-owned videos, so its rival rows are posts
//   ABOUT a rival and say so.
//
//   `thinFixture()` is Sealand-shaped: baseline forming at 1 of 3, no check row
//   at all, no subjects recorded, a thirty-day window crossing from August into
//   September, and 592 first-heard themes of which none clears the floor. It is
//   the state most of this page spends most of its life in, which is why it is
//   a fixture and not an afterthought.

const OSSUR_WINDOW: WeekWindow = {
  from: '2026-09-06T04:06:38.483Z',
  to: '2026-09-13T04:06:38.483Z',
  basis: 'reconstructed',
}

const SEALAND_WINDOW: WeekWindow = {
  from: '2026-08-11T07:02:10.201Z',
  to: '2026-09-10T07:02:10.201Z',
  basis: 'reconstructed',
}

const quote = (ref: string, text: string, cite: string, extra: { lang?: string; english?: string | null } = {}) => ({
  quote: { ref: quoteRef.evidence(ref), text, ...extra },
  cite,
  href: 'https://www.youtube.com/watch?v=abc',
})


const DAY = 86_400_000

/**
 * A fixture series, built through the loader's own pure builder.
 *
 * NOT HAND-WRITTEN POINTS. `buildUpdateSeries` is what the loader calls, so a
 * fixture that assembled its own `points`, `median`, `band` and `basis` would
 * be a second implementation — and a block test would then be asserting against
 * numbers no code path produces. The fixture supplies only what a READ supplies:
 * the windows, the analysed counts, the windowed spans and the month rows.
 */
function seriesOf(input: {
  /** Videos newly found per update, oldest first — `videos.run_id`. */
  counts: readonly number[]
  /** The day the newest window closes. */
  endsAt: string
  /** How many days each window covers — one number, or one per point with the
   *  newest last (Sealand's newest window is thirty days and the ones behind
   *  it are seven). */
  days: number | readonly number[]
  /** Each month's own denominator. */
  monthOf: Record<string, number>
  /** How much of an update's analysed set the windowed read answers for —
   *  Össur's newest update analysed 508 and its window carried 205. */
  windowShare?: number
  /**
   * The newest point's spans, by month, EXACTLY as the windowed read answers
   * them — because the newest point is the one the page states twice.
   *
   * §1's series restates the newest update's contribution to its month and §4
   * states the same fact from the same RPC clipped the same way, so on
   * production the two agree by construction. A fixture that derived §1's from
   * an even split of `windowShare` had the two sections of one page print
   * different numbers for one claim, which is the page disagreeing with itself
   * in the handover artefact wave 2 builds against. Videos do not add across
   * months and comments do (`buildUpdateSeries`), so these are given, not
   * divided.
   */
  newestSpans?: Record<string, { videos: number; comments: number }>
  windowless?: number
  requested?: number
}): UpdateSeries {
  const end = new Date(input.endsAt).getTime()
  const dayList = typeof input.days === 'number' ? input.counts.map(() => input.days as number) : input.days
  const runs: { runId: string; window: { from: string; to: string } }[] = []
  const videosByRun = new Map<string, number>()
  const spans = new Map<string, { videos: number; comments: number }>()
  const share = input.windowShare ?? 0.4

  // Newest first, walking backwards: each window ends where the one after it
  // began, which is `previousRunEnd`'s own rule.
  const ends: number[] = []
  let cursor = end
  for (let i = input.counts.length - 1; i >= 0; i -= 1) {
    ends[i] = cursor
    cursor -= dayList[i] * DAY
  }

  input.counts.forEach((videos, i) => {
    const to = new Date(ends[i]).toISOString()
    const from = new Date(ends[i] - dayList[i] * DAY).toISOString()
    const runId = `run-${i + 1}`
    runs.push({ runId, window: { from, to } })
    videosByRun.set(runId, videos)
    const months = monthsOfWindow(from, to)
    const newest = i === input.counts.length - 1 ? input.newestSpans : undefined
    for (const month of months) {
      spans.set(`${runId}::${month}`, newest?.[month] ?? {
        videos: Math.round((videos * share) / months.length),
        comments: Math.round((videos * 25) / months.length),
      })
    }
  })

  return buildUpdateSeries({
    runs,
    videosByRun,
    spans,
    monthOf: new Map(Object.entries(input.monthOf)),
    windowless: input.windowless ?? 0,
    requested: input.requested ?? 13,
    windowRead: 'read',
  })
}

/** A subject row with its typical and its tag computed the way the loader
 *  computes them — one arithmetic, not two. */
function subjectRow(input: {
  id: string
  label: string
  monthVideos: number
  monthOf: number
  addedVideos: number | null
  clientUpdateVideos: number | null
}): SubjectWeekRow {
  const typical = typicalContribution({
    monthVideos: input.monthVideos,
    monthOf: input.monthOf,
    updateVideos: input.clientUpdateVideos,
  })
  return {
    id: input.id,
    label: input.label,
    monthVideos: input.monthVideos,
    monthOf: input.monthOf,
    addedVideos: input.addedVideos,
    typical,
    tag: typicalTag(input.addedVideos, typical),
    verdict: null,
  }
}


/**
 * Össur's three subjects, month-to-date, with what this update put in.
 *
 * `addedVideos` sits against a client window of 14 videos in a month of 96, so
 * a subject's "typical" contribution is its month size scaled by 14/96 — two
 * of the three ran above it, which is what `subjectLead` counts.
 */
function ossurSubjects(): WeekData['subjects'] {
  const rows = [
    subjectRow({ id: 's1', label: 'Comfort', monthVideos: 31, monthOf: 96, addedVideos: 8, clientUpdateVideos: 14 }),
    subjectRow({ id: 's2', label: 'Price and cover', monthVideos: 27, monthOf: 96, addedVideos: 6, clientUpdateVideos: 14 }),
    subjectRow({ id: 's3', label: 'Durability', monthVideos: 19, monthOf: 96, addedVideos: 1, clientUpdateVideos: 14 }),
  ]
  return { month: '2026-09-01', unread: null, rows, lead: subjectLead(rows, '2026-09-01') }
}

export function weekFixture(): WeekData {
  const risingVerdict = bandVerdict({
    objectKind: 'theme',
    objectId: 'reg-1',
    objectLabel: 'Socket comfort after a long day',
    audience: 'industry-other',
    window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' },
    basis: { from: '2026-06-01', to: '2026-09-01' },
    value: { k: 44, n: 398 },
    baseline: { k: 46, n: 928 },
  })

  return {
    brand: 'Össur',
    update: {
      id: 'd346b0f7-5b2b-4b46-a60c-db0c83ecfda7',
      date: '2026-09-13T06:26:49.308Z',
      previous: '2026-09-06T12:41:40.114Z',
      status: 'completed',
    },
    window: OSSUR_WINDOW,
    month: '2026-09-01',
    monthStatus: 'filling',
    readingAt: '2026-09-16T09:00:00.000Z',
    windowVideos: 205,
    unusual: {
      state: 'flagged',
      note: 'One object cleared its band this update.',
      flaggedCount: 1,
      setSize: 31,
      tested: 14,
      baseline: {
        denominator: 'every audience together',
        monthsClearing: 3,
        monthsRead: 3,
        required: 3,
        ready: true,
        label: 'baseline ready',
      },
      startsWith: null,
      updateVideos: 508,
      medianVideos: 476,
      // THIRTEEN WEEKLY UPDATES, and the two numbers above are the CHECK's own
      // reading of the newest one, taken when it ran. The series is read now.
      // They agree here because nothing was resumed; they are separate fields
      // because they are separate readings.
      // ÖSSUR'S OWN THIRTEEN, MEASURED READ-ONLY ON PRODUCTION 2026-09-18,
      // counted on `videos.run_id` — three of them found nothing at all, which
      // is a fact about those deliveries and is drawn as one. The same counts
      // on `analyzed_run_id` would have been 508, 205, 65, 796 and NINE
      // ZEROES, which is why this field is not that column.
      series: seriesOf({
        counts: [0, 94, 0, 1, 462, 0, 488, 456, 473, 376, 466, 559, 618],
        endsAt: '2026-09-13T04:06:38.483Z',
        days: 7,
        monthOf: { '2026-06-01': 480, '2026-07-01': 505, '2026-08-01': 520, '2026-09-01': 449 },
        windowShare: 205 / 618,
        // THE SAME TWO NUMBERS §4 PRINTS — 205 of 449, and the 5,134 comments
        // dated in these days — because they are the same read of the same
        // days and the page says them twice.
        newestSpans: { '2026-09-01': { videos: 205, comments: 5134 } },
      }),
      flags: [{
        objectKind: 'kind',
        objectId: 'objection',
        label: 'Objections',
        denominator: 'every audience together',
        week: { k: 28, n: 205 },
        baseline: { k: 38, n: 1089 },
        baselineMonths: ['2026-06-01', '2026-07-01', '2026-08-01'],
        baselineFilling: ['2026-08-01'],
        // The three months behind it were NOT read under one clustering, which
        // is M7's `baseline_regime` and the reason the column exists.
        baselineRegime: 'mixed',
        changePts: 10.2,
        bandPts: 4.9,
        // WITH THE MODEL'S OWN TOKENS IN THEM, because that is what the column
        // holds: the explainer is told to cite every figure as a
        // `[[placeholder]]` and `explanationJson` stores the string it wrote.
        // Token-free prose here is why this block printed a literal
        // `[[flag_1_week_share]]` until 2026-09-16 with a green suite. The
        // last sentence cites a key no table holds and must never be rendered.
        sentences: [
          'Objections ran at [[flag_1_week_share]] of this update against [[flag_1_baseline_share]] across the three months behind it.',
          'Most of the pushback sits under one creator’s fitting video, where commenters compare socket prices rather than sockets.',
          'The objection is about cost, not about comfort — the comfort talk in the same thread runs the other way.',
          'A sentence citing [[a_key_no_table_holds]] is dropped whole.',
        ],
        explanationModel: 'gpt-4.1-mini',
        quotes: [
          quote('ev-1', 'Insurance covered nothing and the quote was more than my car', 'YouTube · 9 Sep'),
          quote('ev-2', 'Love the socket, hate what they charge for a liner', 'TikTok · 11 Sep'),
        ],
        rank: 1,
      }],
    },
    subjects: ossurSubjects(),
    rising: {
      audience: 'industry-other',
      month: '2026-09-01',
      monthOf: 398,
      // ONE of the thirty banded cleared, and one is printed — so the note
      // under the rows is about the other twenty-nine, every one of which was
      // compared and came back inside its band.
      moved: 1,
      pooled: 30,
      pooledBaseline: true,
      unread: null,
      rows: [{
        id: 'reg-1',
        label: 'Socket comfort after a long day',
        month: { k: 44, n: 398 },
        baseline: { k: 46, n: 928 },
        verdict: risingVerdict,
        addedVideos: 18,
        quotes: [quote('ev-3', 'Third socket this year and the first one I can wear all day', 'YouTube · 10 Sep')],
      }],
    },
    cameIn: {
      window: OSSUR_WINDOW,
      // The share is `analysed` over the update's own analysed total (360 + 96
      // + 52 = 508) and the comments are the windowed read's per-audience
      // figure, which sums to `windowComments` below — both sides carried, no
      // bare percentage anywhere.
      rows: [
        { audience: 'industry-other', label: 'The category', gathered: 429, analysed: 360, platformMix: { youtube: 210, instagram: 85, tiktok: 45, reddit: 20 }, contribution: { videos: 144, of: 398 }, share: { k: 360, n: 508 }, comments: 3600 },
        { audience: 'competitor:Ottobock', label: 'Ottobock', gathered: 137, analysed: 96, platformMix: { youtube: 52, instagram: 30, tiktok: 12, reddit: 2 }, contribution: { videos: 47, of: 118 }, share: { k: 96, n: 508 }, comments: 1100 },
        { audience: 'client', label: 'Your own brand', gathered: 52, analysed: 52, platformMix: { youtube: 33, instagram: 12, tiktok: 7 }, contribution: { videos: 14, of: 96 }, share: { k: 52, n: 508 }, comments: 434 },
      ],
      gathered: 618,
      analysed: 508,
      windowComments: 5134,
      contribution: { videos: 205, of: 449 },
      crossesInto: null,
      newThemes: [
        { id: 'reg-9', label: 'Liner cost after the first year', videos: 14 },
        { id: 'reg-10', label: 'Waiting on a refit appointment', videos: 11 },
      ],
      newThemesSeen: 303,
      rivals: [{
        audience: 'competitor:Ottobock',
        label: 'Ottobock',
        byThem: 0,
        aboutThem: 92,
        // The sum over the two posts named, and 92 posts in all — never a
        // rival's whole week, which nothing here counted.
        comments: 998,
        postsTotal: 92,
        postsConsidered: 6,
        // A POST HAS NO TITLE COLUMN, so this is what a post IS: the platform,
        // the account, the day it went up, the caption cut to a line, the link.
        // Össur captures none of Ottobock's own posts, so both of these are
        // posts ABOUT them — which is why neither account is the rival's.
        posts: [
          { platform: 'youtube', account: 'PhysioWithPriya', postedOn: '2026-09-08', caption: 'Testing the Ottobock C-Leg 4 on stairs — six weeks in', href: 'https://www.youtube.com/watch?v=ott1', comments: 610 },
          { platform: 'instagram', account: 'amputee.life', postedOn: '2026-09-11', caption: 'Why I switched sockets again, and what it cost', href: 'https://www.instagram.com/p/ott2', comments: 388 },
        ],
        ownPostsUnread: true,
      }],
      quotes: [
        { subject: 'Comfort', ...quote('ev-4', 'The new liner finally stopped the rubbing', 'YouTube · 11 Sep') },
      ],
      quotesTotal: 41,
      quotesUnread: null,
      playbookHref: '/dashboard/market',
    },
    sales: {
      window: { from: OSSUR_WINDOW.from, to: OSSUR_WINDOW.to },
      videos: 205,
      grouping: 'subject',
      objections: [
        { id: 's2', label: 'Price and cover', videos: 96, quotes: [quote('ev-5', 'Insurance covered nothing and the quote was more than my car', 'YouTube · 9 Sep · under a category video')] },
        { id: 's3', label: 'Durability', videos: 38, quotes: [] },
        { id: 's4', label: 'Fit and refit waits', videos: 12, quotes: [] },
      ],
      praise: [quote('ev-6', 'Two winters on this socket and it still fits like day one', 'TikTok · 11 Sep · under a category video')],
      // Two shown of seven counted — the shape the block has to print
      // honestly, and the shape a slice-then-count made invisible.
      switching: [quote('ev-7', 'Moving off Ottobock after the last refit', 'Reddit · 12 Sep · under a Ottobock video')],
      switchingTotal: 7,
      rivalComplaints: [
        { id: 'competitor:Ottobock', label: 'Ottobock', videos: 21, quotes: [quote('ev-8', 'Their service booking is a nightmare', 'YouTube · 10 Sep · under a Ottobock video')] },
      ],
      brief: { href: '/dashboard/reports', label: 'Open the sales brief →' },
      unread: null,
    },
    worked: {
      // THE CLASSIFIER'S OWN VOCABULARY, through `workedLabel` — not invented
      // labels. `classified_type` and `hook_style` are fixed enums
      // (lib/pipeline/schemas.ts), and one of the hooks a live tenant carries
      // is `trend-riding`, which humanises straight into a direction word. The
      // fixture said `direct_question` and `before_after`, which exist nowhere,
      // so a D1 violation shipped on production with a green suite.
      formats: [
        { label: 'Promotional', videos: 128, engagement: 3.8, multiple: 1.8 },
        { label: 'Educational', videos: 71, engagement: 3.1, multiple: 1.4 },
        { label: 'Review', videos: 53, engagement: 5.2, multiple: 2.4 },
      ],
      hooks: [
        { label: 'Question', videos: 181, engagement: 4.1, multiple: 1.9 },
        { label: 'Riding what is current', videos: 97, engagement: 3.6, multiple: 1.7 },
        { label: 'Before and after', videos: 44, engagement: 3.3, multiple: 1.5 },
      ],
      rated: 331,
      excluded: ['Reddit'],
      unread: null,
    },
    coverage: {
      line: coverageLine({
        brand: 'Össur',
        update: '2026-09-13T06:26:49.308Z',
        previous: '2026-09-06T12:41:40.114Z',
        window: OSSUR_WINDOW,
        platformMix: { youtube: 295, instagram: 127, tiktok: 64, reddit: 22 },
        videos: 205,
        comments: 5134,
      }),
      privacy: PRIVACY_LINE,
    },
    // Össur's four months carry a clustering key throughout, so the reading
    // layer has no caveat to make about them.
    notes: [],
    laterLine: LATER_LINE,
  }
}

export function thinFixture(): WeekData {
  const baseline = {
    denominator: 'every audience together',
    monthsClearing: 1,
    monthsRead: 3,
    required: 3,
    ready: false,
    label: 'baseline forming — 1 of 3 months',
  }
  return {
    brand: 'Sealand',
    update: {
      id: 'cb0d97b2-7d9b-451d-b427-721a6dcade71',
      date: '2026-09-10T07:02:10.201Z',
      previous: '2026-09-09T12:08:47.213Z',
      status: 'completed',
    },
    window: SEALAND_WINDOW,
    month: '2026-09-01',
    monthStatus: 'filling',
    readingAt: '2026-09-16T09:00:00.000Z',
    windowVideos: 655,
    unusual: {
      state: 'baseline_forming',
      note: null,
      flags: [],
      flaggedCount: 0,
      setSize: null,
      tested: null,
      baseline,
      startsWith: '2026-11-01',
      updateVideos: null,
      medianVideos: null,
      // FOUR UPDATES, NOT THIRTEEN, AND THE NOTE SAYS SO — a monthly cadence
      // whose every window crosses a month boundary, so every point carries two
      // contributions. The band is drawn on the three behind the newest, which
      // is the minimum; the check itself still cannot speak, and the series is
      // drawn anyway, because "here is what we read" is the honest half of
      // "baseline forming".
      // SEALAND'S OWN THIRTEEN, measured the same way and the same day: FIVE of
      // the twelve behind the newest found nothing, so the band is drawn on
      // five points and the legend says so. The newest window is thirty days —
      // which is why nothing on this page may call it "a week" — and the
      // twelve behind it are seven.
      series: seriesOf({
        counts: [0, 288, 0, 0, 425, 0, 0, 197, 560, 0, 0, 176, 1098],
        endsAt: '2026-09-10T07:02:10.201Z',
        days: [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 30],
        monthOf: { '2026-06-01': 402, '2026-07-01': 466, '2026-08-01': 512, '2026-09-01': 475 },
        windowShare: 655 / 1098,
        // A CROSSING WINDOW CARRIES BOTH MONTHS, each with its own clipped
        // numerator: 394 of September is what §4 prints, and 260 of August is
        // the part §4's crossing line says it is leaving out. The two comment
        // counts add to the 9,331 §4 states, because comments do add across
        // disjoint spans and videos do not.
        newestSpans: {
          '2026-08-01': { videos: 260, comments: 5900 },
          '2026-09-01': { videos: 394, comments: 3431 },
        },
      }),
    },
    subjects: {
      month: '2026-09-01',
      unread: 'No subjects are recorded for this workspace yet. Name what you care about in Settings and this update’s videos are counted against them from the next reading.',
      rows: [],
      // NO ROWS MEANS NO LEAD, never "0 of 0 ran above typical": a sentence
      // counting comparisons nobody drew is the exact failure `unread` exists
      // to keep this block out of.
      lead: null,
    },
    rising: {
      audience: 'industry-other',
      month: '2026-09-01',
      monthOf: 452,
      moved: 0,
      pooled: 30,
      pooledBaseline: true,
      unread: null,
      rows: [],
    },
    cameIn: {
      window: SEALAND_WINDOW,
      rows: [
        { audience: 'industry-other', label: 'The category', gathered: 933, analysed: 150, platformMix: { youtube: 80, instagram: 40, tiktok: 25, reddit: 5 }, contribution: null, share: { k: 150, n: 253 }, comments: 6000 },
        { audience: 'competitor:Freitag', label: 'Freitag', gathered: 138, analysed: 71, platformMix: { instagram: 45, tiktok: 20, youtube: 6 }, contribution: null, share: { k: 71, n: 253 }, comments: 2400 },
        { audience: 'competitor:Cotopaxi', label: 'Cotopaxi', gathered: 27, analysed: 32, platformMix: { instagram: 20, tiktok: 12 }, contribution: null, share: { k: 32, n: 253 }, comments: 931 },
      ],
      gathered: 1098,
      analysed: 253,
      windowComments: 9331,
      contribution: { videos: 394, of: 475 },
      crossesInto: '2026-08-01',
      newThemes: [],
      newThemesSeen: 592,
      rivals: [
        {
          audience: 'competitor:Freitag',
          label: 'Freitag',
          byThem: 44,
          aboutThem: 94,
          comments: 1130,
          postsTotal: 138,
          postsConsidered: 6,
          posts: [
            { platform: 'instagram', account: 'freitag', postedOn: '2026-08-29', caption: 'F41 Hawaii Five-0 — every bag cut from a different truck', href: 'https://www.instagram.com/p/fre1', comments: 742 },
            { platform: 'tiktok', account: 'freitag', postedOn: '2026-09-02', caption: 'Cutting the tarp: how one bag becomes another', href: 'https://www.tiktok.com/@freitag/video/fre2', comments: 388 },
          ],
          ownPostsUnread: false,
        },
        {
          audience: 'competitor:Cotopaxi',
          label: 'Cotopaxi',
          byThem: 18,
          aboutThem: 9,
          comments: 120,
          postsTotal: 27,
          postsConsidered: 6,
          // A POST WITH NO CAPTION IS AN EMPTY STRING, not a made-up title:
          // `videos` has no title column and a row that invented one would be
          // the only fabricated field on the page.
          posts: [
            { platform: 'instagram', account: 'cotopaxi', postedOn: '2026-09-04', caption: '', href: 'https://www.instagram.com/p/cot1', comments: 120 },
          ],
          ownPostsUnread: false,
        },
        // POSTS READ, NONE THIS UPDATE. The row the old filter dropped, which
        // is how "Rareform went quiet" reached a reader as silence rather than
        // as a zero — and with no post to name, the table is empty rather than
        // absent.
        { audience: 'competitor:Rareform', label: 'Rareform', byThem: 0, aboutThem: 0, comments: 0, postsTotal: 0, postsConsidered: 0, posts: [], ownPostsUnread: false },
      ],
      quotes: [],
      quotesTotal: null,
      quotesUnread: 'Quotes are counted against your subjects once subjects are recorded for this workspace. Until then this update’s comments are read, grouped and counted — they are simply not yours to name.',
      playbookHref: '/dashboard/market',
    },
    sales: {
      window: { from: SEALAND_WINDOW.from, to: SEALAND_WINDOW.to },
      videos: 655,
      grouping: 'theme',
      objections: [],
      praise: [],
      switching: [],
      switchingTotal: 0,
      rivalComplaints: [],
      brief: { href: '/dashboard/reports', label: 'Open the sales brief →' },
      unread: null,
    },
    worked: {
      formats: [],
      hooks: [],
      rated: 41,
      excluded: ['Reddit'],
      unread: 'Too few of this update’s videos carry an engagement figure to read a format or a hook against the rest.',
    },
    coverage: {
      line: coverageLine({
        brand: 'Sealand',
        update: '2026-09-10T07:02:10.201Z',
        previous: '2026-09-09T12:08:47.213Z',
        window: SEALAND_WINDOW,
        platformMix: { youtube: 426, instagram: 317, tiktok: 158, reddit: 61 },
        videos: 655,
        comments: 9331,
      }),
      privacy: PRIVACY_LINE,
    },
    // ONE SENTENCE FOR A RUN OF MONTHS, never one per bar — what
    // `mergeSeriesNotes` collapses thirty themes' notes into, and what a
    // comparison pooling three months owes its reader.
    notes: [{
      kind: 'clustering_changed',
      text: 'We did not record how themes were grouped for June to August 2026, so those months are not strictly comparable with the ones after them.',
      months: ['2026-06-01', '2026-07-01', '2026-08-01'],
    }],
    laterLine: LATER_LINE,
  }
}
