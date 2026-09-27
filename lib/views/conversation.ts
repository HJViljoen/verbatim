import type { SupabaseClient } from '@supabase/supabase-js'

import type { ThemeBoard } from '../pages/overview-market'
import type { ConversationMarket } from '../pages/voice-surface'
import { viewsConfigFor, viewsLive, type ViewsConfig } from './config'
import { lensCategoryVideos, lensCounts, lensThemes, loadViewLens, type ViewRead } from './lens'
import { viewState, type ViewState } from './state'
import { parseView, VIEW_PARAM, type MarketView } from './view'

// Conversation's view (market-first decision F; plan §2.4 C1 "From D5, a view
// switch: Everything · Buyers · Makers"; WP3.3). The page's loader
// (lib/pages/voice-surface.ts) reads its numbers through these substitutions,
// each a one-line hunk where the stored reading is taken, so the board, the
// lead, the open theme and its voices are all read ON the view, never a stored
// page re-labelled after the fact.
//
// WHAT A VIEW CHANGES, AND WHAT IT DOES NOT:
//   - the market's size (C1): the lens's pooled denominators, the category and
//     the brands' audiences as ever (decision E);
//   - every theme's k, the category's n, the month before's k and n (C2, C3):
//     the lens's category rows, so a row reads "Sep (of 412)" on Buyers;
//   - which themes are grouped. On `market` the makers stay in, so a theme
//     still groups on its maker share, taken over the videos left once the
//     off-topic ones are out (m / (1 - noise)); on Buyers and Makers the lens
//     has already chosen its videos, so nothing groups and no maker share
//     prints;
//   - the open theme's voices: only from a video the view keeps (its segment
//     read, and a voice whose segment cannot be read is not printed);
//   - what the lens cannot say is not said: where the category's videos were
//     said (no platform split in the lens), how many of them sit in a theme of
//     10 or more, and what people did in a theme's comments all need each
//     video's segment against a count frozen with its month, so under a lens
//     they print nothing rather than an Everything figure beside a lens n.
//     Where its videos came from prints only when no search was added in the
//     month (0 of the view's k, exact on any view).
//   - C4, who is talking, is grouped over everything read to date and says so
//     (its column head); a lens does not re-group it.
//
// NOTHING IS READ while no view is live for the tenant: every substitution is
// the identity, `view` is absent from the page's data, and the page is exactly
// the page it is today.

const BASE_PATH = '/dashboard/voice'

export interface ConversationView {
  read: ViewRead
  /** The view the page is asked for (`?view=`, or the default). */
  asked: MarketView
  /** Is the page reading a lens (not the stored month rows)? */
  lens: boolean
  /** The category themes at 3 or more, biggest first (`loadThemePool`'s order). */
  pool(stored: readonly { id: string; k: number }[], floor: number): { id: string; k: number }[]
  /** Last month's category k per theme (absent: 0 where that month was read). */
  prevK(stored: ReadonlyMap<string, number>): Map<string, number>
  /** The category's videos in the month, and the month before (null: not read). */
  n(stored: number): number
  prevN(stored: number | null): number | null
  segments(stored: ThemeBoard['segments']): ThemeBoard['segments']
  shares<M extends ReadonlyMap<string, number | null>>(stored: { maker: M; noise: M } | null): { maker: Map<string, number | null>; noise: Map<string, number | null> } | null
  /** Should the open theme's candidates have their segments read? */
  readsSegments: boolean
  /** The candidates a voice may come from on this view. */
  voices<C extends { segment?: string | null }>(candidates: readonly C[]): C[]
  provenance(stored: { fromNewSearches: number; of: number } | null, k: number): { fromNewSearches: number; of: number } | null
  inThemes(stored: number | null): number | null
  kinds<T>(stored: T | null): T | null
  /** The market in the month on the view, and the page's view state (absent
   *  where no view is live, so the page draws nothing new). */
  finish(market: ConversationMarket, input: { month: string; rivalAudiences: readonly string[]; params: Readonly<Record<string, string | undefined>> }): { market: ConversationMarket; view?: ViewState }
}

/** The segments a view keeps a voice from; null keeps every video. */
export function keptSegments(view: MarketView): ReadonlySet<string> | null {
  if (view === 'market') return new Set(['market', 'maker'])
  if (view === 'buyers') return new Set(['market'])
  if (view === 'makers') return new Set(['maker'])
  return null
}

/**
 * A theme's maker and noise shares on a view. `market` (off-topic out): the
 * maker share of what is left, m / (1 - noise), and no noise. Buyers and
 * Makers: none, since the lens chose its videos by segment and nothing groups.
 */
