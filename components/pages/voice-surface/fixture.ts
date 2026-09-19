import { prevalenceTier } from '@/lib/calibration'
import { horizonWindow } from '@/lib/reading/horizon'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, rivalKey } from '@/lib/rivals'
import type { Verdict } from '@/lib/reading/verdicts'
import type { MonthPoint } from '@/lib/reading/series'
import type { Mover } from '@/lib/pages/overview'
import type { VoiceSurfaceData } from '@/lib/pages/voice-surface'
import { PERSONA_VIDEO_FLOOR, onCameraScope, voiceSurfaceHref } from '@/lib/pages/voice-surface'
import { methodFixture, methodRefusedFixture, methodRefusedRecordFixture, recordBandFixture } from '@/lib/test/method-fixture'
import { moodShares } from '@/lib/reading/mood'

// Voice's block fixtures (Phase 1 WP13).
//
// TWO STATES, BOTH REAL, and the second one is the one a client sees today.
// `voiceFixture()` is a month that read — the shape the mock's Voice artboard
// draws. `refusedVoiceFixture()` is the state PRODUCTION is in: M2 and M5
// unapplied, so the kind ladder, the tone line and the re-read mark all come
// back as sentences saying what is not recorded, and Pass E has written no
// profile for the cast. Every block is rendered in both, in all three modes,
// because a page that only renders when everything is there is a page nobody
// has checked.

const MONTH = '2026-09-01'
const PREV = '2026-08-01'
const NOW = '2026-09-18T09:00:00.000Z'

export const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  objectKind: 'theme',
  objectId: 't1',
  objectLabel: 'Will it survive a wet commute',
  audience: INDUSTRY_AUDIENCE,
  window: { kind: 'month', from: MONTH, to: '2026-10-01' },
  basis: { from: PREV, to: MONTH },
  value: { k: 130, n: 1388 },
  baseline: { k: 82, n: 1200 },
  changePts: 2.6,
  bandPts: 1.8,
  state: 'moved',
  flags: [],
  ...over,
})

/**
 * One mover row, with a verdict that is a verdict OF THAT ROW.
 *
 * THE OVERRIDE IS MERGED, NEVER SUBSTITUTED, and that is the whole point. A
 * caller passing a whole `verdict({ objectId: 't2', changePts: 1.9 })` replaced
 * the row's verdict with one carrying the DEFAULT label and the DEFAULT counts,
 * so t2 printed "Zips failing after a year · 5.1% · 71 of 1,388" while its own
 * verdict said "Will it survive a wet commute · 9.4% · 130 of 1,388". In
 * production the two come off one reading and agree; in a fixture they diverged
 * silently, and the record written from the verdicts is append-only — the render
 * tier is the only thing between a mismatch and a permanently wrong statement.
 * So the identity and the two sides come from the row and only the rest is
 * overridable.
 */
export const mover = (
  over: Omit<Partial<Mover>, 'verdict'> & { id: string; label: string; verdict?: Partial<Verdict> },
): Mover => {
  const { verdict: said, ...row } = over
  const base = { k: 130, n: 1388, pct: 9.4, direction: null, isNew: false, ...row }
  return {
    ...base,
    verdict: verdict({
      objectId: over.id,
      objectLabel: over.label,
      value: { k: base.k, n: base.n },
      ...said,
    }),
  }
}

const point = (month: string, k: number | null, videos: number | null): MonthPoint => ({
  month,
  state: k == null ? 'missing' : month === MONTH ? 'filling' : 'frozen',
  videos,
  comments: videos == null ? null : videos * 7,
  k,
  kComments: k == null ? null : k * 3,
  pct: k == null || videos == null || videos === 0 ? null : Math.round((k / videos) * 1000) / 10,
  audience: INDUSTRY_AUDIENCE,
  status: month === MONTH ? 'filling' : 'frozen',
  origin: 'live',
  readAt: NOW,
  runId: 'run-1',
  frozenAt: null,
  clusteringKey: 'k1',
  labels: [],
})

