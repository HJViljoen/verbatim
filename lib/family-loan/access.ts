import { getSessionContext } from '@/lib/auth'
import { isPlatformAdmin } from '@/lib/agent/access'

// WHO MAY SEE OR CHANGE THE FAMILY LOAN: a platform admin (`platform_admins`),
// and no one else, the gate the Costs page uses (lib/costs/access.ts says why
// it is the product's one operator mechanism).
//
// The page answers everyone else with notFound(); the sidebar never sends
// them the link (components/ops/ops-nav-loader.tsx); every server action asks
// again here before it reads or writes, because an action is POST-reachable
// from any page; and the table refuses every session but the service role
// (supabase/migrations/20261111090000_family_loan.sql), which is what this
// file guards the use of. isPlatformAdmin fails closed.

/** The signed-in platform admin's user id, or null for anyone else.
 *  Redirects to /login when signed out (getSessionContext). */
export async function loanAdmin(): Promise<string | null> {
  const { userId } = await getSessionContext()
  return (await isPlatformAdmin(userId)) ? userId : null
}
