import { themeSegmentsOf, type ThemeMakerShareRow } from '../pages/overview'
import { segmentOf } from '../pages/overview-market/board'
import type { WeekReadConversation } from './types'

// The week's conversations as the week's lead ranks them (depth v2, T11b;
// lib/reading/week-lead.ts): every category theme the week's read counted,
// with the count Market ranks on and Market's own "set apart" mark, frozen
// with the read so the level-1 email and Market's top row lead with the same
// conversation.
//
//  · `week` is the CATEGORY's videos in the run's frozen window
//    (`window_theme_readings` on the category audience, the pool's
//    `weekVideos`), the count Market's week ranks by;
//  · `month` is the category's videos in the reading month to date, the
//    pool's `monthK` (the stored month rows where this run wrote them, else
//    the window read to the window's end): the figure the week is printed
//    beside (decision 1);
//  · `setApart` is a theme half or more of whose videos are makers' own, or
//    off-topic, in the month (`segmentOf`, the board's rule, over
//    `theme_maker_shares`): it never leads.
//
// The themes are the pool's (lib/written/pool.ts): every category theme on
// three or more window videos, labelled under this run's clustering. Pure.

/** The themes set apart in the month: `segmentOf` over the month's
 *  `theme_maker_shares` rows (the same composition as Market's `setApartOf`,
 *  lib/pages/v2/market.ts on the depth branch). Empty where not measured. */
export function setApartIds(rows: readonly ThemeMakerShareRow[] | null): Set<string> {
  const out = new Set<string>()
  if (!rows) return out
  const shares = themeSegmentsOf(rows)
  for (const id of new Set([...shares.maker.keys(), ...shares.noise.keys()])) {
    if (segmentOf({ makerShare: shares.maker.get(id) ?? null, noiseShare: shares.noise.get(id) ?? null })) out.add(id)
  }
  return out
}

/** The week's conversations, the biggest this week first (ties by id). */
export function weekConversations(input: {
  themes: readonly { themeId: string; label: string; weekVideos: number }[]
  monthK: ReadonlyMap<string, number>
  setApart: ReadonlySet<string>
}): WeekReadConversation[] {
  return input.themes
    .filter((t) => t.label.trim())
    .map((t) => ({
      registryId: t.themeId,
      label: t.label.trim(),
      week: t.weekVideos,
      month: input.monthK.has(t.themeId) ? input.monthK.get(t.themeId)! : null,
      setApart: input.setApart.has(t.themeId),
    }))
    .sort((a, b) => b.week - a.week || (a.registryId < b.registryId ? -1 : a.registryId > b.registryId ? 1 : 0))
}
