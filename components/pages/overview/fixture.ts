import { INTERPRETATION_LABEL } from '@/lib/prose/interpret'
import { horizonWindow } from '@/lib/reading/horizon'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, rivalKey } from '@/lib/rivals'
import type { Verdict } from '@/lib/reading/verdicts'
import type { OverviewData } from '@/lib/pages/overview'
import { MOVES_MASTHEAD, MOVES_EMPTY, MOVES_UNLOCK, RIVALS_CAVEAT, fillingLine } from '@/lib/pages/overview'

// The Overview's block fixtures (Phase 1 WP11).
//
// TWO STATES, BOTH REAL. `overviewFixture()` is a month that read — the shape
// the mock draws — and `refusedFixture()` is the state PRODUCTION is in today:
// M3–M7 unapplied, so the subjects, kinds, mood, attention, standings, moves
// and the "at this point last month" tick all come back as sentences saying
// what is not recorded yet. Every block is rendered in both, in all three
// modes, because the refusal is the reading a client sees first.

const REAL_MONTH = '2026-09-01'
const NOW = '2026-09-18T09:00:00.000Z'

export const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  objectKind: 'theme',
  objectId: 't1',
  objectLabel: 'Will it survive a wet commute',
  audience: INDUSTRY_AUDIENCE,
  window: { kind: 'month', from: REAL_MONTH, to: '2026-10-01' },
  basis: { from: '2026-08-01', to: REAL_MONTH },
  value: { k: 130, n: 1388 },
  baseline: { k: 80, n: 1200 },
  changePts: 2.6,
  bandPts: 1.8,
  state: 'moved',
  flags: [],
  ...over,
})

