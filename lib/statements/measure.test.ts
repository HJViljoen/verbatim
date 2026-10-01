import { describe, expect, it } from 'vitest'

import {
  aboutOf,
  buildGlossPrompt,
  buildStancePrompt,
  buildStatementJudgePrompt,
  glossText,
  readingFrom,
  scrubSays,
  statementMonth,
  validateStanceResponse,
  type DatedMember,
} from './measure'
import { READING_VERSION } from './types'

const m = (id: string, videos: [string, 'market' | 'own', string?][]): DatedMember => ({
  id,
  videos: videos.map(([v, lane, about]) => ({ id: v, lane, about: (about ?? (lane === 'own' ? 'client' : 'market')) as DatedMember['videos'][number]['about'] })),
})

describe('readingFrom', () => {
  it('counts distinct market videos against the month base, and stances by video', () => {
    const r = readingFrom({
      month: '2026-09-01', complete: true, marketBase: 852,
      members: [m('a', [['v1', 'market'], ['v2', 'market']]), m('b', [['v2', 'market'], ['v3', 'market', 'rival:Freitag']]), m('c', [])],
      stances: new Map([['a', 'backs'], ['b', 'doubts'], ['c', 'asks']]),
      says: 'People like it.',
    })
    expect(r.version).toBe(READING_VERSION)
    expect(r.market).toEqual({ videos: 3, base: 852 })
    expect(r.own).toEqual({ videos: 0 })
    // v2 carries a backer and a doubter: it counts in both, each against the base.
    expect(r.stance).toEqual({ of: 'market', base: 3, backs: 2, doubts: 2, asks: 0 })
    expect(r.who).toEqual([{ about: 'market', videos: 2 }, { about: 'rival:Freitag', videos: 1 }])
    expect(r.who.reduce((n, w) => n + w.videos, 0)).toBe(r.stance!.base)
    expect(r.members).toBe(2)
    expect(r.says).toBe('People like it.')
  })

  it('reads the client’s own posts when the market is silent', () => {
    const r = readingFrom({
      month: '2026-09-01', complete: true, marketBase: 852,
      members: [m('a', [['p1', 'own'], ['p2', 'own']]), m('b', [['p2', 'own']])],
      stances: new Map([['a', 'backs'], ['b', 'neutral']]),
      says: 'People back the cleanups.',
    })
    expect(r.market.videos).toBe(0)
    expect(r.own.videos).toBe(2)
    expect(r.stance).toEqual({ of: 'own', base: 2, backs: 2, doubts: 0, asks: 0 })
    expect(r.who).toEqual([{ about: 'client', videos: 2 }])
  })

  it('states an absence with no stance and no sentence when nobody talks about it', () => {
    const r = readingFrom({ month: '2026-09-01', complete: true, marketBase: 852, members: [m('a', [])], stances: new Map(), says: 'ignored' })
    expect(r.market).toEqual({ videos: 0, base: 852 })
    expect(r.own.videos).toBe(0)
    expect(r.stance).toBeNull()
    expect(r.says).toBeNull()
    expect(r.who).toEqual([])
  })
})

describe('aboutOf', () => {
  it('maps the audience string to who the talk is about', () => {
    expect(aboutOf('industry-other', false)).toBe('market')
    expect(aboutOf('competitor:Freitag', false)).toBe('rival:Freitag')
    expect(aboutOf(undefined, true)).toBe('client')
    expect(aboutOf('competitor:Freitag', true)).toBe('client')
  })
})

describe('statementMonth', () => {
  it('reads the month a run’s week is restated against, complete once it has ended', () => {
    const w = { from: '2026-09-20T04:00:00.000Z', to: '2026-09-27T04:00:00.000Z' }
    expect(statementMonth(w, new Date('2026-10-01T12:00:00Z'))).toEqual({ month: '2026-09-01', complete: true })
    expect(statementMonth(w, new Date('2026-09-28T12:00:00Z'))).toEqual({ month: '2026-09-01', complete: false })
    // A week crossing the month end reads the month it started in.
    expect(statementMonth({ from: '2026-09-27T04:00:00.000Z', to: '2026-10-04T04:00:00.000Z' }, new Date('2026-10-04T06:00:00Z')).month).toBe('2026-09-01')
  })
})

describe('validateStanceResponse', () => {
  it('maps refs onto ids and drops bad, duplicate and out-of-range refs', () => {
    const batch = [{ id: 'a' }, { id: 'b' }]
    const out = validateStanceResponse({ stances: [
      { ref: 'i1', stance: 'backs' }, { ref: 'i1', stance: 'doubts' }, { ref: 'i3', stance: 'asks' }, { ref: 'x', stance: 'asks' }, { ref: 'I2', stance: 'asks' },
    ], says: '' }, batch)
    expect([...out]).toEqual([['a', 'backs'], ['b', 'asks']])
  })
})

describe('scrubSays', () => {
  it('keeps a plain sentence', () => {
    const s = 'People love upcycling ideas and anti-waste design, but they also ask what materials are used and whether the claim is genuine.'
    expect(scrubSays(s)).toBe(s)
  })
  it('drops a sentence with a digit, a direction word or a word about how it was made', () => {
    expect(scrubSays('About 40 videos praise it.')).toBeNull()
    expect(scrubSays('Talk about recycled nylon is growing.')).toBeNull()
    expect(scrubSays('Our searches found people praising it.')).toBeNull()
  })
  it('keeps one sentence and never an empty one', () => {
    expect(scrubSays('People praise it. They also ask where it is made.')).toBe('People praise it.')
    expect(scrubSays('')).toBeNull()
  })
})

describe('the prompts', () => {
  it('name the claim and the brand, and keep the stance sentence free of method and change words', () => {
    expect(buildStatementJudgePrompt('Made from recycled nylon', 'Sealand')).toContain('THE CLAIM: "Made from recycled nylon"')
    const stance = buildStancePrompt('Made from recycled nylon', 'Sealand')
    expect(stance).toContain('backs')
    expect(stance).toMatch(/no numbers/)
    expect(stance).toMatch(/new, growing/)
    expect(buildGlossPrompt('Sealand')).toContain('do not name Sealand')
  })
  it('writes the gloss in the insight embedding’s own register', () => {
    expect(glossText({ lines: [
      { slug: 'recycled_nylon_bags', description: 'Viewers like bags made from recycled nylon.' },
      { slug: 'recycled_doubt', description: 'Commenters doubt the claim.' },
    ] })).toBe('recycled nylon bags. Viewers like bags made from recycled nylon. recycled doubt. Commenters doubt the claim.')
  })
})
