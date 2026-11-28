import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { firstWorking, providerOrder, providerOrderEnv, summariseSearchNotes, type Attempt } from './router'
import { ProviderError } from './transport'

// The provider router (28 Nov 2026): order, failover, and the notes a run
// warning is made of.

const isEmpty = (r: string[]) => r.length === 0
const ok = (provider: string, items: string[]): Attempt<string[]> & { ran: () => number } => {
  let n = 0
  return { provider, run: async () => { n++; return items }, ran: () => n }
}
const boom = (provider: string, e: unknown): Attempt<string[]> & { ran: () => number } => {
  let n = 0
  return { provider, run: async () => { n++; throw e }, ran: () => n }
}

describe('firstWorking', () => {
  it('takes the first source when it works, and never runs the next', async () => {
    const a = ok('tikhub', ['x', 'y'])
    const b = ok('apify', ['z'])
    const r = await firstWorking([a, b], isEmpty)
    expect(r).toEqual({ result: ['x', 'y'], provider: 'tikhub', notes: [] })
    expect(b.ran()).toBe(0)
  })

  it('moves on when the first throws, and says why', async () => {
    const r = await firstWorking([boom('tikhub', new ProviderError('http', 'TikHub answered HTTP 502')), ok('apify', ['z'])], isEmpty)
    expect(r.result).toEqual(['z'])
    expect(r.provider).toBe('apify')
    expect(r.notes).toEqual(['TikHub did not work (TikHub answered HTTP 502), so the search used Apify'])
  })

  it('says a source that was not set up was skipped, not that it failed', async () => {
    const r = await firstWorking([boom('tikhub', new ProviderError('unavailable', 'TikHub is not set up')), ok('apify', ['z'])], isEmpty)
    expect(r.notes).toEqual(['TikHub was skipped (TikHub is not set up), so the search used Apify'])
  })

  it('moves on when the first finds nothing', async () => {
    const r = await firstWorking([ok('tikhub', []), ok('apify', ['z'])], isEmpty)
    expect(r).toEqual({ result: ['z'], provider: 'apify', notes: ['TikHub found nothing, so the search also tried Apify'] })
  })

  it('returns the first empty answer when every source is empty', async () => {
    const first: string[] = []
    const r = await firstWorking([{ provider: 'tikhub', run: async () => first }, ok('apify', [])], isEmpty)
    expect(r.result).toBe(first)
    expect(r.provider).toBe('tikhub')
    expect(r.notes).toEqual(['TikHub found nothing, so the search also tried Apify', 'Apify found nothing either'])
  })

  it('returns an empty answer over a later failure', async () => {
    const r = await firstWorking([ok('tikhub', []), boom('apify', new Error('Apify 402: usage limit'))], isEmpty)
    expect(r.result).toEqual([])
    expect(r.provider).toBe('tikhub')
    expect(r.notes[1]).toBe('Apify did not work either (Apify 402: usage limit)')
  })

  it('rethrows the last error when every source throws', async () => {
    const last = new Error('Apify 500: down')
    await expect(firstWorking([boom('tikhub', new ProviderError('timeout', 'TikHub did not answer within 30 s')), boom('apify', last)], isEmpty)).rejects.toBe(last)
  })

  it('throws with nothing to try', async () => {
    await expect(firstWorking<string[]>([], isEmpty)).rejects.toThrow('no source to try')
  })

  it('keeps a long reason to one line of 160 characters', async () => {
    const r = await firstWorking([boom('tikhub', new Error(`${'x'.repeat(300)}\nsecond line`)), ok('apify', ['z'])], isEmpty)
    expect(r.notes[0]).not.toContain('second line')
    expect(r.notes[0].length).toBeLessThan(220)
  })
})

describe('providerOrder — GATHER_<KEY>_PROVIDERS', () => {
  const ENV = providerOrderEnv('instagram.search')
  let saved: string | undefined
  beforeEach(() => { saved = process.env[ENV]; delete process.env[ENV] })
  afterEach(() => { if (saved === undefined) delete process.env[ENV]; else process.env[ENV] = saved })

  it('names the env line after the key', () => {
    expect(ENV).toBe('GATHER_INSTAGRAM_SEARCH_PROVIDERS')
    expect(providerOrderEnv('reddit.comments')).toBe('GATHER_REDDIT_COMMENTS_PROVIDERS')
  })

  it('defaults Instagram search to TikHub then Apify, and every other job to Apify', () => {
    expect(providerOrder('instagram.search')).toEqual(['tikhub', 'apify'])
    expect(providerOrder('instagram.comments')).toEqual(['apify'])
    expect(providerOrder('reddit.search')).toEqual(['apify'])
    expect(providerOrder('reddit.comments')).toEqual(['apify'])
  })

  it('rolls back with one line', () => {
    process.env[ENV] = 'apify'
    expect(providerOrder('instagram.search')).toEqual(['apify'])
  })

  it('reads a comma list in its order, trimmed, lowercased, once each', () => {
    process.env[ENV] = ' Apify , TIKHUB,apify,'
    expect(providerOrder('instagram.search')).toEqual(['apify', 'tikhub'])
  })

  it('drops names the job cannot run, and never leaves it without a source', () => {
    process.env[ENV] = 'tikhb'
    expect(providerOrder('instagram.search')).toEqual(['tikhub', 'apify'])
    process.env[ENV] = 'hikerapi,apify'
    expect(providerOrder('instagram.search')).toEqual(['apify'])
    process.env.GATHER_INSTAGRAM_COMMENTS_PROVIDERS = 'tikhub'
    expect(providerOrder('instagram.comments')).toEqual(['apify'])
    delete process.env.GATHER_INSTAGRAM_COMMENTS_PROVIDERS
  })
})

describe('summariseSearchNotes — one warning a reason, not one a search', () => {
  it('counts each distinct note across the searches, in first-seen order', () => {
    const a = 'TikHub did not work (TikHub is not set up), so the search used Apify'
    const b = 'TikHub found nothing, so the search also tried Apify'
    expect(summariseSearchNotes([{ notes: [a] }, { notes: [a, b] }, {}, { notes: [a, a] }])).toEqual([
      `${a} (3 of 4 searches)`,
      `${b} (1 of 4 searches)`,
    ])
  })

  it('is empty when no search left a note', () => {
    expect(summariseSearchNotes([{}, { notes: [] }])).toEqual([])
  })
})
