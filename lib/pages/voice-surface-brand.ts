import type { SupabaseClient } from '@supabase/supabase-js'

import { rivalKey } from '../rivals'
import { RPC_WINDOW_DENOMINATORS, RPC_WINDOW_THEME_READINGS } from '../reading/types'
import { selectAll } from '../supabase-admin'
import { loadBoardObservations } from './overview'

// Conversation, one brand's videos (`?brand=`, market-first; the Brands page's
// B2 footer "Open {brand}'s videos →", the approved preview's link to
// Conversation filtered by brand).
//
// THE SAME NINETY DAYS AS THE BLOCK THAT LINKS HERE. B2 counts the videos filed
// under each brand over the ninety days ending at the reading month's last
// update (`ninetyDays(windowEnd(reading))`, lib/pages/brands.ts), so this view
// reads that window too: "Open Cotopaxi's videos" under "Cotopaxi 32" opens
// those 32 videos, never September's 12. A brand's month is too small to
// group (a rival's audience holds 5 to 12 videos a month; its biggest theme on
// staging's September is 5), which is why the month board never drew one.
//
// WHAT IS PRINTED: every theme the brand's videos carried over the window, as
// counts of its videos (a rival's n never reaches a share's floor, research
// F31, F33), biggest first; the first `BRAND_THEMES_SHOWN` and "Show all" for
// the rest, as B3 lists its question themes. No month before, no flag and no
// provenance: those are the month board's, and a window has none of them.
//
// THE READS, ONLY WHEN `?brand=` NAMES A LIVE TRACKED BRAND (the page without
// it reads nothing more): `window_denominators` for the brand's videos (1),
// `window_theme_readings` on the themed update, filtered to the brand's
// audience (1; about four seconds on staging, started early, beside the rest
// of the page), and the update's observations of those themes for their
// labels and kinds (1, and the registry's label where one has none).

/** Rows the view prints before "Show all" (the 24 Sep rulings: at most 12
 *  rows in any block). */
export const BRAND_THEMES_SHOWN = 12

export interface BrandViewTheme {
  registryId: string
  /** Model words, replayed (`pass_b_theme`). */
  label: string
  kind: string | null
  /** The brand's videos in the window that carry the theme. */
  videos: number
}

export interface BrandView {
  /** The tracked brand, as Settings names it. */
  name: string
  audience: string
  /** [from, to): the ninety days B2 reads. */
  window: { from: string; to: string }
  /** The brand's videos over the window; null where it was not read. */
  videos: number | null
  /** The themes printed, biggest first; null where they were not read. */
  themes: BrandViewTheme[] | null
  /** Themes with videos in the window, printed or not. */
  total: number
  /** Every theme is printed (`?board=all`). */
  all: boolean
}

/**
 * The live tracked brand `?brand=` names: its name as Settings holds it,
 * matched without case or outer spaces (the preview writes `?brand=cotopaxi`).
 * A retired brand, or a name nobody tracks, is no filter: the page reads as it
 * does without one.
 */
export function brandNamed(
  wanted: string | null | undefined,
  rivals: readonly { name: string; retiredAt: string | null }[],
): string | null {
  const w = (wanted ?? '').trim().toLowerCase()
  if (!w) return null
  return rivals.find((r) => !r.retiredAt && r.name.trim().toLowerCase() === w)?.name ?? null
}

/** The view from its reads. A theme with no label is left out, as the month
 *  board leaves it out. */
export function buildBrandView(input: {
  name: string
  window: { from: string; to: string }
  videos: number | null
  /** `window_theme_readings`, this brand's audience; null where not read. */
  readings: readonly { themeId: string; videos: number }[] | null
  labels: ReadonlyMap<string, { label: string | null; kind: string | null }>
  all: boolean
}): BrandView {
  const base = { name: input.name, audience: rivalKey(input.name), window: input.window, videos: input.videos, all: input.all }
  if (!input.readings) return { ...base, themes: null, total: 0 }
  const every = input.readings
    .filter((r) => r.videos > 0)
    .flatMap((r) => {
      const o = input.labels.get(r.themeId)
      return o?.label ? [{ registryId: r.themeId, label: o.label, kind: o.kind, videos: r.videos }] : []
    })
    .sort((a, b) => b.videos - a.videos || a.label.localeCompare(b.label) || a.registryId.localeCompare(b.registryId))
  return { ...base, themes: input.all ? every : every.slice(0, BRAND_THEMES_SHOWN), total: every.length }
}

const say = (what: string, error: unknown): null => {
  console.error(`[pages] voice.brand.${what}: ${(error as { message?: string } | null)?.message ?? String(error)}; not read`)
  return null
}

/**
 * One brand's videos over the window, read on the reading client. Each read
 * fails on its own and costs the view its figure, never the page.
 */
export async function loadBrandView(
  db: SupabaseClient,
  clientId: string,
  input: { name: string; window: { from: string; to: string }; themedRunId: string | null; all: boolean },
): Promise<BrandView> {
  const audience = rivalKey(input.name)
  const range = { p_client: clientId, p_from: input.window.from, p_to: input.window.to }
  const videosRead = (async (): Promise<number | null> => {
    const res = await db.rpc(RPC_WINDOW_DENOMINATORS, range).eq('audience', audience)
    if (res.error) throw new Error(`${RPC_WINDOW_DENOMINATORS}: ${res.error.message}`)
    const r = ((res.data ?? []) as { videos: number }[])[0]
    return r ? Number(r.videos) || 0 : 0
  })().catch((e: unknown) => say('videos', e))
  const readingsRead = (async (): Promise<{ themeId: string; videos: number }[] | null> => {
    if (!input.themedRunId) return null
    const rows = await selectAll<{ theme_id: string; videos: number }>(() =>
      db.rpc(RPC_WINDOW_THEME_READINGS, { ...range, p_run: input.themedRunId })
        .eq('audience', audience).gt('videos', 0).order('theme_id'))
    return rows.map((r) => ({ themeId: String(r.theme_id), videos: Number(r.videos) || 0 }))
  })().catch((e: unknown) => say('themes', e))
  const readings = await readingsRead
  const labels = readings && readings.length > 0
    ? await loadBoardObservations(db, clientId, input.themedRunId, readings.map((r) => r.themeId)).catch((e: unknown) => say('labels', e))
    : new Map<string, { label: string | null; kind: string | null }>()
  return buildBrandView({
    name: input.name,
    window: input.window,
    videos: await videosRead,
    // Labels that could not be read leave nothing to print: not read.
    readings: labels ? readings : null,
    labels: labels ?? new Map(),
    all: input.all,
  })
}
