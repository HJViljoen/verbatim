import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = { title: 'Page not found' }

// Any /dashboard address no page claims. Unmatched URLs otherwise reach only
// the root not-found, outside the shell; throwing here renders
// app/dashboard/not-found.tsx inside the dashboard layout, sidebar and all.
// Every real page, the parked ones and the retired-address redirects are more
// specific routes and win over this catch-all.
//
// NO LOADER ABOVE IT, AND NONE OF ITS OWN (sw-2 item 8). A loading.tsx is a
// Suspense boundary: the shell streams with status 200 before notFound()
// throws, so an unknown address answered 200. The Dashboard's loader lives in
// app/dashboard/(home) for that reason, and lib/dashboard-loading.test.ts
// holds the line.
export default function UnknownDashboardPage(): never {
  notFound()
}
