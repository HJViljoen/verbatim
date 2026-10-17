import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadVoices, parseVoicesParams } from '@/lib/pages/v2/voices'
import { VoicesPage } from '@/components/pages/v2/voices'
import type { Metadata } from 'next'
import { redirectFor, surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('voices').label }

// VOICES AT /dashboard/voices (Design v2, depth plan T4; as pages since 17
// Oct, the G3 boards): who is saying it, and who matters. The root: the groups
// in your market this month, the brands it names and how it treats them, and
// the creators behind most of its videos (lib/pages/v2/voices.ts). Each row
// opens its own page: a group (`/dashboard/voices/groups/<key>`), a brand
// (`/brands/<key>`) or a creator (`/creators/<platform>/<account>`), written
// once in lib/pages/v2/voices-address.ts. Nothing opens in place. `?month=`
// and `?creators=all` are read here.
//
// OLD LINKS LAND ON THEIR PAGES, BEFORE ANYTHING IS READ (`redirectFor`, its
// Voices block): `?group=` / `?persona=`, `?brand=` (a name, a key or
// `competitor:<name>`) and `?creator=` (an account or `platform|account`)
// opened a panel here, and stored snapshots, sent emails and share pages carry
// them, so they redirect for good, every other param kept. Conversation's
// `/dashboard/voice` and Competitive's `?vs=` land on the pages in one hop.
//
// THE LEGACY MODULES STAY REGISTERED, NOT ROUTED: the Voice of Customer module
// (page key `voice`), its six `voice.*` blocks, `VoiceSurfacePage` and
// `COMPETITIVE_BLOCKS` render stored snapshots, exports and share links. This
// file is a ROUTE, not the module an artefact names.

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = (await searchParams) ?? {}
  const away = redirectFor('/dashboard/voices', sp)
  if (away) redirect(away)
  const { supabase, clientId } = await getSessionContext()
  const data = await loadVoices({ supabase, clientId, reading: readingHandle(clientId), params: parseVoicesParams(sp) })
  return <VoicesPage data={data} />
}
