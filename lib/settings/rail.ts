/**
 * The Settings area's seven sub-pages (Phase 1 WP16, design item 29,
 * Heinrich's 14 Sep revision 3: "a settings area with sub-pages — Tracking ·
 * Subjects · Readiness · The record · Reports and recipients · Team and
 * billing · How to read, forms not tiles").
 *
 * One table, for the same reason `lib/nav.ts` is one table: the rail's label,
 * the page's own title and the address a redirect points at were three strings
 * in three files, and they drifted. `lib/nav.ts` owns the nine surfaces; this
 * owns what is INSIDE one of them, and the two are joined at `/dashboard/
 * settings` — every address here lights Settings in the sidebar, which
 * `surfaceForPath` already does by longest match.
 *
 * TEAM AND BILLING IS ONE RAIL ENTRY OVER TWO ROUTES. They have different
 * gates — billing is owner-only through `billingAccess()`, team is mixed — and
 * merging them into one route would mean merging the gates or gating panes
 * inside a page. The entry points at Team, and Billing lights the same entry
 * (`under`), which is exactly the arrangement `lib/nav.ts` UNDER already uses
 * for the sidebar.
 */

export type SettingsSection =
  | 'tracking' | 'subjects' | 'readiness' | 'record' | 'reports' | 'team' | 'guide'

export interface SettingsSubPage {
  key: SettingsSection
  href: string
  /** The rail label AND the content pane's title — one string, deliberately. */
  label: string
  /** Addresses that light this entry without being it. */
  under?: string[]
}

export const SETTINGS_SUBPAGES: readonly SettingsSubPage[] = [
  { key: 'tracking', href: '/dashboard/settings', label: 'Tracking' },
  { key: 'subjects', href: '/dashboard/settings/subjects', label: 'Subjects' },
  { key: 'readiness', href: '/dashboard/settings/readiness', label: 'Readiness' },
  { key: 'record', href: '/dashboard/settings/record', label: 'The record' },
  { key: 'reports', href: '/dashboard/settings/reports', label: 'Reports and recipients' },
  { key: 'team', href: '/dashboard/team', label: 'Team and billing', under: ['/dashboard/billing'] },
  { key: 'guide', href: '/dashboard/settings/how-to-read', label: 'How to read' },
]

export function settingsSubPage(key: SettingsSection): SettingsSubPage {
  const s = SETTINGS_SUBPAGES.find((x) => x.key === key)
  if (!s) throw new Error(`no settings sub-page: ${key}`)
  return s
}

/** Every address the settings area serves — what a redirect may legally point
 *  at, and what `lib/nav.test.ts` checks a retired address against. */
export const SETTINGS_ADDRESSES: readonly string[] =
  SETTINGS_SUBPAGES.flatMap((s) => [s.href, ...(s.under ?? [])])

/**
 * The counts beside the rail labels.
 *
 * READINESS CARRIES NONE, deliberately. The mock's "Readiness (3 missing)" is
 * wrong against production by 2× — both tenants read six missing — and getting
 * the true number costs the whole thirteen-row load, on every sub-page, to
 * print one digit in a rail. The Readiness page states its own summary in its
 * own header, where it is computed once and is right.
 *
 * `Partial`, and a missing key prints nothing: a count nobody has loaded must
 * not become a zero (the readiness module's own rule, applied to furniture).
 *
 * A FIGURE AND ITS UNIT, SEPARATELY, BECAUSE THE RAIL IS 224px. "5 schedules"
 * beside "Reports and recipients" does not fit, and what gave way was the
 * LABEL — the rail printed "Reports and recipi…", cutting the one entry a
 * reader is least able to guess. The number is what the rail always has room
 * for; the unit travels with it as the count's accessible name and its
 * tooltip, so nothing is lost to a reader who asks.
 *
 * THAT REASON ONLY APPLIES TO A ROW THAT CANNOT HOLD BOTH, AND IT WAS APPLIED
 * TO EVERY ROW (Block D wave 3, RC9). "Reports and recipients" — the row the
 * rule was written about — carries no count at all, deliberately, and the
 * three rows that DO carry one had 64–87px of slack each: measured at 1440,
 * a row has 200px of usable width (224 less `px-3` twice) and the three need
 * 113 / 128 / 136px with their units. So the artboard's "21 terms" and
 * "23 updates" were printed as "21" and "22", and "The record 22" said what
 * 22 was only in a `title`. `railCountText` puts the unit back wherever the
 * pair fits and keeps the bare figure where it does not — which is the
 * original rule, applied per row instead of to all of them.
 */
export interface RailCount {
  /** The figure, bare. */
  value: string
  /** What it counts, as a phrase that completes it ("schedules", "updates").
   *  Always the count's accessible name; drawn beside the figure where the
   *  pair fits. */
  unit: string
}

/**
 * The row's width budget, in pixels, measured in Chromium at every width the
 * settings shell is drawn at — the rail is 224px and `px-3` takes 12 each
 * side, so the link's content box is 200px at 375 as at 1440, and `gap-2` is
 * 8 of it.
 *
 * The two per-character figures are measured, not assumed: IBM Plex Sans at
 * 13.5px runs about 7px a character on the seven labels, and IBM Plex Mono at
 * 10.5px about 6.3px — "21 terms" renders 50px and "22 updates" 63px. They are
 * an ESTIMATE of a proportional face and they are allowed to be, because the
 * consequence of being wrong is the count going bare, not a broken row: the
 * label truncates only if the count is drawn too wide, and the budget is
 * deliberately the tighter reading.
 */
const RAIL_ROW_PX = 200
const RAIL_GAP_PX = 8
const LABEL_PX_PER_CHAR = 7
const COUNT_PX_PER_CHAR = 6.3

/**
 * What the rail draws beside a label: the figure and its unit where the ROW
 * holds the pair, the figure alone where it does not. The full phrase is the
 * count's accessible name and its tooltip either way, so nothing is lost to a
 * reader who asks.
 *
 * The budget is per row because the original rule was: "5 schedules" beside
 * "Reports and recipients" does not fit, and what gives way is the LABEL —
 * the rail printed "Reports and recipi…", cutting the one entry a reader is
 * least able to guess. That is still true and this still refuses it (22
 * characters of label leaves room for about 6 of count). What was wrong was
 * applying it to "Tracking · 21 terms" (113px of a 200px row) and
 * "The record · 22 updates" (136px), which have 64–87px of slack.
 */
export function railCountText(count: RailCount, label: string): string {
  const both = `${count.value} ${count.unit}`
  const room = RAIL_ROW_PX - RAIL_GAP_PX - label.length * LABEL_PX_PER_CHAR
  return both.length * COUNT_PX_PER_CHAR <= room ? both : count.value
}

export type RailCounts = Partial<Record<SettingsSection, RailCount>>
