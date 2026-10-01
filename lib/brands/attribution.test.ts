import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { fakeDb } from '../test/fake-db'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '../rivals'
import {
  aboutAudience,
  aboutNamed,
  aboutVideo,
  attributeAudiences,
  attributeVideos,
  countedNamings,
  loadAttribution,
  loadCommentNamings,
  marketLabels,
  marketLabelsOf,
  mergeWhoVideos,
  namesByComment,
  sortParts,
  trackedBrands,
  whoSplit,
  windowMonths,
  type AttributionInputs,
  type Naming,
  type TrackedBrands,
} from './attribution'

const COTO = '11111111-1111-1111-1111-111111111111'
const PATA = '22222222-2222-2222-2222-222222222222'
const TNF = '33333333-3333-3333-3333-333333333333'
const FREI = '44444444-4444-4444-4444-444444444444'

const brands: TrackedBrands = {
  client: 'Sealand',
  rivals: new Map([[COTO, 'Cotopaxi'], [PATA, 'Patagonia'], [TNF, 'The North Face'], [FREI, 'Freitag']]),
  // Freitag's naming is mostly the German word for Friday: never counted.
  counts: (name) => name !== 'Freitag',
}

const named = (brandKey: string, commentId: string, month = '2026-09-01'): Naming => ({ brandKey, commentId, month })

function inputs(audiences: Record<string, string>, namings: Record<string, Naming[]> = {}): AttributionInputs {
  return { audiences: new Map(Object.entries(audiences)), namings: new Map(Object.entries(namings)), brands }
}

describe('aboutAudience', () => {
  it('files the client’s posts, a rival-filed video and the rest', () => {
    expect(aboutAudience('client')).toBe('client')
    expect(aboutAudience('competitor:Cotopaxi')).toBe('rival:Cotopaxi')
    expect(aboutAudience('industry-other')).toBe('market')
    expect(aboutAudience(undefined)).toBe('market')
  })
})

describe('aboutVideo', () => {
  it('a naming in the talk overrides the audience', () => {
    const x = inputs({ v1: 'industry-other' }, { v1: [named(PATA, 'c1')] })
    expect(aboutVideo('v1', x)).toBe('rival:Patagonia')
  })

  it('two brands named: the alphabetically first, so one brand per video', () => {
    const x = inputs({ v1: 'industry-other' }, { v1: [named(TNF, 'c1'), named('client', 'c2'), named(PATA, 'c3')] })
    expect(aboutVideo('v1', x)).toBe('rival:Patagonia')
    const y = inputs({ v1: 'industry-other' }, { v1: [named(TNF, 'c1'), named('client', 'c2')] })
    expect(aboutVideo('v1', y)).toBe('client')
  })

  it('never guesses: an uncounted brand, a watched key or an unknown key files nothing', () => {
    const x = inputs({ v1: 'industry-other' }, { v1: [named(FREI, 'c1'), named('watched:osprey', 'c2'), named('99999999-9999-9999-9999-999999999999', 'c3')] })
    expect(aboutVideo('v1', x)).toBe('market')
  })

  it('reads only the item’s own comments and months where the caller names them', () => {
    const x = inputs({ v1: 'industry-other' }, { v1: [named(COTO, 'c1', '2026-08-01')] })
    expect(aboutVideo('v1', x, { comments: new Set(['c9']) })).toBe('market')
    expect(aboutVideo('v1', x, { comments: new Set(['c1']) })).toBe('rival:Cotopaxi')
    expect(aboutVideo('v1', x, { months: new Set(['2026-09-01']) })).toBe('market')
    expect(aboutVideo('v1', x, { months: new Set(['2026-08-01']) })).toBe('rival:Cotopaxi')
  })
})

describe('attributeVideos', () => {
  it('splits a set so it adds up to its distinct videos, brands first, the market last', () => {
    const x = inputs(
      { a: 'industry-other', b: 'industry-other', c: 'competitor:Cotopaxi', d: 'industry-other', e: 'industry-other', f: 'industry-other' },
      { a: [named(PATA, 'c1')], b: [named(PATA, 'c2')], d: [named(COTO, 'c3')] },
    )
    const split = attributeVideos(['a', 'b', 'c', 'd', 'e', 'f', 'a'], x)
    expect(split).toEqual([
      { about: 'rival:Cotopaxi', videos: 2 },
      { about: 'rival:Patagonia', videos: 2 },
      { about: 'market', videos: 2 },
    ])
    expect(split.reduce((s, p) => s + p.videos, 0)).toBe(6)
  })

  it('is empty for no videos', () => {
    expect(attributeVideos([], inputs({}))).toEqual([])
  })
})

describe('attributeAudiences', () => {
  it('sums an audience reading by who it is about', () => {
    expect(attributeAudiences([
      { audience: 'industry-other', videos: 599 },
      { audience: 'competitor:Patagonia', videos: 11 },
      { audience: 'competitor:The North Face', videos: 8 },
    ], brands)).toEqual([
      { about: 'rival:Patagonia', videos: 11 },
      { about: 'rival:The North Face', videos: 8 },
      { about: 'market', videos: 599 },
    ])
  })
})

