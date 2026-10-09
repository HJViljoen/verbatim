'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { NavigationPromisesContext, PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime'
import { AppSidebar } from '@/components/app-sidebar'

// Dev-only (see ./page.tsx). The shipped sidebar reads its active row from the
// pathname, and this harness lives at /render/…, so once mounted the sidebar
// alone is told it is on Conversation (the server renders it with no row
// active, which the first client render matches, so nothing mismatches).
// In development `usePathname` reads the navigation promises first, hence
// null there. Nothing else in the tree reads these providers.

const subscribe = () => () => {}

export function HarnessSidebar({ header }: { header: ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false)
  if (!mounted) return <AppSidebar header={header} />
  return (
    <NavigationPromisesContext.Provider value={null}>
      <PathnameContext.Provider value="/dashboard/voice">
        <AppSidebar header={header} />
      </PathnameContext.Provider>
    </NavigationPromisesContext.Provider>
  )
}
