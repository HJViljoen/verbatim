import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { loadThemeQuotes, markVideoSegments, provenanceBatch } from './overview'

// THE D3 SPEED PASS'S TWO NEW SHORTCUTS ANSWER EXACTLY WHAT THE LONG WAY DID.
//
// Your market's loader reads the same rows in fewer round trips (staging, 27
// Sep: 102 reads and 5.3 s down to 96 and 3.2 s for Sealand), and the loader
// dumps are byte-identical before and after. Two of the changes are more than
// a reordering, so each is held here against the path it replaced, on one
// in-memory table set:
//   - `provenanceBatch`: the lead's provenance and "With this update"'s named
//     themes, one read of the union, each theme answered as it was alone;
//   - `loadThemeQuotes`' `segmentsFor`: the headline voices' segments read
//     beside the English, and only for videos the market's segments read did
//     not already hold, set on the same candidates as `markVideoSegments`.

type Row = Record<string, unknown>

/** A PostgREST stand-in over in-memory tables: select (plain columns), eq, in,
 *  not-is-null, order, range and maybeSingle, awaited as PostgREST is; rpc by
 *  name. Every request is logged by table (or `rpc:name`). */
function fakeDb(tables: Record<string, Row[]>, rpcs: Record<string, (args: Record<string, unknown>) => Row[]> = {}) {
  const log: string[] = []
  const client = {
    from(table: string) {
      let cols: string[] = []
      const filters: ((r: Row) => boolean)[] = []
      const orders: string[] = []
      let window: [number, number] | null = null
      let single = false
      const run = () => {
        log.push(table)
        let hit = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
        for (const o of [...orders].reverse()) hit = [...hit].sort((a, b) => String(a[o]).localeCompare(String(b[o])))
        if (window) hit = hit.slice(window[0], window[1] + 1)
        const data = hit.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])))
        return { data: single ? data[0] ?? null : data, error: null }
      }
      const b = {
        select(c: string) { cols = c.split(',').map((x) => x.trim()); return b },
        eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return b },
        in(c: string, vs: unknown[]) { const s = new Set(vs); filters.push((r) => s.has(r[c])); return b },
        not(c: string) { filters.push((r) => r[c] != null); return b },
        order(c: string) { orders.push(c); return b },
        limit() { return b },
        range(from: number, to: number) { window = [from, to]; return Promise.resolve(run()) },
        maybeSingle() { single = true; return Promise.resolve(run()) },
        then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) { return Promise.resolve(run()).then(ok, err) },
      }
      return b
    },
    rpc(fn: string, args: Record<string, unknown>) {
      log.push(`rpc:${fn}`)
      return Promise.resolve({ data: (rpcs[fn] ?? (() => []))(args), error: null })
    },
  }
  return { client: client as unknown as SupabaseClient, log }
}

const CLIENT = 'client-1'
const SEP = '2026-09-01'

