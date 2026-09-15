import { redirect } from 'next/navigation'
import { RETIRED_ADDRESSES } from '@/lib/nav'

// Connections retired into Settings › Tracking in Phase 1 (decision C): the
// accounts, terms, communities and rivals are one subject and were two pages.
// WP16 builds that sub-page.
export default function Page() {
  redirect(RETIRED_ADDRESSES['/dashboard/settings/connections'])
}
