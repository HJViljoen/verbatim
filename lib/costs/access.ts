import { getSessionContext } from '@/lib/auth'
import { isPlatformAdmin } from '@/lib/agent/access'

// WHO MAY SEE OR CHANGE THE COSTS: a platform admin (`platform_admins`), and
// no one else. That is the product's one operator mechanism — the Readiness
// page, the workspace switcher and the operator's sidebar group all key off
// it — and Heinrich's login (heinrichviljoen@verbatimintel.com) is its one row.
//
// The page answers everyone else with notFound(), so a client who guesses the
// address learns nothing; the sidebar never sends them the link
// (components/ops/ops-nav-loader.tsx); every server action asks again here
// before it reads or writes, because an action is POST-reachable from any
// page; and the tables refuse every session but the service role
// (supabase/migrations/20261108090000_costs.sql), which is what this file
// guards the use of.
//
// isPlatformAdmin fails closed: an unreadable admin table is a "no".

/** The signed-in platform admin's user id, or null for anyone else.
 *  Redirects to /login when signed out (getSessionContext). */
export async function costsAdmin(): Promise<string | null> {
  const { userId } = await getSessionContext()
  return (await isPlatformAdmin(userId)) ? userId : null
}
