import { describe, expect, it } from 'vitest'

import type { DatedEvidence } from '../../written/evidence'
import { groundPoint, groundedPointOf, pointText, unionOf } from './ground'
import { Meaning, stemsOf, wordsSim } from './meaning'
import { QuotePool } from './quotes'
import { cite } from './test-fixtures'

// A tenant with no market lexicon and no maker rule: the gate's quality rules
// alone (the brief is tenant-general).
const CLIENT = '00000000-0000-0000-0000-00000000000a'
const UNIVERSE = new Set(['industry-other', 'competitor:Rival', 'client'])
const words = () => new Meaning(new Map(), 'words')

const ground = (evidence: DatedEvidence[], insights = ['i1'], brandsOf = new Map<string, string[]>()) =>
  groundPoint({ clientId: CLIENT, company: 'Acme', insightIds: insights, claim: 'straps that hold up', evidence, universe: UNIVERSE, brandsOf })

describe('a research point, counted', () => {
  it('counts distinct market videos, by the month the comment was written', () => {
    const g = ground([
      cite({ insight: 'i1', video: 'v1', date: '2026-08-20T00:00:00Z' }),
      cite({ insight: 'i1', video: 'v1', date: '2026-09-02T00:00:00Z' }),
      cite({ insight: 'i1', video: 'v2' }),
      cite({ insight: 'i1', video: 'v3' }),
    ])
    expect(g.videoIds).toEqual(['v1', 'v2', 'v3'])
    expect(g.monthVideoIds).toEqual({ '2026-08-01': ['v1'], '2026-09-01': ['v1', 'v2', 'v3'] })
    expect(g.usable).toBe(true)
  })

  it('is not usable under three videos: a detail from one or two threads is a single-video claim', () => {
    expect(ground([cite({ insight: 'i1', video: 'v1' }), cite({ insight: 'i1', video: 'v2' })]).usable).toBe(false)
  })

  it('never counts a maker\'s video, a brand insider, another lane, or another point\'s insight', () => {
    const g = ground([
      cite({ insight: 'i1', video: 'v1', segment: 'maker' }),
      cite({ insight: 'i1', video: 'v2', insider: true }),
      cite({ insight: 'i1', video: 'v3', lane: 'light' }),
      cite({ insight: 'other', video: 'v4' }),
      cite({ insight: 'i1', video: 'v5' }),
    ])
    expect(g.videoIds).toEqual(['v5'])
    expect(g.seenVideos).toBe(3)
    expect(g.makerVideos).toBe(1)
  })

  it('counts talk under the client\'s own post, judged without the rules about who posted it', () => {
    const own = ['o1', 'o2', 'o3'].map((v) => cite({ insight: 'i1', video: v, audience: 'client', account: 'Acme Bags shop', text: 'Huge respect for putting responsibility behind the adventure.' }))
    const g = ground(own)
    expect(g.videoIds).toEqual(['o1', 'o2', 'o3'])
    expect(g.who).toEqual([{ about: 'client', videos: 3 }])
  })

  it('is not usable where makers are the majority of its talk', () => {
    const g = ground([
      cite({ insight: 'i1', video: 'm1', segment: 'maker' }), cite({ insight: 'i1', video: 'm2', segment: 'maker' }),
      cite({ insight: 'i1', video: 'm3', segment: 'maker' }), cite({ insight: 'i1', video: 'm4', segment: 'maker' }),
      cite({ insight: 'i1', video: 'v1' }), cite({ insight: 'i1', video: 'v2' }), cite({ insight: 'i1', video: 'v3' }),
    ])
    expect(g.videoIds).toEqual(['v1', 'v2', 'v3'])
    expect(g.usable).toBe(false)
  })

  it('a point that is only a theme label is not evidence, whatever it counts', () => {
    const g = ground(['v1', 'v2', 'v3', 'v4'].map((v) => cite({ insight: 'i1', video: v })))
    const p = groundedPointOf({ id: 'G7', text: 'Advanced knee technology impresses: 0 of 487 videos.', insightIds: ['i1'], questionId: 'sales.rivals', replaced: true }, 'sales', g)
    expect(p).toMatchObject({ usable: false, labelOnly: true, text: 'Advanced knee technology impresses' })
    expect(pointText('Durability and wear concerns: 14 of 900 videos.')).toBe('Durability and wear concerns')
  })

  it('files a video under the tracked brand its counted comment names, else its audience', () => {
    const named = cite({ insight: 'i1', video: 'v1' })
    const g = ground([named, cite({ insight: 'i1', video: 'v2', audience: 'competitor:Rival' })], ['i1'], new Map([[named.commentId, ['Rival']]]))
    expect(g.who).toEqual([{ about: 'rival:Rival', videos: 2 }])
  })

  it('a union counts a shared video once and keeps every month', () => {
    const u = unionOf(
      [{ videoIds: ['a', 'b'], monthVideoIds: { '2026-09-01': ['a', 'b'] } }, { videoIds: ['b', 'c'], monthVideoIds: { '2026-08-01': ['c'], '2026-09-01': ['b'] } }],
      [{ id: 'a', audience: 'industry-other', named: [] }, { id: 'b', audience: 'client', named: [] }, { id: 'c', audience: 'industry-other', named: [] }],
      'Acme',
    )
    expect(u.videos).toBe(3)
    expect(u.months).toEqual([{ month: '2026-08-01', videos: 1 }, { month: '2026-09-01', videos: 2 }])
    expect(u.who).toEqual([{ about: 'client', videos: 1 }, { about: 'market', videos: 2 }])
  })
})

