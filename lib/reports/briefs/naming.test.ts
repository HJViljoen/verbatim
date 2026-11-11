import { describe, expect, it } from 'vitest'

import type { CrossMention } from '../../reading/cross'
import { namingOf, type NamingVideo } from './naming'

// Who named each brand in the month (naming.ts): one base for every row, each
// brand's own posts out, every video a brand search found out of the videos'
// base. Made-up videos and namings; nothing here is a reading.

const OCT = '2026-10-01'
const BRANDS = [{ brandKey: 'client', label: 'Acme' }, { brandKey: 'r1', label: 'Rival' }]
const v = (id: string, comments: number, owner: string | null = null, platform = 'tiktok'): NamingVideo => ({ id, platform, comments, owner })
const comment = (videoId: string, brandKey: string, month = OCT): CrossMention => ({ videoId, brandKey, source: 'comment', commentMonth: month })
const content = (videoId: string, brandKey: string): CrossMention => ({ videoId, brandKey, source: 'content', commentMonth: null })

describe('namingOf', () => {
  const videos = [
    v('own', 100, 'client', 'instagram'), // the company's own post
    v('found-acme', 40), // our search for the company found it
    v('found-rival', 50), // our search for the rival found it
    v('a', 30, null, 'reddit'), v('b', 20), v('c', 10, null, 'youtube'),
  ]
  const searched = new Set(['found-acme', 'found-rival'])
  const mentions = [
    comment('own', 'client'), comment('own', 'client'), // under its own post: never counted
    comment('found-acme', 'client'), comment('found-rival', 'r1'), comment('found-rival', 'r1'),
    comment('a', 'client'), content('b', 'client'), content('c', 'r1'),
    comment('a', 'r1', '2026-09-01'), // a September comment: neither count
  ]

  it('comments naming each brand over every video read but the brands\' own; videos named unasked over those no brand search found', () => {
    const n = namingOf({ month: OCT, brands: BRANDS, videos, searched, mentions })!
    expect(n.comments).toBe(150)
    expect(n.videos).toBe(3)
    expect(n.rows).toEqual([
      { brandKey: 'client', label: 'Acme', you: true, comments: 2, videos: 2, platforms: ['Reddit', 'TikTok'] },
      { brandKey: 'r1', label: 'Rival', you: false, comments: 2, videos: 1, platforms: ['YouTube'] },
    ])
  })

  it('the company first, whatever its count; nothing without the company and a rival', () => {
    const n = namingOf({ month: OCT, brands: BRANDS, videos, searched, mentions: [comment('a', 'r1'), comment('b', 'r1')] })!
    expect(n.rows.map((r) => [r.label, r.comments])).toEqual([['Acme', 0], ['Rival', 2]])
    expect(namingOf({ month: OCT, brands: BRANDS.slice(0, 1), videos, searched, mentions })).toBeNull()
    expect(namingOf({ month: OCT, brands: BRANDS.slice(1), videos, searched, mentions })).toBeNull()
  })

  it('a rival\'s own post is out of both bases too', () => {
    const n = namingOf({ month: OCT, brands: BRANDS, videos: [...videos, v('theirs', 70, 'r1')], searched, mentions: [...mentions, content('theirs', 'r1')] })!
    expect(n.comments).toBe(150)
    expect(n.rows[1].videos).toBe(1)
  })
})
