import { describe, expect, it } from 'vitest'

import type { SupabaseClient } from '@supabase/supabase-js'

import { overlapSpellings, pgTextArray, readRivalFound, rivalFoundOf, rivalSearchTerms, withoutRivalSearches } from './rival-searches'

// The one base every brand's headline count sits over (decision E, the
// research's F37, the 27 Sep ruling): the market's videos that no rival search
// of ours found, current or retired. The terms are staging's rival bucket as
// keyword_performance holds it for Sealand (27 Sep), and its
// competitor_keywords then.

const RUN_TERMS = [
  // Until 9 Sep: the bare names, Poler and Topo Designs among them (retired).
  'cotopaxi', 'freitag', 'patagonia', 'poler', 'topo designs',
  // From 9, 13 and 20 Sep.
  'cotopaxi backpack', 'freitag bag', 'rareform bag', 'frtg', 'fombrand', 'north face backpack', 'patagonia black hole',
].map((keyword) => ({ keyword, bucket: 'competitor' }))
const CONFIGURED = ['cotopaxi backpack', 'freitag bag', 'frtg', 'rareform bag', 'north face backpack', 'patagonia black hole', 'fombrand']

describe('the rival searches', () => {
  it('are every term run in the rival bucket, retired ones included, and every term configured as one now', () => {
    const terms = rivalSearchTerms(RUN_TERMS, CONFIGURED)
    expect(terms.size).toBe(12)
    for (const t of ['poler', 'topo designs', 'patagonia', 'north face backpack']) expect(terms.has(t), t).toBe(true)
    // A term configured and not yet run is one too; another bucket's is not.
    expect(rivalSearchTerms([{ keyword: 'upcycled bag', bucket: 'industry' }], ['Osprey Farpoint ']).has('osprey farpoint')).toBe(true)
    expect(rivalSearchTerms([{ keyword: 'upcycled bag', bucket: 'industry' }], null).size).toBe(0)
  })

  it('asks the overlap for each spelling as stored and as compared, quoted so a comma or a quote cannot split a term', () => {
    expect(overlapSpellings([{ keyword: 'North Face Backpack' }], ['frtg'])).toEqual(['North Face Backpack', 'frtg', 'north face backpack'])
    expect(pgTextArray(['north face backpack', 'a,b', 'say "hi"'])).toBe('{"north face backpack","a,b","say \\"hi\\""}')
  })

  it('finds a video by its first-found terms or its terms now, whichever brand the search was for', () => {
    const rival = rivalSearchTerms(RUN_TERMS, CONFIGURED)
    const found = rivalFoundOf([
      { id: 'v1', terms: ['upcycled bag', 'Patagonia Black Hole'] }, // a rival search among others
      { id: 'v2', terms: ['upcycled bag'] },
      { id: 'v3', terms: ['poler'] }, // a retired rival's search
      { id: 'v4', terms: null },
      { id: 'v2', terms: ['frtg'] }, // its first-found terms name one
    ], rival)
    expect([...found].sort()).toEqual(['v1', 'v2', 'v3'])
    expect(withoutRivalSearches(['v1', 'v2', 'v3', 'v4', 'v5'], found)).toEqual(['v4', 'v5'])
  })
})

/** A client that answers the three reads from tables, one page at a time,
 *  logging each request and how many were in flight. */
function fakeClient(tables: Record<string, Record<string, unknown>[] | Error>, log: string[]) {
  let inFlight = 0
  let most = 0
  const client = {
    from(table: string) {
      const q = {
        select: () => q, eq: () => q, overlaps: () => q, order: () => q,
        range: async (from: number, to: number) => {
          inFlight += 1
          most = Math.max(most, inFlight)
          log.push(`read ${table} ${from}`)
          await new Promise((r) => setTimeout(r, 5))
          inFlight -= 1
          const rows = tables[table]
          if (rows instanceof Error) return { data: null, error: { message: rows.message } }
          return { data: (rows ?? []).slice(from, to + 1), error: null }
        },
      }
      return q
    },
  }
  return { client: client as unknown as SupabaseClient, most: () => most }
}

describe('reading them (plan §7.6: one query in flight)', () => {
  const tables = {
    keyword_performance: RUN_TERMS.map((r, i) => ({ id: String(i), ...r })),
    videos: [{ id: 'v1', source_keywords: ['patagonia black hole'] }, { id: 'v2', source_keywords: ['upcycled bag'] }],
    video_provenance: [{ video_id: 'v3', first_terms: ['poler'] }],
  }

  it('reads in turn, never two at once, and charges the allowance before each page', async () => {
    const log: string[] = []
    const { client, most } = fakeClient(tables, log)
    const got = await readRivalFound(client, 'c', CONFIGURED, { spend: (k, what) => log.push(`charge ${k} ${what}`) })
    expect(most()).toBe(1)
    expect(log).toEqual([
      'charge 1 the rival searches', 'read keyword_performance 0',
      'charge 1 the videos our rival searches found', 'read videos 0',
      'charge 1 the videos our rival searches found first', 'read video_provenance 0',
    ])
    expect([...got.videos].sort()).toEqual(['v1', 'v3'])
    expect(got.pages).toBe(3)
  })

  it('stops before the read that would overshoot the allowance', async () => {
    const log: string[] = []
    const { client } = fakeClient(tables, log)
    let n = 0
    const ration = { spend: (k: number, what: string) => { n += k; if (n > 2) throw new Error(`spent at ${what}`) } }
    await expect(readRivalFound(client, 'c', CONFIGURED, ration)).rejects.toThrow('spent at the videos our rival searches found first')
    expect(log).toEqual(['read keyword_performance 0', 'read videos 0'])
  })

  it('reads no first-found terms where MF1 is not applied, and throws on any other failure', async () => {
    const gone = fakeClient({ ...tables, video_provenance: new Error('Could not find the table public.video_provenance in the schema cache') }, [])
    expect([...(await readRivalFound(gone.client, 'c', CONFIGURED)).videos]).toEqual(['v1'])
    const broken = fakeClient({ ...tables, videos: new Error('timeout') }, [])
    await expect(readRivalFound(broken.client, 'c', CONFIGURED)).rejects.toThrow('timeout')
  })
})
