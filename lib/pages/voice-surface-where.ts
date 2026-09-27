import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../chunk'
import { INDUSTRY_AUDIENCE } from '../rivals'
import { monthStartOf } from '../reading/month-key'
import { bareNameOnly } from '../segments/rules'
import { selectAll } from '../supabase-admin'
import { isMissingRelation, RPC_SEGMENTS_FOR_VIDEOS } from './overview'
import { rows as readRows } from './read'

// C6 · Where your market talks (market-first WP3.8, plan §2.4 C6; key
// `voice.where`, new, deploy 5). It answers cut #68 ("top voices": a one-week
// leaderboard with no floor and no memory) with both:
//
//   - A FLOOR: an account is listed with 3 videos or more in the reading
//     month (the pool's floor, `POOL_FLOOR`), by videos, never by views;
//   - A MEMORY: each listed account says in how many of the months read it
//     was seen, over the reading month and the two before it.
//
// PER MONTH, NEVER A TWO-MONTH SUM (the research's "34 threads, 943 comments"
// on r/onebag was August and September added together). Every count is the
// reading month's: the category's videos with a comment dated in the month
// (MF1 `market_month_videos`, the market's own denominator set, the client arm
// dropped) and those comments.
//
// THE CATEGORY'S ACCOUNTS (the approved preview: "accounts behind the
// category's September videos"), where themes are grouped. An account is its
// platform and its name as stored (a subreddit on Reddit is "r/onebag").
//
// THE NOISE IS NAMED, NOT LISTED (decision F; WP3.8 done-when: the
// military-dog channel appears only under "set aside"). An account more than
// half of whose videos in the month the reader precedence marks off-topic
// (MF1 `segments_for_videos`) is set aside: counted, and printed under "Set
// aside, off-topic" with how it was found, never in the list. An account more
// than half makers' is listed and marked "maker". More than half, not half:
// an account is one voice, and r/ManyBaggers' September is 5 threads found by
// a bare brand name out of 10.
//
// THE LARGEST ACCOUNT'S SHARE is of the category's comments in the month. The
// largest is the list's first row (the most videos), so the sentence and the
// one row that prints its comments name the same account.
//
// PURE HALF FIRST, THEN THE READS.

/** An account is listed at this many of the month's videos or more. */
export const ACCOUNT_FLOOR = 3
/** Rows the list prints before "All N accounts". */
export const ACCOUNT_ROWS = 10
/** The months the memory looks at: the reading month and the two before. */
export const MEMORY_MONTHS = 3

/** One of the month's category videos (`market_month_videos`), with its
 *  account. */
export interface MonthVideo {
  videoId: string
  platform: string
  /** Comments dated in the month on it. */
  dated: number
  account: string | null
  /** `videos.source_keywords`: every search that has found it. */
  sourceKeywords: readonly string[]
}

export interface WhereAccount {
  /** `platform|account`, the identity. */
  key: string
  name: string
  platform: string
  videos: number
  comments: number
  maker: boolean
  /** In how many of the months read it was seen; null where the memory was
   *  not read. */
  seen: { n: number; of: number } | null
  /** Set aside only: the bare name every search that found its videos was
   *  ("sealand gear"), or null where they were not all one. */
  foundBy: string | null
}

export interface WhereBlock {
  month: string
  segments: 'measured' | 'unknown' | 'no_rule'
  /** Accounts behind the category's videos in the month. */
  accounts: number
  /** Those at the floor, the set-aside ones included. */
  atFloor: number
  /** The category's comments dated in the month (the share's base). */
  comments: number
  /** The list's first row (the most videos) and its comments in the month. */
  largest: { key: string; comments: number } | null
  /** The listed accounts (at the floor, not set aside), by videos, then
   *  comments, then name; the first `ACCOUNT_ROWS` unless `expanded`. */
  rows: WhereAccount[]
  /** How many are listed in all. */
  listed: number
  /** At the floor and set aside as off-topic. */
  setAside: WhereAccount[]
  expanded: boolean
  /** The months the memory counted, oldest first (each one read: a category
   *  denominator row); null where the memory could not be read. */
  memory: string[] | null
}

