import { subredditKey, subredditLabel } from '../gather/subreddits'
import type { SubredditEntry } from '../gather/types'
import type { SubredditRoiRow } from '../pipeline/subreddit-roi'
import type { KeptRate } from './reject-log'

/**
 * The watched communities, as ST2 asks for them: watched since · status ·
 * discovered · last probed · posts · comments · kept-rate · insights.
 *
 * FOUR SOURCES, ONE FOLD. The status and the dates come from
 * `tracking_configs.subreddits`; the posts, comments and insights from
 * `computeSubredditRoi` over stored Reddit videos; the kept-rate from
 * `gate_verdicts.account_name`. Each spells a community differently —
 * 'r/Prosthetics', 'prosthetics', a pasted URL — and every one of them goes
 * through `subredditKey` before it is joined, which is the fold the ROI reader
 * and the readiness row already use.
 *
 * A COMMUNITY WITH POSTS AND NO ENTRY IS A ROW. 66% of Össur's stored Reddit
 * posts and 74% of Sealand's come from communities nobody configured — the
 * keyword search dragged them in — and that is the single most useful fact on
 * the panel. A table that listed only the configured ones would hide it, and
 * readiness row 3 already reports the same fact from the other side; the two
 * must not disagree.
 *
 * Pure.
 */

export interface CommunityRow {
  key: string
  label: string
  /** 'active' | 'candidate' | 'rejected', or null for a community that is
   *  stored against no entry at all. */
  status: SubredditEntry['status'] | null
  discoveredAt: string | null
  /** The probe that decided it, where one ran. Sealand's r/onebag is active
   *  with no probe at all — watched by hand — and the row says so. */
  probe: { sampled: number; kept: number; at: string } | null
  posts: number
  comments: number
  insights: number
  /** Posts that cleared the Pass A floor — worth a model call. */
  eligible: number
  /** From the gate record, or null while it is closed to this reader. */
  keptPct: number | null
  found: number | null
  /** True when the community is stored against nothing anyone configured. */
  unconfigured: boolean
}

export function communityRows(args: {
  entries: readonly SubredditEntry[]
  roi: readonly SubredditRoiRow[]
  /** Per-community kept rates from the gate record; empty when it is closed. */
  gate?: readonly KeptRate[]
}): CommunityRow[] {
  const { entries, roi, gate = [] } = args
  const byKey = new Map<string, CommunityRow>()

  const ensure = (key: string): CommunityRow => {
    const row = byKey.get(key) ?? {
      key, label: subredditLabel(key), status: null, discoveredAt: null, probe: null,
      posts: 0, comments: 0, insights: 0, eligible: 0, keptPct: null, found: null,
      unconfigured: true,
    }
    byKey.set(key, row)
    return row
  }

  for (const e of entries) {
    const key = subredditKey(e.name)
    if (!key) continue
    const row = ensure(key)
    row.status = e.status
    row.discoveredAt = e.discovered_at ?? null
    row.probe = e.probe ?? null
    row.unconfigured = false
  }

  for (const r of roi) {
    const row = ensure(r.subreddit)
    row.posts = r.posts
    row.comments = r.comments
    row.insights = r.insights
    row.eligible = r.eligible
  }

  for (const g of gate) {
    // The gate's key is already folded by `keptByCommunity`.
    const row = byKey.get(g.key)
    if (!row) continue
    row.keptPct = g.keptPct
    row.found = g.found
  }

  const order: Record<string, number> = { active: 0, candidate: 1, stopped: 2, rejected: 3 }
  return [...byKey.values()].sort((a, b) => {
    // A community nobody configured has no status at all, and it sorts after
    // every configured one — the fallback has to stay past the end of `order`.
    const rank = (r: CommunityRow) => (r.status ? order[r.status] : 4)
    return rank(a) - rank(b) || b.posts - a.posts || a.key.localeCompare(b.key)
  })
}

/**
 * What the table actually draws.
 *
 * Every CONFIGURED community, always: those are the list, and a list with rows
 * missing from it is not a list. Then the biggest of the ones the search
 * dragged in, because measured on production that set is 103 communities on
 * Össur and 175 on Sealand — almost all of them one or two posts of noise —
 * and a settings panel that printed 178 rows would bury the twenty that matter
 * along with the three that are configured.
 *
 * The remainder is not dropped silently: `unconfiguredShare` counts every one
 * of them and the line under the table says how many and how much they carry.
 */
export const UNCONFIGURED_SHOWN = 10

export function tableRows(rows: readonly CommunityRow[]): { shown: CommunityRow[]; hidden: number; hiddenPosts: number } {
  const configured = rows.filter((r) => !r.unconfigured)
  const found = rows.filter((r) => r.unconfigured)
  const shown = found.slice(0, UNCONFIGURED_SHOWN)
  const hidden = found.slice(UNCONFIGURED_SHOWN)
  return {
    shown: [...configured, ...shown],
    hidden: hidden.length,
    hiddenPosts: hidden.reduce((n, r) => n + r.posts, 0),
  }
}

/** The one line under the table: how much of what is stored came from nowhere
 *  anybody chose. The same arithmetic readiness row 3 prints. */
export function unconfiguredShare(rows: readonly CommunityRow[]): { posts: number; fromUnconfigured: number; pct: number } {
  const posts = rows.reduce((n, r) => n + r.posts, 0)
  const fromUnconfigured = rows.filter((r) => r.unconfigured).reduce((n, r) => n + r.posts, 0)
  return { posts, fromUnconfigured, pct: posts > 0 ? Math.round((fromUnconfigured / posts) * 1000) / 10 : 0 }
}

/** What a community's state says in the client's words. `active` with no probe
 *  is a real and different state: somebody put it on the list by hand and no
 *  probe has ever measured it. */
export function communityWords(row: CommunityRow): string {
  if (row.unconfigured) return 'not on your list — the search found it'
  // "YOU STOPPED IT" AND "WE RULED IT OUT" ARE DIFFERENT SENTENCES, and the
  // second is a judgment of the community that a client who took it off the
  // list themselves never asked us to make. A stopped community often PASSED
  // the probe — the probe line beside this one may read "31 of 40 on topic" —
  // so printing "ruled out" over it contradicts the row it sits in.
  if (row.status === 'stopped') return 'you stopped watching it'
  if (row.status === 'rejected') return 'ruled out'
  if (row.status === 'candidate') return row.probe ? 'proposed, and measured' : 'proposed, not yet sampled'
  return row.probe ? 'watched' : 'watched by hand, never sampled'
}