export function voiceFixture(over: Partial<VoiceSurfaceData> = {}): VoiceSurfaceData {
  const window = horizonWindow('last_3', NOW, '2026-06-01')
  const axis = window.months
  const params = { audience: INDUSTRY_AUDIENCE }
  // EVERY ROW CARRIES ITS OWN BASELINE, since wave 2 renders it. The default
  // in `verdict()` is t1's, and three rows sharing one baseline printed "Aug
  // 6.8% of 1,200" under four different September readings — a fixture saying
  // the same thing about four themes. The k's are the artboard's own August
  // shares over that month's 1,200 category videos.
  const growing = [
    mover({ id: 't1', label: 'Will it survive a wet commute', k: 130, pct: 9.4, direction: 'growing' }),
    mover({ id: 't2', label: 'Zips failing after a year', k: 71, pct: 5.1, verdict: { changePts: 1.9, baseline: { k: 38, n: 1200 } } }),
  ]
  const fading = [
    mover({ id: 't3', label: 'Made from truck tarps', k: 99, pct: 7.1, verdict: { changePts: -2.5, baseline: { k: 115, n: 1200 } } }),
  ]

  return {
    brand: 'Sealand',
    month: MONTH,
    monthStatus: 'filling',
    readingAt: NOW,
    horizon: 'last_3',
    window,
    axis,
    substrate: 'seeded',
    notes: [],
    params,
    audience: {
      options: [
        { audience: CLIENT_AUDIENCE, label: 'Your own brand', videos: 3, comments: 27, thin: true, observed: true, retiredAt: null, selected: false, href: voiceSurfaceHref(params, { audience: CLIENT_AUDIENCE }) },
        { audience: rivalKey('Cotopaxi'), label: 'Cotopaxi', videos: 27, comments: 237, thin: true, observed: true, retiredAt: null, selected: false, href: voiceSurfaceHref(params, { audience: rivalKey('Cotopaxi') }) },
        { audience: rivalKey('Poler'), label: 'Poler', videos: null, comments: null, thin: true, observed: false, retiredAt: '2026-09-09', selected: false, href: voiceSurfaceHref(params, { audience: rivalKey('Poler') }) },
        { audience: INDUSTRY_AUDIENCE, label: 'The category', videos: 1388, comments: 9397, thin: false, observed: true, retiredAt: null, selected: true, href: voiceSurfaceHref(params, { audience: INDUSTRY_AUDIENCE }) },
      ],
      selected: INDUSTRY_AUDIENCE,
      label: 'The category',
      videos: 1388,
      comments: 9397,
      thin: false,
      platformMix: [
        { platform: 'tiktok', label: 'TikTok', videos: 528, pct: 38 },
        { platform: 'youtube', label: 'YouTube', videos: 403, pct: 29 },
        { platform: 'instagram', label: 'Instagram', videos: 291, pct: 21 },
        { platform: 'reddit', label: 'Reddit', videos: 166, pct: 12 },
      ],
      kinds: [
        { kind: 'question', label: 'Asking how it works', videos: 472, denominator: 1388, pct: 34, reddit: 110 },
        { kind: 'pain_point', label: 'Hitting a problem', videos: 264, denominator: 1388, pct: 19, reddit: 40 },
        { kind: 'praise', label: 'Saying it worked', videos: 389, denominator: 1388, pct: 28, reddit: 12 },
      ],
      kindVerdicts: { question: verdict({ objectKind: 'kind', objectId: 'question', objectLabel: 'Asking how it works', changePts: 1.4 }) },
      kindsNote: null,
      reddit: { kinds: ['question', 'objection'], videos: 640, reddit: 133, pct: 20.8, exact: false },
      replies: { comments: 9397, replies: 1972, pct: 21, reddit: 812 },
      repliesNote: 'Counted across every audience: a comment carries no audience of its own, and replies are materially a Reddit signal.',
    },
    movers: {
      growing,
      fading,
      flat: [mover({ id: 't4', label: 'Airline carry-on fit', k: 42, pct: 3, verdict: { state: 'no_clear_change', changePts: 0.3, baseline: { k: 32, n: 1200 } } })],
      newcomers: [mover({ id: 't5', label: 'Second-hand resale value', k: 26, pct: 1.9, isNew: true, verdict: { state: 'too_little_data', changePts: null, bandPts: null } })],
      goneQuiet: [{ id: 't6', label: 'Festival season packs', lastHeard: '2026-06-01' }],
      shown: 6,
      expanded: false,
      expandHref: voiceSurfaceHref(params, { movers: 'all' }),
      note: null,
      rereadNote: 'Whether a theme’s members were re-read this month is not recorded here yet, so a change that is really a re-reading cannot be marked.',
    },
    theme: {
      state: 'ready',
      id: 't1',
      label: 'Will it survive a wet commute',
      description: 'Buyers ask whether the bag keeps a laptop dry on a daily commute.',
      audience: INDUSTRY_AUDIENCE,
      audienceLabel: 'The category',
      k: 130,
      n: 1388,
      pct: 9.4,
      // THE LADDER'S ANSWER, NOT A WORD TYPED BESIDE THE NUMBERS. Written by
      // hand as `'widespread'`, the chip in the artboard's most prominent slot
      // read "Widespread · 130 of 1,388 videos" — 9.4%, beside a glossary that
      // defines Widespread as "at least 15%". `loadVoiceSurface` calls
      // `prevalenceTier` and can never produce that pairing, so the title row
      // had never been seen in its shipping state and this port's fidelity
      // argument was made against a render production cannot reach. The fixture
      // calls the function the loader calls, so the word and the counts cannot
      // drift apart again — including in the refused arm, which spreads this
      // object and re-cuts k and n (34 of 388 = 8.8%, also `recurring`).
      prevalence: prevalenceTier(130, 1388),
      verdict: verdict(),
      direction: 'growing',
      firstHeard: '2026-07-01',
      firstHeardOnAxis: true,
      monthsSeen: 3,
      monthsDrawn: axis.length,
      axis,
      points: [point('2026-07-01', 71, 1200), point(PREV, 82, 1200), point(MONTH, 130, 1388)],
      tone: {
        // ALL FOUR MOODS, FROM THE REAL FUNCTION. The fixture listed three, in
        // an order `moodShares` does not produce and without `mixed` ("Both
        // ways") at all — so the fourth segment, and the two-row legend four
        // segments produce at this width, had never been rendered or reviewed
        // although production returns them on every judged month. The counts
        // balance, which is what `moodCountsBalance` says a real row does.
        shares: moodShares({ judged: 1112, positive: 678, mixed: 111, neutral: 122, negative: 201 }),
        judged: 1112,
        // THE MOOD VERDICT'S TWO SIDES ARE JUDGED VIDEOS, not the theme's. It
        // inherited the theme's 130-of-1,388 and its 82-of-1,200, so the block
        // printed the cold share's baseline as a count of a different thing.
        verdict: verdict({
          objectKind: 'mood', objectId: 'negative', objectLabel: 'Cold', state: 'no_clear_change', changePts: 2,
          value: { k: 201, n: 1112 }, baseline: { k: 168, n: 1050 },
        }),
      },
      toneNote: null,
      // ONE POPULATION, ONE NUMBER. `onCameraOf` and `quotesOf` are both
      // `themes.evidence_count` in the loader (voice-surface.ts, the same
      // `themeRow.evidence_count` two lines apart), so they are ALWAYS equal;
      // written as 120 against 182 the block printed two denominators for one
      // population three inches apart, in a state no production read can
      // reach. And the sentence comes from `onCameraScope` rather than being
      // typed, so the fixture cannot say something the loader would not.
      onCamera: onCameraScope(17, 182),
      onCameraSaid: 17,
      onCameraOf: 182,
      // SIX, WHICH IS WHAT `THEME_QUOTES` ALLOWS AND WHAT THE ARTBOARD DRAWS.
      // Three filled one row of the three-column grid, so the second row —
      // its gutter, its baseline against the cite block, and the height the
      // tile comes out at — was in no screenshot anybody reviewed.
      quotes: [
        { ref: 'e:1', text: 'Three winters on the bike and the seams are still perfect. The zip, less so.' },
        { ref: 'e:2', text: 'I have had this bag through two Cape Town winters and it is the only one that never leaked' },
        { ref: 'e:3', text: 'Nach 14 Monaten ist der Reißverschluss hin', lang: 'de', english: 'After 14 months the zip is done' },
        { ref: 'e:4', text: 'The strap padding is the only reason I still carry it two years in' },
        { ref: 'e:5', text: 'Everyone in the thread says the zip is a known issue on this model' },
        { ref: 'e:6', text: 'Mine soaked through on one cycle home and theirs did not' },
      ],
      // PLATFORM · DATE · WHERE, the artboard's cite, which the page can say
      // now that a quote is joined to the video it was written under. The
      // third is the shape a quote whose video did not resolve still takes,
      // and the last is a quote under a tracked rival's own post.
      quoteCites: [
        'TikTok · 14 Sep · under a category video',
        'TikTok · 11 Sep · a category video, transcript',
        'in the comments',
        'YouTube · 12 Sep · under a category video',
        'Reddit · 8 Sep · under a category video',
        'Instagram · 5 Sep · under a Cotopaxi post',
      ],
      quotePlatforms: ['tiktok', 'tiktok', null, 'youtube', 'reddit', 'instagram'],
      quoteOnScreen: [null, '1 bag. 3 years. 0 regrets', null, null, 'Zip test: 400 cycles, no failure', null],
      quotesOf: 182,
      // A DIFFERENT VIDEO FROM ANY THE QUOTES CAME OUT OF. Quote 2 is cited
      // "TikTok · 11 Sep · a category video, transcript" — an extract of that
      // video's transcript — and this line stood under it carrying the same
      // utterance in a second transcription ("One bag, three years, no
      // regrets." against the nested "1 bag. 3 years. 0 regrets"), which is
      // the state the loader's said-once rule now refuses on both halves.
      spoken: { text: 'It kept a laptop dry through a whole winter of commuting.', cite: 'YouTube · 9 Sep · a category video', href: 'https://example.test/v' },
      // NULL, and that is the ported behaviour: this video's on-screen text is
      // nested under the quote taken FROM that video (`quoteOnScreen`), and the
      // loader drops the loose block-level copy so it is not read as a second
      // piece of evidence.
      onScreen: null,
      withheld: 4,
      conclusionHref: '/dashboard/market?theme=t1',
      videosHref: '/dashboard/videos?theme=t1',
      askHref: '/dashboard/agent?q=x',
      trackRegistryId: 't1',
      search: { q: '', rows: [], total: 0 },
      notes: [],
    },
    cast: {
      state: 'ready',
      personas: [
        {
          key: 'commuter', name: 'The one-bag commuter', oneLiner: 'Carries one bag to work and expects it to last.',
          videos: 527,
          wants: 'durability, laptop fit, one bag for everything',
          blockers: 'price, weight',
          triggers: 'a bag that failed in the rain',
          platformMix: [
            { platform: 'tiktok', label: 'TikTok', videos: 242, pct: 46 },
            { platform: 'youtube', label: 'YouTube', videos: 163, pct: 31 },
          ],
          quote: { ref: 'e:9', text: 'If the strap buckle breaks in two months I am not paying that again' },
          quoteCite: 'one of this group’s own comments',
          selected: true,
          href: voiceSurfaceHref(params, { persona: 'commuter' }),
        },
        // THREE GROUPS, because the block draws three cards abreast and a
        // fixture with one of them checks a third of the layout. The counts
        // deliberately do NOT sum to the month's videos: these groups overlap,
        // which is the fact `overlapNote` states and the reason no share is
        // printed on a card.
        {
          key: 'hiker', name: 'The weekend hiker', oneLiner: 'Walks two days at a time and packs for weather.',
          videos: 374,
          wants: 'waterproofing, strap comfort',
          blockers: 'capacity, airline fit',
          triggers: 'a wet weekend on the trail',
          platformMix: [
            { platform: 'youtube', label: 'YouTube', videos: 165, pct: 44 },
            { platform: 'tiktok', label: 'TikTok', videos: 112, pct: 30 },
            { platform: 'instagram', label: 'Instagram', videos: 67, pct: 18 },
          ],
          quote: { ref: 'e:10', text: 'I have had this bag through two Cape Town winters and it is the only one that never leaked' },
          quoteCite: 'one of this group’s own comments',
          selected: false,
          href: voiceSurfaceHref(params, { persona: 'hiker' }),
        },
        {
          key: 'sceptic', name: 'The sustainability sceptic', oneLiner: 'Wants the recycled claim checked before believing it.',
          videos: 263,
          wants: 'proof of recycled content, repairability',
          blockers: 'greenwashing doubt',
          triggers: 'a recycled-materials claim in an ad',
          platformMix: [
            { platform: 'reddit', label: 'Reddit', videos: 108, pct: 41 },
            { platform: 'youtube', label: 'YouTube', videos: 76, pct: 29 },
            { platform: 'tiktok', label: 'TikTok', videos: 55, pct: 21 },
          ],
          quote: { ref: 'e:11', text: 'I want to believe the recycled sails thing but has anyone actually checked?' },
          quoteCite: 'one of this group’s own comments',
          selected: false,
          href: voiceSurfaceHref(params, { persona: 'sceptic' }),
        },
      ],
      selected: 'commuter',
      population: 3129,
      overlapNote: 'A video can carry more than one group, so these counts overlap and do not add up to a whole.',
      profileDate: '2026-09-13',
      stale: false,
      floorNote: `A group is named only where at least ${PERSONA_VIDEO_FLOOR} videos carry it.`,
      stateNote: 'this month as it stands, never compared with another month',
      empty: null,
    },
    // THE BAND AND THE FOOTNOTE COME OFF ONE RECORD. Hand-written, the band
    // said "27% not in English" and "27% of the comments read were not in
    // English" — the mock's clause, which `howSoundLine` never produces and
    // which lib/reading/method.ts names as two errors in one clause (the
    // period and the subject). With the method footnote mounted at the foot of
    // this page, that put two contradictory sentences about one measure on one
    // screenshot, and the screenshots are the evidence for this port's own
    // D15 claim.
    record: recordBandFixture(),
    method: methodFixture(),
    ...over,
  }
}

