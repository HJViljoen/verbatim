import { describe, expect, it } from 'vitest'

import {
  MOVERS_EXPANDED,
  MOVERS_HERE,
  PERSONA_VIDEO_FLOOR,
  THIN_AUDIENCE_VIDEOS,
  audienceFigures,
  audienceThin,
  castMasthead,
  daysInto,
  fillingLine,
  firstSentences,
  flatMovers,
  heardLine,
  moversNote,
  newMovers,
  onCameraReach,
  pickAudience,
  platformShares,
  searchRegistry,
  unnamedShare,
  voiceSurfaceHref,
  type AudienceBlock,
  type CastBlock,
} from './voice-surface'
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
  it('keeps ?themes= through a filter click — the deep link fourteen stored links carry', () => {
    const href = voiceSurfaceHref({ themes: 'wet_commute,zips', audience: 'client' }, { platform: 'reddit' })
    expect(href).toContain('themes=wet_commute%2Czips')
    expect(href).toContain('audience=client')
    expect(href).toContain('platform=reddit')
  })

  it('drops a key set to null — which is how "clear this filter" is written', () => {
    expect(voiceSurfaceHref({ kind: 'question', theme: 't1' }, { kind: null })).toBe('/dashboard/voice?theme=t1')
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

describe('moversNote', () => {
  it('says the month could not be read when no theme cleared its floors', () => {
    expect(moversNote({ read: false, thin: false, any: false }))
      .toBe('No theme carried enough of this month to be compared.')
  })

  it('says the month is thin before it says nothing moved', () => {
    expect(moversNote({ read: true, thin: true, any: false }))
      .toBe('Too little conversation this month to say what moved.')
  })

  it('"Nothing moved clearly this month" is a legitimate answer, not an empty state', () => {
    expect(moversNote({ read: true, thin: false, any: false })).toBe('Nothing moved clearly this month.')
  })

  it('is silent when the page has rows', () => {
    expect(moversNote({ read: true, thin: false, any: true })).toBeNull()
  })
})

describe('heardLine', () => {
  it('reads the registry for "first heard" and the drawn axis for "seen in"', () => {
    expect(heardLine({ firstHeard: '2026-06-01', monthsSeen: 3, monthsDrawn: 3 }))
      .toBe('first heard June 2026 · seen in 3 of 3 months drawn')
  })

  it('says only what it can when the registry has no first sighting', () => {
    expect(heardLine({ firstHeard: null, monthsSeen: 1, monthsDrawn: 2 }))
      .toBe('seen in 1 of 2 months drawn')
  })

  it('agrees with itself about one month', () => {
    expect(heardLine({ firstHeard: null, monthsSeen: 1, monthsDrawn: 1 })).toContain('1 of 1 month drawn')
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

  it('caps what it returns', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `${i}`, canonical_label: 'zip thing', member_slugs: null }))
    expect(searchRegistry(many, 'zip', 5)).toHaveLength(5)
  })
})

describe('unnamedShare', () => {
  it('is the audience a persona was not named on', () => {
    expect(unnamedShare([527, 374, 263], 1388)).toBe(16.1)
  })

  it('is null rather than 0 where there is no denominator', () => {
    expect(unnamedShare([10], null)).toBeNull()
    expect(unnamedShare([10], 0)).toBeNull()
  })

  it('refuses to print a negative remainder when the personas overlap past the month', () => {
    // Personas are read on OVERLAPPING video sets; their counts can exceed the
    // audience. A remainder computed from that would be negative, which is not
    // a share of anything.
    expect(unnamedShare([900, 900], 1000)).toBeNull()
  })
})

describe('fillingLine and daysInto', () => {
  it('says the month is still filling and how far in', () => {
    expect(fillingLine('2026-09-01', 'filling', 16)).toBe('September 2026 · still filling · 16 days in')
  })

  it('says a frozen month is complete and counts no days', () => {
    expect(fillingLine('2026-08-01', 'frozen', null)).toBe('August 2026 · complete')
  })

  it('counts the days of a month still running and none of a month behind us', () => {
    expect(daysInto('2026-09-01', '2026-09-16T08:00:00.000Z')).toBe(16)
    expect(daysInto('2026-08-01', '2026-09-16T08:00:00.000Z')).toBeNull()
  })
})

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

describe('audienceFigures', () => {
  const block = (over: Partial<AudienceBlock>): AudienceBlock => ({
    options: [], selected: 'industry-other', label: 'The category',
    videos: 388, comments: 10534, thin: false,
    platformMix: [], platforms: [], platform: null,
    kinds: [], kindVerdicts: {}, kindFilters: [], kind: null, kindsNote: null,
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
    state: 'ready', personas: [], selected: null, denominator: 1388,
    unnamedPct: 16, profileDate: '2026-09-13', stale: false,
    floorNote: `A group is named only where at least ${PERSONA_VIDEO_FLOOR} videos carry it · current state, not a trend.`,
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
