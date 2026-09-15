import { redirect } from 'next/navigation'
import { RETIRED_ADDRESSES } from '@/lib/nav'

// The Guide retired in Phase 1 (decision C): its nine per-page sections and
// its glossary become Settings › How to read, one card per page, beside the
// thirteen words. WP16 builds that sub-page; until it exists this lands on
// Settings itself, because a redirect to an unbuilt route is a bare 404.
export default function Page() {
  redirect(RETIRED_ADDRESSES['/dashboard/guide'])
}
