import { describe, expect, it } from 'vitest'

import {
  MOVERS_EXPANDED,
  MOVERS_HERE,
  PERSONA_VIDEO_FLOOR,
  THIN_AUDIENCE_VIDEOS,
  audienceFigures,
  audiencePillLabel,
  audienceThin,
  castMasthead,
  DEEP_LINK_EMPTY,
  firstSentences,
  flatMovers,
  heardLine,
  largestRead,
  moversCoda,
  moversNote,
  newMovers,
  onCameraReach,
  onCameraScope,
  openRefusal,
  pickAudience,
  platformShares,
  quoteCite,
  reachAxisMax,
  repliesNote,
  searchRegistry,
  voiceSurfaceHref,
  type AudienceBlock,
  type CastBlock,
} from './voice-surface'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, rivalKey } from '../rivals'
import type { Mover } from './overview'
import type { Verdict } from '../reading/verdicts'

// The pure half of Voice (Phase 1 WP13). Everything here decides what a reader
// is TOLD — which audience they are on, which arm of the one axis a row sits
// under, what a line may claim about a theme's history, and what a filter link
// keeps. No I/O, per AGENTS.md.

const verdict = (state: Verdict['state'], changePts: number | null): Verdict => ({
  objectKind: 'theme',
  objectId: 'id',
  objectLabel: 'label',
  audience: 'industry-other',
  window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' },
  value: { k: 30, n: 400 },
  changePts,
  bandPts: 2,
  state,
  flags: [],
})

const mover = (over: Partial<Mover> & { id: string; label: string }): Mover => ({
  k: 30,
  n: 400,
  pct: 7.5,
  verdict: verdict('moved', 2.6),
  direction: null,
  isNew: false,
  ...over,
})

describe('voiceSurfaceHref', () => {
  it('keeps ?themes= through an audience click — the deep link fourteen stored links carry', () => {
    const href = voiceSurfaceHref({ themes: 'wet_commute,zips', audience: 'client' }, { audience: 'industry-other' })
    expect(href).toContain('themes=wet_commute%2Czips')
    expect(href).toContain('audience=industry-other')
  })

  it('drops a key set to null — which is how "clear this filter" is written', () => {
    expect(voiceSurfaceHref({ theme: 't1', q: 'zip' }, { q: null })).toBe('/dashboard/voice?theme=t1')
  })

  it('emits no ?platform= or ?kind=, because neither ever narrowed the page', () => {
    const href = voiceSurfaceHref({ ...({ platform: 'reddit', kind: 'question' } as Record<string, string>), theme: 't1' })
    expect(href).toBe('/dashboard/voice?theme=t1')
  })

  it('is the bare address when nothing is selected', () => {
    expect(voiceSurfaceHref({})).toBe('/dashboard/voice')
  })

  it('never emits a key the page does not read', () => {
    expect(voiceSurfaceHref({ ...( { nonsense: 'x' } as Record<string, string>) })).toBe('/dashboard/voice')
  })
})

describe('pickAudience', () => {
  const available = ['client', 'competitor:Ottobock', 'industry-other']

  it('takes the asked-for audience when the tenant has it', () => {
    expect(pickAudience('competitor:Ottobock', available)).toBe('competitor:Ottobock')
  })

  it('opens on the category, not on you — the only audience that can carry a month', () => {
    expect(pickAudience(undefined, available)).toBe('industry-other')
  })

  it('falls back rather than reading a string from the URL', () => {
    expect(pickAudience('competitor:NotYours', available)).toBe('industry-other')
  })

  it('takes what there is when there is no category', () => {
    expect(pickAudience(undefined, ['client'])).toBe('client')
  })
})

describe('audienceThin', () => {
  it('marks both tenants own brands — 19 and 3 videos in September', () => {
    expect(audienceThin(19)).toBe(true)
    expect(audienceThin(3)).toBe(true)
  })

  it('does not mark the category — 388 videos', () => {
    expect(audienceThin(388)).toBe(false)
  })

  it('marks an audience with no row at all', () => {
    expect(audienceThin(null)).toBe(true)
  })

  it('draws the line at THIN_AUDIENCE_VIDEOS exactly', () => {
    expect(audienceThin(THIN_AUDIENCE_VIDEOS)).toBe(false)
    expect(audienceThin(THIN_AUDIENCE_VIDEOS - 1)).toBe(true)
  })
})