describe('the quotes a set prints, by meaning', () => {
  const rows = [
    cite({ insight: 'i1', video: 'q1', text: 'The straps held up after a month of daily walking and I would buy it again.' }),
    cite({ insight: 'i1', video: 'q2', text: 'Mine snapped at the buckle within two weeks, so I sent it back.', description: 'An owner says the buckle snapped within weeks and returned it.' }),
    cite({ insight: 'i1', video: 'q3', text: 'Where can I buy it?' }),
    cite({ insight: 'i1', video: 'q1', text: 'The straps on this one held up through a whole month of daily walking too.' }),
  ]
  const pool = () => new QuotePool(new Map([['G1', rows], ['G2', rows]]), { clientId: CLIENT, company: 'Acme', brandsOf: new Map(), meaning: words() })

  it('stores a ref and never the words, and hands the words to a renderer only', () => {
    const p = pool()
    const [q] = p.pick(['G1'], 'straps held up through daily walking')
    expect(q.text).toBe('')
    expect(q.ref).toMatch(/^e:ev/)
    expect(p.textOf(q.ref)?.text).toMatch(/straps/)
  })

  it('judges fit on the quote\'s insight, and prints nothing that misses what it sits beside', () => {
    const p = pool()
    const [q] = p.pick(['G1'], 'the buckle snapped and the owner returned it')
    expect(p.textOf(q.ref)?.text).toMatch(/buckle/)
    expect(pool().pick(['G1'], 'warranty claims at the dealer')).toEqual([])
  })

  it('never two voices from one video beside one item, and never the same voice twice in a set', () => {
    const p = pool()
    const two = p.pick(['G1'], 'straps held up daily walking month', 2)
    expect(two).toHaveLength(1)
    const again = p.pick(['G2'], 'straps held up daily walking month', 2)
    expect(again.map((q) => q.ref)).not.toContain(two[0].ref)
  })

  it('never prints a creator answering under their own post', () => {
    const own = cite({ insight: 'i1', video: 'q9', author: 'the maker', account: 'the maker', text: 'Thank you all, the new straps are stitched twice and hold up for years.' })
    const p = new QuotePool(new Map([['G1', [own]]]), { clientId: CLIENT, company: 'Acme', brandsOf: new Map(), meaning: words() })
    expect(p.pick(['G1'], 'straps stitched twice hold up years')).toEqual([])
  })

  it('says where a translated quote came from and keeps the English for the reader', () => {
    const es = cite({ insight: 'i1', video: 'q7', text: 'Las correas aguantaron un mes entero de caminatas diarias.', english: 'The straps lasted a whole month of daily walks.', lang: 'es', description: 'The straps lasted a month of daily walks.' })
    const p = new QuotePool(new Map([['G1', [es]]]), { clientId: CLIENT, company: 'Acme', brandsOf: new Map(), meaning: words() })
    const [q] = p.pick(['G1'], 'straps lasted daily walks')
    expect(q.lang).toBe('es')
    expect(p.textOf(q.ref)?.english).toBe('The straps lasted a whole month of daily walks.')
  })
})

describe('meaning', () => {
  it('collects every text it is asked about, and judges by vectors once it has them', () => {
    const collect = new Meaning(new Map(), 'collect')
    expect(collect.sim('one text', 'another text')).toBe(1)
    expect(collect.wanted().sort()).toEqual(['another text', 'one text'])
    const v = new Meaning(new Map([['a', [1, 0]], ['b', [0, 1]], ['c', [1, 0]]]), 'vectors')
    expect(v.sim('a', 'b')).toBe(0)
    expect(v.sim('a', 'c')).toBe(1)
    expect(v.wanted()).toEqual([])
  })

  it('by words: shared content stems over the smaller side, filler out', () => {
    expect([...stemsOf('People really like the straps')]).toEqual(['strap'])
    expect(wordsSim('the straps snapped', 'straps that snapped at the buckle')).toBe(1)
  })
})
