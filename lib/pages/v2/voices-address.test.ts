import { describe, expect, it } from 'vitest'
import { surface } from '../../nav'
import {
  creatorParam, creatorPathOf, isVoicesPage, pathSegment, VOICES_PATH, voicesBrandHref, voicesBrandPath, voicesCreatorHref, voicesCreatorPath,
  voicesGroupHref, voicesGroupPath, voicesLevelRedirect, voicesMonthQuery,
} from './voices-address'

// VOICES' ADDRESSES, WRITTEN ONCE (17 Oct, the G3 boards). The redirects
// themselves are pinned in lib/nav-redirects.test.ts (Voices' table).

describe('Voices\' addresses', () => {
  it('the root is the surface\'s own address (a literal here, so nav.ts can import this module)', () => {
    expect(VOICES_PATH).toBe(surface('voices').href)
  })

  it('a group, a brand and a creator, each its own address; a creator in two segments', () => {
    expect(voicesGroupPath('carers')).toBe('/dashboard/voices/groups/carers')
    expect(voicesBrandPath('client')).toBe('/dashboard/voices/brands/client')
    expect(voicesBrandPath('watched:old-school')).toBe('/dashboard/voices/brands/watched:old-school')
    expect(voicesCreatorPath('tiktok', '@stepbystep.amp')).toBe('/dashboard/voices/creators/tiktok/@stepbystep.amp')
    expect(voicesCreatorPath('youtube', 'The Amputee Diaries')).toBe('/dashboard/voices/creators/youtube/The%20Amputee%20Diaries')
  })

  it('a segment keeps "@" and ":" readable and escapes the rest, a slash and a pipe included', () => {
    expect(pathSegment('a/b|c?d#e')).toBe('a%2Fb%7Cc%3Fd%23e')
    expect(pathSegment('@x:y')).toBe('@x:y')
  })

  it('the chosen month travels as YYYY-MM, and nothing where none was chosen', () => {
    expect(voicesMonthQuery('2026-09-01')).toBe('?month=2026-09')
    expect(voicesMonthQuery(null)).toBe('')
    expect(voicesGroupHref('carers', { month: '2026-09' })).toBe('/dashboard/voices/groups/carers?month=2026-09')
    expect(voicesBrandHref('client')).toBe('/dashboard/voices/brands/client')
    expect(voicesCreatorHref('tiktok', '@a', { month: '2026-09-01' })).toBe('/dashboard/voices/creators/tiktok/@a?month=2026-09')
  })

  it('knows its own pages, and no other', () => {
    for (const p of ['/dashboard/voices', '/dashboard/voices/groups/carers', '/dashboard/voices/brands/client', '/dashboard/voices/creators/tiktok/@a', '/dashboard/voices/creators/@a']) expect(isVoicesPage(p), p).toBe(true)
    for (const p of ['/dashboard/voices/groups', '/dashboard/voices/groups/a/b', '/dashboard/voices/creators/a/b/c', '/dashboard/voice', '/dashboard/voicesx']) expect(isVoicesPage(p), p).toBe(false)
  })

  it('an old ?creator= value: platform|account, or the account alone (one segment)', () => {
    expect(creatorParam('tiktok|@a')).toEqual({ platform: 'tiktok', account: '@a' })
    expect(creatorParam('@a')).toEqual({ platform: null, account: '@a' })
    expect(creatorParam('|@a')).toEqual({ platform: null, account: '|@a' })
    expect(creatorPathOf('instagram|limbcare.clinic')).toBe('/dashboard/voices/creators/instagram/limbcare.clinic')
    expect(creatorPathOf('limbcare.clinic')).toBe('/dashboard/voices/creators/limbcare.clinic')
  })

  it('answers only for the addresses it maps: the root with nothing to open stays (null), any other address is not its to answer', () => {
    expect(voicesLevelRedirect('/dashboard/voices', {})).toBeNull()
    expect(voicesLevelRedirect('/dashboard/voices', { month: '2026-09' })).toBeNull()
    expect(voicesLevelRedirect('/dashboard/voice', {})).toBeUndefined()
    expect(voicesLevelRedirect('/dashboard/voice', { theme: 'reg-1', brand: 'Ottobock' })).toBeUndefined()
    expect(voicesLevelRedirect('/dashboard/competitive', {})).toBeUndefined()
    expect(voicesLevelRedirect('/dashboard/market', { brand: 'x' })).toBeUndefined()
    expect(voicesLevelRedirect('/dashboard/voices', { group: ['a', 'b'] })).toBe('/dashboard/voices/groups/a')
  })
})
