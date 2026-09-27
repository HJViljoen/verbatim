/**
 * The Settings area's seven sub-pages, drawn as tabs (Phase 1 WP16, design item 29,
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
  /** The tab's label AND the sub-page's title — one string, deliberately. */
  label: string
  /** Addresses that light this entry without being it. */
  under?: string[]
}

// THE PREVIEW'S TABS (market-first WP3.10; the approved Settings and
// SettingsRecord artboards draw "What we read · Subjects · The record ·
// Reports and recipients · Team · How to read", in that order, as tabs over
// the page). The key stays `tracking`, so no address or stored link changes;
// the page it names is the market and the searches that find it, which "What
// we read" says and "Tracking" did not. "Team" is the entry's label; Billing
// still lights it (`under`). Readiness comes last, after the preview's six,
// although the artboards leave it out: pages still send a reader to
// "Settings › Readiness" (lib/reading/own-posts.ts), and a tab a page names
// has to be there to be found. Dropping it is a call for Heinrich.
export const SETTINGS_SUBPAGES: readonly SettingsSubPage[] = [
  { key: 'tracking', href: '/dashboard/settings', label: 'What we read' },
  { key: 'subjects', href: '/dashboard/settings/subjects', label: 'Subjects' },
  { key: 'record', href: '/dashboard/settings/record', label: 'The record' },
  { key: 'reports', href: '/dashboard/settings/reports', label: 'Reports and recipients' },
  { key: 'team', href: '/dashboard/team', label: 'Team', under: ['/dashboard/billing'] },
  { key: 'guide', href: '/dashboard/settings/how-to-read', label: 'How to read' },
  { key: 'readiness', href: '/dashboard/settings/readiness', label: 'Readiness' },
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