describe('platformShares', () => {
  it('reads Össur September category: 388 videos over four platforms', () => {
    const shares = platformShares({ reddit: 66, tiktok: 144, youtube: 106, instagram: 72 }, 388)
    expect(shares.map((s) => s.platform)).toEqual(['tiktok', 'youtube', 'instagram', 'reddit'])
    expect(shares[0]).toMatchObject({ videos: 144, pct: 37.1 })
    expect(shares.reduce((n, s) => n + s.videos, 0)).toBe(388)
  })

  it('omits a platform the month did not carry rather than printing 0%', () => {
    // Össur's own brand in September: instagram, youtube and tiktok only.
    const shares = platformShares({ tiktok: 6, youtube: 10, instagram: 3 }, 19)
    expect(shares.some((s) => s.platform === 'reddit')).toBe(false)
  })

  it('answers nothing where no mix was stored', () => {
    expect(platformShares(null, 100)).toEqual([])
  })

  it('leaves the share null rather than dividing by a denominator it has not got', () => {
    expect(platformShares({ tiktok: 4 }, null)[0].pct).toBeNull()
  })
})

describe('the one axis', () => {
  it('flat is a comparison that was drawn and came back inside the band', () => {
    const rows = [
      mover({ id: 'a', label: 'A', verdict: verdict('no_clear_change', 0.4), k: 30 }),
      mover({ id: 'b', label: 'B', verdict: verdict('no_clear_change', -0.1), k: 50 }),
    ]
    expect(flatMovers(rows, 6).map((m) => m.id)).toEqual(['b', 'a'])
  })

  it('never puts a row with no comparison under flat — an absence is not a steadiness', () => {
    const rows = [mover({ id: 'a', label: 'A', verdict: verdict('too_little_data', null) })]
    expect(flatMovers(rows, 6)).toEqual([])
  })

  it('never puts a banded mover under flat', () => {
    expect(flatMovers([mover({ id: 'a', label: 'A', verdict: verdict('moved', 2.6) })], 6)).toEqual([])
  })

  it('new is a flag on a level, and takes the rows that carry it largest first', () => {
    const rows = [
      mover({ id: 'a', label: 'A', isNew: true, k: 10 }),
      mover({ id: 'b', label: 'B', isNew: true, k: 26 }),
      mover({ id: 'c', label: 'C', isNew: false, k: 99 }),
    ]
    expect(newMovers(rows, 6).map((m) => m.id)).toEqual(['b', 'a'])
  })

  it('honours the three lengths — six here, ten expanded', () => {
    const rows = Array.from({ length: 14 }, (_, i) =>
      mover({ id: `t${i}`, label: `T${i}`, isNew: true, k: 100 - i }))
    expect(newMovers(rows, MOVERS_HERE)).toHaveLength(6)
    expect(newMovers(rows, MOVERS_EXPANDED)).toHaveLength(10)
  })
})

describe('largestRead', () => {
  it('opens the largest reading of the month, not the largest of the axis', () => {
    const rows = [
      mover({ id: 'a', label: 'A', k: 4 }),
      mover({ id: 'b', label: 'B', k: 34 }),
      mover({ id: 'c', label: 'C', k: 12 }),
    ]
    expect(largestRead(rows)).toBe('b')
  })

  it('never opens a theme that was not said this month', () => {
    // Össur, own-brand audience: "Price and availability questions" led the
    // axis and read 0 of 19 videos in September. Opened, it printed a
    // calibrated level and six quotes over a zero numerator.
    expect(largestRead([mover({ id: 'z', label: 'Z', k: 0 })])).toBeNull()
  })

  it('settles a tie by label rather than by whatever order a read came back in', () => {
    const rows = [mover({ id: 'b', label: 'B', k: 9 }), mover({ id: 'a', label: 'A', k: 9 })]
    expect(largestRead(rows)).toBe('a')
  })
})