const keyOf = (platform: string, account: string): string => `${platform}|${account}`

/** More than half of `n`. */
const majority = (k: number, n: number): boolean => n > 0 && k * 2 > n

/** The one bare name every search that found these videos was, most often
 *  first; null where any search was another term (lib/segments/rules.ts
 *  `bareNameOnly`, the noise rule's own test). */
export function foundByBareName(keywords: readonly (readonly string[])[]): string | null {
  const all = keywords.flat()
  if (bareNameOnly(all) == null) return null
  const counts = new Map<string, number>()
  for (const t of all) {
    const k = t.trim().toLowerCase()
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  // The words a reader would search, before a hashtag of them.
  const tag = (t: string): number => (t.startsWith('#') ? 1 : 0)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || tag(a[0]) - tag(b[0]) || a[0].localeCompare(b[0]))[0]?.[0] ?? null
}

/**
 * The block. Pure.
 *
 * `segments` maps a video to its segment where they were read (null: not read
 * or no rule, per `segmentsState`). `memory` holds, for each month counted
 * (the reading month included), the video ids that month's market held, and
 * each listed account's video ids across those months; null where it was not
 * read.
 */
export function buildWhere(input: {
  month: string
  videos: readonly MonthVideo[]
  segments: ReadonlyMap<string, string> | null
  segmentsState: WhereBlock['segments']
  memory: { months: readonly string[]; held: ReadonlyMap<string, ReadonlySet<string>>; accountVideos: ReadonlyMap<string, ReadonlySet<string>> } | null
  expanded: boolean
}): WhereBlock {
  const month = monthStartOf(input.month)
  const byAccount = new Map<string, { name: string; platform: string; videos: MonthVideo[] }>()
  for (const v of input.videos) {
    if (!v.account) continue
    const key = keyOf(v.platform, v.account)
    const held = byAccount.get(key) ?? { name: v.account, platform: v.platform, videos: [] }
    held.videos.push(v)
    byAccount.set(key, held)
  }
  const measured = input.segmentsState === 'measured' && input.segments != null
  const seenIn = (key: string): WhereAccount['seen'] => {
    const m = input.memory
    if (!m || m.months.length === 0) return null
    const ids = m.accountVideos.get(key)
    let n = 0
    for (const mm of m.months) {
      const held = m.held.get(monthStartOf(mm))
      if (mm === month || (ids && held && [...ids].some((id) => held.has(id)))) n++
    }
    return { n, of: m.months.length }
  }
  const atFloor: WhereAccount[] = []
  const setAside: WhereAccount[] = []
  for (const [key, a] of byAccount) {
    if (a.videos.length < ACCOUNT_FLOOR) continue
    const noise = measured ? a.videos.filter((v) => input.segments?.get(v.videoId) === 'noise').length : 0
    const makers = measured ? a.videos.filter((v) => input.segments?.get(v.videoId) === 'maker').length : 0
    const row: WhereAccount = {
      key,
      name: a.name,
      platform: a.platform,
      videos: a.videos.length,
      comments: a.videos.reduce((n, v) => n + v.dated, 0),
      maker: majority(makers, a.videos.length),
      seen: null,
      foundBy: null,
    }
    atFloor.push(row)
    if (majority(noise, a.videos.length)) setAside.push({ ...row, maker: false, foundBy: foundByBareName(a.videos.map((v) => v.sourceKeywords)) })
  }
  const order = (x: WhereAccount, y: WhereAccount): number =>
    y.videos - x.videos || y.comments - x.comments || x.name.localeCompare(y.name) || x.platform.localeCompare(y.platform)
  const aside = new Set(setAside.map((a) => a.key))
  const listed = atFloor.filter((a) => !aside.has(a.key)).sort(order).map((a) => ({ ...a, seen: seenIn(a.key) }))
  const largest = listed[0] ?? null
  return {
    month,
    segments: input.segmentsState,
    accounts: byAccount.size,
    atFloor: atFloor.length,
    comments: input.videos.reduce((n, v) => n + v.dated, 0),
    largest: largest && largest.comments > 0 ? { key: largest.key, comments: largest.comments } : null,
    rows: input.expanded ? listed : listed.slice(0, ACCOUNT_ROWS),
    listed: listed.length,
    setAside: setAside.sort(order),
    expanded: input.expanded,
    memory: input.memory ? [...input.memory.months] : null,
  }
}

