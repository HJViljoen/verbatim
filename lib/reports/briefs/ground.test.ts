import { describe, expect, it } from 'vitest'

import type { DatedEvidence } from '../../written/evidence'
import { cite } from './test-fixtures'
import { groundPoint, unionOf } from './ground'
import { QuotePool, genericStems, specificRelevance, stemsOf } from './quotes'

// A tenant with no market lexicon and no maker rule: the gate's quality rules
// alone (the brief is tenant-general).
const CLIENT = '00000000-0000-0000-0000-00000000000a'
const UNIVERSE = new Set(['industry-other', 'competitor:Rival', 'client'])

const ground = (evidence: DatedEvidence[], insights = ['i1'], brandsOf = new Map<string, string[]>()) =>
  groundPoint({ clientId: CLIENT, company: 'Acme', insightIds: insights, claim: 'straps that hold up', evidence, universe: UNIVERSE, brandsOf })

describe('a research point, counted', () => {
  it('counts distinct market videos, by the month the comment was written', () => {
    const g = ground([
      cite({ insight: 'i1', video: 'v1', date: '2026-08-20T00:00:00Z' }),
      cite({ insight: 'i1', video: 'v1', date: '2026-09-02T00:00:00Z' }),
      cite({ insight: 'i1', video: 'v2' }),
    ])
    expect(g.videoIds).toEqual(['v1', 'v2'])
    expect(g.monthVideoIds).toEqual({ '2026-08-01': ['v1'], '2026-09-01': ['v1', 'v2'] })
    expect(g.usable).toBe(true)
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

  it('counts talk under the client\'s own posts: it is talk about the client', () => {
    const g = ground([cite({ insight: 'i1', video: 'own', audience: 'client' })])
    expect(g.videoIds).toEqual(['own'])
    expect(g.who).toEqual([{ about: 'client', videos: 1 }])
  })

  it('is not usable where makers are the majority of its talk; at half it stands on its market videos', () => {
    const g = ground([
      cite({ insight: 'i1', video: 'm1', segment: 'maker' }),
      cite({ insight: 'i1', video: 'm2', segment: 'maker' }),
      cite({ insight: 'i1', video: 'v1' }),
    ])
    expect(g.videoIds).toEqual(['v1'])
    expect(g.usable).toBe(false)
    const half = ground([cite({ insight: 'i1', video: 'm3', segment: 'maker' }), cite({ insight: 'i1', video: 'v2' })])
    expect(half.usable).toBe(true)
  })

  it('judges talk under the client\'s own post without the rules about who posted it', () => {
    const own = cite({ insight: 'i1', video: 'own', audience: 'client', account: 'Acme Bags shop', text: 'Huge respect for putting responsibility behind the adventure.' })
    expect(ground([own]).videoIds).toEqual(['own'])
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

describe('the quotes a set prints', () => {
  const rows = [
    cite({ insight: 'i1', video: 'q1', text: 'The straps held up after a month of daily walking and I would buy it again.' }),
    cite({ insight: 'i1', video: 'q2', text: 'Mine snapped at the buckle within two weeks, so I sent it back.' }),
    cite({ insight: 'i1', video: 'q3', text: 'Where can I buy it?' }),
  ]
  const pool = () => new QuotePool(new Map([['G1', rows], ['G2', rows]]), { clientId: CLIENT, company: 'Acme', brandsOf: new Map() })

  it('stores a ref and never the words, and hands the words to a renderer only', () => {
    const p = pool()
    const [q] = p.pick(['G1'], 'straps that hold up')
    expect(q.text).toBe('')
    expect(q.ref).toMatch(/^e:ev/)
    expect(p.textOf(q.ref)?.text).toMatch(/straps/)
  })

  it('never prints the same voice twice in a set, even for another point that cites it', () => {
    const p = pool()
    const first = p.pick(['G1'], 'straps hold up', 2)
    const second = p.pick(['G2'], 'straps hold up', 2)
    const refs = [...first, ...second].map((q) => q.ref)
    expect(new Set(refs).size).toBe(refs.length)
  })

  it('prefers a line that says something to a bare question, and prints nothing that misses the claim', () => {
    const p = pool()
    const [first] = p.pick(['G1'], 'daily walking', 1)
    expect(p.textOf(first.ref)?.text).toBe('The straps held up after a month of daily walking and I would buy it again.')
    expect(pool().pick(['G1'], 'warranty claims')).toEqual([])
  })

  it('never prints a creator answering under their own post', () => {
    const own = cite({ insight: 'i1', video: 'q9', author: 'the maker', account: 'the maker', text: 'Thank you all, the new straps are stitched twice and hold up for years.' })
    const p = new QuotePool(new Map([['G1', [own]]]), { clientId: CLIENT, company: 'Acme', brandsOf: new Map() })
    expect(p.pick(['G1'], 'straps')).toEqual([])
  })

  it('says where a translated quote came from and keeps the English for the reader', () => {
    const es = cite({ insight: 'i1', video: 'q7', text: 'Las correas aguantaron un mes entero de caminatas diarias.', english: 'The straps lasted a whole month of daily walks.', lang: 'es' })
    const p = new QuotePool(new Map([['G1', [es]]]), { clientId: CLIENT, company: 'Acme', brandsOf: new Map() })
    const [q] = p.pick(['G1'], 'straps')
    expect(q.lang).toBe('es')
    expect(p.textOf(q.ref)?.english).toBe('The straps lasted a whole month of daily walks.')
  })
})

describe('which voice fits', () => {
  it('a word most of the voices share says nothing about fit; the claim\'s specific words do', () => {
    const voices = ['My backpack ripped at the seam', 'The backpack holds a laptop', 'A backpack in bright colours', 'This backpack smells after rain', 'Backpack straps dig in'].map(stemsOf)
    const claim = stemsOf('The backpack seam ripped after rain')
    const generic = genericStems(claim, voices)
    expect([...generic]).toEqual(['backp'])
    expect(specificRelevance(claim, voices[0], generic)).toBe(2)
    expect(specificRelevance(claim, voices[1], generic)).toBe(0)
  })
})