export function overviewFixture(over: Partial<OverviewData> = {}): OverviewData {
  const window = horizonWindow('this_month', NOW, '2026-06-01')
  const lead = verdict()
  const bar = {
    month: REAL_MONTH,
    status: 'filling' as const,
    daysIn: 18,
    updates: 3,
    updateDates: ['6 Sep', '13 Sep'],
    videos: 2359,
    expected: 2240,
    atLastMonth: 2044,
    atLastMonthKnown: true,
    thin: false,
    line: '',
    readings: 3,
    horizonLabel: 'This month',
  }
  bar.line = fillingLine(bar)

  return {
    brand: 'Sealand',
    month: REAL_MONTH,
    monthStatus: 'filling',
    readingAt: NOW,
    horizon: 'this_month',
    window,
    axis: window.months,
    substrate: 'seeded',
    notes: [],
    bar,
    sentence: {
      lead,
      body: 'Will it survive a wet commute came up in [[t1_share]] of the category’s videos this month — [[t1_videos]] of [[t1_of]] videos.',
      figures: {
        t1_share: { value: 9.4, unit: 'pct', label: 'share of the month' },
        t1_videos: { value: 130, unit: 'videos', label: 'videos that raised it' },
        t1_of: { value: 1388, unit: 'videos', label: 'videos read for the category' },
      },
      anomaly: {
        label: 'Zips failing after a year',
        objectKind: 'theme',
        weekStart: '2026-09-08',
        weekEnd: '2026-09-15',
        k: 21,
        n: 310,
        changePts: 4.4,
        bandPts: 2.1,
        denominator: 'videos',
        sentences: ['People are describing the same failure at the same age.'],
        quote: { ref: 'c:1', text: 'Zip gave out after eleven months.', lang: 'en', english: null },
        href: '/dashboard/week',
      },
      interpretation: {
        slot: 'interpretation_monthly',
        label: INTERPRETATION_LABEL,
        sentences: ['Durability has become the question of the season, and it is being asked under other brands’ videos.'],
        quotes: [{ ref: 'c:1' }],
        fallback: true,
        reason: 'no_model',
        note: 'We wrote this read ourselves this month.',
        scrub: { text: '', dropped: 0, droppedDigits: 0, droppedDirection: 0, flaggedDirection: 0, leaked: false },
      },
      ledger: {
        id: 'r1',
        title: 'Lead with repairability, not recycling, in the next campaign',
        monthsOld: 3,
        status: 'in_progress',
        statusLabel: 'Working on it',
        decidedAt: '2026-09-02',
        href: '/dashboard/market',
      },
      voices: [
        { quote: { ref: 'e:1', text: 'Three winters on the bike and the seams are still perfect.', lang: 'en', english: null }, cite: 'tiktok · 14 Sep · under a video we read' },
        { quote: { ref: 'e:2', text: 'Dit het twee winters gehou.', lang: 'af', english: 'It held through two winters.' }, cite: 'tiktok · 11 Sep · under a video we read' },
      ],
      verdicts: [lead],
    },
    subjects: {
      state: 'ready',
      rows: [
        {
          id: 's1',
          label: 'Durability',
          you: { k: 26, n: 84, pct: 31, verdict: verdict({ objectKind: 'subject', objectId: 's1', objectLabel: 'Durability', audience: CLIENT_AUDIENCE, state: 'too_little_data', changePts: null, bandPts: null, value: { k: 26, n: 84 } }), observed: true },
          rival: { k: 62, n: 142, pct: 44, verdict: null, observed: true },
          category: { k: 305, n: 1388, pct: 22, verdict: verdict({ objectKind: 'subject', objectId: 's1', objectLabel: 'Durability', value: { k: 305, n: 1388 }, changePts: 3.2, bandPts: 2.1 }), observed: true },
          direction: 'growing',
          spark: [null, 18, 19, 20, 21, 22],
          href: '/dashboard/subjects?item=s1',
        },
        {
          id: 's2',
          label: 'Price',
          you: { k: 20, n: 84, pct: 24, verdict: null, observed: true },
          rival: { k: 58, n: 142, pct: 41, verdict: null, observed: true },
          category: { k: 375, n: 1388, pct: 27, verdict: verdict({ objectKind: 'subject', objectId: 's2', objectLabel: 'Price', value: { k: 375, n: 1388 }, changePts: -3.1, bandPts: 2.1 }), observed: true },
          direction: 'fading',
          spark: [30, 29, 29, 28, 28, 27],
          href: '/dashboard/subjects?item=s2',
        },
      ],
      candidates: [],
      rivalLabel: 'Freitag',
      categoryLabel: 'The category',
      note: 'Your side reads "too few to compare" on 84 videos — the category column carries the month.',
    },
    category: {
      audience: INDUSTRY_AUDIENCE,
      label: 'The category',
      denominator: 1388,
      kinds: [
        { kind: 'question', label: 'Questions', videos: 470, denominator: 1388, pct: 33.9, reddit: 180 },
        { kind: 'praise', label: 'Praise', videos: 389, denominator: 1388, pct: 28, reddit: 12 },
        { kind: 'pain_point', label: 'Complaints', videos: 264, denominator: 1388, pct: 19, reddit: 30 },
      ],
      kindVerdicts: {
        question: verdict({ objectKind: 'kind', objectId: 'question', objectLabel: 'Questions', value: { k: 470, n: 1388 }, changePts: 3.1, bandPts: 2.2 }),
        praise: verdict({ objectKind: 'kind', objectId: 'praise', objectLabel: 'Praise', state: 'no_clear_change', changePts: 0.4, bandPts: 2.2 }),
        pain_point: null,
      },
      reddit: { kinds: ['question', 'objection'], videos: 590, reddit: 200, pct: 33.9, exact: false },
      kindsNote: null,
      growing: [
        { id: 't1', label: 'Will it survive a wet commute', k: 130, n: 1388, pct: 9.4, verdict: verdict(), direction: 'growing', isNew: false },
        { id: 't2', label: 'Zips failing after a year', k: 71, n: 1388, pct: 5.1, verdict: verdict({ objectId: 't2', objectLabel: 'Zips failing after a year', changePts: 1.9, value: { k: 71, n: 1388 } }), direction: null, isNew: true },
      ],
      fading: [
        { id: 't3', label: 'Made from truck tarps', k: 99, n: 1388, pct: 7.1, verdict: verdict({ objectId: 't3', objectLabel: 'Made from truck tarps', changePts: -2.5, value: { k: 99, n: 1388 } }), direction: 'fading', isNew: false },
      ],
      moversNote: null,
      mood: {
        shares: [
          { mood: 'positive', label: 'Positive', videos: 678, judged: 1112, pct: 61 },
          { mood: 'mixed', label: 'Mixed', videos: 20, judged: 1112, pct: 1.8 },
          { mood: 'neutral', label: 'Neutral', videos: 214, judged: 1112, pct: 19.2 },
          { mood: 'negative', label: 'Negative', videos: 200, judged: 1112, pct: 18 },
        ],
        judged: 1112,
        framingPct: 9.7,
        verdict: verdict({ objectKind: 'mood', objectId: 'negative', objectLabel: 'Negative', state: 'no_clear_change', changePts: 2, bandPts: 2.3, value: { k: 200, n: 1112 } }),
      },
      moodNote: null,
      attention: {
        // The line's own calendar: every month from the panel's first reading
        // to this one, gaps included.
        axis: ['2026-07-01', '2026-08-01', REAL_MONTH],
        months: [
          { month: '2026-07-01', comments: 50300, videos: 900 },
          { month: '2026-08-01', comments: 46000, videos: 880 },
          { month: REAL_MONTH, comments: 41200, videos: 850 },
        ],
        panel: {
          id: 'p1',
          client_id: 'c',
          frozen_at: '2026-09-03T00:00:00.000Z',
          cutoff: '2026-04-01',
          accounts: [],
          reason: 'tracking_change',
        } as unknown as NonNullable<OverviewData['category']['attention']>['panel'],
        verdict: null,
      },
      attentionNote: null,
    },
    rivals: {
      rows: [
        {
          audience: rivalKey('Freitag'),
          label: 'Freitag',
          role: 'rival',
          observed: true,
          attention: { k: 6200, n: 41200, pct: 15 },
          content: { k: 150, n: 1000, pct: 15 },
          attentionVerdict: verdict({ objectKind: 'rival', objectId: rivalKey('Freitag'), objectLabel: 'Freitag', changePts: 3, bandPts: 1.8, value: { k: 6200, n: 41200 } }),
          contentVerdict: null,
          ownPosts: null,
          raisedMost: { label: 'Does the tarp smell', k: 41, n: 142, pct: 28.9 },
          retiredAt: null,
        },
        {
          audience: CLIENT_AUDIENCE,
          label: 'Sealand',
          role: 'client',
          observed: true,
          attention: { k: 2400, n: 41200, pct: 6 },
          content: { k: 70, n: 1000, pct: 7 },
          attentionVerdict: verdict({ objectKind: 'audience', objectId: CLIENT_AUDIENCE, objectLabel: 'Sealand', state: 'no_clear_change', changePts: 1, bandPts: 1.8, value: { k: 2400, n: 41200 } }),
          contentVerdict: null,
          ownPosts: null,
          raisedMost: null,
          retiredAt: null,
        },
      ],
      standingsNote: null,
      dualMention: 41,
      caveat: RIVALS_CAVEAT,
    },
    moves: {
      rows: [
        { id: 'm1', title: 'Advanced technology', kind: 'subject', declaredAt: '2026-09-14', line: 'Advanced technology · tracked 14 Sep · first scoring lands with the October reading.' },
      ],
      unlock: MOVES_UNLOCK,
      masthead: MOVES_MASTHEAD,
      empty: null,
      recorded: true,
    },
    record: {
      line: '3 updates · 2,359 videos (TikTok 38% · YouTube 29% · Instagram 21% · Reddit 12%) · 27% of what was said on camera was not in English · 1 tracking change',
      lines: [
        '3 updates delivered, 2026-09-06 to 2026-09-13, longest gap 7 days.',
        '2,359 videos carried conversation in this window — TikTok 38% · YouTube 29% · Instagram 21% · Reddit 12%.',
        '41 videos of your own named a tracked rival as well as you.',
        'Nothing about what we track changed in this window.',
      ],
      href: '/dashboard/settings',
      freezesOn: '2026-10-31',
      refused: 2,
      refusals: [
        { state: 'too_little_data' as const, reason: null },
        { state: 'refused' as const, reason: 'clustering_changed' as const },
      ],
    },
    ...over,
  }
}

