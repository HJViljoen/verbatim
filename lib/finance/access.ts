import { adminKeyValid } from '@/lib/admin-auth'
import { isPlatformAdmin } from '@/lib/agent/access'
import { getRouteSession } from '@/lib/auth'

// WHO MAY CALL /api/admin/finance/*: the ops key (the daily job, a script) or
// a signed-in platform admin (the Costs page's buttons). Everyone else gets a
// 404 from the route, as the page answers a client with "no such page".
// isPlatformAdmin fails closed.

export async function financeCaller(req: Request): Promise<'key' | 'operator' | null> {
  if (adminKeyValid(req.headers.get('x-admin-key'))) return 'key'
  const session = await getRouteSession().catch(() => null)
  if (session && (await isPlatformAdmin(session.userId))) return 'operator'
  return null
}