export function viewShares<M extends ReadonlyMap<string, number | null>>(
  view: MarketView,
  stored: { maker: M; noise: M } | null,
): { maker: Map<string, number | null>; noise: Map<string, number | null> } | null {
  if (!stored) return null
  if (view === 'everything') return { maker: new Map(stored.maker), noise: new Map(stored.noise) }
  if (view === 'market') {
    const maker = new Map<string, number | null>()
    const noise = new Map<string, number | null>()
    for (const [id, m] of stored.maker) {
      const ns = stored.noise.get(id)
      const ok = m != null && ns != null && Number.isFinite(m) && Number.isFinite(ns) && ns >= 0 && ns < 1
      maker.set(id, ok ? Math.min(1, (m as number) / (1 - (ns as number))) : null)
    }
    for (const [id, ns] of stored.noise) noise.set(id, ns == null ? null : 0)
    return { maker, noise }
  }
  return null
}

const identity: Omit<ConversationView, 'read' | 'asked' | 'finish'> = {
  lens: false,
  pool: (stored) => [...stored],
  prevK: (stored) => new Map(stored),
  n: (stored) => stored,
  prevN: (stored) => stored,
  segments: (stored) => stored,
  shares: (stored) => (stored ? { maker: new Map(stored.maker), noise: new Map(stored.noise) } : null),
  readsSegments: false,
  voices: (candidates) => [...candidates],
  provenance: (stored) => stored,
  inThemes: (stored) => stored,
  kinds: (stored) => stored,
}

/**
 * The page's view, from the lens rows read for it (pure; `readConversationView`
 * does the one read). `month` is the reading month, `prevMonth` the one before.
 */
export function conversationView(input: {
  cfg: ViewsConfig | null
  asked: MarketView
  read: ViewRead
  month: string
  prevMonth: string
}): ConversationView {
  const { cfg, asked, read, month, prevMonth } = input
  const finish: ConversationView['finish'] = (market, f) => {
    if (!viewsLive(cfg)) return { market }
    const onLens = read.state === 'read' ? lensCounts(read.rows, f.rivalAudiences).get(month) ?? null : null
    const viewed: ConversationMarket = onLens
      ? { videos: onLens.videos, comments: onLens.comments, category: onLens.category, rivalFiled: onLens.rivalFiled, platformMix: [] }
      : market
    const view = viewState({
      read, cfg, basePath: BASE_PATH, params: f.params, month,
      everything: market.videos, inView: onLens?.videos ?? null,
    })
    return { market: viewed, view }
  }
  if (read.state !== 'read') return { ...identity, read, asked, finish }

  const rows = read.rows
  const view = read.view
  const n = lensCategoryVideos(rows, month) ?? 0
  const prevN = lensCategoryVideos(rows, prevMonth)
  const kept = keptSegments(view)
  return {
    read,
    asked,
    lens: true,
    pool: (_stored, floor) => [...lensThemes(rows, month)]
      .filter(([, k]) => k >= floor)
      .sort(([a, ka], [b, kb]) => kb - ka || a.localeCompare(b))
      .map(([id, k]) => ({ id, k })),
    prevK: () => (prevN == null ? new Map() : lensThemes(rows, prevMonth)),
    n: () => n,
    prevN: () => prevN,
    segments: (stored) => (view === 'market' ? stored : 'no_rule'),
    shares: (stored) => viewShares(view, stored),
    readsSegments: kept != null,
    voices: (candidates) => (kept ? candidates.filter((c) => c.segment != null && kept.has(c.segment)) : [...candidates]),
    // 0 FROM SEARCHES ADDED IN THE MONTH is exact on any view (no search was
    // added, so none of the view's videos came from one); any other count was
    // taken over every video of the theme, so it is not printed on a lens.
    provenance: (stored, k) => (stored && stored.fromNewSearches === 0 ? { fromNewSearches: 0, of: k } : null),
    inThemes: () => null,
    kinds: () => null,
    finish,
  }
}

/** Which view the page is asked for: `?view=` where the tenant reads views,
 *  else its default. PURE. */
export function askedView(clientId: string, params: Readonly<Record<string, string | undefined>>): { cfg: ViewsConfig | null; asked: MarketView } {
  const cfg = viewsConfigFor(clientId)
  return { cfg, asked: parseView(params[VIEW_PARAM], cfg) }
}

/**
 * Conversation's view for one tenant and month: one read of the view's lens
 * over the reading month and the one before, and none at all where the page
 * reads everything (no view live, or `?view=everything`).
 */
export async function readConversationView(
  client: SupabaseClient,
  clientId: string,
  params: Readonly<Record<string, string | undefined>>,
  month: string,
  prevMonth: string,
): Promise<ConversationView> {
  const { cfg, asked } = askedView(clientId, params)
  const read = await loadViewLens(client, clientId, asked, [prevMonth, month])
  return conversationView({ cfg, asked, read, month, prevMonth })
}
