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
 */
export type RailCounts = Partial<Record<SettingsSection, string>>
