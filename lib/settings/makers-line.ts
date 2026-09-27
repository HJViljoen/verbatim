import type { SupabaseClient } from '@supabase/supabase-js'

import { fetchRunningRunIds } from '../pages/latest-video-run'
import { namesABrand, segmentOf, THEME_FLOOR } from '../pages/overview-market/board'
import { fetchThemedRunId } from '../pages/themed-run'
import { monthStartOf } from '../reading/month-key'
import { segmentRulesEnabled } from '../segments/rules'

// Settings › What we read › Makers, "Grouped" (market-first WP3.10; the
// approved artboard's data line: "In September: 7 themes at 10 or more, led by
// upcycled bag creativity (71) and handmade craftsmanship (64)"). The makers
// line the pages draw, read the way the front page's board reads it
// (lib/pages/overview-market/board.ts): the reading month's category themes at
// the floor, each theme's maker and off-topic shares off MF1's
// `theme_maker_shares` on the latest themed update, a theme led by makers when
// half or more of its videos are makers' (`segmentOf`), biggest first (ties
// by the registry id). Five small reads.
//
// A LABEL THAT NAMES A BRAND IS NOT A LEAD HERE. The front page reads each
// lead's evidence before it prints a label naming a brand (it may read "a
// brand"); this card reads no evidence, so it passes such a theme over for the
// next one rather than print a name the evidence may not carry.

export interface MakersLineTheme { id: string; k: number; label: string | null; maker: number | null; noise: number | null }

/** The line: how many maker-led themes the month holds at the floor, and the
 *  two biggest whose labels name no brand. Null where nothing is measured. */
export function makersLine(themes: readonly MakersLineTheme[], brandNames: readonly string[]): { count: number; lead: { label: string; k: number }[] } | null {
  const led = themes
    .filter((t) => t.k >= THEME_FLOOR && segmentOf({ makerShare: t.maker, noiseShare: t.noise }) === 'makers')
    .sort((a, b) => b.k - a.k || a.id.localeCompare(b.id))
  const lead = led
    .filter((t) => t.label && t.label.trim() && !namesABrand(t.label, brandNames))
    .slice(0, 2)
    .map((t) => ({ label: t.label!.trim(), k: t.k }))
  return { count: led.length, lead }
}

const share = (part: unknown, of: unknown): number | null => {
  const p = Number(part)
  const n = Number(of)
  return Number.isFinite(p) && Number.isFinite(n) && n > 0 && p >= 0 && p <= n ? p / n : null
}

/**
 * The reading month's makers line, or null where it cannot be read: no maker
 * rule for the tenant, no themed update, MF1 not applied, or a read that
 * failed (logged).
 */
export async function loadMakersLine(
  client: SupabaseClient,
  clientId: string,
  month: string,
  brandNames: readonly string[],
): Promise<{ count: number; lead: { label: string; k: number }[] } | null> {
  if (!segmentRulesEnabled(clientId)) return null
  const m = monthStartOf(month)
  try {
    const running = await fetchRunningRunIds(client, clientId, 'settings')
    const [runId, readings] = await Promise.all([
      fetchThemedRunId(client, clientId, running, 'settings'),
      client.from('month_theme_readings').select('theme_id, videos')
        .eq('client_id', clientId).eq('month', m).eq('audience', 'industry-other').gte('videos', THEME_FLOOR)
        .order('videos', { ascending: false }).order('theme_id', { ascending: true }).limit(200),
    ])
    if (!runId || readings.error) return null
    const rows = (readings.data ?? []) as { theme_id: string; videos: number }[]
    if (rows.length === 0) return { count: 0, lead: [] }
    const shares = await client.rpc('theme_maker_shares', { p_client: clientId, p_month: m, p_run: runId })
    if (shares.error) return null
    const by = new Map(((shares.data ?? []) as { registry_id: string; videos: number; maker: number; noise: number }[])
      .map((r) => [String(r.registry_id), { maker: share(r.maker, r.videos), noise: share(r.noise, r.videos) }]))
    const ids = rows.map((r) => String(r.theme_id))
    const led = ids.filter((id) => segmentOf({ makerShare: by.get(id)?.maker ?? null, noiseShare: by.get(id)?.noise ?? null }) === 'makers')
    const labels = new Map<string, string | null>()
    if (led.length > 0) {
      const obs = await client.from('theme_observations').select('theme_id, label').eq('client_id', clientId).eq('run_id', runId).in('theme_id', led)
      for (const r of (obs.data ?? []) as { theme_id: string; label: string | null }[]) labels.set(String(r.theme_id), r.label?.trim() || null)
      const missing = led.filter((id) => !labels.get(id))
      if (missing.length > 0) {
        const reg = await client.from('theme_registry').select('id, canonical_label').eq('client_id', clientId).in('id', missing)
        for (const r of (reg.data ?? []) as { id: string; canonical_label: string | null }[]) labels.set(String(r.id), r.canonical_label?.trim() || null)
      }
    }
    return makersLine(rows.map((r) => {
      const id = String(r.theme_id)
      return { id, k: Number(r.videos), label: labels.get(id) ?? null, maker: by.get(id)?.maker ?? null, noise: by.get(id)?.noise ?? null }
    }), brandNames)
  } catch (error) {
    console.error(`[settings] makers line not read for ${clientId}: ${(error as { message?: string }).message ?? String(error)}`)
    return null
  }
}