describe('moversNote', () => {
  it('says the month could not be compared when no comparison was drawn', () => {
    expect(moversNote({ read: false, thin: false, any: false }))
      .toBe('No theme carried enough of this month to be compared.')
  })

  it('says the month is thin before anything else — the cause, not the symptom', () => {
    expect(moversNote({ read: true, thin: true, any: false }))
      .toBe('Too little conversation this month to say what moved.')
    expect(moversNote({ read: false, thin: true, any: false }))
      .toBe('Too little conversation this month to say what moved.')
  })

  it('"Nothing moved clearly this month" is a legitimate answer, not an empty state', () => {
    expect(moversNote({ read: true, thin: false, any: false })).toBe('Nothing moved clearly this month.')
  })

  it('blames the reader’s link, not the month, when ?themes= left nothing', () => {
    // Verified read-only with themes=no_such_slug_at_all: both blocks said the
    // month carried nothing, of a month that carried 437 videos and six
    // comparable themes.
    expect(moversNote({ read: false, thin: true, any: false, narrowed: true })).toBe(DEEP_LINK_EMPTY)
  })

  it('is silent when the page has rows', () => {
    expect(moversNote({ read: true, thin: false, any: true })).toBeNull()
  })

  it('the thin sentence is the same fact VO1 prints on its own pill', () => {
    // Össur's own brand: 19 videos. VO1 marks the pill "too thin to compare";
    // VO2 said "Nothing moved clearly this month" two blocks below it, because
    // the page ran two thin rules. It runs one now, so both say the same.
    expect(audienceThin(19)).toBe(true)
    expect(moversNote({ read: true, thin: true, any: false }))
      .toBe('Too little conversation this month to say what moved.')
  })
})

describe('openRefusal', () => {
  it('names the theme a link asked for rather than blaming the month', () => {
    // Production: ?theme= honoured only the forty themes ranked for this
    // audience-month, and every other register id — 1,046 of them on Össur —
    // silently opened the first mover instead.
    expect(openRefusal({ asked: { id: 'r1', label: 'Filip’s storytelling stands out', found: false } }, 'The category'))
      .toBe('“Filip’s storytelling stands out” was not said in the category this month, so there is nothing to open — clear it from the link to see what was.')
  })

  it('tells a register id nobody has named apart from a theme nobody said', () => {
    expect(openRefusal({ asked: { id: 'nope', label: null, found: false } }, 'The category'))
      .toContain('not in this workspace’s register')
  })

  it('keeps the plain sentence where no link asked for anything', () => {
    expect(openRefusal({ asked: null }, 'The category'))
      .toBe('No theme in this audience carried enough of this month to be opened.')
  })

  it('says a ?themes= link narrowed the month to nothing, rather than blaming the month', () => {
    expect(openRefusal({ asked: null, narrowed: true }, 'The category')).toContain(DEEP_LINK_EMPTY)
  })
})

describe('heardLine', () => {
  it('says "first heard" plainly when the month it names is one of the drawn ones', () => {
    expect(heardLine({ firstHeard: '2026-06-01', firstHeardOnAxis: true, monthsSeen: 3, monthsDrawn: 3 }))
      .toBe('first heard June 2026 · seen in 3 of 3 months drawn')
  })

  it('still names the month when it sits before the axis, and says it does', () => {
    // Össur's "Admiration for personal resilience" is carried in the category
    // from November 2022. Off the drawn axis the line answered September 2026
    // on this month, July 2026 on the last three and March 2026 on the last
    // twelve — three answers to a question with one answer.
    expect(heardLine({ firstHeard: '2022-11-01', firstHeardOnAxis: false, monthsSeen: 1, monthsDrawn: 1 }))
      .toBe('first heard November 2022, before the months drawn here · seen in 1 of 1 month drawn')
  })

  it('does not vary with the horizon — one answer, whatever is drawn', () => {
    const lines = [1, 3, 12].map((monthsDrawn) =>
      heardLine({ firstHeard: '2022-11-01', firstHeardOnAxis: false, monthsSeen: 1, monthsDrawn }))
    expect(new Set(lines.map((l) => l.split(' · ')[0])).size).toBe(1)
  })

  it('says only the half it can when the record cannot be read at all', () => {
    expect(heardLine({ firstHeard: null, firstHeardOnAxis: false, monthsSeen: 0, monthsDrawn: 2 }))
      .toBe('seen in 0 of 2 months drawn')
  })

  it('agrees with itself about one month', () => {
    expect(heardLine({ firstHeard: null, firstHeardOnAxis: false, monthsSeen: 1, monthsDrawn: 1 })).toContain('1 of 1 month drawn')
  })
})