describe('countedNamings', () => {
  it('keeps the rules’ rows and drops a hit a confirm rejected', () => {
    const rows = [
      { video_id: 'v1', brand_key: COTO, comment_id: 'c1', comment_month: '2026-09-14', method: 'rule', rule_version: 'brands_v1' },
      { video_id: 'v1', brand_key: PATA, comment_id: 'c2', comment_month: '2026-09-14', method: 'rule', rule_version: 'brands_v1' },
      { video_id: 'v1', brand_key: PATA, comment_id: 'c2', comment_month: '2026-09-14', method: 'rejected', rule_version: 'brands_v1+brand_confirm_v1' },
      { video_id: 'v2', brand_key: TNF, comment_id: 'c3', comment_month: '2026-09-01', method: 'rule', rule_version: 'brands_v0' },
    ]
    const out = countedNamings(rows)
    expect(out.get('v1')).toEqual([{ brandKey: COTO, commentId: 'c1', month: '2026-09-01' }])
    expect(out.has('v2')).toBe(false)
  })
})

describe('trackedBrands', () => {
  it('gates a naming on production’s hand check', () => {
    const b = trackedBrands(SEALAND_CLIENT_ID, 'Sealand', [{ id: COTO, name: 'Cotopaxi' }, { id: PATA, name: 'Old School' }])
    expect(b.counts('Cotopaxi')).toBe(true)
    expect(b.counts('Sealand')).toBe(true)
    expect(b.counts('Old School')).toBe(false)
  })
})

describe('marketLabels', () => {
  it('names the market by what the tenant sells', () => {
    expect(marketLabels(SEALAND_CLIENT_ID)).toEqual({ long: 'Other bags in your market', short: 'other bags', inline: 'other bags in your market' })
    expect(marketLabels('someone-else')).toEqual({ long: 'Others in your market', short: 'others', inline: 'others in your market' })
    expect(marketLabelsOf('bags')).toEqual(marketLabels(SEALAND_CLIENT_ID))
    expect(marketLabelsOf(null)).toEqual(marketLabels('someone-else'))
  })
})

describe('windowMonths', () => {
  it('lists the months a window touches', () => {
    expect([...windowMonths({ from: '2026-09-27T04:03:00Z', to: '2026-10-04T04:02:00Z' })]).toEqual(['2026-09-01', '2026-10-01'])
    expect([...windowMonths({ from: '2026-09-01', to: '2026-10-01' })]).toEqual(['2026-09-01'])
  })
})

describe('loadAttribution', () => {
  it('reads the videos’ tags and their comment namings in one wave', async () => {
    const db = fakeDb({
      videos: [
        { id: 'v1', client_id: 'cl', is_client: false, is_competitor: true, competitor_name: 'Cotopaxi' },
        { id: 'v2', client_id: 'cl', is_client: true, is_competitor: false, competitor_name: null },
        { id: 'v3', client_id: 'cl', is_client: false, is_competitor: false, competitor_name: null },
      ],
      brand_mentions: [
        { id: 'm1', client_id: 'cl', video_id: 'v3', brand_key: TNF, source: 'comment', comment_id: 'c1', comment_month: '2026-09-01', method: 'rule', rule_version: 'brands_v1' },
        { id: 'm2', client_id: 'cl', video_id: 'v3', brand_key: TNF, source: 'content', comment_id: null, comment_month: null, method: 'rule', rule_version: 'brands_v1' },
      ],
    })
    const x = await loadAttribution(db.client as never, { clientId: 'cl', videoIds: ['v1', 'v2', 'v3'], brands })
    expect(x).not.toBeNull()
    // The one order: the client first, then the rivals, the market last.
    expect(attributeVideos(['v1', 'v2', 'v3'], x!)).toEqual([
      { about: 'client', videos: 1 },
      { about: 'rival:Cotopaxi', videos: 1 },
      { about: 'rival:The North Face', videos: 1 },
    ])
    expect(db.calls.map((c) => c.table).sort()).toEqual(['brand_mentions', 'videos'])
  })

  it('answers null, never a guessed split, when a table cannot be read', async () => {
    const db = fakeDb({ videos: [] })
    expect(await loadAttribution(db.client as never, { clientId: 'cl', videoIds: ['v1'], brands })).toBeNull()
  })
})

// ---- Folded in from MARKET's lib/written/who.ts (integration, ruling 4) --------

describe('sortParts: the one order', () => {
  it('the client first even with fewer videos, then the rivals by videos and name, the market last', () => {
    expect(sortParts([
      { about: 'market', videos: 11 },
      { about: 'rival:Patagonia', videos: 1 },
      { about: 'client', videos: 6 },
      { about: 'rival:The North Face', videos: 2 },
      { about: 'rival:Cotopaxi', videos: 10 },
      { about: 'rival:Gone', videos: 0 },
    ], brands)).toEqual([
      { about: 'client', videos: 6 },
      { about: 'rival:Cotopaxi', videos: 10 },
      { about: 'rival:The North Face', videos: 2 },
      { about: 'rival:Patagonia', videos: 1 },
      { about: 'market', videos: 11 },
    ])
  })
})

