import { redirect } from 'next/navigation'
import { retiredTo, type SearchProps } from '@/lib/nav'

// CONVERSATION SPLIT (Design v2, decision 6 of the depth plan). A link that
// opened a theme (`?theme=`, or a stored link's `?themes=`, the first of
// them) opens it on Market (`?conv=`); the rest of the page, the cast
// (`#cast`) and a brand's videos (`?brand=`), is Voices', and lands there
// with its params.
//
// Its page keys, modules and block keys stay registered, so a stored report
// or share link renders as it did; only the address moved. A thin page.tsx
// calling redirect() (the house pattern, never next.config.ts), with NO
// loading.tsx above it: a Suspense boundary would stream the shell first and
// turn the 307 into a client-side hop (lib/dashboard-loading.test.ts INHERITS).
// The mapping is lib/nav.ts `redirectFor`, held to a table of old links by
// lib/nav-redirects.test.ts.
export default async function Page({ searchParams }: SearchProps) {
  redirect(retiredTo('/dashboard/voice', (await searchParams) ?? {}))
}