/** Production today: M3–M7 unapplied, so five of the seven blocks answer with a
 *  sentence instead of a number. */
export function refusedFixture(): OverviewData {
  const base = overviewFixture()
  const bar = {
    ...base.bar,
    atLastMonth: null,
    atLastMonthKnown: false,
    line: '',
  }
  bar.line = fillingLine(bar)
  return {
    ...base,
    bar,
    sentence: {
      ...base.sentence,
      anomaly: null,
      ledger: null,
      voices: [],
    },
    subjects: {
      state: 'not_recorded',
      rows: [],
      candidates: [],
      rivalLabel: 'Freitag',
      categoryLabel: 'The category',
      note: null,
    },
    category: {
      ...base.category,
      kinds: [],
      kindVerdicts: {},
      reddit: null,
      kindsNote: 'What kind of thing is being said is not recorded month by month for this workspace yet.',
      mood: null,
      moodNote: 'How the month was received is not recorded month by month for this workspace yet.',
      attention: null,
      attentionNote: 'No panel has been frozen for this workspace yet, so attention is not read.',
    },
    rivals: {
      ...base.rivals,
      rows: base.rivals.rows.map((r) => ({
        ...r,
        observed: false,
        attention: null,
        content: null,
        attentionVerdict: null,
        contentVerdict: null,
      })),
      standingsNote:
        'How much attention each brand drew is not recorded month by month for this workspace yet — what is printed here is what was raised under their content.',
    },
    moves: {
      ...base.moves,
      rows: [],
      empty: MOVES_EMPTY,
      recorded: true,
    },
  }
}