describe('onCameraScope', () => {
  it('says what the on-camera count was counted over, because it is not this month', () => {
    // Production, Össur ?themes=prosthetist_skill: "· 1 said on camera" sat one
    // line above "read from 0 of 2 videos". The first is the update's whole
    // evidence, the second this month's platform mix.
    expect(onCameraScope(1, 12))
      .toBe('1 of the 12 quotes behind this theme was said on camera rather than typed — counted over the whole update, not over this month.')
  })

  it('agrees with itself about more than one', () => {
    expect(onCameraScope(17, 120)).toContain('17 of the 120 quotes behind this theme were said on camera')
  })

  it('says nothing about a theme heard only in comments — a zero on every pane is noise', () => {
    expect(onCameraScope(0, 12)).toBeNull()
    expect(onCameraScope(null, 12)).toBeNull()
  })

  it('never claims more on camera than there is evidence', () => {
    expect(onCameraScope(40, 12)).toContain('12 of the 12 quotes')
  })
})

describe('onCameraReach', () => {
  it('names the videos the speech read could not reach', () => {
    expect(onCameraReach({ videos: 130, reddit: 12 }))
      .toBe('read from 118 of 130 videos — Reddit carries no speech and no on-screen text')
  })

  it('says nothing where no Reddit thread is in the count — there is nothing to warn about', () => {
    expect(onCameraReach({ videos: 130, reddit: 0 })).toBeNull()
  })

  it('says nothing where the mix was never stored', () => {
    expect(onCameraReach({ videos: 130, reddit: null })).toBeNull()
  })

  it('never goes below zero when the mix is larger than the theme', () => {
    expect(onCameraReach({ videos: 4, reddit: 9 })).toContain('read from 0 of 4 videos')
  })
})

describe('searchRegistry', () => {
  const rows = [
    { id: '1', canonical_label: 'Will it survive a wet commute', member_slugs: ['wet_commute'] },
    { id: '2', canonical_label: 'Zips failing after a year', member_slugs: ['zips', 'zip_failure'] },
    { id: '3', canonical_label: null, member_slugs: ['second_hand_resale'] },
  ]

  it('matches the label, case-folded', () => {
    expect(searchRegistry(rows, 'WET').map((r) => r.id)).toEqual(['1'])
  })

  it('matches a member slug, which is what a deep link is made of', () => {
    expect(searchRegistry(rows, 'resale').map((r) => r.id)).toEqual(['3'])
  })

  it('matches nothing on one character rather than everything', () => {
    expect(searchRegistry(rows, 'z')).toEqual([])
    expect(searchRegistry(rows, '')).toEqual([])
  })

  it('returns every match, so the caller can say how many there were', () => {
    // "prosthetic" matches 56 of Össur's first 400 register rows alone. The
    // first cut sliced twelve in uuid order and reported the slice as the
    // total.
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `${i}`, canonical_label: `zip thing ${i}`, member_slugs: null }))
    expect(searchRegistry(many, 'zip')).toHaveLength(40)
  })

  it('ranks a label that starts with the query above one that merely contains it', () => {
    const ranked = searchRegistry([
      { id: 'a', canonical_label: 'Worry about zips in winter', member_slugs: null },
      { id: 'b', canonical_label: 'Zips failing after a year', member_slugs: null },
      { id: 'c', canonical_label: null, member_slugs: ['zip_failure'] },
    ], 'zip')
    expect(ranked.map((r) => r.id)).toEqual(['b', 'a', 'c'])
  })

  it('puts the shorter label first inside a tier, so the plain theme beats the qualified one', () => {
    const ranked = searchRegistry([
      { id: 'long', canonical_label: 'Zips failing after a year of daily commuting', member_slugs: null },
      { id: 'short', canonical_label: 'Zips failing', member_slugs: null },
    ], 'zip')
    expect(ranked.map((r) => r.id)).toEqual(['short', 'long'])
  })
})

