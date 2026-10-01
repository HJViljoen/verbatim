/**
 * The Settings area's sub-pages, drawn as tabs (Phase 1 WP16, design item 29,
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
  | 'tracking' | 'team' | 'billing' | 'readiness' | 'record' | 'guide' | 'subjects' | 'reports'

export interface SettingsSubPage {
  key: SettingsSection
  href: string
  /** The tab's label AND the sub-page's title — one string, deliberately. */
  label: string
  /** Addresses that light this entry without being it. */
  under?: string[]
  /** Who sees it as a tab: everyone, the operator alone, or nobody (an
   *  address that still serves, or redirects, after its page moved). */
  tab: 'all' | 'operator' | 'none'
}

// THE ARTBOARD'S TABS (pages build, 1 Oct; Page-Settings): What you track ·
// Team · Billing, with Log out in the page's own bar. The key stays
// `tracking`, so no address or stored link changes.
//   - Readiness and The record are the operator's (rule 3: product health and
//     process are not the client's), and How to read is removed for tenants;
//     the operator keeps all three as tabs.
//   - Subjects moved to the Subjects page and Reports and recipients to the
//     Studio. Their entries stay, tab-less, because their addresses still
//     answer (a redirect to the new home) and a redirect may only point at an
//     address this table serves (`lib/nav.test.ts`).
//   - Billing is its own tab now; it was lit through Team.
export const SETTINGS_SUBPAGES: readonly SettingsSubPage[] = [
  { key: 'tracking', href: '/dashboard/settings', label: 'What you track', tab: 'all' },
  { key: 'team', href: '/dashboard/team', label: 'Team', tab: 'all' },
  { key: 'billing', href: '/dashboard/billing', label: 'Billing', tab: 'all' },
  { key: 'readiness', href: '/dashboard/settings/readiness', label: 'Readiness', tab: 'operator' },
  { key: 'record', href: '/dashboard/settings/record', label: 'The record', tab: 'operator' },
  { key: 'guide', href: '/dashboard/settings/how-to-read', label: 'How to read', tab: 'operator' },
  { key: 'subjects', href: '/dashboard/settings/subjects', label: 'Subjects', tab: 'none' },
  { key: 'reports', href: '/dashboard/settings/reports', label: 'Reports and recipients', tab: 'none' },
]

/** The tabs a reader sees: the client's three, and the operator's after them. */
export function settingsTabs(operator: boolean): SettingsSubPage[] {
  return SETTINGS_SUBPAGES.filter((s) => s.tab === 'all' || (operator && s.tab === 'operator'))
}

export function settingsSubPage(key: SettingsSection): SettingsSubPage {
  const s = SETTINGS_SUBPAGES.find((x) => x.key === key)
  if (!s) throw new Error(`no settings sub-page: ${key}`)
  return s
}

/** Every address the settings area serves — what a redirect may legally point
 *  at, and what `lib/nav.test.ts` checks a retired address against. */
export const SETTINGS_ADDRESSES: readonly string[] =
  SETTINGS_SUBPAGES.flatMap((s) => [s.href, ...(s.under ?? [])])
