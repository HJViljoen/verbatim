import { redirect } from 'next/navigation'
import { SettingsFrame } from '@/components/settings-frame'
import { HowToReadBody } from '@/components/settings/how-to-read'
import { ListSearch } from '@/components/shell/list-search'
import { getSessionContext } from '@/lib/auth'
import { settingsBar } from '@/lib/settings/bar'
import type { Metadata } from 'next'
import { surface, tenantAway } from '@/lib/nav'
import { settingsSubPage } from '@/lib/settings/rail'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: `${settingsSubPage('guide').label} · ${surface('settings').label}` }

// Settings › How to read (Phase 1 WP16, design ST9; market-first WP3.10) — one
// card per page, the reading words, the definitions and a path through the
// product on the three clocks it keeps. The body is
// components/settings/how-to-read.tsx; this resolves the session and the bar.
//
// The Guide it replaces had a false claim on it: "search terms … are changed by
// us on request, not from this page", while the same rail rendered a term
// editor the client had been able to save since 2026-09-11. It is not carried
// forward, and the true half of that sentence is (lib/settings/how-to-read.ts).
//
// TITLE AND QUESTION COME FROM lib/nav.ts, never from here. One table owns what
// a surface is called and what it answers; a second copy of either is how the
// sidebar came to say "Content" about a page routed at /dashboard/videos.
//
// THE ONE-LINE BAR (the 25 Sep rulings, WP3.10): the brand, the reading month
// and "as at the {update} update · next update {date}", as on every other
// Settings sub-page (settingsBar). A read that fails leaves the title alone.

export default async function HowToReadPage() {
  // The page is static text, but the frame is a tenant surface and the rail is
  // the workspace's: resolving the session is what keeps a signed-out reader
  // out of it, the same as every other sub-page.
  const session = await getSessionContext()
  // A tenant no longer reaches this page (lib/nav.ts TENANT_RETIRED, 1 Oct); the operator keeps it.
  const away = tenantAway(session, '/dashboard/settings/how-to-read')
  if (away) redirect(away)
  const { supabase, clientId } = session
  const { data: client } = await supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle()
  const tenant = (client?.company_name as string | undefined) ?? 'Your workspace'
  const bar = await settingsBar(supabase, clientId, tenant)

  return (
    <SettingsFrame
      active="guide"
      operator
      title="Settings"
      context={tenant}
      bar={bar}
      contentTitle="How to read"
    >
      <HowToReadBody search={<ListSearch scope="reading-cards" placeholder="Search…" />} />
    </SettingsFrame>
  )
}
