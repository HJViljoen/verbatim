import { getSessionContext } from '@/lib/auth'
import type { Role } from '@/lib/roles'

/**
 * Who you are, and whose workspace you are in — the sidebar's footer line
 * (Block D wave 2, `main.shell.sidebar.tenant`).
 *
 * THE ROLE IS THE MEMBER'S REAL ROLE, NEVER THE MOCK'S JOB TITLE. The artboard
 * prints "Sealand / digital director"; there is no such field. `users.role` is
 * one of three values and it is the only thing about this person the product
 * actually knows, so it is what prints — D14 of the mock gap: a claim about
 * state the product does not hold is not printed at all. Where no role resolves
 * (which cannot happen through `getSessionContext`, but can through a render
 * with no session), the brand prints alone rather than under an invented word.
 *
 * STREAMED, LIKE THE HEADER AND THE BANNER. `app/dashboard/layout.tsx` is
 * deliberately synchronous — an async layout sits above every route's
 * loading.tsx and freezes the shell on a session round-trip — so this is a slot
 * the layout passes down inside Suspense, exactly as `WorkspaceSwitcherLoader`
 * is. `getSessionContext()` is request-cached, so for a reader whose page has
 * already resolved the session this costs one `clients` row and nothing else.
 *
 * AND THE OPERATOR SEES THE TENANT THEY ARE VIEWING. While a platform admin is
 * inside someone else's workspace `SessionContext.role` is forced to 'owner'
 * (lib/auth.ts applyOperatorView) and `operator.viewingName` is the tenant's
 * own name — which is the name that belongs here, because the footer answers
 * "whose numbers am I looking at".
 */

const ROLE_WORD: Record<Role, string> = {
  owner: 'owner',
  admin: 'admin',
  member: 'member',
}

export function SidebarTenant({ brand, role }: { brand: string | null; role: Role | null }) {
  if (!brand && !role) return null
  return (
    <div className="flex flex-col gap-px px-2.5 pb-2.5">
      {brand ? <span className="truncate text-[12.5px] font-medium text-sidebar-foreground">{brand}</span> : null}
      {role ? <span className="font-mono text-[10.5px] text-muted-foreground">{ROLE_WORD[role]}</span> : null}
    </div>
  )
}

export async function SidebarTenantLoader() {
  const { supabase, clientId, role, operator } = await getSessionContext()
  if (operator && !operator.isHome) return <SidebarTenant brand={operator.viewingName} role={role} />
  const { data } = await supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle()
  const brand = ((data as { company_name?: string } | null)?.company_name ?? '').trim() || null
  return <SidebarTenant brand={brand} role={role} />
}
