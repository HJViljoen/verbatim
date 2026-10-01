import { describe, expect, it } from 'vitest'

import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '../rivals'
import { aboutOf, mergeWhoVideos, whoOfAudiences, whoSplit } from './who'

// Who a piece of talk is about (the pages build's brand rule): a named brand
// wins, else the audience; one brand per video, so a split adds up.

describe('aboutOf', () => {
  it('a named brand wins over the audience, the alphabetically first of two', () => {
    expect(aboutOf({ audience: INDUSTRY_AUDIENCE, named: ['The North Face', 'Cotopaxi'] }, 'Sealand')).toBe('rival:Cotopaxi')
    expect(aboutOf({ audience: 'competitor:Cotopaxi', named: ['Sealand'] }, 'Sealand')).toBe('client')
    expect(aboutOf({ audience: INDUSTRY_AUDIENCE, named: ['sealand'] }, 'Sealand')).toBe('client')
  })

  it('else the audience: own posts, a rival\'s filed videos, the category', () => {
    expect(aboutOf({ audience: CLIENT_AUDIENCE, named: [] }, 'Sealand')).toBe('client')
    expect(aboutOf({ audience: 'competitor:Patagonia', named: [] }, 'Sealand')).toBe('rival:Patagonia')
    expect(aboutOf({ audience: INDUSTRY_AUDIENCE, named: [] }, 'Sealand')).toBe('market')
  })
})

describe('whoSplit', () => {
  it('one brand per video, merged across sightings; the client first, rivals by videos, the category last', () => {
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
    expect(mergeWhoVideos([{ id: 'v1', audience: 'x', named: ['A'] }, { id: 'v1', audience: 'x', named: ['B'] }])).toEqual([{ id: 'v1', audience: 'x', named: ['A', 'B'] }])
  })
})

describe('whoOfAudiences', () => {
  it('splits a per-audience count over the audiences asked for', () => {
    const rows = [
      { audience: INDUSTRY_AUDIENCE, videos: 599 },
      { audience: 'competitor:Patagonia', videos: 11 },
      { audience: 'competitor:Freitag', videos: 4 },
      { audience: CLIENT_AUDIENCE, videos: 7 },
      { audience: 'competitor:Gone', videos: 0 },
    ]
    expect(whoOfAudiences(rows, new Set([INDUSTRY_AUDIENCE, 'competitor:Patagonia', 'competitor:Freitag', 'competitor:Gone']))).toEqual([
      { about: 'rival:Patagonia', videos: 11 },
      { about: 'rival:Freitag', videos: 4 },
      { about: 'market', videos: 599 },
    ])
  })
})
