import { redirect } from 'next/navigation'
import { retiredTo, type SearchProps } from '@/lib/nav'

// COMPETITIVE FOLDED INTO VOICES (Design v2, decision 6 of the depth plan):
// the brands are Voices'. `?vs=` (the brand read in full) lands as
// `?brand=`.
//
// Its page keys, modules and block keys stay registered, so a stored report
// or share link renders as it did; only the address moved. A thin page.tsx
// calling redirect() (the house pattern, never next.config.ts), with NO
// loading.tsx above it: a Suspense boundary would stream the shell first and
// turn the 307 into a client-side hop (lib/dashboard-loading.test.ts INHERITS).
// The mapping is lib/nav.ts `redirectFor`, held to a table of old links by
// lib/nav-redirects.test.ts.
export default async function Page({ searchParams }: SearchProps) {
  redirect(retiredTo('/dashboard/competitive', (await searchParams) ?? {}))
}