/**
 * The state production is in today: M2 and M5 unapplied, no profile written.
 *
 * Every refusal here is a sentence the loader composes, not an empty tile —
 * the kind ladder, the tone line and the cast each say what is not recorded
 * rather than showing a hole or, worse, a zero.
 */
export function refusedVoiceFixture(over: Partial<VoiceSurfaceData> = {}): VoiceSurfaceData {
  const base = voiceFixture()
  return {
    ...base,
    method: methodRefusedFixture('Össur'),
    record: recordBandFixture(methodRefusedRecordFixture()),
    brand: 'Össur',
    audience: {
      ...base.audience,
      // THE SELECTED PILL AND THE ROW IT SELECTS AGREE. The refused state
      // overrode the audience's own counts and left the OPTIONS as the
      // category month's, so the pill read "Category 1,388" beside a row
      // reading "388 videos in this audience" — two numbers for one audience,
      // an inch apart, in the state a client is actually in.
      options: base.audience.options.map((o) => (
        o.audience === INDUSTRY_AUDIENCE ? { ...o, videos: 388, comments: 10534 } : o
      )),
      videos: 388,
      comments: 10534,
      platformMix: [
        { platform: 'tiktok', label: 'TikTok', videos: 144, pct: 37.1 },
        { platform: 'youtube', label: 'YouTube', videos: 106, pct: 27.3 },
        { platform: 'instagram', label: 'Instagram', videos: 72, pct: 18.6 },
        { platform: 'reddit', label: 'Reddit', videos: 66, pct: 17 },
      ],
      kinds: [],
      kindVerdicts: {},
      kindsNote: 'What kind of thing is being said is not recorded month by month for this workspace yet.',
      reddit: null,
      replies: { comments: 10534, replies: 1804, pct: 17.1, reddit: 934 },
    },
    movers: {
      ...base.movers,
      // A NEGATIVE CHANGE BELONGS IN THE ARM THAT SAYS SO. This row sat under
      // "a larger share than last month" printing "▼ 5.1 pts" — the exact
      // failure movers.tsx's header says the one-axis rule ended, preserved in
      // the fixture that is supposed to catch it. Its baseline is its own
      // audience's August, not t1's category month.
      growing: [],
      fading: [mover({ id: 'r1', label: 'Admiration for personal resilience', k: 34, n: 388, pct: 8.8, verdict: { changePts: -5.1, bandPts: 4, baseline: { k: 56, n: 402 } } })],
      flat: [],
      newcomers: [],
      goneQuiet: [],
      note: null,
    },
    theme: {
      ...base.theme,
      id: 'r1',
      label: 'Admiration for personal resilience',
      description: null,
      k: 34,
      n: 388,
      pct: 8.8,
      // RE-CUT, NOT INHERITED. This arm replaces k and n and the tier is a
      // function of both; spread from the month above it would be a word about
      // a different reading. It happens to land on the same rung today, which
      // is exactly why it has to be computed rather than assumed.
      prevalence: prevalenceTier(34, 388),
      direction: null,
      // THE OPEN THEME IS THE ONE MOVER THIS MONTH HAS, so it carries that
      // row's verdict and that row's months. It inherited t1's — a +2.6 on the
      // page's only theme, two blocks under the same theme's −5.1, over a
      // baseline of 1,200 videos in an audience of 388.
      verdict: verdict({
        objectId: 'r1', objectLabel: 'Admiration for personal resilience',
        value: { k: 34, n: 388 }, baseline: { k: 56, n: 402 },
        changePts: -5.1, bandPts: 4,
      }),
      points: [point('2026-07-01', 21, 380), point(PREV, 56, 402), point(MONTH, 34, 388)],
      tone: null,
      toneNote: 'How this audience’s month was received is not recorded month by month for this workspace yet.',
      onCamera: null,
      onCameraSaid: null,
      onCameraOf: null,
      spoken: null,
      onScreen: null,
      notes: ['No video behind this theme carries readable speech or on-screen text.'],
    },
    cast: {
      ...base.cast,
      state: 'not_run',
      personas: [],
      selected: null,
      population: null,
      profileDate: null,
      empty: 'Reading who is talking is not switched on for this workspace yet.',
    },
    ...over,
  }
}