/** The months the memory counts: the reading month and the two before it,
 *  each one only if the category has a denominator row for it (a month read),
 *  oldest first. Pure. */
export function memoryMonths(month: string, monthsRead: readonly string[]): string[] {
  const read = new Set(monthsRead.map(monthStartOf))
  const out: string[] = []
  const d = new Date(`${monthStartOf(month)}T00:00:00.000Z`)
  for (let i = MEMORY_MONTHS - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 10)
    if (read.has(m)) out.push(m)
  }
  return out
}

// ---- the reads ----------------------------------------------------------------

export const RPC_MARKET_MONTH_VIDEOS = 'market_month_videos'

type MonthVideoRow = { video_id: string; audience: string; platform: string; dated_comments: number }

/** One month's category videos with their dated comments (MF1
 *  `market_month_videos`, paged: a month past 1,000 videos is more than one
 *  page). Null where the function is not there or the read failed. */
async function categoryVideos(client: SupabaseClient, clientId: string, month: string): Promise<MonthVideoRow[] | null> {
  try {
    const all = await selectAll<MonthVideoRow>(() =>
      client.rpc(RPC_MARKET_MONTH_VIDEOS, { p_client: clientId, p_month: monthStartOf(month) }).order('video_id') as never,
    )
    return all.filter((r) => r.audience === INDUSTRY_AUDIENCE)
  } catch (error) {
    if (!isMissingRelation(error, RPC_MARKET_MONTH_VIDEOS)) console.error(`[pages] voice.where.monthVideos: ${(error as Error)?.message ?? String(error)}`)
    return null
  }
}

/**
 * The reading month's category videos, their accounts and (where the tenant
 * has a maker rule) their segments: the one read the bank shares with this
 * block, since every quote the bank prints is under one of these videos.
 * Three steps: the month's videos, then their accounts (chunked) and their
 * segments (one call) beside each other. Null where the month's videos could
 * not be read.
 */
export async function loadMonthVideos(
  client: SupabaseClient,
  clientId: string,
  month: string,
  withSegments: boolean,
): Promise<{ videos: MonthVideo[]; segments: Map<string, string> | null; segmentsState: WhereBlock['segments'] } | null> {
  const rowsIn = await categoryVideos(client, clientId, month)
  if (!rowsIn) return null
  const ids = rowsIn.map((r) => r.video_id)
  type VideoRow = { id: string; account_name: string | null; source_keywords: string[] | null }
  // A failed page of accounts fails the read: its videos would otherwise lose
  // their accounts in silence, and the block would print fewer accounts, a
  // smaller floor and a different largest, as if they were the month's.
  let accountsFailed = false
  const [accounts, segments] = await Promise.all([
    (async () => {
      const pages = await mapWithLimit(chunk(ids, UUID_IN_CHUNK), READ_CONCURRENCY, async (part) => {
        const res = await client.from('videos').select('id, account_name, source_keywords').eq('client_id', clientId).in('id', part)
        if (res.error) accountsFailed = true
        return readRows<VideoRow>(res as never, 'voice.where.accounts')
      })
      return new Map(pages.flat().map((v) => [String(v.id), v]))
    })(),
    (async (): Promise<Map<string, string> | null> => {
      if (!withSegments || ids.length === 0) return null
      try {
        const out = await selectAll<{ video_id: string; segment: string | null }>(() =>
          client.rpc(RPC_SEGMENTS_FOR_VIDEOS, { p_client: clientId, p_video_ids: ids }).order('video_id') as never,
        )
        return new Map(out.filter((r) => r.segment).map((r) => [String(r.video_id), String(r.segment)]))
      } catch (error) {
        if (!isMissingRelation(error, RPC_SEGMENTS_FOR_VIDEOS)) console.error(`[pages] voice.where.segments: ${(error as Error)?.message ?? String(error)}; not measured`)
        return null
      }
    })(),
  ])
  if (accountsFailed) return null
  const videos: MonthVideo[] = rowsIn.map((r) => {
    const v = accounts.get(String(r.video_id))
    return {
      videoId: String(r.video_id),
      platform: r.platform,
      dated: Number(r.dated_comments) || 0,
      account: v?.account_name || null,
      sourceKeywords: v?.source_keywords ?? [],
    }
  })
  return { videos, segments, segmentsState: !withSegments ? 'no_rule' : segments ? 'measured' : 'unknown' }
}