describe('provenanceBatch', () => {
  // Three themes' September videos; one video is shared by the lead and a
  // named theme, and the found-by data differs per video so each theme's
  // answer is its own.
  const tables: Record<string, Row[]> = {
    month_evidence_refs: [
      { client_id: CLIENT, month: SEP, audience: 'industry-other', object_kind: 'theme', object_id: 'lead', video_ids: ['v1', 'v2', 'v3'] },
      { client_id: CLIENT, month: SEP, audience: 'industry-other', object_kind: 'theme', object_id: 'new-a', video_ids: ['v3', 'v4'] },
      { client_id: CLIENT, month: SEP, audience: 'industry-other', object_kind: 'theme', object_id: 'new-b', video_ids: ['v5'] },
    ],
    video_provenance: [
      { client_id: CLIENT, video_id: 'v1', first_terms: ['sealand bag'], first_subreddits: null, method: 'exact' },
      { client_id: CLIENT, video_id: 'v2', first_terms: ['travel gear'], first_subreddits: null, method: 'exact' },
      { client_id: CLIENT, video_id: 'v3', first_terms: ['travel gear'], first_subreddits: null, method: 'exact' },
      { client_id: CLIENT, video_id: 'v4', first_terms: ['upcycled bag'], first_subreddits: null, method: 'exact' },
      { client_id: CLIENT, video_id: 'v5', first_terms: ['travel gear'], first_subreddits: null, method: 'exact' },
    ],
    videos: ['v1', 'v2', 'v3', 'v4', 'v5'].map((id) => ({ client_id: CLIENT, id, platform: 'youtube', video_id: `yt-${id}`, source_keywords: null })),
    gate_verdicts: [],
  }
  // "travel gear" was first run in September.
  const added = () => Promise.resolve(new Set(['travel gear']))

  it('reads once for both askers and answers each theme as its own read would', async () => {
    const alone = fakeDb(tables)
    const [one] = provenanceBatch(alone.client, CLIENT, SEP, added, 1)
    const leadAlone = await one.ask(['lead'])
    const [two] = provenanceBatch(alone.client, CLIENT, SEP, added, 1)
    const namedAlone = await two.ask(['new-a', 'new-b'])
    expect(alone.log.filter((t) => t === 'month_evidence_refs')).toHaveLength(2)

    const both = fakeDb(tables)
    const [lead, named] = provenanceBatch(both.client, CLIENT, SEP, added, 2)
    const leadAsk = lead.ask(['lead'])
    const namedAsk = named.ask(['new-a', 'new-b'])
    expect(await leadAsk).toEqual(leadAlone)
    expect(await namedAsk).toEqual(namedAlone)
    expect([...(await namedAsk).keys()]).toEqual(['new-a', 'new-b'])
    expect(leadAlone.get('lead')).toEqual({ fromNewSearches: 2, of: 3 })
    // One refs read, one of each evidence read, for the two.
    expect(both.log.filter((t) => t === 'month_evidence_refs')).toHaveLength(1)
    expect(both.log.filter((t) => t === 'video_provenance')).toHaveLength(1)
  })

  it('waits for every asker, reads when the last one passes, and reads nothing when none asks', async () => {
    const db = fakeDb(tables)
    const [lead, named] = provenanceBatch(db.client, CLIENT, SEP, added, 2)
    const asked = lead.ask(['lead'])
    await Promise.resolve()
    expect(db.log).toEqual([])
    named.pass()
    named.pass()
    expect((await asked).get('lead')).toEqual({ fromNewSearches: 2, of: 3 })

    const none = fakeDb(tables)
    const [a, b] = provenanceBatch(none.client, CLIENT, SEP, added, 2)
    a.pass()
    b.pass()
    await new Promise((r) => setTimeout(r, 0))
    expect(none.log).toEqual([])
  })

  it('reads on its own for an asker that asks a second time (a lead that moved)', async () => {
    const db = fakeDb(tables)
    const [lead, named] = provenanceBatch(db.client, CLIENT, SEP, added, 2)
    named.pass()
    await lead.ask(['lead'])
    const again = await lead.ask(['new-b'])
    expect(again.get('new-b')).toEqual({ fromNewSearches: 1, of: 1 })
    expect(db.log.filter((t) => t === 'month_evidence_refs')).toHaveLength(2)
  })
})