describe('aboutNamed: the same rule over names already read', () => {
  it('a named brand wins over the audience, the alphabetically first of two; the client by its name', () => {
    expect(aboutNamed({ audience: INDUSTRY_AUDIENCE, named: ['The North Face', 'Cotopaxi'] }, 'Sealand')).toBe('rival:Cotopaxi')
    expect(aboutNamed({ audience: 'competitor:Cotopaxi', named: ['Sealand'] }, 'Sealand')).toBe('client')
    expect(aboutNamed({ audience: INDUSTRY_AUDIENCE, named: ['sealand'] }, 'Sealand')).toBe('client')
  })

  it('else the audience: own posts, a rival\'s filed videos, the category', () => {
    expect(aboutNamed({ audience: CLIENT_AUDIENCE, named: [] }, 'Sealand')).toBe('client')
    expect(aboutNamed({ audience: 'competitor:Patagonia', named: [] }, 'Sealand')).toBe('rival:Patagonia')
    expect(aboutNamed({ audience: INDUSTRY_AUDIENCE, named: [] }, 'Sealand')).toBe('market')
  })

  it('agrees with aboutVideo on the same talk', () => {
    const x = inputs({ v1: 'industry-other' }, { v1: [named(TNF, 'c1'), named(COTO, 'c2')] })
    expect(aboutNamed({ audience: 'industry-other', named: ['The North Face', 'Cotopaxi'] }, 'Sealand')).toBe(aboutVideo('v1', x))
  })
})

describe('whoSplit', () => {
  it('one brand per video, merged across sightings, in the one order', () => {
    const split = whoSplit([
      { id: 'v1', audience: INDUSTRY_AUDIENCE, named: [] },
      { id: 'v1', audience: INDUSTRY_AUDIENCE, named: ['Patagonia'] },
      { id: 'v2', audience: 'competitor:Cotopaxi', named: [] },
      { id: 'v3', audience: 'competitor:Cotopaxi', named: [] },
      { id: 'v4', audience: CLIENT_AUDIENCE, named: [] },
      { id: 'v5', audience: INDUSTRY_AUDIENCE, named: [] },
    ], 'Sealand')
    expect(split).toEqual([
      { about: 'client', videos: 1 },
      { about: 'rival:Cotopaxi', videos: 2 },
      { about: 'rival:Patagonia', videos: 1 },
      { about: 'market', videos: 1 },
    ])
    expect(split.reduce((n, p) => n + p.videos, 0)).toBe(5)
    expect(mergeWhoVideos([{ id: 'v1', audience: 'x', named: ['A'] }, { id: 'v1', audience: 'x', named: ['B'] }])).toEqual([{ id: 'v1', audience: 'x', named: ['A', 'B'] }])
  })
})

describe('loadCommentNamings', () => {
  it('names a comment\'s tracked brands by the same gates as loadAttribution', async () => {
    const row = (id: string, comment: string, video: string, key: string, over: Record<string, unknown> = {}) => ({
      id, client_id: 'cl', video_id: video, brand_key: key, source: 'comment', comment_id: comment, comment_month: '2026-09-14', method: 'rule', rule_version: 'brands_v1', ...over,
    })
    const db = fakeDb({
      brand_mentions: [
        row('m1', 'c1', 'v1', COTO),
        row('m2', 'c1', 'v1', 'client'),
        // A hit a confirm rejected names nothing.
        row('m3', 'c2', 'v2', PATA),
        row('m4', 'c2', 'v2', PATA, { method: 'rejected', rule_version: 'brands_v1+brand_confirm_v1' }),
        // An older rules' row, a watched key, an unknown key, a name the hand check refuses.
        row('m5', 'c3', 'v3', TNF, { rule_version: 'brands_v0' }),
        row('m6', 'c3', 'v3', 'watched:osprey'),
        row('m7', 'c3', 'v3', '99999999-9999-9999-9999-999999999999'),
        row('m8', 'c3', 'v3', FREI),
        // Another tenant's row is never read.
        { ...row('m9', 'c1', 'v1', TNF), client_id: 'other' },
      ],
    })
    const out = await loadCommentNamings(db.client as never, { clientId: 'cl', commentIds: ['c1', 'c2', 'c3', 'c1'], brands })
    expect(out.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { commentId: 'c1', videoId: 'v1', name: 'Cotopaxi' },
      { commentId: 'c1', videoId: 'v1', name: 'Sealand' },
    ])
    expect(namesByComment(out)).toEqual(new Map([['c1', ['Cotopaxi', 'Sealand']]]))
  })

  it('reads nothing for no comments, and throws (no guessed split) when the table cannot be read', async () => {
    const db = fakeDb({})
    expect(await loadCommentNamings(db.client as never, { clientId: 'cl', commentIds: [], brands })).toEqual([])
    expect(db.calls).toHaveLength(0)
    await expect(loadCommentNamings(db.client as never, { clientId: 'cl', commentIds: ['c1'], brands })).rejects.toThrow()
  })
})
