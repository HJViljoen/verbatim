import { horizonWindow } from '@/lib/reading/horizon'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, rivalKey } from '@/lib/rivals'
import type { Verdict } from '@/lib/reading/verdicts'
import type { MonthPoint } from '@/lib/reading/series'
import type { Mover } from '@/lib/pages/overview'
import type { VoiceSurfaceData } from '@/lib/pages/voice-surface'
import { PERSONA_VIDEO_FLOOR, voiceSurfaceHref } from '@/lib/pages/voice-surface'

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

export const mover = (over: Partial<Mover> & { id: string; label: string }): Mover => ({
  k: 130,
  n: 1388,
  pct: 9.4,
  verdict: verdict({ objectId: over.id, objectLabel: over.label }),
  direction: null,
  isNew: false,
  ...over,
})

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
  const growing = [
    mover({ id: 't1', label: 'Will it survive a wet commute', k: 130, pct: 9.4, direction: 'growing' }),
    mover({ id: 't2', label: 'Zips failing after a year', k: 71, pct: 5.1, verdict: verdict({ objectId: 't2', changePts: 1.9 }) }),
  ]
  const fading = [
    mover({ id: 't3', label: 'Made from truck tarps', k: 99, pct: 7.1, verdict: verdict({ objectId: 't3', changePts: -2.5 }) }),
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
      flat: [mover({ id: 't4', label: 'Airline carry-on fit', k: 42, pct: 3, verdict: verdict({ objectId: 't4', state: 'no_clear_change', changePts: 0.3 }) })],
      newcomers: [mover({ id: 't5', label: 'Second-hand resale value', k: 26, pct: 1.9, isNew: true, verdict: verdict({ objectId: 't5', state: 'too_little_data', changePts: null, bandPts: null }) })],
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
      prevalence: 'widespread',
      verdict: verdict(),
      direction: 'growing',
      firstHeard: '2026-07-01',
      firstHeardOnAxis: true,
      monthsSeen: 3,
      monthsDrawn: axis.length,
      axis,
      points: [point('2026-07-01', 71, 1200), point(PREV, 82, 1200), point(MONTH, 130, 1388)],
      tone: {
        shares: [
          { mood: 'positive', label: 'Warm', videos: 678, judged: 1112, pct: 61 },
          { mood: 'neutral', label: 'Neutral', videos: 233, judged: 1112, pct: 21 },
          { mood: 'negative', label: 'Cold', videos: 201, judged: 1112, pct: 18 },
        ],
        judged: 1112,
        verdict: verdict({ objectKind: 'mood', objectId: 'negative', objectLabel: 'Cold', state: 'no_clear_change', changePts: 2 }),
      },
      toneNote: null,
      onCamera: '17 of the 120 quotes behind this theme were said on camera rather than typed — counted over the whole update, not over this month.',
      quotes: [
        { ref: 'e:1', text: 'Three winters on the bike and the seams are still perfect. The zip, less so.' },
        { ref: 'e:2', text: 'Nach 14 Monaten ist der Reißverschluss hin', lang: 'de', english: 'After 14 months the zip is done' },
      ],
      quoteCites: ['in the comments', 'in the comments'],
      quotesOf: 182,
      spoken: { text: 'One bag, three years, no regrets.', cite: 'TikTok · 11 Sep · a category video', href: 'https://example.test/v' },
      onScreen: { text: '1 bag. 3 years. 0 regrets', cite: 'TikTok · 11 Sep · a category video', href: null },
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
      ],
      selected: 'commuter',
      population: 3129,
      overlapNote: 'A video can carry more than one group, so these counts overlap and do not add up to a whole.',
      profileDate: '2026-09-13',
      stale: false,
      floorNote: `A group is named only where at least ${PERSONA_VIDEO_FLOOR} videos carry it · this month as it stands, never compared with another month.`,
      empty: null,
    },
    record: {
      line: '4 updates · 2,359 videos (TikTok 38%, YouTube 29%, Instagram 21%, Reddit 12%) · 27% not in English',
      lines: ['4 updates delivered, 1 Sep to 15 Sep.', '27% of the comments read were not in English.'],
    },
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
    brand: 'Össur',
    audience: {
      ...base.audience,
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
      growing: [mover({ id: 'r1', label: 'Admiration for personal resilience', k: 34, n: 388, pct: 8.8, verdict: verdict({ objectId: 'r1', changePts: -5.1, bandPts: 4, value: { k: 34, n: 388 } }) })],
      fading: [],
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
      direction: null,
      tone: null,
      toneNote: 'How this audience’s month was received is not recorded month by month for this workspace yet.',
      onCamera: null,
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