describe('loadThemeQuotes, the headline voices’ segments', () => {
  // One lead theme and one ask theme; the lead's candidates sit under three
  // videos, one of them outside the month's market (the client's own post).
  const tables: Record<string, Row[]> = {
    themes: [
      { client_id: CLIENT, run_id: 'run-1', registry_id: 'lead', supporting_insight_ids: ['i1', 'i2'] },
      { client_id: CLIENT, run_id: 'run-1', registry_id: 'ask', supporting_insight_ids: ['i3'] },
    ],
    audience_insights: [
      { client_id: CLIENT, id: 'i1', category: 'buying_intent' },
      { client_id: CLIENT, id: 'i2', category: 'buying_intent' },
      { client_id: CLIENT, id: 'i3', category: 'question' },
    ],
    insight_evidence: [
      { id: 'e1', audience_insight_id: 'i1', quote: 'I would buy this today', relevance_rank: 1, comment_id: 'c1', redacted: false },
      { id: 'e2', audience_insight_id: 'i1', quote: 'Where can I get one?', relevance_rank: 2, comment_id: 'c2', redacted: false },
      { id: 'e3', audience_insight_id: 'i2', quote: 'Take my money', relevance_rank: 1, comment_id: 'c3', redacted: false },
      { id: 'e4', audience_insight_id: 'i3', quote: 'Does it fit a laptop?', relevance_rank: 1, comment_id: 'c4', redacted: false },
    ],
    comments: [
      { client_id: CLIENT, id: 'c1', platform: 'youtube', comment_date: '2026-09-03', video_id: 'yt-1', comment_id: 'n1', author: 'a1' },
      { client_id: CLIENT, id: 'c2', platform: 'youtube', comment_date: '2026-09-04', video_id: 'yt-2', comment_id: 'n2', author: 'a2' },
      { client_id: CLIENT, id: 'c3', platform: 'tiktok', comment_date: '2026-09-05', video_id: 'tt-3', comment_id: 'n3', author: 'a3' },
      { client_id: CLIENT, id: 'c4', platform: 'youtube', comment_date: '2026-09-06', video_id: 'yt-4', comment_id: 'n4', author: 'a4' },
    ],
    videos: [
      { client_id: CLIENT, id: 'v1', platform: 'youtube', video_id: 'yt-1', video_url: 'u1', account_name: 'acct1', is_client: false, is_competitor: false, competitor_name: null },
      { client_id: CLIENT, id: 'v2', platform: 'youtube', video_id: 'yt-2', video_url: 'u2', account_name: 'acct2', is_client: false, is_competitor: false, competitor_name: null },
      { client_id: CLIENT, id: 'v3', platform: 'tiktok', video_id: 'tt-3', video_url: 'u3', account_name: 'sealand', is_client: true, is_competitor: false, competitor_name: null },
      { client_id: CLIENT, id: 'v4', platform: 'youtube', video_id: 'yt-4', video_url: 'u4', account_name: 'acct4', is_client: false, is_competitor: false, competitor_name: null },
    ],
    comment_translations: [],
  }
  const SEGMENT: Record<string, string> = { v1: 'market', v2: 'maker', v3: 'market', v4: 'market' }
  const rpcs = {
    segments_for_videos: (args: Record<string, unknown>) => (args.p_video_ids as string[]).map((id) => ({ video_id: id, segment: SEGMENT[id] ?? null })),
  }
  const wanted = new Map<string, string | null>([['lead', 'buying_intent'], ['ask', 'question']])
  const leads = new Set(['lead'])

  it('sets the same segments on the same candidates as markVideoSegments did after the read', async () => {
    const before = fakeDb(tables, rpcs)
    const was = await loadThemeQuotes(before.client, CLIENT, 'run-1', wanted, SEP, leads)
    await markVideoSegments(before.client, CLIENT, was.get('lead')?.candidates ?? [])

    const after = fakeDb(tables, rpcs)
    const now = await loadThemeQuotes(after.client, CLIENT, 'run-1', wanted, SEP, leads, { client: after.client, themes: leads })
    expect(now).toEqual(was)
    expect(now.get('lead')?.candidates.map((c) => c.segment)).toEqual(['market', 'market', 'maker'])
    expect(now.get('ask')?.candidates.every((c) => !('segment' in c))).toBe(true)
    expect(after.log.filter((t) => t === 'rpc:segments_for_videos')).toHaveLength(1)
  })

  it('asks only about the videos the market’s segments read did not hold, and none when it held them all', async () => {
    const before = fakeDb(tables, rpcs)
    const was = await loadThemeQuotes(before.client, CLIENT, 'run-1', wanted, SEP, leads)
    await markVideoSegments(before.client, CLIENT, was.get('lead')?.candidates ?? [])

    // The month's market: v1 and v2, not the client's own v3.
    const asked: string[][] = []
    const partial = fakeDb(tables, { segments_for_videos: (args) => { asked.push(args.p_video_ids as string[]); return rpcs.segments_for_videos(args) } })
    const known = Promise.resolve(new Map([['v1', 'market'], ['v2', 'maker'], ['v9', 'market']]))
    const now = await loadThemeQuotes(partial.client, CLIENT, 'run-1', wanted, SEP, leads, { client: partial.client, themes: leads, known })
    expect(now).toEqual(was)
    expect(asked).toEqual([['v3']])

    const whole = fakeDb(tables, rpcs)
    const all = Promise.resolve(new Map(Object.entries(SEGMENT)))
    expect(await loadThemeQuotes(whole.client, CLIENT, 'run-1', wanted, SEP, leads, { client: whole.client, themes: leads, known: all })).toEqual(was)
    expect(whole.log.filter((t) => t === 'rpc:segments_for_videos')).toHaveLength(0)
  })
})
