import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadVoices, parseVoicesParams } from '@/lib/pages/v2/voices'
import { VoicesPage } from '@/components/pages/v2/voices'
import type { Metadata } from 'next'
import { surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('voices').label }

// VOICES AT /dashboard/voices (Design v2, depth plan T4; boards E3-Voices and
// E3-Voices-Open): who is saying it, and who matters. The groups in your
// market this month, the brands it names and how it treats them, and the
// creators behind most of its videos (lib/pages/v2/voices.ts). One item opens
// in place under its row: `?group=<key>`, `?brand=<name>`, `?creator=<account>`.
//
// OLD LINKS LAND HERE (lib/nav.ts `redirectFor`): Conversation's
// `/dashboard/voice` with its params (`?persona=` opens that group, `?brand=`
// that brand), and Competitive's `?vs=` as `?brand=`, which takes the rival's
// name or its audience key (`competitor:<name>`).
//
// THE LEGACY MODULES STAY REGISTERED, NOT ROUTED: the Voice of Customer module
// (page key `voice`), its six `voice.*` blocks, `VoiceSurfacePage` and
// `COMPETITIVE_BLOCKS` render stored snapshots, exports and share links. This
// file is a ROUTE, not the module an artefact names.

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, clientId } = await getSessionContext()
  const params = parseVoicesParams((await searchParams) ?? {})
  const data = await loadVoices({ supabase, clientId, reading: readingHandle(clientId), params })
  return <VoicesPage data={data} />
}
