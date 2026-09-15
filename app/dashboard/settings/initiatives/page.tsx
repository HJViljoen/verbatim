import { redirect } from 'next/navigation'
import { RETIRED_ADDRESSES } from '@/lib/nav'

// Initiatives retired in Phase 1: what a client is trying to move belongs
// beside the recommendations it came from, so it reads on Market as "moves"
// (the `moves` table; `initiatives` is legacy). The action that files one
// moved to lib/actions/initiatives.ts — Voice's "Track this" still calls it.
export default function Page() {
  redirect(RETIRED_ADDRESSES['/dashboard/settings/initiatives'])
}
