import { SettingsFrame } from '@/components/settings-frame'
import { ProductsTab } from '@/components/pages/settings/products'
import { canManageTenant, getSessionContext } from '@/lib/auth'
import { surface } from '@/lib/nav'
import { loadProductSettingsForPage, productSettingsView } from '@/lib/settings/products'
import { productsMonth } from '@/lib/pages/v2/products'
import { readingHandle } from '@/lib/reading/read'
import { settingsSubPage } from '@/lib/settings/rail'
import { assertTenantMay } from '@/lib/tenant-locks'
import type { Metadata } from 'next'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: `${settingsSubPage('products').label} · ${surface('settings').label}` }

// Settings › Your products (depth redesign v2, T10b; board E8-Settings-Products):
// the categories, the products in them and the other names people use for
// each. `?group=` opens a category.
//
// ONE READ, ON THE SESSION'S CLIENT (lib/settings/products.ts): the live
// catalogue and the product readings of Your products' month (`productsMonth`,
// the reading month), so this tab and the page print one figure; while the
// page is not switched on (`PRODUCT_READINGS_ENABLED`) it reads no month and
// prints no count, and says so. Until the products migration
// is applied the read answers `missing` and the tab says the list is not
// switched on; any other failure keeps the frame and says the settings did not
// load. The writes are lib/actions/products.ts, each checking the role and the
// tenant lock itself; `canEdit` here is the affordance, not the gate. The lock
// is a pure check on the session (`assertTenantMay`, the same call the actions
// make), so a locked tenant's owner or admin sees the controls disabled under
// the lock's line rather than a refusal after a submit.

export default async function SettingsProductsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const selected = typeof sp.group === 'string' ? sp.group : null
  const session = await getSessionContext()
  const { supabase, clientId, role } = session
  // The month Your products reads, so the two surfaces print one figure; no
  // month at all while the products page is off (no count prints then).
  const now = new Date()
  const read = await loadProductSettingsForPage(supabase, clientId, now, () => productsMonth(supabase, readingHandle(clientId), now.toISOString())).catch((error: unknown) => {
    console.error(`[settings] products did not load for ${clientId}: ${(error as { message?: string })?.message ?? String(error)}`)
    return null
  })

  return (
    <SettingsFrame active="products" title="Settings" operator={session.operator != null}>
      {read === null ? (
        <p className="m-0 text-[14px] text-[#5F656B]">Your settings did not load. Refresh the page.</p>
      ) : (
        <ProductsTab view={read.state === 'missing' ? null : productSettingsView(read, {
          selected,
          canEdit: canManageTenant(role),
          locked: !assertTenantMay(session, clientId, 'tracking').ok,
          // The month's words and label at the clock the month was read at.
          now: now.toISOString(),
        })} />
      )}
    </SettingsFrame>
  )
}