// `unnamedShare` was removed with the mock's "No persona 16%" line — it is the
// remainder of a partition and a stored profile's groups do not partition
// anything. `fillingLine` and `daysInto` were removed with it: they were a
// second declaration of two lib/pages/overview.ts exports under the same names
// and different signatures, and nothing on this page called either.

describe('firstSentences', () => {
  it('takes a line off a transcript, not the wall', () => {
    expect(firstSentences('I bought this bag. Three winters later it still works. And the zip is fine.'))
      .toBe('I bought this bag. Three winters later it still works.')
  })

  it('cuts at the cap and marks the cut', () => {
    const out = firstSentences('a'.repeat(500), 2, 40)
    expect(out).toHaveLength(40)
    expect(out.endsWith('…')).toBe(true)
  })

  it('answers empty for nothing rather than throwing', () => {
    expect(firstSentences('   ')).toBe('')
  })
})

describe('repliesNote', () => {
  it('says the instrument\u2019s limit out loud when every reply is a Reddit reply', () => {
    // Production, both tenants: 835 of 835 and 842 of 842. Reddit is the only
    // source that records a reply at all.
    expect(repliesNote({ comments: 11712, replies: 835, pct: 7.1, reddit: 835 }))
      .toContain('Every reply we can see is a Reddit reply')
  })

  it('says the weaker thing where the platforms actually differ', () => {
    expect(repliesNote({ comments: 9397, replies: 1972, pct: 21, reddit: 812 }))
      .toContain('materially a Reddit signal')
  })

  it('does not claim it on a month with no replies at all', () => {
    expect(repliesNote({ comments: 100, replies: 0, pct: 0, reddit: 0 }))
      .toContain('materially a Reddit signal')
  })

  it('says the figure is not readable rather than printing nothing', () => {
    expect(repliesNote(null)).toBe('How much of this month was argued rather than said once is not readable here.')
  })
})

describe('audienceFigures', () => {
  const block = (over: Partial<AudienceBlock>): AudienceBlock => ({
    options: [], selected: 'industry-other', label: 'The category',
    videos: 388, comments: 10534, thin: false,
    platformMix: [],
    kinds: [], kindVerdicts: {}, kindsNote: null,
    reddit: null, replies: null, repliesNote: null,
    ...over,
  })

  it('declares the audience denominator every other number on the page rests on', () => {
    expect(audienceFigures(block({}))).toHaveProperty('audience_videos.value', 388)
  })

  it('declares no kind share where no kind was read — an absent figure, not a zero', () => {
    expect(Object.keys(audienceFigures(block({})))).toEqual(['audience_videos'])
  })

  it('declares at most the three kinds it leads with, plus the replies share', () => {
    const kinds = ['question', 'pain_point', 'praise', 'objection'].map((kind, i) => ({
      kind, label: kind, videos: 10 + i, denominator: 388, pct: 3 + i, reddit: null,
    }))
    const table = audienceFigures(block({ kinds, replies: { comments: 100, replies: 21, pct: 21, reddit: 9 } }))
    expect(Object.keys(table).filter((k) => k.startsWith('kind_'))).toHaveLength(3)
    expect(table.replies_share.value).toBe(21)
  })
})

describe('castMasthead', () => {
  const cast = (over: Partial<CastBlock>): CastBlock => ({
    state: 'ready', personas: [], selected: null, population: 3129,
    overlapNote: 'A video can carry more than one group, so these counts overlap and do not add up to a whole.',
    profileDate: '2026-09-13', stale: false,
    floorNote: `A group is named only where at least ${PERSONA_VIDEO_FLOOR} videos carry it.`,
    stateNote: 'this month as it stands, never compared with another month',
    empty: null,
    ...over,
  })

  it('dates the cast by the update it was read on — not by the month', () => {
    expect(castMasthead(cast({}))).toContain('Who is talking, as read on')
  })

  it('says so when a later update has landed since', () => {
    expect(castMasthead(cast({ stale: true }))).toContain('a later update has landed since')
  })

  it('says nothing where no profile has ever been written', () => {
    expect(castMasthead(cast({ profileDate: null }))).toBeNull()
  })
})

// ---- the artboard port's own pure halves (Block D wave 2, E-voice) ---------

