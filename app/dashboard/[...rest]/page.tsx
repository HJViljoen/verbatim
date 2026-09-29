import { notFound } from 'next/navigation'

// Any /dashboard address no page claims. Unmatched URLs otherwise reach only
// the root not-found, outside the shell; throwing here renders
// app/dashboard/not-found.tsx inside the dashboard layout, sidebar and all.
// Every real page, the parked ones and the retired-address redirects are more
// specific routes and win over this catch-all.
export default function UnknownDashboardPage(): never {
  notFound()
}
