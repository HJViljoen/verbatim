'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth'
import { WORKSPACE_COOKIE, listWorkspaces, parseWorkspaceCookie } from '@/lib/workspaces'

// A year. The point of persisting is that signing in lands you back where you
// were looking, rather than in your own tenant every morning (Heinrich,
// 2026-09-09). Clearing is a menu item, not an expiry.
const ONE_YEAR = 60 * 60 * 24 * 365

/**
 * Point this session at another tenant, or (null) back at your own.
 *
 * Server actions are directly POST-reachable, so the platform_admins check is
 * re-done here rather than trusted from the UI — which never renders the
 * control for anyone else in the first place. A non-operator hitting this
 * endpoint by hand gets an exception and no cookie; even if one were somehow
 * set, lib/auth.ts would ignore it.
 */
export async function switchWorkspace(clientId: string | null): Promise<void> {
  const { operator } = await getSessionContext()
  if (!operator) throw new Error('Not permitted.')

  const cookieStore = await cookies()

  if (clientId === null) {
    cookieStore.delete(WORKSPACE_COOKIE)
  } else {
    // Shape first, then existence. The cookie must never name something that
    // isn't a client: lib/auth.ts would fall back to home anyway, but a
    // switcher that silently does nothing is worse than one that refuses.
    const parsed = parseWorkspaceCookie(clientId)
    const exists = parsed !== null && (await listWorkspaces()).some((w) => w.id === parsed)
    if (!exists) throw new Error('Unknown workspace.')

    cookieStore.set(WORKSPACE_COOKIE, parsed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ONE_YEAR,
    })
  }

  // Every dashboard page derives its data from the session's clientId, so the
  // whole tree below the root layout is now stale — hence 'layout', not a
  // single path. The redirect lands somewhere that exists in every tenant;
  // a deep link (a report id, an agent thread) would 404 in the new one.
  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