describe('audiencePillLabel', () => {
  it('shortens the two labels that are code’s own words', () => {
    expect(audiencePillLabel(CLIENT_AUDIENCE, 'Your own brand')).toBe('Yours')
    expect(audiencePillLabel(INDUSTRY_AUDIENCE, 'The category')).toBe('Category')
  })

  it('never touches a rival’s name, which is the client’s own string', () => {
    expect(audiencePillLabel(rivalKey('Topo Designs'), 'Topo Designs')).toBe('Topo Designs')
    expect(audiencePillLabel(rivalKey('Yours Truly Bags'), 'Yours Truly Bags')).toBe('Yours Truly Bags')
  })
})

describe('reachAxisMax', () => {
  it('leaves headroom above the largest reading and steps, so the axis does not jitter', () => {
    expect(reachAxisMax([9.4, 6.8])).toBe(15)
    expect(reachAxisMax([9.6, 6.8])).toBe(15)
  })

  it('never draws a reading past the end of its own bar', () => {
    for (const v of [0.4, 3, 12, 33, 49, 70, 99.9]) {
      expect(reachAxisMax([v])).toBeGreaterThanOrEqual(v)
      expect(reachAxisMax([v])).toBeLessThanOrEqual(100)
    }
  })

  it('is zero where there is nothing to draw, so the bar renders nothing', () => {
    expect(reachAxisMax([])).toBe(0)
    expect(reachAxisMax([null, undefined, 0])).toBe(0)
  })
})

describe('quoteCite', () => {
  const video = { platform: 'tiktok', upload_date: '2026-09-14', kind: 'a category video' }

  it('says platform · date · where, which is what the artboard asks for', () => {
    expect(quoteCite({ video, source: 'comment' })).toBe('TikTok · 14 Sep · under a category video')
  })

  it('moves the COLUMN to the end, because it is a different claim from where the video was posted', () => {
    // "said on camera" and "on-screen text" say these words were spoken or
    // written ON the video rather than typed under it. The old phrase named
    // the column and nothing else, so six quotes carried three words between
    // them.
    expect(quoteCite({ video, source: 'transcript' })).toBe('TikTok · 14 Sep · a category video, transcript')
    expect(quoteCite({ video, source: 'ocr' })).toBe('TikTok · 14 Sep · a category video, on-screen text')
  })

  it('keeps the rival’s own post as the kind, as the loader reads it', () => {
    expect(quoteCite({ video: { ...video, kind: 'a Cotopaxi post' }, source: 'comment' }))
      .toBe('TikTok · 14 Sep · under a Cotopaxi post')
  })

  it('falls back to the old phrase when the video is gone, and never invents a platform', () => {
    // `audience_insights` rows are superseded and pruned by later runs. A
    // quote whose video did not resolve must still say honestly where it was
    // read rather than claim a platform nobody can check.
    expect(quoteCite({ video: null, source: 'comment' })).toBe('in the comments')
    expect(quoteCite({ video: null, source: 'transcript' })).toBe('said on camera')
    expect(quoteCite({ video: null, source: 'ocr' })).toBe('on-screen text')
    expect(quoteCite({ video: null, source: null })).toBe('in the comments')
  })

  it('drops a fact it does not have rather than printing a gap for it', () => {
    expect(quoteCite({ video: { ...video, upload_date: null }, source: 'comment' }))
      .toBe('TikTok · under a category video')
    expect(quoteCite({ video: { ...video, platform: null }, source: 'comment' }))
      .toBe('14 Sep · under a category video')
    expect(quoteCite({ video: { platform: null, upload_date: null, kind: 'a category video' }, source: 'comment' }))
      .toBe('under a category video')
  })
})

describe('moversCoda', () => {
  it('closes a complete list', () => {
    expect(moversCoda({ growing: 2, fading: 1, shown: 6, any: true })).toBe('Nothing else moved clearly this month.')
  })

  it('says nothing when an arm was cut — the rows below the cut moved too', () => {
    expect(moversCoda({ growing: 9, fading: 1, shown: 6, any: true })).toBeNull()
    expect(moversCoda({ growing: 1, fading: 9, shown: 6, any: true })).toBeNull()
  })

  it('leaves an empty list to the block’s own empty state', () => {
    expect(moversCoda({ growing: 0, fading: 0, shown: 6, any: false })).toBeNull()
  })
})
