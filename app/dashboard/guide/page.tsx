import { redirect } from 'next/navigation'
import { RETIRED_ADDRESSES } from '@/lib/nav'

// The Guide retired in Phase 1 (decision C) into Settings › How to read, which
// is cut for clients since 1 Oct (page review §1 Settings), so the Guide lands
// on Settings itself (page review §4).
export default function Page() {
  redirect(RETIRED_ADDRESSES['/dashboard/guide'])
}
