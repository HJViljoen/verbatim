import { redirect } from 'next/navigation'
import { RETIRED_ADDRESSES } from '@/lib/nav'

// Consumer Profile retired in Phase 1 (decision C): the personas it showed are
// Voice's cast, and the connector lines and the run-indexed mix chart are cut
// rather than moved. The house pattern for a retired route is a thin page.tsx
// calling redirect() — next.config.ts carries no redirects() and its own
// header forbids one, because config redirects run before proxy.ts's host
// routing (refute-06 §2.4).
export default function Page() {
  redirect(RETIRED_ADDRESSES['/dashboard/profile'])
}