/**
 * The memory's earlier months: each one's category videos (one call a month,
 * at most two), by month. It needs nothing but the months, so the page starts
 * it beside the reading month's own read. Null where any failed.
 */
export async function loadEarlierMonths(
  client: SupabaseClient,
  clientId: string,
  month: string,
  months: readonly string[],
): Promise<Map<string, Set<string>> | null> {
  const m0 = monthStartOf(month)
  const earlier = months.map(monthStartOf).filter((m) => m !== m0)
  const held = await Promise.all(earlier.map(async (m) => [m, await categoryVideos(client, clientId, m)] as const))
  if (held.some(([, rows]) => rows == null)) return null
  return new Map(held.map(([m, rows]) => [m, new Set((rows ?? []).map((r) => String(r.video_id)))]))
}

/**
 * What the memory needs for the listed accounts: the earlier months'
 * videos (`loadEarlierMonths`, started by the caller) and every video of the
 * listed accounts (one read, paged past 1,000 rows). Null where either
 * failed.
 */
export async function loadMemory(
  client: SupabaseClient,
  clientId: string,
  month: string,
  months: readonly string[],
  thisMonth: readonly MonthVideo[],
  accounts: readonly { platform: string; name: string }[],
  earlierMonths: Promise<Map<string, Set<string>> | null>,
): Promise<{ months: string[]; held: Map<string, Set<string>>; accountVideos: Map<string, Set<string>> } | null> {
  const m0 = monthStartOf(month)
  const hasEarlier = months.some((m) => monthStartOf(m) !== m0)
  const names = [...new Set(accounts.map((a) => a.name))]
  const [held, ownVideos] = await Promise.all([
    earlierMonths,
    (async () => {
      type Own = { id: string; platform: string; account_name: string | null }
      if (names.length === 0 || !hasEarlier) return [] as Own[]
      // Paged by id: every video the listed accounts have, over all months,
      // passes PostgREST's 1,000-row cap as the months add up, and a cut
      // list would print "Seen in 1 of 3" for an account seen in all three.
      try {
        return await selectAll<Own>(() =>
          client.from('videos').select('id, platform, account_name').eq('client_id', clientId).in('account_name', names).order('id') as never,
        )
      } catch (error) {
        console.error(`[pages] voice.where.accountVideos: ${(error as Error)?.message ?? String(error)}; the memory is not read`)
        return null
      }
    })(),
  ])
  if (!ownVideos || !held) return null
  const heldBy = new Map<string, Set<string>>([[m0, new Set(thisMonth.map((v) => v.videoId))]])
  for (const [m, ids] of held) heldBy.set(m, ids)
  const accountVideos = new Map<string, Set<string>>()
  for (const v of ownVideos) {
    if (!v.account_name) continue
    const key = keyOf(v.platform, v.account_name)
    accountVideos.set(key, new Set([...(accountVideos.get(key) ?? []), String(v.id)]))
  }
  return { months: [...months].map(monthStartOf), held: heldBy, accountVideos }
}
