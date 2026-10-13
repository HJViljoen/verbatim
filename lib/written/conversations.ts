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

/**
 * THE ONE SET-APART RULE (decision F): a theme half or more of whose videos in
 * the month are makers' own (`makers`), or off-topic (`noise`), by `segmentOf`,
 * the board's rule, over the month's `theme_maker_shares` rows. Market tags
 * these and never leads with one; the week's read freezes the same set
 * (`setApartIds`), so the email and the page cannot disagree. Empty where not
 * measured. Pure.
 */
export function setApartOf(rows: readonly ThemeMakerShareRow[] | null): Map<string, 'makers' | 'noise'> {
  const out = new Map<string, 'makers' | 'noise'>()
  if (!rows) return out
  const shares = themeSegmentsOf(rows)
  for (const id of new Set([...shares.maker.keys(), ...shares.noise.keys()])) {
    const seg = segmentOf({ makerShare: shares.maker.get(id) ?? null, noiseShare: shares.noise.get(id) ?? null })
    if (seg) out.set(id, seg)
  }
  return out
}

/** The themes set apart in the month, by id (`setApartOf`'s keys). */
export function setApartIds(rows: readonly ThemeMakerShareRow[] | null): Set<string> {
  return new Set(setApartOf(rows).keys())
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
